import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../db.js";
import { env } from "../config.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createNotification } from "../utils/notifications.js";
import { getPlatformSettings } from "../utils/platform-settings.js";
import { Prisma, type PaymentProvider } from "@prisma/client";

export const webhooksRouter = Router();

const timingSafeEqual = (a: string, b: string) => {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const verifyStripeSignature = (rawBody: string, signature: string, secret: string) => {
  const elements = signature.split(",").reduce<Record<string, string[]>>((acc, item) => {
    const [key, value] = item.split("=");
    if (!key || !value) return acc;
    acc[key] = acc[key] ? [...acc[key], value] : [value];
    return acc;
  }, {});

  const timestamp = elements["t"]?.[0];
  const signatures = elements["v1"] ?? [];
  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  const isValid = signatures.some((sig) => timingSafeEqual(sig, expected));
  if (!isValid) {
    return false;
  }

  const toleranceSeconds = 10 * 60;
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceSeconds) {
    return false;
  }

  return true;
};

const verifyFlutterwaveSignature = (rawBody: string, headers: Record<string, string | string[] | undefined>, secret: string) => {
  const hashHeader = headers["verif-hash"];
  if (hashHeader) {
    const hash = Array.isArray(hashHeader) ? hashHeader[0] : hashHeader;
    return timingSafeEqual(hash ?? "", secret);
  }

  const signatureHeader = headers["flutterwave-signature"];
  if (signatureHeader) {
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return timingSafeEqual(signature ?? "", expected);
  }

  return false;
};

const markOrderRefunded = async (params: {
  orderId?: string | null;
  refundReference?: string | null;
  provider: PaymentProvider;
  payload: Prisma.JsonValue;
}) => {
  let order = null;

  if (params.orderId) {
    order = await prisma.order.findUnique({
      where: { id: params.orderId },
      include: { service: true },
    });
  }

  if (!order && params.refundReference) {
    order = await prisma.order.findFirst({
      where: { refundReference: params.refundReference },
      include: { service: true },
    });
  }

  if (!order) {
    return null;
  }

  if (order.status === "refunded") {
    return order;
  }

  if (!["refund_pending", "cancelled"].includes(order.status)) {
    return order;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.order.update({
      where: { id: order!.id },
      data: {
        status: "refunded",
        refundCompletedAt: new Date(),
        refundProvider: params.provider,
        refundReference: params.refundReference ?? order!.refundReference ?? undefined,
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order!.id,
        type: "refunded",
        payload: {
          provider: params.provider,
          refundReference: params.refundReference ?? null,
          webhook: true,
        },
      },
    });

    return updatedOrder;
  });

  const serviceTitle = order.service?.title ?? "service";
  await createNotification({
    userId: order.buyerId,
    actorId: order.providerId,
    type: "order_status",
    title: "Refund completed",
    body: `Your payment for ${serviceTitle} has been refunded.`,
    data: { orderId: order.id, serviceId: order.serviceId },
  });

  return updated;
};

const markPayoutRequest = async (params: {
  reference?: string | null;
  status: "paid" | "failed";
  payload: Prisma.JsonValue;
}) => {
  if (!params.reference) {
    return null;
  }

  const request = await prisma.payoutRequest.findFirst({
    where: { reference: params.reference },
  });

  if (!request) {
    return null;
  }

  if (["paid", "failed", "cancelled"].includes(request.status)) {
    return request;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const wallet = await tx.providerWallet.upsert({
      where: { providerId: request.providerId },
      create: {
        providerId: request.providerId,
        availableBalance: new Prisma.Decimal(0),
        pendingBalance: new Prisma.Decimal(0),
        currency: request.currency,
      },
      update: {},
    });

    if (params.status === "paid") {
      const pendingAfter = wallet.pendingBalance.sub(request.amount);
      await tx.providerWallet.update({
        where: { providerId: request.providerId },
        data: {
          pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
        },
      });
    }

    if (params.status === "failed") {
      const pendingAfter = wallet.pendingBalance.sub(request.amount);
      await tx.providerWallet.update({
        where: { providerId: request.providerId },
        data: {
          availableBalance: { increment: request.amount },
          pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
        },
      });
    }

    const metadata =
      params.payload === null ? Prisma.JsonNull : (params.payload as Prisma.InputJsonValue);

    return tx.payoutRequest.update({
      where: { id: request.id },
      data: {
        status: params.status,
        metadata,
      },
    });
  });

  if (params.status === "paid") {
    await createNotification({
      userId: request.providerId,
      actorId: null,
      type: "payout_update",
      title: "Payout completed",
      body: `Your payout of ${request.currency} ${request.amount.toFixed(2)} is completed.`,
      data: { payoutRequestId: request.id },
    });
  } else {
    await createNotification({
      userId: request.providerId,
      actorId: null,
      type: "payout_update",
      title: "Payout failed",
      body: "Your payout could not be completed. Funds have been returned to your balance.",
      data: { payoutRequestId: request.id },
    });
  }

  return updated;
};

