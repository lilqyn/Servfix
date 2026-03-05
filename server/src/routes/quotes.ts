import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { createNotification } from "../utils/notifications.js";
import { getPlatformSettings } from "../utils/platform-settings.js";

export const quotesRouter = Router();

const threadParamsSchema = z.object({
  id: z.string().uuid(),
});

const quoteParamsSchema = z.object({
  id: z.string().uuid(),
});

const createQuoteSchema = z.object({
  serviceId: z.string().uuid().optional(),
  tierId: z.string().uuid().optional(),
  amount: z.coerce.number().positive(),
  currency: z.enum(["GHS", "USD", "EUR"]).optional(),
  quantity: z.coerce.number().int().min(1).optional(),
  depositPercent: z
    .coerce
    .number()
    .int()
    .refine((value) => [50, 70, 100].includes(value), {
      message: "Initial payment percent must be 50, 70, or 100.",
    })
    .optional(),
  message: z.string().trim().max(2000).optional(),
  expiresAt: z.string().trim().optional(),
});

const calculatePaymentBreakdown = (
  gross: Prisma.Decimal,
  settings: { platformFeeBps: number; taxBps: number },
) => {
  const fee = gross.mul(settings.platformFeeBps).div(10000);
  const tax = fee.mul(settings.taxBps).div(10000);
  const net = gross.sub(fee).sub(tax);
  return { fee, tax, net };
};

quotesRouter.get(
  "/threads/:id/quotes",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = threadParamsSchema.parse(req.params);
    const userId = req.user!.id;

    const thread = await prisma.thread.findUnique({
      where: { id: params.id },
      select: { id: true, buyerId: true, providerId: true },
    });

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    if (
      req.user!.role !== "admin" &&
      thread.buyerId !== userId &&
      thread.providerId !== userId
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const quotes = await prisma.quote.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({ quotes });
  }),
);

quotesRouter.post(
  "/threads/:id/quotes",
  authRequired,
  requireRole("provider", "admin"),
  asyncHandler(async (req, res) => {
    const params = threadParamsSchema.parse(req.params);
    const data = createQuoteSchema.parse(req.body);
    const userId = req.user!.id;

    const thread = await prisma.thread.findUnique({
      where: { id: params.id },
      select: { id: true, buyerId: true, providerId: true, serviceId: true },
    });

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    if (req.user!.role !== "admin" && thread.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const serviceId = data.serviceId ?? thread.serviceId ?? null;
    if (!serviceId) {
      return res.status(400).json({ error: "Service is required to create a quote." });
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, providerId: true },
    });

    if (!service || (req.user!.role !== "admin" && service.providerId !== userId)) {
      return res.status(404).json({ error: "Service not found." });
    }

    const tierId: string | null = data.tierId ?? null;
    let currency = data.currency ?? "GHS";
    let pricingType: "flat" | "per_unit" = "flat";
    if (tierId) {
      const tier = await prisma.serviceTier.findUnique({
        where: { id: tierId },
        select: { id: true, serviceId: true, currency: true, pricingType: true },
      });
      if (!tier || tier.serviceId !== serviceId) {
        return res.status(400).json({ error: "Invalid service tier." });
      }
      currency = data.currency ?? tier.currency;
      pricingType = tier.pricingType ?? "flat";
    }

    const quantityValue = data.quantity ?? 1;
    if (pricingType === "per_unit" && !data.quantity) {
      return res
        .status(400)
        .json({ error: "Quantity is required for per-unit quotes." });
    }
    if (!Number.isFinite(quantityValue) || quantityValue < 1) {
      return res.status(400).json({ error: "Quantity must be at least 1." });
    }

    const unitPrice = new Prisma.Decimal(data.amount);
    const amount =
      pricingType === "per_unit"
        ? unitPrice.mul(quantityValue)
        : unitPrice;
    const depositPercent = data.depositPercent ?? 50;
    const depositAmount = amount.mul(depositPercent).div(100);
    const balanceAmount = amount.sub(depositAmount);

    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({ error: "Invalid quote expiry date." });
    }

    const quote = await prisma.quote.create({
      data: {
        threadId: thread.id,
        serviceId,
        tierId,
        providerId: thread.providerId,
        buyerId: thread.buyerId,
        amount,
        currency,
        quantity: quantityValue,
        depositPercent,
        depositAmount,
        balanceAmount,
        message: data.message?.trim() || null,
        expiresAt,
      },
    });

    await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: userId,
        body: `Quote sent: ${currency} ${amount.toFixed(2)} (${depositPercent}% initial payment)`,
      },
    });

    await prisma.thread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    await createNotification({
      userId: thread.buyerId,
      actorId: userId,
      type: "message_received",
      title: "New quote received",
      body: `A quote was sent for your request.`,
      data: { threadId: thread.id, quoteId: quote.id },
    });

    res.status(201).json({ quote });
  }),
);

