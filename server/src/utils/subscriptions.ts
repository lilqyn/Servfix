import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export type PlanTier = "free" | "pro" | "business";

export type PlanBenefits = {
  tier: PlanTier;
  badgeLabel?: string | null;
  rankingWeight?: number;
  payoutMinAmount?: number;
  payoutFeeBps?: number;
  features?: string[];
};

type PlanSeed = {
  name: string;
  monthlyPrice: number;
  currency: "GHS";
  benefits: PlanBenefits;
};

const DEFAULT_PLANS: PlanSeed[] = [
  {
    name: "Free",
    monthlyPrice: 0,
    currency: "GHS",
    benefits: {
      tier: "free",
      badgeLabel: null,
      rankingWeight: 0,
      payoutMinAmount: 0,
      payoutFeeBps: 0,
      features: ["Basic listing", "Search visibility", "Standard payouts"],
    },
  },
  {
    name: "Pro",
    monthlyPrice: 40,
    currency: "GHS",
    benefits: {
      tier: "pro",
      badgeLabel: "Pro",
      rankingWeight: 1,
      payoutMinAmount: 0,
      payoutFeeBps: 0,
      features: ["Higher search ranking", "Pro badge", "Faster payout eligibility"],
    },
  },
  {
    name: "Business",
    monthlyPrice: 120,
    currency: "GHS",
    benefits: {
      tier: "business",
      badgeLabel: "Business",
      rankingWeight: 2,
      payoutMinAmount: 0,
      payoutFeeBps: 0,
      features: [
        "Top search priority",
        "Business badge",
        "Dedicated support routing",
        "Faster payout eligibility",
      ],
    },
  },
];

const allowedTiers: PlanTier[] = ["free", "pro", "business"];

export const parsePlanBenefits = (input: Prisma.JsonValue | null | undefined): PlanBenefits => {
  const raw = (input as Partial<PlanBenefits>) ?? {};
  const tier = allowedTiers.includes(raw.tier as PlanTier) ? (raw.tier as PlanTier) : "free";
  const rankingWeight =
    typeof raw.rankingWeight === "number" && Number.isFinite(raw.rankingWeight)
      ? raw.rankingWeight
      : tier === "business"
        ? 2
        : tier === "pro"
          ? 1
          : 0;
  const payoutMinAmount =
    typeof raw.payoutMinAmount === "number" && Number.isFinite(raw.payoutMinAmount)
      ? Math.max(0, raw.payoutMinAmount)
      : 0;
  const payoutFeeBps =
    typeof raw.payoutFeeBps === "number" && Number.isFinite(raw.payoutFeeBps)
      ? Math.max(0, raw.payoutFeeBps)
      : 0;
  const features = Array.isArray(raw.features)
    ? raw.features.map((item) => String(item)).filter(Boolean).slice(0, 10)
    : [];

  return {
    tier,
    badgeLabel: raw.badgeLabel ?? null,
    rankingWeight,
    payoutMinAmount,
    payoutFeeBps,
    features,
  };
};

export const ensureDefaultPlans = async () => {
  const existing = await prisma.plan.findMany({ select: { id: true, name: true } });
  const existingNames = new Set(existing.map((plan) => plan.name.toLowerCase()));

  const creations = DEFAULT_PLANS.filter(
    (plan) => !existingNames.has(plan.name.toLowerCase()),
  );

  if (creations.length === 0) {
    return;
  }

  await prisma.plan.createMany({
    data: creations.map((plan) => ({
      name: plan.name,
      monthlyPrice: new Prisma.Decimal(plan.monthlyPrice),
      currency: plan.currency,
      benefits: plan.benefits as Prisma.InputJsonValue,
      isActive: true,
    })),
  });
};

export const getActiveSubscriptionForProvider = async (providerId: string) => {
  const now = new Date();
  const subscription = await prisma.providerSubscription.findFirst({
    where: {
      providerId,
      status: "active",
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    return null;
  }

  return {
    subscription,
    benefits: parsePlanBenefits(subscription.plan?.benefits ?? null),
  };
};

export type ProviderPlanSummary = {
  tier: PlanTier;
  badgeLabel?: string | null;
  rankingWeight: number;
  planId?: string;
  planName?: string;
};

export const getProviderPlanMap = async (providerIds: string[]) => {
  const map = new Map<string, ProviderPlanSummary>();
  if (providerIds.length === 0) {
    return map;
  }

  const now = new Date();
  const subscriptions = await prisma.providerSubscription.findMany({
    where: {
      providerId: { in: providerIds },
      status: "active",
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    include: { plan: true },
  });

  subscriptions.forEach((subscription) => {
    const benefits = parsePlanBenefits(subscription.plan?.benefits ?? null);
    const rankingWeight = benefits.rankingWeight ?? 0;
    const current = map.get(subscription.providerId);
    if (!current || rankingWeight > current.rankingWeight) {
      map.set(subscription.providerId, {
        tier: benefits.tier,
        badgeLabel: benefits.badgeLabel ?? null,
        rankingWeight,
        planId: subscription.planId,
        planName: subscription.plan?.name,
      });
    }
  });

  return map;
};

export const getPlanSummary = (benefits: PlanBenefits | null): ProviderPlanSummary => {
  const safe = benefits ?? { tier: "free", rankingWeight: 0 };
  return {
    tier: safe.tier,
    badgeLabel: safe.badgeLabel ?? null,
    rankingWeight: safe.rankingWeight ?? 0,
  };
};
