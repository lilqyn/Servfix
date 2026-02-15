import { Router } from "express";
import { Prisma, BoostType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { env } from "../config.js";
import { getPlatformSettings } from "../utils/platform-settings.js";
import { getBoostCatalog, getBoostOption } from "../utils/boosts.js";
import {
  createHubtelPaylink,
  normalizeHubtelPhone,
  resolveHubtelConfig,
} from "../utils/hubtel.js";
import {
  buildExpresspayCustomer,
  createExpresspayCheckout,
  normalizeExpresspayPhone,
  resolveExpresspayConfig,
} from "../utils/expresspay.js";

export const boostsRouter = Router();

const purchaseSchema = z.object({
  serviceId: z.string().uuid(),
  type: z.enum(["featured", "feed_boost", "category_top"]),
});

const checkoutSchema = purchaseSchema.extend({
  provider: z.enum(["flutterwave", "stripe", "paystack", "hubtel", "expresspay"]),
  method: z.enum(["card", "mobile_money"]).optional(),
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

const ensureWallet = async (providerId: string) =>
  prisma.providerWallet.upsert({
    where: { providerId },
    create: {
      providerId,
      availableBalance: new Prisma.Decimal(0),
      pendingBalance: new Prisma.Decimal(0),
      currency: "GHS",
    },
    update: {},
  });

const serializeBoost = (boost: {
  id: string;
  type: BoostType;
  status: string;
  startsAt: Date;
  endsAt: Date;
  price: Prisma.Decimal;
  currency: string;
  metadata: Prisma.JsonValue | null;
  service?: { id: string; title: string; category: string } | null;
}) => ({
  id: boost.id,
  type: boost.type,
  status: boost.status,
  startsAt: boost.startsAt,
  endsAt: boost.endsAt,
  price: boost.price.toString(),
  currency: boost.currency,
  metadata: boost.metadata,
  service: boost.service ?? null,
});

boostsRouter.get(
  "/options",
  asyncHandler(async (_req, res) => {
    const { settings } = await getPlatformSettings();
    if (!settings.featureFlags.boosts) {
      return res.status(403).json({ error: "Boosts are currently disabled." });
    }

    res.json({ options: getBoostCatalog(settings) });
  }),
);

boostsRouter.get(
  "/mine",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    if (!settings.featureFlags.boosts) {
      return res.status(403).json({ error: "Boosts are currently disabled." });
    }

    const boosts = await prisma.boostPurchase.findMany({
      where: { providerId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        service: {
          select: { id: true, title: true, category: true },
        },
      },
    });

    res.json({ boosts: boosts.map(serializeBoost) });
  }),
);

boostsRouter.post(
  "/checkout",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const data = checkoutSchema.parse(req.body);
    const { settings } = await getPlatformSettings();

    if (!settings.featureFlags.boosts) {
      return res.status(403).json({ error: "Boosts are currently disabled." });
    }

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

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
      select: { id: true, providerId: true, status: true, category: true },
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found." });
    }

    if (service.providerId !== req.user!.id) {
      return res.status(403).json({ error: "You can only boost your own services." });
    }

    if (service.status !== "published") {
      return res.status(400).json({ error: "Only published services can be boosted." });
    }

    const option = getBoostOption(settings, data.type as BoostType);
    if (!option) {
      return res.status(400).json({ error: "Invalid boost type." });
    }

    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        provider: data.provider,
        status: "created",
        amount: new Prisma.Decimal(option.price),
        currency: option.currency,
        metadata: {
          purpose: "boost",
          boostType: option.type,
          serviceId: data.serviceId,
          providerId: req.user!.id,
        },
      },
    });

    try {
      if (data.provider === "flutterwave") {
        const txRef = `scg_boost_${paymentIntent.id}`;
        const paymentOptions =
          data.method === "card" ? "card" : "mobilemoneyghana";

        const response = await fetch("https://api.flutterwave.com/v3/payments", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${flutterwaveSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tx_ref: txRef,
            amount: paymentIntent.amount.toFixed(2),
            currency: paymentIntent.currency,
            redirect_url: `${appUrl}/payment/verify?provider=flutterwave&purpose=boost`,
            payment_options: paymentOptions,
            customer: {
              email: req.user!.email ?? `${req.user!.id}@servfix.local`,
              phonenumber: req.user!.phone ?? undefined,
            },
            meta: {
              paymentIntentId: paymentIntent.id,
              purpose: "boost",
            },
            customizations: {
              title: "SERVFIX",
              description: "Boost your service visibility.",
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
              purpose: "boost",
              boostType: option.type,
              serviceId: data.serviceId,
              providerId: req.user!.id,
              flutterwave: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data.link,
          paymentIntentId: paymentIntent.id,
          provider: "flutterwave",
        });
      }

      if (data.provider === "paystack") {
        const reference = `scg_boost_${paymentIntent.id}`;
        const channels =
          data.method === "mobile_money"
            ? ["mobile_money"]
            : data.method === "card"
              ? ["card"]
              : undefined;

        const payloadBody: Record<string, unknown> = {
          email: req.user!.email ?? `${req.user!.id}@servfix.local`,
          amount: toMinorUnits(paymentIntent.amount),
          currency: paymentIntent.currency,
          reference,
          callback_url: `${appUrl}/payment/verify?provider=paystack&purpose=boost`,
          metadata: {
            paymentIntentId: paymentIntent.id,
            purpose: "boost",
            boostType: option.type,
            serviceId: data.serviceId,
            providerId: req.user!.id,
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
              purpose: "boost",
              boostType: option.type,
              serviceId: data.serviceId,
              providerId: req.user!.id,
              paystack: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data.authorization_url,
          paymentIntentId: paymentIntent.id,
          provider: "paystack",
        });
      }

      if (data.provider === "expresspay") {
        if (paymentIntent.currency !== "GHS") {
          return res.status(400).json({ error: "ExpressPay supports GHS only." });
        }

        const redirectUrl = `${appUrl}/payment/verify?provider=expresspay&purpose=boost`;
        const postUrl = `${appUrl}/api/webhooks/expresspay`;
        const customer = buildExpresspayCustomer(req.user!);

        const payload = await createExpresspayCheckout(expresspayConfig!, {
          amount: paymentIntent.amount.toFixed(2),
          currency: paymentIntent.currency,
          orderId: paymentIntent.id,
          redirectUrl,
          postUrl,
          customer: {
            ...customer,
            phonenumber: expresspayPhone!,
          },
          orderDesc: "Boost your service visibility.",
        });

        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "pending",
            providerRef: payload.token,
            metadata: {
              purpose: "boost",
              boostType: option.type,
              serviceId: data.serviceId,
              providerId: req.user!.id,
              expresspay: payload.payload as unknown as Prisma.InputJsonValue,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.checkoutUrl,
          paymentIntentId: paymentIntent.id,
          provider: "expresspay",
        });
      }

      if (data.provider === "hubtel") {
        if (paymentIntent.currency !== "GHS") {
          return res.status(400).json({ error: "Hubtel supports GHS only." });
        }

        const callbackUrl = `${appUrl}/api/webhooks/hubtel`;
        const returnUrl = `${appUrl}/payment/verify?provider=hubtel&purpose=boost&reference=${paymentIntent.id}`;
        const cancellationUrl = `${appUrl}/dashboard/boosts?payment=cancelled`;

        const payload = await createHubtelPaylink(hubtelConfig!, {
          mobileNumber: hubtelPhone!,
          amount: Number(paymentIntent.amount.toFixed(2)),
          title: "SERVFIX",
          description: "Boost your service visibility.",
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
              purpose: "boost",
              boostType: option.type,
              serviceId: data.serviceId,
              providerId: req.user!.id,
              hubtel: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data?.paylinkUrl,
          paymentIntentId: paymentIntent.id,
          provider: "hubtel",
        });
      }

      const amountMinor = toMinorUnits(paymentIntent.amount);
      const stripeBody = new URLSearchParams();
      stripeBody.append("mode", "payment");
      stripeBody.append(
        "success_url",
        `${appUrl}/payment/verify?provider=stripe&purpose=boost&session_id={CHECKOUT_SESSION_ID}`,
      );
      stripeBody.append("cancel_url", `${appUrl}/dashboard/boosts?payment=cancelled`);
      stripeBody.append("line_items[0][price_data][currency]", paymentIntent.currency.toLowerCase());
      stripeBody.append("line_items[0][price_data][product_data][name]", "SERVFIX Boost");
      stripeBody.append("line_items[0][price_data][unit_amount]", String(amountMinor));
      stripeBody.append("line_items[0][quantity]", "1");
      stripeBody.append("metadata[paymentIntentId]", paymentIntent.id);
      stripeBody.append("metadata[purpose]", "boost");
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
            purpose: "boost",
            boostType: option.type,
            serviceId: data.serviceId,
            providerId: req.user!.id,
            stripe: stripePayload,
          },
        },
      });

      return res.json({
        checkoutUrl: stripePayload.url,
        paymentIntentId: paymentIntent.id,
        provider: "stripe",
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

boostsRouter.post(
  "/purchase",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const data = purchaseSchema.parse(req.body);
    const { settings } = await getPlatformSettings();

    if (!settings.featureFlags.boosts) {
      return res.status(403).json({ error: "Boosts are currently disabled." });
    }

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
      select: { id: true, providerId: true, status: true, category: true },
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found." });
    }

    if (service.providerId !== req.user!.id) {
      return res.status(403).json({ error: "You can only boost your own services." });
    }

    if (service.status !== "published") {
      return res.status(400).json({ error: "Only published services can be boosted." });
    }

    const option = getBoostOption(settings, data.type as BoostType);
    if (!option) {
      return res.status(400).json({ error: "Invalid boost type." });
    }

    const now = new Date();
    const existing = await prisma.boostPurchase.findFirst({
      where: {
        providerId: req.user!.id,
        serviceId: data.serviceId,
        type: data.type as BoostType,
        status: "active",
        endsAt: { gt: now },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: `Boost already active until ${existing.endsAt.toISOString()}.`,
      });
    }

    const wallet = await ensureWallet(req.user!.id);
    const price = new Prisma.Decimal(option.price);

    if (wallet.currency !== option.currency) {
      return res.status(400).json({ error: "Boost currency does not match wallet currency." });
    }

    if (wallet.availableBalance.lt(price)) {
      return res.status(400).json({ error: "Insufficient available balance." });
    }

    const endsAt = new Date(now.getTime() + option.durationHours * 60 * 60 * 1000);

    const boost = await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.providerWallet.update({
        where: { providerId: req.user!.id },
        data: { availableBalance: { decrement: price } },
      });

      const created = await tx.boostPurchase.create({
        data: {
          providerId: req.user!.id,
          serviceId: data.serviceId,
          type: data.type as BoostType,
          status: "active",
          startsAt: now,
          endsAt,
          price,
          currency: updatedWallet.currency,
          metadata: {
            category: service.category,
            source: "wallet",
          },
        },
        include: {
          service: {
            select: { id: true, title: true, category: true },
          },
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: req.user!.id,
          type: "adjustment",
          direction: "debit",
          amount: price,
          currency: updatedWallet.currency,
          reference: `boost_${created.id}`,
          metadata: {
            boostPurchaseId: created.id,
            boostType: created.type,
            serviceId: created.serviceId,
          },
        },
      });

      return created;
    });

    res.status(201).json({ boost: serializeBoost(boost) });
  }),
);