webhooksRouter.post(
  "/stripe",
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    const stripeSecret =
      settings.integrations.webhooks.stripeWebhookSecret || env.STRIPE_WEBHOOK_SECRET;
    if (!stripeSecret) {
      return res.status(400).json({ error: "Stripe webhook secret not configured." });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: "Missing Stripe signature." });
    }

    const rawBody = req.rawBody?.toString("utf8") ?? "";
    if (!rawBody) {
      return res.status(400).json({ error: "Missing webhook payload." });
    }

    const isValid = verifyStripeSignature(rawBody, signature, stripeSecret);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid Stripe signature." });
    }

    const event = req.body as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };

    const type = event.type ?? "";
    const data = event.data?.object ?? {};

    if (type === "refund.succeeded" || type === "refund.updated") {
      const status = String(data["status"] ?? "").toLowerCase();
      if (status === "succeeded") {
        const refundId = data["id"] ? String(data["id"]) : undefined;
        const metadata = data["metadata"] as Record<string, string> | undefined;
        const orderId = metadata?.orderId;

        await markOrderRefunded({
          orderId,
          refundReference: refundId,
          provider: "stripe",
          payload: event as Prisma.JsonValue,
        });
      }
    }

    res.json({ received: true });
  }),
);

webhooksRouter.post(
  "/flutterwave",
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    const flutterwaveHash =
      settings.integrations.webhooks.flutterwaveWebhookHash || env.FLUTTERWAVE_WEBHOOK_HASH;
    if (!flutterwaveHash) {
      return res.status(400).json({ error: "Flutterwave webhook hash not configured." });
    }

    const rawBody = req.rawBody?.toString("utf8") ?? "";
    if (!rawBody) {
      return res.status(400).json({ error: "Missing webhook payload." });
    }

    const isValid = verifyFlutterwaveSignature(rawBody, req.headers, flutterwaveHash);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid Flutterwave signature." });
    }

    const payload = req.body as {
      event?: string;
      type?: string;
      data?: Record<string, unknown>;
    };

    const eventName = String(payload.event ?? payload.type ?? "").toLowerCase();
    if (eventName.includes("transfer")) {
      const data = payload.data ?? {};
      const status = String(data["status"] ?? "").toLowerCase();
      const referenceValue = data["reference"] ?? data["transfer_reference"];
      const reference = referenceValue ? String(referenceValue) : undefined;
      const isSuccess = ["successful", "success", "completed"].includes(status);
      const isFailed = ["failed", "cancelled", "canceled"].includes(status);

      if (isSuccess || isFailed) {
        await markPayoutRequest({
          reference,
          status: isSuccess ? "paid" : "failed",
          payload: payload as Prisma.JsonValue,
        });
      }

      return res.json({ received: true });
    }

    if (!eventName.includes("refund")) {
      return res.json({ received: true });
    }

    const data = payload.data ?? {};
    const status = String(data["status"] ?? data["refund_status"] ?? "").toLowerCase();
    const isCompleted = ["completed", "successful", "success", "succeeded"].includes(status);

    if (!isCompleted) {
      return res.json({ received: true });
    }

    const refundId =
      data["id"] ??
      data["refund_id"] ??
      data["refundId"];
    const refundReference = refundId ? String(refundId) : undefined;
    const meta = (data["meta"] as Record<string, unknown> | undefined) ?? {};
    const orderIdValue =
      meta["orderId"] ??
      meta["order_id"] ??
      meta["orderID"];
    const orderId = orderIdValue ? String(orderIdValue) : undefined;

    await markOrderRefunded({
      orderId,
      refundReference,
      provider: "flutterwave",
      payload: payload as Prisma.JsonValue,
    });

    res.json({ received: true });
  }),
);
