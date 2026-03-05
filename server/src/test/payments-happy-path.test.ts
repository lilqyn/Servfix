/* @vitest-environment node */

import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, createNotificationMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    orderPayment: {
      findFirst: vi.fn(),
    },
  },
  createNotificationMock: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../utils/notifications.js", () => ({
  createNotification: createNotificationMock,
}));

import { finalizePayment } from "../routes/payments.js";

describe("payments happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finalizes a successful orders payment and moves funds to escrow", async () => {
    const paymentIntent = {
      id: "payment-intent-1",
      provider: "stripe",
      status: "pending",
      amount: new Prisma.Decimal("200"),
      currency: "GHS",
      providerRef: "pi_ref_1",
      metadata: { buyerId: "buyer-1" },
    };

    const order = {
      id: "order-1",
      providerId: "provider-1",
      buyerId: "buyer-1",
      serviceId: "service-1",
      status: "created",
      amountGross: new Prisma.Decimal("200"),
      amountNetProvider: new Prisma.Decimal("160"),
      currency: "GHS",
      service: { title: "Premium Plumbing Fix" },
    };

    const tx = {
      paymentIntent: {
        findUnique: vi.fn().mockResolvedValue(paymentIntent),
        update: vi.fn().mockResolvedValue(paymentIntent),
      },
      paymentEvent: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        findMany: vi.fn().mockResolvedValue([order]),
        update: vi.fn().mockResolvedValue({ ...order, status: "paid_to_escrow" }),
      },
      providerWallet: {
        upsert: vi.fn().mockResolvedValue(null),
      },
      orderEvent: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    prismaMock.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === "function") {
        return input(tx);
      }
      return [];
    });

    const result = await finalizePayment({
      paymentIntentId: paymentIntent.id,
      providerEventId: "evt_1",
      providerPayload: Prisma.JsonNull,
      actorId: "buyer-1",
      settings: {} as never,
    });

    expect(result.purpose).toBe("orders");
    expect(tx.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: paymentIntent.id },
        data: { status: "succeeded" },
      }),
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: order.id },
        data: expect.objectContaining({
          status: "paid_to_escrow",
        }),
      }),
    );
    expect(tx.providerWallet.upsert).toHaveBeenCalledTimes(1);
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
  });

  it("finalizes an order stage payment and marks the stage payment as paid", async () => {
    const paymentIntent = {
      id: "payment-intent-order-stage-1",
      provider: "paystack",
      status: "pending",
      amount: new Prisma.Decimal("120"),
      currency: "GHS",
      providerRef: "ps_ref_stage_1",
      metadata: {
        purpose: "order_payment",
        orderPaymentId: "order-payment-1",
        orderId: "order-2",
        buyerId: "buyer-2",
      },
    };

    const order = {
      id: "order-2",
      providerId: "provider-2",
      buyerId: "buyer-2",
      serviceId: "service-2",
      status: "payment_pending",
      amountPaid: new Prisma.Decimal("0"),
      amountPaidNet: new Prisma.Decimal("0"),
      amountGross: new Prisma.Decimal("240"),
      amountNetProvider: new Prisma.Decimal("192"),
      currency: "GHS",
      service: { title: "Deep home cleaning" },
    };

    const orderPayment = {
      id: "order-payment-1",
      orderId: "order-2",
      stage: "balance",
      status: "pending",
      amount: new Prisma.Decimal("120"),
      amountNetProvider: new Prisma.Decimal("96"),
      currency: "GHS",
      paymentIntentId: paymentIntent.id,
      order,
    };

    const tx = {
      paymentIntent: {
        findUnique: vi.fn().mockResolvedValue(paymentIntent),
        update: vi.fn().mockResolvedValue(paymentIntent),
      },
      paymentEvent: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      orderPayment: {
        findUnique: vi.fn().mockResolvedValue(orderPayment),
        update: vi.fn().mockResolvedValue({ ...orderPayment, status: "paid" }),
      },
      order: {
        update: vi.fn().mockResolvedValue({ ...order, status: "paid_to_escrow" }),
      },
      providerWallet: {
        upsert: vi.fn().mockResolvedValue(null),
      },
      orderEvent: {
        create: vi.fn().mockResolvedValue({ id: "event-2" }),
      },
    };

    prismaMock.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === "function") {
        return input(tx);
      }
      return [];
    });

    prismaMock.orderPayment.findFirst.mockResolvedValue(orderPayment);

    const result = await finalizePayment({
      paymentIntentId: paymentIntent.id,
      providerEventId: "evt_stage_1",
      providerPayload: Prisma.JsonNull,
      actorId: "buyer-2",
      settings: {} as never,
    });

    expect(result.purpose).toBe("order_payment");
    expect(tx.orderPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: orderPayment.id },
        data: expect.objectContaining({
          status: "paid",
        }),
      }),
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: order.id },
        data: expect.objectContaining({
          status: "paid_to_escrow",
          pspPaymentRef: paymentIntent.providerRef,
        }),
      }),
    );
    expect(tx.providerWallet.upsert).toHaveBeenCalledTimes(1);
    expect(tx.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: order.id,
          type: "paid",
          payload: expect.objectContaining({
            provider: paymentIntent.provider,
            stage: orderPayment.stage,
          }),
        }),
      }),
    );
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
  });
});
