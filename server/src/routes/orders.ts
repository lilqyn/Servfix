import { Router } from "express";
import { Prisma, PaymentProvider } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { env } from "../config.js";
import { createNotification } from "../utils/notifications.js";
import { ADMIN_ROLES, hasPermission } from "../utils/permissions.js";
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

const progressReportSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().max(2000).optional(),
  percentComplete: z.coerce.number().int().min(1).max(100).optional(),
});

const releaseRequestSchema = z.object({
  percent: z.coerce.number().int().min(1).max(20),
  note: z.string().trim().min(5, "Reason is required.").max(500),
});

const updateStatusSchema = z.object({
  status: z.enum(["accepted", "cancelled", "delivered"]),
});

const orderIdSchema = z.object({
  id: z.string().uuid(),
});

const calculatePaymentBreakdown = (gross: Prisma.Decimal, settings: { platformFeeBps: number; taxBps: number }) => {
  const fee = gross.mul(settings.platformFeeBps).div(10000);
  const tax = fee.mul(settings.taxBps).div(10000);
  const net = gross.sub(fee).sub(tax);
  return { fee, tax, net };
};

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

  if (paymentIntent.provider === "paystack") {
    if (!env.PAYSTACK_SECRET_KEY) {
      throw new Error("Paystack is not configured.");
    }
    const reference = paymentIntent.providerRef;
    if (!reference) {
      throw new Error("Missing Paystack transaction reference.");
    }

    const refundResponse = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: reference,
        amount: toMinorUnits(params.amount),
        currency: params.currency,
      }),
    });

    const refundPayload = (await refundResponse.json()) as {
      status?: boolean;
      message?: string;
      data?: { id?: number | string; status?: string };
    };

    if (!refundResponse.ok || !refundPayload.status) {
      throw new Error(refundPayload.message ?? "Paystack refund failed.");
    }

    const refundStatus = String(refundPayload.data?.status ?? "").toLowerCase();
    const isCompleted = ["processed", "success", "succeeded", "completed"].includes(refundStatus);

    return {
      status: isCompleted ? "succeeded" : "pending",
      provider: paymentIntent.provider as PaymentProvider,
      reference: refundPayload.data?.id ? String(refundPayload.data.id) : undefined,
      raw: refundPayload as Prisma.JsonValue,
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
  requireRole("buyer", "provider", "admin"),
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
    const pricingModel = tier.pricingModel ?? "fixed";
    if (pricingModel !== "fixed") {
      return res.status(400).json({ error: "This service requires a quote." });
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
      if (order.amountPaid.lessThan(order.amountGross)) {
        return res.status(400).json({ error: "Balance payment is still due for this order." });
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
      let refundPaymentIntentId = order.paymentIntentId;
      if (!refundPaymentIntentId) {
        const latestPaid = await prisma.orderPayment.findFirst({
          where: { orderId: order.id, status: "paid" },
          orderBy: { createdAt: "desc" },
          select: { paymentIntentId: true },
        });
        refundPaymentIntentId = latestPaid?.paymentIntentId ?? null;
      }

      if (!refundPaymentIntentId) {
        return res.status(400).json({ error: "Missing payment reference for refund." });
      }

      refundOutcome = await initiateRefund({
        paymentIntentId: refundPaymentIntentId,
        amount: order.amountPaid,
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
          amountPaid:
            refundOutcome?.status === "succeeded" ? new Prisma.Decimal(0) : undefined,
          amountPaidNet:
            refundOutcome?.status === "succeeded" ? new Prisma.Decimal(0) : undefined,
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
            pendingBalance: { decrement: order.amountPaidNet },
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

ordersRouter.get(
  "/:id/progress-reports",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = orderIdSchema.parse(req.params);
    const userId = req.user!.id;

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, buyerId: true, providerId: true },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (req.user!.role !== "admin" && order.buyerId !== userId && order.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const reports = await prisma.orderProgressReport.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({ reports });
  }),
);

ordersRouter.get(
  "/:id/payments",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = orderIdSchema.parse(req.params);
    const userId = req.user!.id;

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, buyerId: true, providerId: true },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (req.user!.role !== "admin" && order.buyerId !== userId && order.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const payments = await prisma.orderPayment.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });

    res.json({ payments });
  }),
);

