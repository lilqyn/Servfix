/* @vitest-environment node */

import express from "express";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  order: {
    findUnique: vi.fn(),
  },
  orderPayment: {
    findFirst: vi.fn(),
  },
  dispute: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

const createNotificationMock = vi.fn();
const getPlatformSettingsMock = vi.fn();

vi.mock("../db.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../utils/notifications.js", () => ({
  createNotification: createNotificationMock,
}));

vi.mock("../middleware/permissions.js", () => ({
  requirePermission: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock("../utils/platform-settings.js", async () => {
  const actual = await vi.importActual<typeof import("../utils/platform-settings.js")>(
    "../utils/platform-settings.js",
  );
  return {
    ...actual,
    getPlatformSettings: getPlatformSettingsMock,
  };
});

vi.mock("../middleware/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../middleware/auth.js")>(
    "../middleware/auth.js",
  );

  const resolveUser = (req: { header: (name: string) => string | undefined }) => {
    const role = req.header("x-test-role");
    if (!role) {
      return null;
    }
    return {
      id: req.header("x-test-user-id") ?? "test-user",
      role: role as never,
      email: null,
      phone: null,
      username: "test-user",
    };
  };

  return {
    ...actual,
    authRequired: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const user = resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: "Authorization required" });
      }
      req.user = user;
      return next();
    },
  };
});

let app: express.Express;

beforeAll(async () => {
  const [{ ordersRouter }, { adminRouter }] = await Promise.all([
    import("../routes/orders.js"),
    import("../routes/admin.js"),
  ]);

  app = express();
  app.use(express.json());
  app.use("/api/orders", ordersRouter);
  app.use("/api/admin", adminRouter);
});

describe("orders and disputes happy paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlatformSettingsMock.mockResolvedValue({
      settings: {
        adminAccess: {
          disputes: ["admin"],
        },
        businessFunctions: {
          customer_service: {
            enabled: true,
            roles: ["admin"],
          },
        },
        disputePolicy: {
          allowedStatuses: ["open", "investigating", "resolved", "cancelled"],
          allowedResolutions: ["refund", "release", "partial_refund", "deny"],
          defaultResolution: "refund",
        },
      },
    });
  });

  it("accepts a paid order successfully", async () => {
    const orderId = "11111111-1111-4111-8111-111111111111";

    prismaMock.order.findUnique.mockResolvedValue({
      id: orderId,
      providerId: "provider-1",
      buyerId: "buyer-1",
      serviceId: "service-1",
      status: "paid_to_escrow",
      amountPaid: new Prisma.Decimal("200"),
      amountGross: new Prisma.Decimal("200"),
      amountPaidNet: new Prisma.Decimal("160"),
      amountNetProvider: new Prisma.Decimal("160"),
      currency: "GHS",
      paymentIntentId: "payment-intent-1",
      service: { title: "House Wiring" },
    });

    const txOrderUpdate = vi.fn().mockResolvedValue({
      id: orderId,
      status: "accepted",
    });
    const txOrderEventCreate = vi.fn().mockResolvedValue({});
    const txWalletUpsert = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === "function") {
        return input({
          order: { update: txOrderUpdate },
          orderEvent: { create: txOrderEventCreate },
          providerWallet: { upsert: txWalletUpsert },
        });
      }
      return [];
    });
    createNotificationMock.mockResolvedValue(undefined);

    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set("x-test-role", "provider")
      .set("x-test-user-id", "provider-1")
      .send({ status: "accepted" });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("accepted");
    expect(txOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: orderId },
        data: expect.objectContaining({
          status: "accepted",
        }),
      }),
    );
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("resolves a dispute via admin endpoint", async () => {
    const disputeId = "22222222-2222-4222-8222-222222222222";
    const orderId = "33333333-3333-4333-8333-333333333333";

    prismaMock.dispute.findUnique
      .mockResolvedValueOnce({ id: disputeId })
      .mockResolvedValueOnce({
        id: disputeId,
        order: {
          id: orderId,
          buyerId: "buyer-1",
          providerId: "provider-1",
          serviceId: "service-1",
          status: "dispute_open",
          currency: "GHS",
          amountPaidNet: new Prisma.Decimal("160"),
          amountReleasedNet: new Prisma.Decimal("0"),
          service: { title: "House Wiring" },
        },
      });

    prismaMock.dispute.update.mockResolvedValue({
      id: disputeId,
      status: "resolved",
      resolution: "refund",
    });
    prismaMock.auditLog.create.mockResolvedValue({});

    const txWalletUpsert = vi.fn().mockResolvedValue({
      pendingBalance: new Prisma.Decimal("160"),
    });
    const txWalletUpdate = vi.fn().mockResolvedValue({});
    const txOrderUpdate = vi.fn().mockResolvedValue({});
    const txOrderEventCreate = vi.fn().mockResolvedValue({});
    const txDisputeUpdate = vi.fn().mockResolvedValue({
      id: disputeId,
      status: "resolved",
      resolution: "refund",
    });

    prismaMock.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === "function") {
        return input({
          dispute: {
            findUnique: prismaMock.dispute.findUnique,
            update: txDisputeUpdate,
          },
          providerWallet: {
            upsert: txWalletUpsert,
            update: txWalletUpdate,
          },
          order: {
            update: txOrderUpdate,
          },
          orderEvent: {
            create: txOrderEventCreate,
          },
        });
      }
      return [];
    });

    const res = await request(app)
      .patch(`/api/admin/disputes/${disputeId}/status`)
      .set("x-test-role", "admin")
      .set("x-test-user-id", "admin-1")
      .send({
        status: "resolved",
        resolution: "refund",
        note: "Resolved in favor of buyer.",
      });

    expect(res.status).toBe(200);
    expect(res.body.dispute.status).toBe("resolved");
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
  });
});
