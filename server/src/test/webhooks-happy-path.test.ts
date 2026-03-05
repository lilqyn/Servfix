/* @vitest-environment node */

import express from "express";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  paymentIntent: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

const finalizePaymentMock = vi.fn();
const getPlatformSettingsMock = vi.fn();

vi.mock("../db.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../routes/payments.js", () => ({
  finalizePayment: finalizePaymentMock,
}));

vi.mock("../utils/platform-settings.js", () => ({
  getPlatformSettings: getPlatformSettingsMock,
}));

vi.mock("../utils/notifications.js", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

let app: express.Express;

beforeAll(async () => {
  const { webhooksRouter } = await import("../routes/webhooks.js");
  app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use("/api/webhooks", webhooksRouter);
});

describe("webhooks happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlatformSettingsMock.mockResolvedValue({
      settings: {
        integrations: {
          webhooks: {},
          payments: {},
        },
      },
    });
  });

  it("finalizes a successful Hubtel webhook payment", async () => {
    const paymentIntentId = "11111111-1111-4111-8111-111111111111";

    prismaMock.paymentIntent.findUnique.mockResolvedValue({
      id: paymentIntentId,
      provider: "hubtel",
      status: "pending",
      amount: new Prisma.Decimal("120"),
      currency: "GHS",
      providerRef: null,
      metadata: { buyerId: "buyer-1" },
    });
    prismaMock.paymentIntent.update.mockResolvedValue({});
    finalizePaymentMock.mockResolvedValue({
      orders: [],
      purpose: "orders",
      boost: null,
      subscription: null,
      invoice: null,
    });

    const res = await request(app).post("/api/webhooks/hubtel").send({
      responseCode: "0000",
      data: {
        clientReference: paymentIntentId,
        paylinkId: "hubtel-paylink-1",
        amount: "120",
        status: "success",
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(finalizePaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId,
        actorId: "buyer-1",
      }),
    );
  });
});
