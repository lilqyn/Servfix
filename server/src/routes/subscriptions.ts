import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { env } from "../config.js";
import { ensureDefaultPlans, getActiveSubscriptionForProvider, parsePlanBenefits } from "../utils/subscriptions.js";
import { getPlatformSettings } from "../utils/platform-settings.js";

export const subscriptionsRouter = Router();

const checkoutSchema = z.object({
  planId: z.string().uuid(),
  provider: z.enum(["flutterwave", "stripe", "paystack"]),
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

const serializePlan = (plan: {
  id: string;
  name: string;
  monthlyPrice: Prisma.Decimal;
  currency: string;
  benefits: Prisma.JsonValue;
  isActive: boolean;
}) => ({
  id: plan.id,
  name: plan.name,
  monthlyPrice: plan.monthlyPrice.toString(),
  currency: plan.currency,
  benefits: parsePlanBenefits(plan.benefits),
  isActive: plan.isActive,
});

subscriptionsRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    await ensureDefaultPlans();
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { monthlyPrice: "asc" },
    });

    res.json({ plans: plans.map(serializePlan) });
  }),
);

subscriptionsRouter.get(
  "/mine",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const active = await getActiveSubscriptionForProvider(req.user!.id);
    if (!active) {
      return res.json({ subscription: null });
    }

    res.json({
      subscription: {
        id: active.subscription.id,
        status: active.subscription.status,
        renewsAt: active.subscription.renewsAt,
        endsAt: active.subscription.endsAt,
        plan: serializePlan(active.subscription.plan),
      },
    });
  }),
);

subscriptionsRouter.post(
  "/checkout",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const data = checkoutSchema.parse(req.body);
    const { settings } = await getPlatformSettings();

    if (!settings.featureFlags.subscriptions) {
      return res.status(403).json({ error: "Subscriptions are currently disabled." });
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

    if (data.provider === "flutterwave" && !flutterwaveSecret) {
      return res.status(400).json({ error: "Flutterwave is not configured." });
    }
    if (data.provider === "paystack" && !paystackSecret) {
      return res.status(400).json({ error: "Paystack is not configured." });
    }
    if (data.provider === "stripe" && !stripeSecret) {
      return res.status(400).json({ error: "Stripe is not configured." });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: data.planId },
    });

    if (!plan || !plan.isActive) {
      return res.status(404).json({ error: "Plan not available." });
    }

    if (plan.monthlyPrice.lte(0)) {
      return res.status(400).json({ error: "This plan does not require payment." });
    }

    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        provider: data.provider,
        status: "created",
        amount: plan.monthlyPrice,
        currency: plan.currency,
        metadata: {
          purpose: "subscription",
          planId: plan.id,
          providerId: req.user!.id,
        },
      },
    });

    try {
      if (data.provider === "flutterwave") {
        const txRef = `scg_sub_${paymentIntent.id}`;
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
            redirect_url: `${appUrl}/payment/verify?provider=flutterwave&purpose=subscription`,
            payment_options: paymentOptions,
            customer: {
              email: req.user!.email ?? `${req.user!.id}@servfix.local`,
              phonenumber: req.user!.phone ?? undefined,
            },
            meta: {
              paymentIntentId: paymentIntent.id,
              purpose: "subscription",
            },
            customizations: {
              title: "SERVFIX",
              description: `Subscription for ${plan.name}`,
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
              purpose: "subscription",
              planId: plan.id,
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
        const reference = `scg_sub_${paymentIntent.id}`;
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
          callback_url: `${appUrl}/payment/verify?provider=paystack&purpose=subscription`,
          metadata: {
            paymentIntentId: paymentIntent.id,
            purpose: "subscription",
            planId: plan.id,
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
              purpose: "subscription",
              planId: plan.id,
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

      const amountMinor = toMinorUnits(paymentIntent.amount);
      const stripeBody = new URLSearchParams();
      stripeBody.append("mode", "payment");
      stripeBody.append(
        "success_url",
        `${appUrl}/payment/verify?provider=stripe&purpose=subscription&session_id={CHECKOUT_SESSION_ID}`,
      );
      stripeBody.append("cancel_url", `${appUrl}/dashboard/subscription?payment=cancelled`);
      stripeBody.append("line_items[0][price_data][currency]", paymentIntent.currency.toLowerCase());
      stripeBody.append("line_items[0][price_data][product_data][name]", `SERVFIX ${plan.name}`);
      stripeBody.append("line_items[0][price_data][unit_amount]", String(amountMinor));
      stripeBody.append("line_items[0][quantity]", "1");
      stripeBody.append("metadata[paymentIntentId]", paymentIntent.id);
      stripeBody.append("metadata[purpose]", "subscription");
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
            purpose: "subscription",
            planId: plan.id,
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

subscriptionsRouter.post(
  "/cancel",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const active = await getActiveSubscriptionForProvider(req.user!.id);
    if (!active) {
      return res.status(200).json({ status: "ok" });
    }

    await prisma.providerSubscription.update({
      where: { id: active.subscription.id },
      data: {
        status: "cancelled",
        endsAt: new Date(),
      },
    });

    res.json({ status: "ok" });
  }),
);
