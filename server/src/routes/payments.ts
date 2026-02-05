import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { env } from "../config.js";
import { createNotification } from "../utils/notifications.js";
import { getPlatformSettings, type PlatformSettings } from "../utils/platform-settings.js";

export const paymentsRouter = Router();

const checkoutSchema = z.object({
  provider: z.enum(["flutterwave", "stripe"]),
  method: z.enum(["card", "mobile_money"]).optional(),
  items: z
    .array(
      z.object({
        serviceId: z.string().uuid(),
        tierId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).optional(),
      }),
    )
    .min(1),
});

const verifySchema = z.object({
  provider: z.enum(["flutterwave", "stripe"]),
  transaction_id: z.string().optional(),
  tx_ref: z.string().optional(),
  session_id: z.string().optional(),
});

const appUrl = env.APP_URL.replace(/\/+$/, "");

const toMinorUnits = (amount: Prisma.Decimal) => {
  const fixed = amount.toFixed(2);
  const [whole, fraction = ""] = fixed.split(".");
  const normalized = `${whole}${(fraction + "00").slice(0, 2)}`;
  return Number(normalized);
};

const toJsonInput = (value: Prisma.JsonValue) =>
  value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

const ensureBuyerAccess = async (paymentIntentId: string, user: { id: string; role: string }) => {
  if (user.role !== "buyer") {
    return;
  }
  const orders = await prisma.order.findMany({
    where: { paymentIntentId },
    select: { buyerId: true },
  });
  if (orders.length === 0) {
    return;
  }
  if (orders.some((order) => order.buyerId !== user.id)) {
    throw new Error("You are not allowed to verify this payment.");
  }
};

const createOrdersForCheckout = async (
  tx: Prisma.TransactionClient,
  userId: string,
  items: z.infer<typeof checkoutSchema>["items"],
  settings: PlatformSettings,
) => {
  const orders = [];

  for (const item of items) {
    const tier = await tx.serviceTier.findUnique({
      where: { id: item.tierId },
      include: { service: true },
    });

    if (!tier || tier.serviceId !== item.serviceId) {
      throw new Error("Invalid service tier");
    }

    const quantity = item.quantity ?? 1;
    const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const isPerUnit = tier.pricingType === "per_unit";
    const gross = isPerUnit ? tier.price.mul(normalizedQuantity) : tier.price;
    const fee = gross.mul(settings.platformFeeBps).div(10000);
    const tax = fee.mul(settings.taxBps).div(10000);
    const net = gross.sub(fee).sub(tax);

    const order = await tx.order.create({
      data: {
        buyerId: userId,
        providerId: tier.service.providerId,
        serviceId: item.serviceId,
        tierId: item.tierId,
        quantity: isPerUnit ? normalizedQuantity : 1,
        amountGross: gross,
        platformFee: fee,
        taxAmount: tax,
        amountNetProvider: net,
        currency: tier.currency,
        events: { create: { type: "created" } },
      },
    });

    orders.push(order);
  }

  return orders;
};

