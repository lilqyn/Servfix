import { Router } from "express";
import { Prisma, PaymentProvider } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { env } from "../config.js";
import { createNotification } from "../utils/notifications.js";
import { getPlatformSettings } from "../utils/platform-settings.js";

export const ordersRouter = Router();

const publicUserSelect = {
  id: true,
  email: true,
  phone: true,
  username: true,
  role: true,
  providerProfile: {
    select: {
      displayName: true,
      location: true,
      ratingAvg: true,
      ratingCount: true,
      verificationStatus: true,
    },
  },
};

ordersRouter.get(
  "/",
  authRequired,
  asyncHandler(async (req, res) => {
    const where =
      req.user!.role === "buyer"
        ? { buyerId: req.user!.id }
        : req.user!.role === "provider"
          ? { providerId: req.user!.id }
          : {};

    const orders = await prisma.order.findMany({
      where,
      include: {
        service: true,
        tier: true,
        buyer: {
          select: publicUserSelect,
        },
        provider: {
          select: publicUserSelect,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ orders });
  }),
);

const createSchema = z.object({
  serviceId: z.string().uuid(),
  tierId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["accepted", "cancelled", "delivered"]),
});

const orderIdSchema = z.object({
  id: z.string().uuid(),
});

const toMinorUnits = (amount: Prisma.Decimal) => {
  const fixed = amount.toFixed(2);
  const [whole, fraction = ""] = fixed.split(".");
  const normalized = `${whole}${(fraction + "00").slice(0, 2)}`;
  return Number(normalized);
};

type RefundOutcome = {
  status: "succeeded" | "pending";
  provider: PaymentProvider;
  reference?: string;
  raw: Prisma.JsonValue;
};

const initiateRefund = async (params: {
  paymentIntentId: string;
  amount: Prisma.Decimal;
  currency: string;
  orderId: string;
}): Promise<RefundOutcome> => {
  const paymentIntent = await prisma.paymentIntent.findUnique({
    where: { id: params.paymentIntentId },
  });

  if (!paymentIntent) {
    throw new Error("Payment intent not found.");
  }

  if (paymentIntent.provider === "flutterwave") {
    if (!env.FLUTTERWAVE_SECRET_KEY) {
      throw new Error("Flutterwave is not configured.");
    }
    const event = await prisma.paymentEvent.findFirst({
      where: { paymentIntentId: paymentIntent.id },
      orderBy: { receivedAt: "desc" },
    });

    const transactionId = event?.providerEventId;
    if (!transactionId) {
      throw new Error("Missing Flutterwave transaction reference.");
    }

    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Number(params.amount.toFixed(2)),
          comments: `Order ${params.orderId} declined`,
        }),
      },
    );

    const payload = (await response.json()) as {
      status?: string;
      message?: string;
      data?: { id?: number | string; status?: string };
    };

    if (!response.ok || payload.status !== "success") {
      throw new Error(payload.message ?? "Flutterwave refund failed.");
    }

    const refundStatus = payload.data?.status?.toLowerCase() ?? "";
    const isCompleted = refundStatus.startsWith("completed");

    return {
      status: isCompleted ? "succeeded" : "pending",
      provider: paymentIntent.provider as PaymentProvider,
      reference: payload.data?.id ? String(payload.data.id) : undefined,
      raw: payload as Prisma.JsonValue,
    };
  }

  if (paymentIntent.provider === "stripe") {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error("Stripe is not configured.");
    }
    const sessionId = paymentIntent.providerRef;
    if (!sessionId) {
      throw new Error("Missing Stripe session reference.");
    }

    const sessionResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        },
      },
    );

    const sessionPayload = (await sessionResponse.json()) as {
      id?: string;
      payment_intent?: string | null;
      error?: { message?: string };
    };

    if (!sessionResponse.ok || !sessionPayload.payment_intent) {
      throw new Error(sessionPayload.error?.message ?? "Unable to load Stripe session.");
    }

    const refundBody = new URLSearchParams();
    refundBody.append("payment_intent", sessionPayload.payment_intent);
    refundBody.append("amount", String(toMinorUnits(params.amount)));
    refundBody.append("metadata[orderId]", params.orderId);

    const refundResponse = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: refundBody.toString(),
    });

    const refundPayload = (await refundResponse.json()) as {
      id?: string;
      status?: string;
      error?: { message?: string };
    };

    if (!refundResponse.ok || !refundPayload.id) {
      throw new Error(refundPayload.error?.message ?? "Stripe refund failed.");
    }

    const status = refundPayload.status?.toLowerCase() === "succeeded" ? "succeeded" : "pending";

    return {
      status,
      provider: paymentIntent.provider as PaymentProvider,
      reference: refundPayload.id,
      raw: refundPayload as Prisma.JsonValue,
    };
  }

  throw new Error("Refund provider not supported.");
};

