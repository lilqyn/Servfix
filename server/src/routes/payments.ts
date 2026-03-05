import { Router } from "express";
import { z } from "zod";
import { Prisma, BoostType } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { env } from "../config.js";
import { createNotification } from "../utils/notifications.js";
import { getPlatformSettings, type PlatformSettings } from "../utils/platform-settings.js";
import { getBoostOption } from "../utils/boosts.js";
import {
  createHubtelPaylink,
  normalizeHubtelPhone,
  resolveHubtelConfig,
} from "../utils/hubtel.js";
import {
  buildExpresspayCustomer,
  createExpresspayCheckout,
  normalizeExpresspayPhone,
  queryExpresspayPayment,
  resolveExpresspayConfig,
} from "../utils/expresspay.js";
import { getProviderCurrencyError } from "../utils/payment-provider-support.js";

export const paymentsRouter = Router();

const checkoutReturnSchema = z.enum(["web", "mobile"]);

const checkoutSchema = z.object({
  provider: z.enum(["flutterwave", "stripe", "paystack", "hubtel", "expresspay"]),
  method: z.enum(["card", "mobile_money"]).optional(),
  returnTo: checkoutReturnSchema.optional(),
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

const orderPaymentCheckoutSchema = z.object({
  provider: z.enum(["flutterwave", "stripe", "paystack", "hubtel", "expresspay"]),
  method: z.enum(["card", "mobile_money"]).optional(),
  returnTo: checkoutReturnSchema.optional(),
  orderPaymentId: z.string().uuid(),
});

const verifySchema = z.object({
  provider: z.enum(["flutterwave", "stripe", "paystack", "hubtel", "expresspay"]),
  payment_intent_id: z.string().uuid().optional(),
  transaction_id: z.string().optional(),
  tx_ref: z.string().optional(),
  session_id: z.string().optional(),
  reference: z.string().optional(),
  trxref: z.string().optional(),
  token: z.string().optional(),
  order_id: z.string().optional(),
  "order-id": z.string().optional(),
});

const appUrl = env.APP_URL.replace(/\/+$/, "");
type CheckoutReturnTo = z.infer<typeof checkoutReturnSchema>;
type PaymentProvider = z.infer<typeof verifySchema>["provider"];

const buildPaymentVerifyUrl = (params: {
  provider: PaymentProvider;
  returnTo: CheckoutReturnTo;
  extraParams?: Record<string, string | undefined>;
}) => {
  const query = new URLSearchParams({ provider: params.provider });
  if (params.returnTo === "mobile") {
    query.set("return_to", "mobile");
  }
  if (params.extraParams) {
    Object.entries(params.extraParams).forEach(([key, value]) => {
      if (value) {
        query.set(key, value);
      }
    });
  }
  return `${appUrl}/payment/verify?${query.toString()}`;
};

const toMinorUnits = (amount: Prisma.Decimal) => {
  const fixed = amount.toFixed(2);
  const [whole, fraction = ""] = fixed.split(".");
  const normalized = `${whole}${(fraction + "00").slice(0, 2)}`;
  return Number(normalized);
};

const toJsonInput = (value: Prisma.JsonValue) =>
  value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

type PaymentPurpose = "orders" | "boost" | "subscription" | "invoice" | "order_payment";

type PaymentMetadata = {
  purpose?: PaymentPurpose;
  orderIds?: string[];
  orderPaymentId?: string;
  orderId?: string;
  buyerId?: string;
  boostType?: BoostType;
  serviceId?: string;
  providerId?: string;
  planId?: string;
  invoiceId?: string;
  accountId?: string;
  payerId?: string;
};

const getPaymentMetadata = (value: Prisma.JsonValue | null | undefined): PaymentMetadata => {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as PaymentMetadata;
};

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

const ensureOrderPaymentAccess = async (
  orderPaymentId: string,
  user: { id: string; role: string },
) => {
  if (user.role === "admin") {
    return;
  }
  const payment = await prisma.orderPayment.findUnique({
    where: { id: orderPaymentId },
    select: { order: { select: { buyerId: true } } },
  });
  if (!payment || payment.order?.buyerId !== user.id) {
    throw new Error("You are not allowed to verify this payment.");
  }
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const ensurePaymentAccess = async (
  paymentIntent: { id: string; metadata: Prisma.JsonValue | null },
  user: { id: string; role: string },
) => {
  const metadata = getPaymentMetadata(paymentIntent.metadata);
  if (metadata.purpose === "boost" || metadata.purpose === "subscription") {
    if (user.role !== "provider" && user.role !== "admin") {
      throw new Error("You are not allowed to verify this payment.");
    }
    if (metadata.providerId && user.role !== "admin" && metadata.providerId !== user.id) {
      throw new Error("You are not allowed to verify this payment.");
    }
    return;
  }

  if (metadata.purpose === "invoice") {
    if (user.role === "admin") {
      return;
    }
    if (metadata.payerId && metadata.payerId === user.id) {
      return;
    }
    if (metadata.accountId) {
      const membership = await prisma.businessMember.findFirst({
        where: { accountId: metadata.accountId, userId: user.id, status: "active" },
        select: { id: true },
      });
      if (membership) {
        return;
      }
    }
    throw new Error("You are not allowed to verify this payment.");
  }

  if (metadata.purpose === "order_payment") {
    if (!metadata.orderPaymentId) {
      throw new Error("Order payment reference missing.");
    }
    await ensureOrderPaymentAccess(metadata.orderPaymentId, user);
    return;
  }

  await ensureBuyerAccess(paymentIntent.id, user);
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
  requireRole("buyer", "provider", "admin"),
  asyncHandler(async (req, res) => {
    const data = checkoutSchema.parse(req.body);
    const returnTo = data.returnTo ?? "web";
    const { settings } = await getPlatformSettings();
    const enabledProviders = settings.integrations.payments.enabledProviders;

    if (!enabledProviders.includes(data.provider)) {
      return res.status(400).json({ error: "Payment provider is currently disabled." });
    }

    const flutterwaveSecret =
      settings.integrations.payments.flutterwaveSecretKey || env.FLUTTERWAVE_SECRET_KEY;
    const paystackSecret =
      settings.integrations.payments.paystackSecretKey || env.PAYSTACK_SECRET_KEY;
    const stripeSecret =
      settings.integrations.payments.stripeSecretKey || env.STRIPE_SECRET_KEY;
    const hubtelConfig = resolveHubtelConfig(settings);
    const expresspayConfig = resolveExpresspayConfig(settings);

    if (data.provider === "flutterwave" && !flutterwaveSecret) {
      return res.status(400).json({ error: "Flutterwave is not configured." });
    }
    if (data.provider === "paystack" && !paystackSecret) {
      return res.status(400).json({ error: "Paystack is not configured." });
    }
    if (data.provider === "stripe" && !stripeSecret) {
      return res.status(400).json({ error: "Stripe is not configured." });
    }
    if (data.provider === "hubtel" && !hubtelConfig) {
      return res.status(400).json({ error: "Hubtel is not configured." });
    }
    if (data.provider === "expresspay" && !expresspayConfig) {
      return res.status(400).json({ error: "ExpressPay is not configured." });
    }

    const hubtelPhone =
      data.provider === "hubtel" ? normalizeHubtelPhone(req.user!.phone) : null;
    if (data.provider === "hubtel" && !hubtelPhone) {
      return res.status(400).json({
        error: "Hubtel requires a valid phone number in E.164 format.",
      });
    }
    const expresspayPhone =
      data.provider === "expresspay" ? normalizeExpresspayPhone(req.user!.phone) : null;
    if (data.provider === "expresspay" && !expresspayPhone) {
      return res.status(400).json({
        error: "ExpressPay requires a valid phone number.",
      });
    }

    const tierIds = Array.from(new Set(data.items.map((item) => item.tierId)));
    const tiers = await prisma.serviceTier.findMany({
      where: { id: { in: tierIds } },
      select: { id: true, serviceId: true, pricingModel: true, currency: true },
    });

    if (tiers.length !== tierIds.length) {
      return res.status(400).json({ error: "Invalid service tier." });
    }

    const tierMap = new Map(tiers.map((tier) => [tier.id, tier]));
    const invalidTier = data.items.find((item) => {
      const tier = tierMap.get(item.tierId);
      return !tier || tier.serviceId !== item.serviceId;
    });

    if (invalidTier) {
      return res.status(400).json({ error: "Invalid service tier." });
    }

    const hasNonFixed = tiers.some(
      (tier) => (tier.pricingModel ?? "fixed") !== "fixed",
    );
    if (hasNonFixed) {
      return res.status(400).json({ error: "This service requires a quote." });
    }
    const checkoutCurrency = tiers[0]?.currency ?? "GHS";
    if (tiers.some((tier) => tier.currency !== checkoutCurrency)) {
      return res.status(400).json({ error: "Mixed currencies are not supported in one checkout." });
    }
    const providerCurrencyError = getProviderCurrencyError(data.provider, checkoutCurrency);
    if (providerCurrencyError) {
      return res.status(400).json({ error: providerCurrencyError });
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
        data: { paymentIntentId: paymentIntent.id, status: "payment_pending" },
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
            redirect_url: buildPaymentVerifyUrl({
              provider: "flutterwave",
              returnTo,
              extraParams: { payment_intent_id: result.paymentIntent.id },
            }),
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

      if (data.provider === "paystack") {
        const reference = `scg_${result.paymentIntent.id}`;
        const channels =
          data.method === "mobile_money"
            ? ["mobile_money"]
            : data.method === "card"
              ? ["card"]
              : undefined;

        const payloadBody: Record<string, unknown> = {
          email: req.user!.email ?? `${req.user!.id}@servfix.local`,
          amount: toMinorUnits(result.total),
          currency: result.currency,
          reference,
          callback_url: buildPaymentVerifyUrl({
            provider: "paystack",
            returnTo,
            extraParams: { payment_intent_id: result.paymentIntent.id },
          }),
          metadata: {
            paymentIntentId: result.paymentIntent.id,
            orderIds: result.orders.map((order) => order.id),
            buyerId: req.user!.id,
          },
        };

        if (channels) {
          payloadBody.channels = channels;
        }

        const response = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payloadBody),
        });

        const payload = (await response.json()) as {
          status?: boolean;
          message?: string;
          data?: { authorization_url?: string; reference?: string };
        };

        if (!response.ok || !payload.status || !payload.data?.authorization_url) {
          await prisma.paymentIntent.update({
            where: { id: result.paymentIntent.id },
            data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
          });
          return res.status(400).json({
            error: payload.message ?? "Unable to initialize Paystack payment.",
          });
        }

        await prisma.paymentIntent.update({
          where: { id: result.paymentIntent.id },
          data: {
            status: "pending",
            providerRef: payload.data.reference ?? reference,
            metadata: {
              orderIds: result.orders.map((order) => order.id),
              buyerId: req.user!.id,
              paystack: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data.authorization_url,
          paymentIntentId: result.paymentIntent.id,
          provider: "paystack",
          orderIds: result.orders.map((order) => order.id),
        });
      }

      if (data.provider === "expresspay") {
        const redirectUrl = buildPaymentVerifyUrl({
          provider: "expresspay",
          returnTo,
          extraParams: { payment_intent_id: result.paymentIntent.id },
        });
        const postUrl = `${appUrl}/api/webhooks/expresspay`;
        const customer = buildExpresspayCustomer(req.user!);

        const payload = await createExpresspayCheckout(expresspayConfig!, {
          amount: result.total.toFixed(2),
          currency: result.currency,
          orderId: result.paymentIntent.id,
          redirectUrl,
          postUrl,
          customer: {
            ...customer,
            phonenumber: expresspayPhone!,
          },
          orderDesc: "Escrow payment for your service order.",
        });

        await prisma.paymentIntent.update({
          where: { id: result.paymentIntent.id },
          data: {
            status: "pending",
            providerRef: payload.token,
            metadata: {
              orderIds: result.orders.map((order) => order.id),
              buyerId: req.user!.id,
              expresspay: payload as unknown as Prisma.InputJsonValue,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.checkoutUrl,
          paymentIntentId: result.paymentIntent.id,
          provider: "expresspay",
          orderIds: result.orders.map((order) => order.id),
        });
      }

      if (data.provider === "hubtel") {
        const callbackUrl = `${appUrl}/api/webhooks/hubtel`;
        const returnUrl = buildPaymentVerifyUrl({
          provider: "hubtel",
          returnTo,
          extraParams: {
            reference: result.paymentIntent.id,
            payment_intent_id: result.paymentIntent.id,
          },
        });
        const cancellationUrl =
          returnTo === "mobile"
            ? buildPaymentVerifyUrl({
                provider: "hubtel",
                returnTo,
                extraParams: {
                  status: "cancelled",
                  payment_intent_id: result.paymentIntent.id,
                },
              })
            : `${appUrl}/cart?payment=cancelled`;

        const payload = await createHubtelPaylink(hubtelConfig!, {
          mobileNumber: hubtelPhone!,
          amount: Number(result.total.toFixed(2)),
          title: "SERVFIX",
          description: "Escrow payment for your service order.",
          clientReference: result.paymentIntent.id,
          callbackUrl,
          returnUrl,
          cancellationUrl,
        });

        await prisma.paymentIntent.update({
          where: { id: result.paymentIntent.id },
          data: {
            status: "pending",
            providerRef:
              payload.data?.paylinkId ??
              payload.data?.transactionId ??
              result.paymentIntent.id,
            metadata: {
              orderIds: result.orders.map((order) => order.id),
              buyerId: req.user!.id,
              hubtel: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data?.paylinkUrl,
          paymentIntentId: result.paymentIntent.id,
          provider: "hubtel",
          orderIds: result.orders.map((order) => order.id),
        });
      }

      const amountMinor = toMinorUnits(result.total);
      const stripeBody = new URLSearchParams();
      const stripeSuccessUrl = `${buildPaymentVerifyUrl({
        provider: "stripe",
        returnTo,
        extraParams: { payment_intent_id: result.paymentIntent.id },
      })}&session_id={CHECKOUT_SESSION_ID}`;
      const stripeCancelUrl =
        returnTo === "mobile"
          ? buildPaymentVerifyUrl({
              provider: "stripe",
              returnTo,
              extraParams: {
                status: "cancelled",
                payment_intent_id: result.paymentIntent.id,
              },
            })
          : `${appUrl}/cart?payment=cancelled`;
      stripeBody.append("mode", "payment");
      stripeBody.append("success_url", stripeSuccessUrl);
      stripeBody.append("cancel_url", stripeCancelUrl);
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

paymentsRouter.post(
  "/order-payment",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const data = orderPaymentCheckoutSchema.parse(req.body);
    const returnTo = data.returnTo ?? "web";
    const { settings } = await getPlatformSettings();
    const enabledProviders = settings.integrations.payments.enabledProviders;

    if (!enabledProviders.includes(data.provider)) {
      return res.status(400).json({ error: "Payment provider is currently disabled." });
    }

    const flutterwaveSecret =
      settings.integrations.payments.flutterwaveSecretKey || env.FLUTTERWAVE_SECRET_KEY;
    const paystackSecret =
      settings.integrations.payments.paystackSecretKey || env.PAYSTACK_SECRET_KEY;
    const stripeSecret =
      settings.integrations.payments.stripeSecretKey || env.STRIPE_SECRET_KEY;

    if (data.provider === "flutterwave" && !flutterwaveSecret) {
      return res.status(400).json({ error: "Flutterwave is not configured." });
    }
    if (data.provider === "paystack" && !paystackSecret) {
      return res.status(400).json({ error: "Paystack is not configured." });
    }
    if (data.provider === "stripe" && !stripeSecret) {
      return res.status(400).json({ error: "Stripe is not configured." });
    }

    const hubtelConfig = resolveHubtelConfig(settings);
    const expresspayConfig = resolveExpresspayConfig(settings);

    if (data.provider === "hubtel" && !hubtelConfig) {
      return res.status(400).json({ error: "Hubtel is not configured." });
    }
    if (data.provider === "expresspay" && !expresspayConfig) {
      return res.status(400).json({ error: "ExpressPay is not configured." });
    }

    const hubtelPhone =
      data.provider === "hubtel" ? normalizeHubtelPhone(req.user!.phone) : null;
    if (data.provider === "hubtel" && !hubtelPhone) {
      return res.status(400).json({
        error: "Hubtel requires a valid phone number in E.164 format.",
      });
    }
    const expresspayPhone =
      data.provider === "expresspay" ? normalizeExpresspayPhone(req.user!.phone) : null;
    if (data.provider === "expresspay" && !expresspayPhone) {
      return res.status(400).json({
        error: "ExpressPay requires a valid phone number.",
      });
    }

    const orderPayment = await prisma.orderPayment.findUnique({
      where: { id: data.orderPaymentId },
      include: {
        order: {
          select: { id: true, buyerId: true, providerId: true },
        },
      },
    });

    if (!orderPayment) {
      return res.status(404).json({ error: "Order payment not found." });
    }

    if (req.user!.role !== "admin" && orderPayment.order?.buyerId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (orderPayment.status !== "pending") {
      return res.status(400).json({ error: "This payment has already been processed." });
    }
    const orderPaymentCurrencyError = getProviderCurrencyError(
      data.provider,
      orderPayment.currency,
    );
    if (orderPaymentCurrencyError) {
      return res.status(400).json({ error: orderPaymentCurrencyError });
    }

    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        provider: data.provider,
        status: "created",
        amount: orderPayment.amount,
        currency: orderPayment.currency,
        metadata: {
          purpose: "order_payment",
          orderPaymentId: orderPayment.id,
          orderId: orderPayment.orderId,
          buyerId: orderPayment.order?.buyerId,
        },
      },
    });

    await prisma.orderPayment.update({
      where: { id: orderPayment.id },
      data: { paymentIntentId: paymentIntent.id },
    });

    try {
      if (data.provider === "flutterwave") {
        const txRef = `scg_${paymentIntent.id}`;
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
            amount: orderPayment.amount.toFixed(2),
            currency: orderPayment.currency,
            redirect_url: buildPaymentVerifyUrl({
              provider: "flutterwave",
              returnTo,
              extraParams: { payment_intent_id: paymentIntent.id },
            }),
            payment_options: paymentOptions,
            customer: {
              email: req.user!.email ?? `${req.user!.id}@servfix.local`,
              phonenumber: req.user!.phone ?? undefined,
            },
            meta: {
              paymentIntentId: paymentIntent.id,
              orderPaymentId: orderPayment.id,
              orderId: orderPayment.orderId,
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
            where: { id: paymentIntent.id },
            data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
          });
          return res.status(400).json({
            error: payload.message ?? "Unable to initialize Flutterwave payment.",
          });
        }

        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "pending",
            providerRef: txRef,
            metadata: {
              purpose: "order_payment",
              orderPaymentId: orderPayment.id,
              orderId: orderPayment.orderId,
              buyerId: orderPayment.order?.buyerId,
              flutterwave: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data.link,
          paymentIntentId: paymentIntent.id,
          provider: "flutterwave",
          orderPaymentId: orderPayment.id,
          orderId: orderPayment.orderId,
        });
      }

      if (data.provider === "paystack") {
        const reference = `scg_${paymentIntent.id}`;
        const channels =
          data.method === "mobile_money"
            ? ["mobile_money"]
            : data.method === "card"
              ? ["card"]
              : undefined;

        const payloadBody: Record<string, unknown> = {
          email: req.user!.email ?? `${req.user!.id}@servfix.local`,
          amount: toMinorUnits(orderPayment.amount),
          currency: orderPayment.currency,
          reference,
          callback_url: buildPaymentVerifyUrl({
            provider: "paystack",
            returnTo,
            extraParams: { payment_intent_id: paymentIntent.id },
          }),
          metadata: {
            paymentIntentId: paymentIntent.id,
            orderPaymentId: orderPayment.id,
            orderId: orderPayment.orderId,
            buyerId: orderPayment.order?.buyerId,
          },
        };

        if (channels) {
          payloadBody.channels = channels;
        }

        const response = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payloadBody),
        });

        const payload = (await response.json()) as {
          status?: boolean;
          message?: string;
          data?: { authorization_url?: string; reference?: string };
        };

        if (!response.ok || !payload.status || !payload.data?.authorization_url) {
          await prisma.paymentIntent.update({
            where: { id: paymentIntent.id },
            data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
          });
          return res.status(400).json({
            error: payload.message ?? "Unable to initialize Paystack payment.",
          });
        }

        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "pending",
            providerRef: payload.data.reference ?? reference,
            metadata: {
              purpose: "order_payment",
              orderPaymentId: orderPayment.id,
              orderId: orderPayment.orderId,
              buyerId: orderPayment.order?.buyerId,
              paystack: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data.authorization_url,
          paymentIntentId: paymentIntent.id,
          provider: "paystack",
          orderPaymentId: orderPayment.id,
          orderId: orderPayment.orderId,
        });
      }

      if (data.provider === "expresspay") {
        const redirectUrl = buildPaymentVerifyUrl({
          provider: "expresspay",
          returnTo,
          extraParams: { payment_intent_id: paymentIntent.id },
        });
        const postUrl = `${appUrl}/api/webhooks/expresspay`;
        const customer = buildExpresspayCustomer(req.user!);

        const payload = await createExpresspayCheckout(expresspayConfig!, {
          amount: orderPayment.amount.toFixed(2),
          currency: orderPayment.currency,
          orderId: paymentIntent.id,
          redirectUrl,
          postUrl,
          customer: {
            ...customer,
            phonenumber: expresspayPhone!,
          },
          orderDesc: "Payment for your service order.",
        });

        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "pending",
            providerRef: payload.token,
            metadata: {
              purpose: "order_payment",
              orderPaymentId: orderPayment.id,
              orderId: orderPayment.orderId,
              buyerId: orderPayment.order?.buyerId,
              expresspay: payload as unknown as Prisma.InputJsonValue,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.checkoutUrl,
          paymentIntentId: paymentIntent.id,
          provider: "expresspay",
          orderPaymentId: orderPayment.id,
          orderId: orderPayment.orderId,
        });
      }

      if (data.provider === "hubtel") {
        const stageLabel = orderPayment.stage === "deposit" ? "Initial payment" : "Payable amount";
        const callbackUrl = `${appUrl}/api/webhooks/hubtel`;
        const returnUrl = buildPaymentVerifyUrl({
          provider: "hubtel",
          returnTo,
          extraParams: {
            reference: paymentIntent.id,
            payment_intent_id: paymentIntent.id,
          },
        });
        const cancellationUrl =
          returnTo === "mobile"
            ? buildPaymentVerifyUrl({
                provider: "hubtel",
                returnTo,
                extraParams: {
                  status: "cancelled",
                  payment_intent_id: paymentIntent.id,
                },
              })
            : buildPaymentVerifyUrl({
                provider: "hubtel",
                returnTo,
                extraParams: {
                  reference: paymentIntent.id,
                  payment_intent_id: paymentIntent.id,
                },
              });

        const payload = await createHubtelPaylink(hubtelConfig!, {
          mobileNumber: hubtelPhone!,
          amount: Number(orderPayment.amount.toFixed(2)),
          title: "SERVFIX",
          description: `${stageLabel} payment for your service order.`,
          clientReference: paymentIntent.id,
          callbackUrl,
          returnUrl,
          cancellationUrl,
        });

        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "pending",
            providerRef:
              payload.data?.paylinkId ??
              payload.data?.transactionId ??
              paymentIntent.id,
            metadata: {
              purpose: "order_payment",
              orderPaymentId: orderPayment.id,
              orderId: orderPayment.orderId,
              buyerId: orderPayment.order?.buyerId,
              hubtel: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data?.paylinkUrl,
          paymentIntentId: paymentIntent.id,
          provider: "hubtel",
          orderPaymentId: orderPayment.id,
          orderId: orderPayment.orderId,
        });
      }

      const amountMinor = toMinorUnits(orderPayment.amount);
      const stripeBody = new URLSearchParams();
      const stripeSuccessUrl = `${buildPaymentVerifyUrl({
        provider: "stripe",
        returnTo,
        extraParams: { payment_intent_id: paymentIntent.id },
      })}&session_id={CHECKOUT_SESSION_ID}`;
      const stripeCancelUrl =
        returnTo === "mobile"
          ? buildPaymentVerifyUrl({
              provider: "stripe",
              returnTo,
              extraParams: {
                status: "cancelled",
                payment_intent_id: paymentIntent.id,
              },
            })
          : `${appUrl}/cart?payment=cancelled`;
      stripeBody.append("mode", "payment");
      stripeBody.append("success_url", stripeSuccessUrl);
      stripeBody.append("cancel_url", stripeCancelUrl);
      stripeBody.append("line_items[0][price_data][currency]", orderPayment.currency.toLowerCase());
      stripeBody.append("line_items[0][price_data][product_data][name]", "SERVFIX");
      stripeBody.append("line_items[0][price_data][unit_amount]", String(amountMinor));
      stripeBody.append("line_items[0][quantity]", "1");
      stripeBody.append("metadata[paymentIntentId]", paymentIntent.id);
      stripeBody.append("metadata[orderPaymentId]", orderPayment.id);
      stripeBody.append("metadata[orderId]", orderPayment.orderId);
      stripeBody.append("client_reference_id", paymentIntent.id);
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
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(stripePayload as Prisma.JsonValue) },
        });
        return res
          .status(400)
          .json({ error: stripePayload.error?.message ?? "Unable to initialize Stripe payment." });
      }

      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: {
          status: "pending",
          providerRef: stripePayload.id,
          metadata: {
            purpose: "order_payment",
            orderPaymentId: orderPayment.id,
            orderId: orderPayment.orderId,
            buyerId: orderPayment.order?.buyerId,
            stripe: stripePayload,
          },
        },
      });

      return res.json({
        checkoutUrl: stripePayload.url,
        paymentIntentId: paymentIntent.id,
        provider: "stripe",
        orderPaymentId: orderPayment.id,
        orderId: orderPayment.orderId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to initialize payment.";
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
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
    const paystackSecret =
      settings.integrations.payments.paystackSecretKey || env.PAYSTACK_SECRET_KEY;
    const stripeSecret =
      settings.integrations.payments.stripeSecretKey || env.STRIPE_SECRET_KEY;
    const queryPaymentIntentId = query.payment_intent_id;

    const getPaymentIntentFromId = async (provider: PaymentProvider) => {
      if (!queryPaymentIntentId) {
        return null;
      }

      const paymentIntent = await prisma.paymentIntent.findUnique({
        where: { id: queryPaymentIntentId },
      });

      if (!paymentIntent) {
        return null;
      }

      if (paymentIntent.provider !== provider) {
        throw new Error("Payment provider mismatch.");
      }

      return paymentIntent;
    };

    if (query.provider === "flutterwave") {
      if (!enabledProviders.includes("flutterwave")) {
        return res.status(400).json({ error: "Flutterwave is currently disabled." });
      }
      let transactionId = query.transaction_id;
      let txRef = query.tx_ref;

      let paymentIntent: Awaited<ReturnType<typeof getPaymentIntentFromId>>;
      try {
        paymentIntent = await getPaymentIntentFromId("flutterwave");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid payment provider.";
        return res.status(400).json({ error: message });
      }

      if (!paymentIntent && txRef) {
        paymentIntent = await prisma.paymentIntent.findFirst({
          where: { provider: "flutterwave", providerRef: txRef },
        });
      }

      if (!paymentIntent) {
        return res.status(404).json({ error: "Payment intent not found." });
      }

      txRef = txRef ?? paymentIntent.providerRef ?? undefined;

      try {
        await ensurePaymentAccess(paymentIntent, req.user!);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        return res.status(403).json({ error: message });
      }

      if (!transactionId) {
        const event = await prisma.paymentEvent.findFirst({
          where: { paymentIntentId: paymentIntent.id },
          orderBy: { receivedAt: "desc" },
          select: { providerEventId: true },
        });
        transactionId = event?.providerEventId;
      }

      if (!txRef) {
        return res.status(400).json({ error: "Missing Flutterwave transaction reference." });
      }

      if (!transactionId) {
        if (paymentIntent.status === "succeeded") {
          const result = await finalizePayment({
            paymentIntentId: paymentIntent.id,
            providerEventId: paymentIntent.providerRef ?? paymentIntent.id,
            providerPayload: Prisma.JsonNull,
            actorId: req.user!.id,
            settings,
          });

          return res.json({
            status: "success",
            paymentIntentId: paymentIntent.id,
            orders: result.orders,
            purpose: result.purpose,
            boost: result.boost ?? null,
            subscription: result.subscription ?? null,
            invoice: result.invoice ?? null,
          });
        }
        return res.status(400).json({ error: "Flutterwave payment is still pending." });
      }

      if (!flutterwaveSecret) {
        return res.status(400).json({ error: "Flutterwave is not configured." });
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
        settings,
      });

      return res.json({
        status: "success",
        paymentIntentId: paymentIntent.id,
        orders: result.orders,
        purpose: result.purpose,
        boost: result.boost ?? null,
        subscription: result.subscription ?? null,
        invoice: result.invoice ?? null,
      });
    }

    if (query.provider === "paystack") {
      if (!enabledProviders.includes("paystack")) {
        return res.status(400).json({ error: "Paystack is currently disabled." });
      }
      let reference = query.reference ?? query.trxref;

      let paymentIntent: Awaited<ReturnType<typeof getPaymentIntentFromId>>;
      try {
        paymentIntent = await getPaymentIntentFromId("paystack");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid payment provider.";
        return res.status(400).json({ error: message });
      }

      if (!paymentIntent && reference) {
        paymentIntent = await prisma.paymentIntent.findFirst({
          where: { provider: "paystack", providerRef: reference },
        });
      }

      if (!paymentIntent) {
        return res.status(404).json({ error: "Payment intent not found." });
      }

      reference = reference ?? paymentIntent.providerRef ?? undefined;
      if (!reference) {
        return res.status(400).json({ error: "Missing Paystack reference." });
      }

      if (!paystackSecret) {
        return res.status(400).json({ error: "Paystack is not configured." });
      }
      try {
        await ensurePaymentAccess(paymentIntent, req.user!);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        return res.status(403).json({ error: message });
      }

      const verifyResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
          },
        },
      );

      const verifyPayload = (await verifyResponse.json()) as {
        status?: boolean;
        message?: string;
        data?: {
          id?: number | string;
          status?: string;
          amount?: number;
          currency?: string;
          reference?: string;
        };
      };

      if (!verifyResponse.ok || !verifyPayload.status) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(verifyPayload as Prisma.JsonValue) },
        });
        return res
          .status(400)
          .json({ error: verifyPayload.message ?? "Unable to verify Paystack payment." });
      }

      const data = verifyPayload.data ?? {};
      const status = String(data.status ?? "").toLowerCase();
      if (status !== "success") {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(verifyPayload as Prisma.JsonValue) },
        });
        return res.status(400).json({ error: "Paystack payment not successful." });
      }

      if (data.reference && data.reference !== reference) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(verifyPayload as Prisma.JsonValue) },
        });
        return res.status(400).json({ error: "Paystack reference mismatch." });
      }

      if (
        data.currency &&
        String(data.currency).toUpperCase() !== paymentIntent.currency
      ) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(verifyPayload as Prisma.JsonValue) },
        });
        return res.status(400).json({ error: "Currency mismatch." });
      }

      if (
        data.amount !== undefined &&
        data.amount < toMinorUnits(paymentIntent.amount)
      ) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(verifyPayload as Prisma.JsonValue) },
        });
        return res.status(400).json({ error: "Amount mismatch." });
      }

      const result = await finalizePayment({
        paymentIntentId: paymentIntent.id,
        providerEventId: String(data.id ?? reference),
        providerPayload: toJsonInput(verifyPayload as Prisma.JsonValue),
        actorId: req.user!.id,
        settings,
      });

      return res.json({
        status: "success",
        paymentIntentId: paymentIntent.id,
        orders: result.orders,
        purpose: result.purpose,
        boost: result.boost ?? null,
        subscription: result.subscription ?? null,
        invoice: result.invoice ?? null,
      });
    }

    if (query.provider === "expresspay") {
      if (!enabledProviders.includes("expresspay")) {
        return res.status(400).json({ error: "ExpressPay is currently disabled." });
      }

      const token = query.token ?? query.reference;
      const orderId =
        query.order_id ??
        (query as Record<string, string | undefined>)["order-id"] ??
        query.tx_ref ??
        queryPaymentIntentId;

      if (!token && !orderId) {
        return res.status(400).json({ error: "Missing ExpressPay token." });
      }

      const expresspayConfig = resolveExpresspayConfig(settings);
      if (!expresspayConfig) {
        return res.status(400).json({ error: "ExpressPay is not configured." });
      }

      let paymentIntent =
        orderId
          ? await prisma.paymentIntent.findUnique({ where: { id: orderId } })
          : null;

      if (!paymentIntent && token) {
        paymentIntent = await prisma.paymentIntent.findFirst({
          where: { provider: "expresspay", providerRef: token },
        });
      }

      if (!paymentIntent) {
        return res.status(404).json({ error: "Payment intent not found." });
      }

      try {
        await ensurePaymentAccess(paymentIntent, req.user!);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        return res.status(403).json({ error: message });
      }

      const verifyToken = token ?? paymentIntent.providerRef ?? "";
      if (!verifyToken) {
        return res.status(400).json({ error: "Missing ExpressPay token." });
      }

      const { ok, payload } = await queryExpresspayPayment(expresspayConfig, verifyToken);
      const resultCode = payload.result !== undefined ? String(payload.result) : "";
      const resultText = payload["result-text"]?.toString();

      if (!ok || !resultCode) {
        if (paymentIntent.status !== "succeeded") {
          await prisma.paymentIntent.update({
            where: { id: paymentIntent.id },
            data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
          });
        }
        return res
          .status(400)
          .json({ error: resultText ?? "Unable to verify ExpressPay payment." });
      }

      if (resultCode === "4") {
        return res.status(400).json({ error: "ExpressPay payment is still pending." });
      }

      if (resultCode !== "1") {
        if (paymentIntent.status !== "succeeded") {
          await prisma.paymentIntent.update({
            where: { id: paymentIntent.id },
            data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
          });
        }
        return res
          .status(400)
          .json({ error: resultText ?? "ExpressPay payment not successful." });
      }

      if (payload.currency && payload.currency.toString().toUpperCase() !== paymentIntent.currency) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
        });
        return res.status(400).json({ error: "Currency mismatch." });
      }

      if (payload.amount !== undefined) {
        const amount = new Prisma.Decimal(String(payload.amount));
        if (amount.lessThan(paymentIntent.amount)) {
          await prisma.paymentIntent.update({
            where: { id: paymentIntent.id },
            data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
          });
          return res.status(400).json({ error: "Amount mismatch." });
        }
      }

      if (!paymentIntent.providerRef && token) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { providerRef: token },
        });
      }

      const providerEventId =
        payload["transaction-id"]?.toString() ?? verifyToken ?? paymentIntent.id;

      const result = await finalizePayment({
        paymentIntentId: paymentIntent.id,
        providerEventId,
        providerPayload: toJsonInput(payload as Prisma.JsonValue),
        actorId: req.user!.id,
        settings,
      });

      return res.json({
        status: "success",
        paymentIntentId: paymentIntent.id,
        orders: result.orders,
        purpose: result.purpose,
        boost: result.boost ?? null,
        subscription: result.subscription ?? null,
        invoice: result.invoice ?? null,
      });
    }

    if (query.provider === "hubtel") {
      if (!enabledProviders.includes("hubtel")) {
        return res.status(400).json({ error: "Hubtel is currently disabled." });
      }
      const reference = query.reference ?? query.tx_ref ?? query.trxref ?? queryPaymentIntentId;
      if (!reference) {
        return res.status(400).json({ error: "Missing Hubtel reference." });
      }

      let paymentIntent = await prisma.paymentIntent.findUnique({
        where: { id: reference },
      });

      if (!paymentIntent) {
        paymentIntent = await prisma.paymentIntent.findFirst({
          where: { provider: "hubtel", providerRef: reference },
        });
      }

      if (!paymentIntent) {
        return res.status(404).json({ error: "Payment intent not found." });
      }

      try {
        await ensurePaymentAccess(paymentIntent, req.user!);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        return res.status(403).json({ error: message });
      }

      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({ error: "Hubtel payment is still pending." });
      }

      const result = await finalizePayment({
        paymentIntentId: paymentIntent.id,
        providerEventId: paymentIntent.providerRef ?? paymentIntent.id,
        providerPayload: Prisma.JsonNull,
        actorId: req.user!.id,
        settings,
      });

      return res.json({
        status: "success",
        paymentIntentId: paymentIntent.id,
        orders: result.orders,
        purpose: result.purpose,
        boost: result.boost ?? null,
        subscription: result.subscription ?? null,
        invoice: result.invoice ?? null,
      });
    }

    let sessionId = query.session_id;
    if (!sessionId && queryPaymentIntentId) {
      const paymentIntent = await prisma.paymentIntent.findUnique({
        where: { id: queryPaymentIntentId },
      });
      if (paymentIntent?.provider === "stripe" && paymentIntent.providerRef) {
        sessionId = paymentIntent.providerRef;
      }
    }
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

    const paymentIntentId =
      stripePayload.metadata?.paymentIntentId ??
      stripePayload.client_reference_id ??
      queryPaymentIntentId;
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
      await ensurePaymentAccess(paymentIntent, req.user!);
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
      settings,
    });

    return res.json({
      status: "success",
      paymentIntentId: paymentIntent.id,
      orders: result.orders,
      purpose: result.purpose,
      boost: result.boost ?? null,
      subscription: result.subscription ?? null,
      invoice: result.invoice ?? null,
    });
  }),
);