paymentsRouter.post(
  "/checkout",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const data = checkoutSchema.parse(req.body);
    const { settings } = await getPlatformSettings();
    const enabledProviders = settings.integrations.payments.enabledProviders;

    if (!enabledProviders.includes(data.provider)) {
      return res.status(400).json({ error: "Payment provider is currently disabled." });
    }

    const flutterwaveSecret =
      settings.integrations.payments.flutterwaveSecretKey || env.FLUTTERWAVE_SECRET_KEY;
    const stripeSecret =
      settings.integrations.payments.stripeSecretKey || env.STRIPE_SECRET_KEY;

    if (data.provider === "flutterwave" && !flutterwaveSecret) {
      return res.status(400).json({ error: "Flutterwave is not configured." });
    }
    if (data.provider === "stripe" && !stripeSecret) {
      return res.status(400).json({ error: "Stripe is not configured." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const orders = await createOrdersForCheckout(tx, req.user!.id, data.items, settings);

      if (orders.length === 0) {
        throw new Error("No orders created.");
      }

      const currency = orders[0].currency;
      if (orders.some((order) => order.currency !== currency)) {
        throw new Error("Mixed currencies are not supported in one checkout.");
      }

      const total = orders.reduce(
        (sum, order) => sum.add(order.amountGross),
        new Prisma.Decimal(0),
      );

      const paymentIntent = await tx.paymentIntent.create({
        data: {
          provider: data.provider,
          status: "created",
          amount: total,
          currency,
          metadata: {
            orderIds: orders.map((order) => order.id),
            buyerId: req.user!.id,
          },
        },
      });

      await tx.order.updateMany({
        where: { id: { in: orders.map((order) => order.id) } },
        data: { paymentIntentId: paymentIntent.id },
      });

      return { orders, paymentIntent, total, currency };
    });

    try {
      if (data.provider === "flutterwave") {
        const txRef = `scg_${result.paymentIntent.id}`;
        const paymentOptions =
          data.method === "mobile_money" ? "mobilemoneyghana" : "card";

        const response = await fetch("https://api.flutterwave.com/v3/payments", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${flutterwaveSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tx_ref: txRef,
            amount: result.total.toFixed(2),
            currency: result.currency,
            redirect_url: `${appUrl}/payment/verify?provider=flutterwave`,
            payment_options: paymentOptions,
            customer: {
              email:
                req.user!.email ??
                `${req.user!.id}@servfix.local`,
              phonenumber: req.user!.phone ?? undefined,
            },
            meta: {
              paymentIntentId: result.paymentIntent.id,
              orderIds: result.orders.map((order) => order.id),
            },
            customizations: {
              title: "SERVFIX",
              description: "Escrow payment for your service order.",
            },
          }),
        });

        const payload = (await response.json()) as {
          status?: string;
          message?: string;
          data?: { link?: string };
        };

        if (!response.ok || payload.status !== "success" || !payload.data?.link) {
          await prisma.paymentIntent.update({
            where: { id: result.paymentIntent.id },
            data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
          });
          return res.status(400).json({
            error: payload.message ?? "Unable to initialize Flutterwave payment.",
          });
        }

        await prisma.paymentIntent.update({
          where: { id: result.paymentIntent.id },
          data: {
            status: "pending",
            providerRef: txRef,
            metadata: {
              orderIds: result.orders.map((order) => order.id),
              buyerId: req.user!.id,
              flutterwave: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data.link,
          paymentIntentId: result.paymentIntent.id,
          provider: "flutterwave",
          orderIds: result.orders.map((order) => order.id),
        });
      }

      const amountMinor = toMinorUnits(result.total);
      const stripeBody = new URLSearchParams();
      stripeBody.append("mode", "payment");
      stripeBody.append(
        "success_url",
        `${appUrl}/payment/verify?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
      );
      stripeBody.append("cancel_url", `${appUrl}/cart?payment=cancelled`);
      stripeBody.append("line_items[0][price_data][currency]", result.currency.toLowerCase());
      stripeBody.append("line_items[0][price_data][product_data][name]", "SERVFIX");
      stripeBody.append("line_items[0][price_data][unit_amount]", String(amountMinor));
      stripeBody.append("line_items[0][quantity]", "1");
      stripeBody.append("metadata[paymentIntentId]", result.paymentIntent.id);
      stripeBody.append("metadata[orderIds]", result.orders.map((order) => order.id).join(","));
      stripeBody.append("client_reference_id", result.paymentIntent.id);
      if (req.user!.email) {
        stripeBody.append("customer_email", req.user!.email);
      }

      const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: stripeBody.toString(),
      });

      const stripePayload = (await stripeResponse.json()) as {
        id?: string;
        url?: string;
        error?: { message?: string };
      };

      if (!stripeResponse.ok || !stripePayload.id || !stripePayload.url) {
        await prisma.paymentIntent.update({
          where: { id: result.paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(stripePayload as Prisma.JsonValue) },
        });
        return res
          .status(400)
          .json({ error: stripePayload.error?.message ?? "Unable to initialize Stripe payment." });
      }

      await prisma.paymentIntent.update({
        where: { id: result.paymentIntent.id },
        data: {
          status: "pending",
          providerRef: stripePayload.id,
          metadata: {
            orderIds: result.orders.map((order) => order.id),
            buyerId: req.user!.id,
            stripe: stripePayload,
          },
        },
      });

      return res.json({
        checkoutUrl: stripePayload.url,
        paymentIntentId: result.paymentIntent.id,
        provider: "stripe",
        orderIds: result.orders.map((order) => order.id),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to initialize payment.";
      await prisma.paymentIntent.update({
        where: { id: result.paymentIntent.id },
        data: { status: "failed", metadata: { error: message } },
      });
      return res.status(400).json({ error: message });
    }
  }),
);

paymentsRouter.get(
  "/verify",
  authRequired,
  asyncHandler(async (req, res) => {
    const query = verifySchema.parse(req.query);
    const { settings } = await getPlatformSettings();
    const enabledProviders = settings.integrations.payments.enabledProviders;
    const flutterwaveSecret =
      settings.integrations.payments.flutterwaveSecretKey || env.FLUTTERWAVE_SECRET_KEY;
    const stripeSecret =
      settings.integrations.payments.stripeSecretKey || env.STRIPE_SECRET_KEY;

    if (query.provider === "flutterwave") {
      if (!enabledProviders.includes("flutterwave")) {
        return res.status(400).json({ error: "Flutterwave is currently disabled." });
      }
      const transactionId = query.transaction_id;
      const txRef = query.tx_ref;
      if (!transactionId || !txRef) {
        return res.status(400).json({ error: "Missing Flutterwave transaction reference." });
      }
      if (!flutterwaveSecret) {
        return res.status(400).json({ error: "Flutterwave is not configured." });
      }

      const paymentIntent = await prisma.paymentIntent.findFirst({
        where: { provider: "flutterwave", providerRef: txRef },
      });

      if (!paymentIntent) {
        return res.status(404).json({ error: "Payment intent not found." });
      }
      try {
        await ensureBuyerAccess(paymentIntent.id, req.user!);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        return res.status(403).json({ error: message });
      }

      const verifyResponse = await fetch(
        `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
        {
          headers: {
            Authorization: `Bearer ${flutterwaveSecret}`,
          },
        },
      );

      const verifyPayload = (await verifyResponse.json()) as {
        status?: string;
        message?: string;
        data?: {
          status?: string;
          amount?: number;
          currency?: string;
          tx_ref?: string;
        };
      };

      if (!verifyResponse.ok || verifyPayload.status !== "success") {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(verifyPayload as Prisma.JsonValue) },
        });
        return res
          .status(400)
          .json({ error: verifyPayload.message ?? "Unable to verify Flutterwave payment." });
      }

      if (
        verifyPayload.data?.status !== "successful" ||
        verifyPayload.data?.tx_ref !== txRef ||
        verifyPayload.data?.currency !== paymentIntent.currency
      ) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(verifyPayload as Prisma.JsonValue) },
        });
        return res.status(400).json({ error: "Flutterwave payment not successful." });
      }

      if (
        verifyPayload.data?.amount !== undefined &&
        new Prisma.Decimal(verifyPayload.data.amount).lessThan(paymentIntent.amount)
      ) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(verifyPayload as Prisma.JsonValue) },
        });
        return res.status(400).json({ error: "Amount mismatch." });
      }

      const result = await finalizePayment({
        paymentIntentId: paymentIntent.id,
        providerEventId: String(transactionId),
        providerPayload: toJsonInput(verifyPayload as Prisma.JsonValue),
        actorId: req.user!.id,
      });

      return res.json({ status: "success", paymentIntentId: paymentIntent.id, orders: result.orders });
    }

    const sessionId = query.session_id;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing Stripe session id." });
    }
    if (!enabledProviders.includes("stripe")) {
      return res.status(400).json({ error: "Stripe is currently disabled." });
    }
    if (!stripeSecret) {
      return res.status(400).json({ error: "Stripe is not configured." });
    }

    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
        },
      },
    );

    const stripePayload = (await stripeResponse.json()) as {
      id?: string;
      payment_status?: string;
      amount_total?: number;
      currency?: string;
      metadata?: { paymentIntentId?: string };
      client_reference_id?: string;
      error?: { message?: string };
    };

    if (!stripeResponse.ok || !stripePayload.id) {
      return res
        .status(400)
        .json({ error: stripePayload.error?.message ?? "Unable to verify Stripe payment." });
    }

    const paymentIntentId = stripePayload.metadata?.paymentIntentId ?? stripePayload.client_reference_id;
    if (!paymentIntentId) {
      return res.status(400).json({ error: "Stripe payment intent reference missing." });
    }

    const paymentIntent = await prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
    });

    if (!paymentIntent) {
      return res.status(404).json({ error: "Payment intent not found." });
    }
    try {
      await ensureBuyerAccess(paymentIntent.id, req.user!);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return res.status(403).json({ error: message });
    }

    if (stripePayload.payment_status !== "paid") {
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: "failed", metadata: toJsonInput(stripePayload as Prisma.JsonValue) },
      });
      return res.status(400).json({ error: "Stripe payment not completed." });
    }

    if (
      stripePayload.currency &&
      stripePayload.currency.toUpperCase() !== paymentIntent.currency
    ) {
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: "failed", metadata: toJsonInput(stripePayload as Prisma.JsonValue) },
      });
      return res.status(400).json({ error: "Currency mismatch." });
    }

    if (
      stripePayload.amount_total !== undefined &&
      stripePayload.amount_total < toMinorUnits(paymentIntent.amount)
    ) {
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: "failed", metadata: toJsonInput(stripePayload as Prisma.JsonValue) },
      });
      return res.status(400).json({ error: "Amount mismatch." });
    }

    const result = await finalizePayment({
      paymentIntentId: paymentIntent.id,
      providerEventId: stripePayload.id,
      providerPayload: toJsonInput(stripePayload as Prisma.JsonValue),
      actorId: req.user!.id,
    });

    return res.json({ status: "success", paymentIntentId: paymentIntent.id, orders: result.orders });
  }),
);

