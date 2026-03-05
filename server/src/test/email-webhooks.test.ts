/* @vitest-environment node */

import express from "express";
import crypto from "crypto";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  auditLog: { create: vi.fn() },
  user: { findFirst: vi.fn() },
  supportTicket: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  supportTicketMessage: {
    create: vi.fn(),
  },
  supportTicketEvent: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

const getPlatformSettingsMock = vi.fn();

vi.mock("../db.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../utils/platform-settings.js", () => ({
  getPlatformSettings: getPlatformSettingsMock,
}));

vi.mock("../routes/payments.js", () => ({
  finalizePayment: vi.fn(),
}));

vi.mock("../utils/notifications.js", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

let app: express.Express;

const mockSettings = (provider: "postmark" | "sendgrid" | "mailgun" = "postmark") => {
  getPlatformSettingsMock.mockResolvedValue({
    settings: {
      integrations: {
        email: {
          provider,
        },
        webhooks: {
          outboundSigningKey: "email-secret",
        },
        payments: {},
      },
    },
  });
};

beforeAll(async () => {
  const { webhooksRouter } = await import("../routes/webhooks.js");
  app = express();
  app.use(express.json());
  app.use("/api/webhooks", webhooksRouter);
});

describe("email webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings();
  });

  it("links inbound email to an existing support ticket", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      role: "buyer",
    });
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      ticketNumber: 12,
      userId: "11111111-1111-4111-8111-111111111111",
      status: "open",
    });
    prismaMock.supportTicketMessage.create.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
    });
    prismaMock.supportTicket.update.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
    });
    prismaMock.$transaction.mockResolvedValue([]);

    const res = await request(app)
      .post("/api/webhooks/email/inbound?token=email-secret")
      .send({
        From: "customer@example.com",
        Subject: "Re: TKT-000012 service issue",
        TextBody: "Here is my follow-up message.",
        MessageID: "email-msg-1",
      });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.created).toBe(false);
    expect(prismaMock.supportTicketMessage.create).toHaveBeenCalled();
    expect(prismaMock.supportTicket.update).toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("creates a support ticket from inbound email when no ticket id is present", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      role: "buyer",
    });
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    prismaMock.supportTicket.create.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      ticketNumber: 44,
    });
    prismaMock.supportTicketEvent.create.mockResolvedValue({
      id: "event-1",
    });

    const res = await request(app)
      .post("/api/webhooks/email/inbound?token=email-secret")
      .send({
        From: "customer@example.com",
        Subject: "Need help with payout",
        TextBody: "Please help, my payout is delayed.",
        MessageID: "email-msg-2",
      });

    expect(res.status).toBe(201);
    expect(res.body.received).toBe(true);
    expect(res.body.created).toBe(true);
    expect(res.body.ticketNumber).toBe(44);
    expect(prismaMock.supportTicket.create).toHaveBeenCalled();
    expect(prismaMock.supportTicketEvent.create).toHaveBeenCalled();
  });

  it("tracks inbound provider email events in audit logs", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce({
        id: "11111111-1111-4111-8111-111111111111",
        status: "active",
      })
      .mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/api/webhooks/email/events?token=email-secret")
      .send([
        {
          RecordType: "Bounce",
          Email: "customer@example.com",
          MessageID: "postmark-msg-1",
        },
        {
          event: "unsubscribe",
          email: "unknown@example.com",
          id: "sg-msg-2",
        },
      ]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      received: true,
      count: 2,
      severeEvents: 2,
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("parses sendgrid inbound multipart payloads", async () => {
    mockSettings("sendgrid");

    prismaMock.user.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      role: "buyer",
    });
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      ticketNumber: 12,
      userId: "11111111-1111-4111-8111-111111111111",
      status: "open",
    });
    prismaMock.$transaction.mockResolvedValue([]);

    const res = await request(app)
      .post("/api/webhooks/email/inbound?token=email-secret")
      .field("from", "customer@example.com")
      .field("to", "support+tkt-000012@servfixgh.com")
      .field("subject", "Follow up request")
      .field("text", "This is a SendGrid inbound message.")
      .field("headers", "Message-ID: <sg-msg-1@example.com>");

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.created).toBe(false);
    expect(prismaMock.supportTicketMessage.create).toHaveBeenCalledTimes(1);
  });

  it("accepts mailgun signed event payloads", async () => {
    mockSettings("mailgun");

    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = "mailgun-token";
    const signature = crypto
      .createHmac("sha256", "email-secret")
      .update(`${timestamp}${token}`, "utf8")
      .digest("hex");

    prismaMock.user.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: "active",
    });

    const res = await request(app)
      .post("/api/webhooks/email/events")
      .send({
        timestamp,
        token,
        signature,
        "event-data": {
          event: "failed",
          recipient: "customer@example.com",
          id: "mailgun-msg-1",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.severeEvents).toBe(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects email webhook calls with invalid token", async () => {
    const res = await request(app)
      .post("/api/webhooks/email/events")
      .send({ event: "delivered" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email webhook token.");
  });
});