ordersRouter.post(
  "/:id/progress-reports",
  authRequired,
  requireRole("provider", "admin"),
  asyncHandler(async (req, res) => {
    const params = orderIdSchema.parse(req.params);
    const data = progressReportSchema.parse(req.body);
    const userId = req.user!.id;

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        buyerId: true,
        providerId: true,
        amountPaid: true,
        amountGross: true,
        balanceAmount: true,
        currency: true,
        status: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (req.user!.role !== "admin" && order.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { settings } = await getPlatformSettings();
    const report = await prisma.orderProgressReport.create({
      data: {
        orderId: order.id,
        providerId: order.providerId,
        title: data.title.trim(),
        body: data.body?.trim() || null,
        percentComplete: data.percentComplete ?? 0,
      },
    });

    await createNotification({
      userId: order.buyerId,
      actorId: userId,
      type: "order_status",
      title: "Progress update received",
      body: report.title,
      data: { orderId: order.id, reportId: report.id },
    });

    let balancePayment = await prisma.orderPayment.findFirst({
      where: { orderId: order.id, stage: "balance" },
    });

    if (order.amountPaid.lessThan(order.amountGross)) {
      if (!balancePayment) {
        const remaining =
          order.balanceAmount && order.balanceAmount.greaterThan(0)
            ? order.balanceAmount
            : order.amountGross.sub(order.amountPaid);
        if (remaining.greaterThan(0)) {
          const { fee, tax, net } = calculatePaymentBreakdown(remaining, settings);
          balancePayment = await prisma.orderPayment.create({
            data: {
              orderId: order.id,
              stage: "balance",
              status: "pending",
              amount: remaining,
              platformFee: fee,
              taxAmount: tax,
              amountNetProvider: net,
              currency: order.currency,
            },
          });

          await prisma.orderEvent.create({
            data: {
              orderId: order.id,
              type: "balance_requested",
              payload: { reportId: report.id, actorId: userId },
            },
          });

          await createNotification({
            userId: order.buyerId,
            actorId: userId,
            type: "order_status",
            title: "Balance payment requested",
            body: "A progress update was submitted and the remaining balance is now due.",
            data: { orderId: order.id },
          });
        }
      }
    }

    if (order.status === "accepted") {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "in_progress" },
      });
    }

    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "progress_reported",
        payload: { reportId: report.id, actorId: userId },
      },
    });

    res.status(201).json({ report, balancePayment });
  }),
);

ordersRouter.get(
  "/:id/release-requests",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = orderIdSchema.parse(req.params);
    const userId = req.user!.id;

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, providerId: true },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const isAdmin = ADMIN_ROLES.includes(req.user!.role);
    if (!isAdmin && order.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const requests = await prisma.orderReleaseRequest.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({ requests });
  }),
);

ordersRouter.post(
  "/:id/release-requests",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = orderIdSchema.parse(req.params);
    const data = releaseRequestSchema.parse(req.body);
    const userId = req.user!.id;

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        buyerId: true,
        providerId: true,
        currency: true,
        serviceId: true,
        amountPaidNet: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const isAdmin = ADMIN_ROLES.includes(req.user!.role);
    if (!isAdmin && req.user!.role !== "provider") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!isAdmin && order.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

      if (order.amountPaidNet.lte(0)) {
        return res.status(400).json({ error: "Escrow payment has not been received yet." });
      }

      const released = await prisma.orderReleaseRequest.aggregate({
        where: { orderId: order.id, status: "approved" },
        _sum: { amount: true },
      });

      const releasedNet = released._sum.amount ?? new Prisma.Decimal(0);
      const remaining = order.amountPaidNet.sub(releasedNet);

      if (remaining.lte(0)) {
        return res.status(400).json({ error: "No remaining escrow funds are available to release." });
      }

      const requested = await prisma.orderReleaseRequest.aggregate({
        where: { orderId: order.id, status: { in: ["pending", "approved"] } },
        _sum: { amount: true },
      });

      const requestedNet = requested._sum.amount ?? new Prisma.Decimal(0);
      const maxCap = order.amountPaidNet.mul(20).div(100);
      if (requestedNet.greaterThanOrEqualTo(maxCap)) {
        return res.status(400).json({ error: "Release request limit (20%) has already been reached for this order." });
      }

      const requestAmount = order.amountPaidNet.mul(data.percent).div(100);
      if (requestAmount.greaterThan(remaining)) {
        return res.status(400).json({ error: "Requested release exceeds remaining escrow amount." });
      }

      if (requestedNet.add(requestAmount).greaterThan(maxCap)) {
        return res.status(400).json({ error: "Requested release exceeds the 20% limit for this order." });
      }

    const request = await prisma.orderReleaseRequest.create({
      data: {
        orderId: order.id,
        requestedById: order.providerId,
        amount: requestAmount,
        currency: order.currency,
        status: "pending",
        note: data.note.trim(),
      },
    });

    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "release_requested",
        payload: { requestId: request.id, actorId: userId },
      },
    });

    const adminUsers = await prisma.user.findMany({
      where: { role: { in: ADMIN_ROLES }, status: "active" },
      select: { id: true, role: true },
    });

    const adminRecipients = adminUsers
      .filter((admin) => hasPermission(admin.role, "orders.update"))
      .map((admin) => admin.id);

    await Promise.all(
      adminRecipients.map((adminId) =>
        createNotification({
          userId: adminId,
          actorId: userId,
          type: "order_status",
          title: "Deposit release requested",
          body: "A provider requested a deposit release for an order.",
          data: { orderId: order.id, requestId: request.id },
        }),
      ),
    );

    res.status(201).json({ request });
  }),
);