export const finalizePayment = async (params: {
  paymentIntentId: string;
  providerEventId: string;
  providerPayload: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
  actorId: string | null;
  settings: PlatformSettings;
}) => {
  const result = await prisma.$transaction(async (tx) => {
    const paymentIntent = await tx.paymentIntent.findUnique({
      where: { id: params.paymentIntentId },
    });

    if (!paymentIntent) {
      throw new Error("Payment intent not found.");
    }

    const metadata = getPaymentMetadata(paymentIntent.metadata);
    const purpose: PaymentPurpose = metadata.purpose ?? "orders";
    const didFinalize = paymentIntent.status !== "succeeded";
    const pspPaymentRef = paymentIntent.providerRef ?? params.providerEventId;

    let orders: Array<
      Prisma.OrderGetPayload<{ include: { service: true } }>
    > = [];
    let boost: Prisma.BoostPurchaseGetPayload<{
      include: { service: { select: { id: true; title: true; category: true } } };
    }> | null = null;
    let subscription: Prisma.ProviderSubscriptionGetPayload<{ include: { plan: true } }> | null =
      null;
    let invoice: Prisma.BusinessInvoiceGetPayload<{
      include: { account: true; orders: true };
    }> | null = null;

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
    }

    if (purpose === "boost") {
      const boostType = metadata.boostType;
      const serviceId = metadata.serviceId;
      const providerId = metadata.providerId;

      if (!boostType || !serviceId || !providerId) {
        throw new Error("Boost metadata missing.");
      }

      const option = getBoostOption(params.settings, boostType);
      if (!option) {
        throw new Error("Boost type is not configured.");
      }

      if (didFinalize) {
        const service = await tx.service.findUnique({
          where: { id: serviceId },
          select: { id: true, providerId: true, category: true, status: true },
        });

        if (!service || service.providerId !== providerId) {
          throw new Error("Boost service not found.");
        }

        const now = new Date();
        const existing = await tx.boostPurchase.findFirst({
          where: {
            providerId,
            serviceId,
            type: boostType,
            status: "active",
            endsAt: { gt: now },
          },
        });

        const startsAt = existing ? existing.endsAt : now;
        const endsAt = new Date(startsAt.getTime() + option.durationHours * 60 * 60 * 1000);
        const status = startsAt > now ? "scheduled" : "active";

        boost = await tx.boostPurchase.create({
          data: {
            providerId,
            serviceId,
            type: boostType,
            status,
            startsAt,
            endsAt,
            price: paymentIntent.amount,
            currency: paymentIntent.currency,
            metadata: {
              category: service.category,
              source: "gateway",
              paymentIntentId: paymentIntent.id,
            },
          },
          include: {
            service: {
              select: { id: true, title: true, category: true },
            },
          },
        });
      }

      return { paymentIntent, orders, didFinalize, purpose, boost, subscription, invoice };
    }

    if (purpose === "subscription") {
      const planId = metadata.planId;
      const providerId = metadata.providerId;

      if (!planId || !providerId) {
        throw new Error("Subscription metadata missing.");
      }

      if (didFinalize) {
        const plan = await tx.plan.findUnique({
          where: { id: planId },
        });

        if (!plan || !plan.isActive) {
          throw new Error("Plan not available.");
        }

        await tx.providerSubscription.updateMany({
          where: { providerId, status: "active" },
          data: { status: "cancelled", endsAt: new Date() },
        });

        subscription = await tx.providerSubscription.create({
          data: {
            providerId,
            planId,
            status: "active",
            renewsAt: addMonths(new Date(), 1),
            providerRef: paymentIntent.providerRef ?? paymentIntent.id,
            metadata: { paymentIntentId: paymentIntent.id },
          },
          include: { plan: true },
        });
      }

      return { paymentIntent, orders, didFinalize, purpose, boost, subscription, invoice };
    }

    if (purpose === "invoice") {
      const invoiceId = metadata.invoiceId;
      const accountId = metadata.accountId;

      if (!invoiceId || !accountId) {
        throw new Error("Invoice metadata missing.");
      }

      if (didFinalize) {
        invoice = await tx.businessInvoice.findUnique({
          where: { id: invoiceId },
          include: { account: true, orders: true },
        });

        if (!invoice || invoice.accountId !== accountId) {
          throw new Error("Invoice not found.");
        }

        if (invoice.status === "paid" || invoice.status === "void") {
          return { paymentIntent, orders, didFinalize, purpose, boost, subscription, invoice };
        }

        await tx.businessInvoice.update({
          where: { id: invoice.id },
          data: {
            status: "paid",
            issuedAt: invoice.issuedAt ?? new Date(),
            paidAt: new Date(),
          },
        });

        orders = await tx.order.findMany({
          where: { businessInvoiceId: invoice.id },
          include: { service: true },
        });

        const eligibleOrders = orders.filter((order) =>
          ["created", "payment_pending"].includes(order.status),
        );

        if (eligibleOrders.length > 0) {
          await Promise.all(
            eligibleOrders.map((order) =>
              tx.order.update({
                where: { id: order.id },
                data: {
                  status: "paid_to_escrow",
                  paymentIntentId: paymentIntent.id,
                  pspPaymentRef,
                  amountPaid: order.amountGross,
                  amountPaidNet: order.amountNetProvider,
                },
              }),
            ),
          );

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
              payload: { provider: paymentIntent.provider, source: "invoice" },
            })),
          });
        }
      }

      if (!invoice) {
        invoice = await tx.businessInvoice.findUnique({
          where: { id: invoiceId },
          include: { account: true, orders: true },
        });
      }

      return { paymentIntent, orders, didFinalize, purpose, boost, subscription, invoice };
    }

    if (purpose === "order_payment") {
      const orderPaymentId = metadata.orderPaymentId;

      if (!orderPaymentId) {
        throw new Error("Order payment metadata missing.");
      }

      const orderPayment = await tx.orderPayment.findUnique({
        where: { id: orderPaymentId },
        include: { order: { include: { service: true } } },
      });

      if (!orderPayment || !orderPayment.order) {
        throw new Error("Order payment not found.");
      }

      orders = [orderPayment.order];

      if (didFinalize && orderPayment.status !== "paid") {
        await tx.orderPayment.update({
          where: { id: orderPayment.id },
          data: { status: "paid", paidAt: new Date() },
        });

        const order = orderPayment.order;
        const nextPaid = order.amountPaid.add(orderPayment.amount);
        const nextPaidNet = order.amountPaidNet.add(orderPayment.amountNetProvider);

        const orderUpdate: Prisma.OrderUpdateInput = {
          amountPaid: nextPaid,
          amountPaidNet: nextPaidNet,
          pspPaymentRef,
        };

        if (["created", "payment_pending"].includes(order.status)) {
          orderUpdate.status = "paid_to_escrow";
        }

        await tx.order.update({
          where: { id: order.id },
          data: orderUpdate,
        });

        await tx.providerWallet.upsert({
          where: { providerId: order.providerId },
          create: {
            providerId: order.providerId,
            availableBalance: new Prisma.Decimal(0),
            pendingBalance: orderPayment.amountNetProvider,
            currency: orderPayment.currency,
          },
          update: {
            pendingBalance: { increment: orderPayment.amountNetProvider },
          },
        });

        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            type: "paid",
            payload: { provider: paymentIntent.provider, stage: orderPayment.stage },
          },
        });
      }

      return { paymentIntent, orders, didFinalize, purpose, boost, subscription, invoice };
    }

    orders = await tx.order.findMany({
      where: { paymentIntentId: paymentIntent.id },
      include: { service: true },
    });

    if (didFinalize) {
      const eligibleOrders = orders.filter((order) =>
        ["created", "payment_pending"].includes(order.status),
      );

      if (eligibleOrders.length > 0) {
        await Promise.all(
          eligibleOrders.map((order) =>
            tx.order.update({
              where: { id: order.id },
              data: {
                status: "paid_to_escrow",
                pspPaymentRef,
                amountPaid: order.amountGross,
                amountPaidNet: order.amountNetProvider,
              },
            }),
          ),
        );

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

    return { paymentIntent, orders, didFinalize, purpose, boost, subscription, invoice };
  });

  if ((result.purpose === "orders" || result.purpose === "invoice") && result.didFinalize) {
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

  if (result.purpose === "order_payment" && result.didFinalize) {
    const orderPayment = await prisma.orderPayment.findFirst({
      where: { paymentIntentId: result.paymentIntent.id },
      include: { order: { include: { service: true } } },
    });

    if (orderPayment?.order) {
      const serviceTitle = orderPayment.order.service?.title ?? "service";
      const stageLabel = orderPayment.stage === "deposit" ? "Initial payment" : "Payable amount";
      await Promise.all([
        createNotification({
          userId: orderPayment.order.providerId,
          actorId: params.actorId,
          type: "order_status",
          title: `${stageLabel} payment received`,
          body: `${stageLabel} payment received for ${serviceTitle}.`,
          data: { orderId: orderPayment.order.id, serviceId: orderPayment.order.serviceId },
        }),
        createNotification({
          userId: orderPayment.order.buyerId,
          actorId: orderPayment.order.providerId,
          type: "order_status",
          title: `${stageLabel} payment confirmed`,
          body: `Your ${stageLabel.toLowerCase()} payment for ${serviceTitle} was confirmed.`,
          data: { orderId: orderPayment.order.id, serviceId: orderPayment.order.serviceId },
        }),
      ]);
    }
  }

  return result;
};