const finalizePayment = async (params: {
  paymentIntentId: string;
  providerEventId: string;
  providerPayload: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
  actorId: string;
}) => {
  const result = await prisma.$transaction(async (tx) => {
    const paymentIntent = await tx.paymentIntent.findUnique({
      where: { id: params.paymentIntentId },
    });

    if (!paymentIntent) {
      throw new Error("Payment intent not found.");
    }

    const orders = await tx.order.findMany({
      where: { paymentIntentId: paymentIntent.id },
      include: { service: true },
    });

    const didFinalize = paymentIntent.status !== "succeeded";

    if (didFinalize) {
      await tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: "succeeded" },
      });

      await tx.paymentEvent.createMany({
        data: [
          {
            paymentIntentId: paymentIntent.id,
            providerEventId: params.providerEventId,
            status: "processed",
            payload: params.providerPayload,
            processedAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });

      const eligibleOrders = orders.filter((order) => order.status === "created");

      if (eligibleOrders.length > 0) {
        await tx.order.updateMany({
          where: {
            id: { in: eligibleOrders.map((order) => order.id) },
            status: "created",
          },
          data: { status: "paid_to_escrow" },
        });

        const pendingByProvider = new Map<string, Prisma.Decimal>();
        eligibleOrders.forEach((order) => {
          const current = pendingByProvider.get(order.providerId) ?? new Prisma.Decimal(0);
          pendingByProvider.set(order.providerId, current.add(order.amountNetProvider));
        });

        await Promise.all(
          Array.from(pendingByProvider.entries()).map(([providerId, amount]) =>
            tx.providerWallet.upsert({
              where: { providerId },
              create: {
                providerId,
                availableBalance: new Prisma.Decimal(0),
                pendingBalance: amount,
                currency: orders[0]?.currency ?? "GHS",
              },
              update: {
                pendingBalance: { increment: amount },
              },
            }),
          ),
        );

        await tx.orderEvent.createMany({
          data: eligibleOrders.map((order) => ({
            orderId: order.id,
            type: "paid",
            payload: { provider: paymentIntent.provider },
          })),
        });
      }
    }

    return { paymentIntent, orders, didFinalize };
  });

  if (result.didFinalize) {
    const notifiedOrders = result.orders.filter((order) => order.status === "created");
    await Promise.all(
      notifiedOrders.flatMap((order) => {
        const serviceTitle = order.service?.title ?? "service";
        return [
          createNotification({
            userId: order.providerId,
            actorId: params.actorId,
            type: "order_status",
            title: "Payment received",
            body: `Payment received for ${serviceTitle}.`,
            data: { orderId: order.id, serviceId: order.serviceId },
          }),
          createNotification({
            userId: order.buyerId,
            actorId: order.providerId,
            type: "order_status",
            title: "Payment confirmed",
            body: `Your payment for ${serviceTitle} was confirmed.`,
            data: { orderId: order.id, serviceId: order.serviceId },
          }),
        ];
      }),
    );
  }

  return result;
};