ordersRouter.post(
  "/release-requests/:id/approve",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const userId = req.user!.id;

    const request = await prisma.orderReleaseRequest.findUnique({
      where: { id: params.id },
      include: { order: true },
    });

    if (!request || !request.order) {
      return res.status(404).json({ error: "Release request not found." });
    }

    const isAdmin = ADMIN_ROLES.includes(req.user!.role);
    if (!isAdmin || !hasPermission(req.user!.role, "orders.update")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: "Release request is no longer pending." });
    }

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.providerWallet.upsert({
        where: { providerId: request.order.providerId },
        create: {
          providerId: request.order.providerId,
          availableBalance: new Prisma.Decimal(0),
          pendingBalance: new Prisma.Decimal(0),
          currency: request.order.currency,
        },
        update: {},
      });

      const pendingAfter = wallet.pendingBalance.sub(request.amount);
      await tx.providerWallet.update({
        where: { providerId: request.order.providerId },
        data: {
          availableBalance: { increment: request.amount },
          pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
        },
      });

      await tx.order.update({
        where: { id: request.orderId },
        data: {
          amountReleasedNet: request.order.amountReleasedNet.add(request.amount),
        },
      });

      await tx.orderReleaseRequest.update({
        where: { id: request.id },
        data: {
          status: "approved",
          approvedById: req.user!.role === "admin" ? userId : userId,
          decidedAt: new Date(),
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: request.orderId,
          type: "release_approved",
          payload: { requestId: request.id, actorId: userId },
        },
      });
    });

    await createNotification({
      userId: request.order.providerId,
      actorId: userId,
      type: "order_status",
      title: "Deposit released",
      body: "Your deposit release request was approved.",
      data: { orderId: request.orderId, requestId: request.id },
    });

    res.json({ status: "approved" });
  }),
);

ordersRouter.post(
  "/release-requests/:id/reject",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const userId = req.user!.id;

    const request = await prisma.orderReleaseRequest.findUnique({
      where: { id: params.id },
      include: { order: true },
    });

    if (!request || !request.order) {
      return res.status(404).json({ error: "Release request not found." });
    }

    const isAdmin = ADMIN_ROLES.includes(req.user!.role);
    if (!isAdmin || !hasPermission(req.user!.role, "orders.update")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: "Release request is no longer pending." });
    }

    await prisma.orderReleaseRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        approvedById: req.user!.role === "admin" ? userId : userId,
        decidedAt: new Date(),
      },
    });

    await prisma.orderEvent.create({
      data: {
        orderId: request.orderId,
        type: "release_rejected",
        payload: { requestId: request.id, actorId: userId },
      },
    });

    await createNotification({
      userId: request.order.providerId,
      actorId: userId,
      type: "order_status",
      title: "Deposit release rejected",
      body: "Your deposit release request was declined by the buyer.",
      data: { orderId: request.orderId, requestId: request.id },
    });

    res.json({ status: "rejected" });
  }),
);