ordersRouter.post(
  "/",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const { settings } = await getPlatformSettings();

    const tier = await prisma.serviceTier.findUnique({
      where: { id: data.tierId },
      include: { service: true },
    });

    if (!tier || tier.serviceId !== data.serviceId) {
      return res.status(400).json({ error: "Invalid service tier" });
    }

    const quantity = data.quantity ?? 1;
    const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const isPerUnit = tier.pricingType === "per_unit";
    const gross = isPerUnit ? tier.price.mul(normalizedQuantity) : tier.price;
    const fee = gross.mul(settings.platformFeeBps).div(10000);
    const tax = fee.mul(settings.taxBps).div(10000);
    const net = gross.sub(fee).sub(tax);

    const order = await prisma.order.create({
      data: {
        buyerId: req.user!.id,
        providerId: tier.service.providerId,
        serviceId: data.serviceId,
        tierId: data.tierId,
        quantity: isPerUnit ? normalizedQuantity : 1,
        amountGross: gross,
        platformFee: fee,
        taxAmount: tax,
        amountNetProvider: net,
        currency: tier.currency,
        events: {
          create: {
            type: "created",
          },
        },
      },
      include: {
        service: true,
        tier: true,
        buyer: {
          select: publicUserSelect,
        },
        provider: {
          select: publicUserSelect,
        },
      },
    });

    const serviceTitle = order.service?.title ?? "service";
    await Promise.all([
      createNotification({
        userId: order.providerId,
        actorId: order.buyerId,
        type: "order_created",
        title: "New order received",
        body: `New order for ${serviceTitle}.`,
        data: { orderId: order.id, serviceId: order.serviceId },
      }),
      createNotification({
        userId: order.buyerId,
        actorId: order.providerId,
        type: "order_created",
        title: "Order placed",
        body: `Your order for ${serviceTitle} was placed.`,
        data: { orderId: order.id, serviceId: order.serviceId },
      }),
    ]);

    res.status(201).json({ order });
  }),
);

ordersRouter.patch(
  "/:id/status",
  authRequired,
  requireRole("provider", "admin"),
  asyncHandler(async (req, res) => {
    const params = orderIdSchema.parse(req.params);
    const data = updateStatusSchema.parse(req.body);

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { service: true },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (req.user!.role === "provider" && order.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (data.status === "delivered") {
      if (!["accepted", "in_progress"].includes(order.status)) {
        return res.status(400).json({ error: "Order cannot be marked complete yet." });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: "delivered",
            deliveredAt: new Date(),
          },
        });

        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            type: "delivered",
            payload: { actorId: req.user!.id },
          },
        });

        return updatedOrder;
      });

      const serviceTitle = order.service?.title ?? "service";
      await createNotification({
        userId: order.buyerId,
        actorId: req.user!.id,
        type: "order_status",
        title: "Order delivered",
        body: `Your order for ${serviceTitle} was marked complete.`,
        data: { orderId: order.id, serviceId: order.serviceId },
      });

      return res.json({ order: updated });
    }

    if (data.status === "accepted" && order.status !== "paid_to_escrow") {
      return res.status(400).json({ error: "Order must be paid before acceptance." });
    }

    if (data.status === "cancelled") {
      if (["refund_pending", "refunded"].includes(order.status)) {
        return res.status(400).json({ error: "Refund already in progress." });
      }
      if (!["created", "paid_to_escrow"].includes(order.status)) {
        return res.status(400).json({ error: "Order cannot be cancelled at this stage." });
      }
    }

    let refundOutcome: {
      status: "succeeded" | "pending";
      reference?: string;
      provider?: PaymentProvider;
    } | null = null;

    if (data.status === "cancelled" && order.status === "paid_to_escrow") {
      if (!order.paymentIntentId) {
        return res.status(400).json({ error: "Missing payment reference for refund." });
      }
      refundOutcome = await initiateRefund({
        paymentIntentId: order.paymentIntentId,
        amount: order.amountGross,
        currency: order.currency,
        orderId: order.id,
      });
    }

    const nextStatus =
      data.status === "accepted"
        ? "accepted"
        : refundOutcome
          ? refundOutcome.status === "succeeded"
            ? "refunded"
            : "refund_pending"
          : "cancelled";

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          acceptedAt: data.status === "accepted" ? new Date() : undefined,
          cancelledAt: data.status === "cancelled" ? new Date() : undefined,
          refundReference: refundOutcome?.reference ?? undefined,
          refundProvider: refundOutcome?.provider ?? undefined,
          refundRequestedAt: refundOutcome ? new Date() : undefined,
          refundCompletedAt:
            refundOutcome?.status === "succeeded" ? new Date() : undefined,
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type:
            data.status === "accepted"
              ? "accepted"
              : refundOutcome
                ? refundOutcome.status === "succeeded"
                  ? "refunded"
                  : "refund_initiated"
                : "cancelled",
          payload: {
            actorId: req.user!.id,
            refundReference: refundOutcome?.reference ?? null,
            refundProvider: refundOutcome?.provider ?? null,
          },
        },
      });

      if (data.status === "cancelled" && order.status === "paid_to_escrow") {
        await tx.providerWallet.upsert({
          where: { providerId: order.providerId },
          create: {
            providerId: order.providerId,
            availableBalance: new Prisma.Decimal(0),
            pendingBalance: new Prisma.Decimal(0),
            currency: order.currency,
          },
          update: {
            pendingBalance: { decrement: order.amountNetProvider },
          },
        });
      }

      return updatedOrder;
    });

    const serviceTitle = order.service?.title ?? "service";
    await createNotification({
      userId: order.buyerId,
      actorId: req.user!.id,
      type: "order_status",
      title:
        data.status === "accepted"
          ? "Order accepted"
          : refundOutcome
            ? refundOutcome.status === "succeeded"
              ? "Refund completed"
              : "Refund initiated"
            : "Order declined",
      body:
        data.status === "accepted"
          ? `Your order for ${serviceTitle} was accepted.`
          : refundOutcome
            ? refundOutcome.status === "succeeded"
              ? `Your payment for ${serviceTitle} was refunded.`
              : `Your payment for ${serviceTitle} is being refunded.`
            : `Your order for ${serviceTitle} was declined.`,
      data: { orderId: order.id, serviceId: order.serviceId },
    });

    res.json({ order: updated });
  }),
);