quotesRouter.post(
  "/quotes/:id/accept",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const params = quoteParamsSchema.parse(req.params);
    const userId = req.user!.id;
    const { settings } = await getPlatformSettings();

    const quote = await prisma.quote.findUnique({
      where: { id: params.id },
      include: { thread: true },
    });

    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    if (req.user!.role !== "admin" && quote.buyerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (quote.status !== "sent") {
      return res.status(400).json({ error: "Quote is no longer available." });
    }

    if (quote.expiresAt && quote.expiresAt < new Date()) {
      return res.status(400).json({ error: "Quote has expired." });
    }

    const { fee, tax, net } = calculatePaymentBreakdown(quote.amount, settings);

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          buyerId: quote.buyerId,
          providerId: quote.providerId,
          serviceId: quote.serviceId,
          tierId: quote.tierId,
          quoteId: quote.id,
          status: "created",
          quantity: quote.quantity,
          amountGross: quote.amount,
          platformFee: fee,
          taxAmount: tax,
          amountNetProvider: net,
          currency: quote.currency,
          depositPercent: quote.depositPercent,
          depositAmount: quote.depositAmount,
          balanceAmount: quote.balanceAmount,
          events: { create: { type: "created" } },
        },
        include: { service: true },
      });

      const paymentStage = quote.depositPercent > 0 ? "deposit" : "balance";
      const paymentAmount =
        quote.depositPercent > 0 ? quote.depositAmount : quote.amount;
      const { fee: paymentFee, tax: paymentTax, net: paymentNet } =
        calculatePaymentBreakdown(paymentAmount, settings);

      const orderPayment = await tx.orderPayment.create({
        data: {
          orderId: order.id,
          stage: paymentStage,
          status: "pending",
          amount: paymentAmount,
          platformFee: paymentFee,
          taxAmount: paymentTax,
          amountNetProvider: paymentNet,
          currency: quote.currency,
        },
      });

      await tx.quote.update({
        where: { id: quote.id },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
        },
      });

      await tx.thread.update({
        where: { id: quote.threadId },
        data: { orderId: order.id },
      });

      return { order, orderPayment };
    });

    await createNotification({
      userId: quote.providerId,
      actorId: userId,
      type: "order_status",
      title: "Quote accepted",
      body: "Your quote was accepted. The buyer can now pay the initial amount.",
      data: { orderId: result.order.id, quoteId: quote.id },
    });

    await createNotification({
      userId: quote.buyerId,
      actorId: quote.providerId,
      type: "order_status",
      title: "Quote accepted",
      body: "Please complete the initial payment to start the order.",
      data: { orderId: result.order.id, quoteId: quote.id },
    });

    res.json({ order: result.order, orderPayment: result.orderPayment });
  }),
);

quotesRouter.post(
  "/quotes/:id/reject",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const params = quoteParamsSchema.parse(req.params);
    const userId = req.user!.id;

    const quote = await prisma.quote.findUnique({
      where: { id: params.id },
    });

    if (!quote) {
      return res.status(404).json({ error: "Quote not found." });
    }

    if (req.user!.role !== "admin" && quote.buyerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (quote.status !== "sent") {
      return res.status(400).json({ error: "Quote is no longer available." });
    }

    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "rejected", rejectedAt: new Date() },
    });

    await createNotification({
      userId: quote.providerId,
      actorId: userId,
      type: "order_status",
      title: "Quote declined",
      body: "The buyer declined your quote.",
      data: { quoteId: quote.id },
    });

    res.json({ quote: updated });
  }),
);
