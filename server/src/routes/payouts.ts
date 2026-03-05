import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { getPlatformSettings } from "../utils/platform-settings.js";
import { getActiveSubscriptionForProvider } from "../utils/subscriptions.js";

export const payoutsRouter = Router();

const requestSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    amount: z.coerce.number().positive().optional(),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
  })
  .refine((data) => Boolean(data.orderId || data.amount !== undefined), {
    message: "Provide orderId or amount.",
    path: ["orderId"],
  });

const DEFAULT_MAX_DISBURSEMENT_AMOUNT = 10000;
const DAILY_DISBURSEMENT_CAP_UNVERIFIED = new Prisma.Decimal(1000);
const DAILY_DISBURSEMENT_CAP_VERIFIED = new Prisma.Decimal(5000);
const AML_REVIEW_SCORE_THRESHOLD = 60;
const AML_BLOCK_SCORE_THRESHOLD = 90;
const SANCTIONS_RESCREEN_DAYS = 30;
const COMPLIANCE_DEDUP_WINDOW_HOURS = 24;
const OPEN_COMPLIANCE_CASE_STATUSES = ["open", "investigating", "escalated", "reported"] as const;
const BLOCKING_SANCTIONS_STATUSES = ["pending", "possible_match", "confirmed_match", "error"] as const;

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

const serializeDisbursementRequest = (
  request: {
    id: string;
    amount: Prisma.Decimal;
    currency: "GHS" | "USD" | "EUR";
    status: "requested" | "processing" | "paid" | "failed" | "cancelled";
    destinationMomo: string;
    momoNetwork: "mtn" | "vodafone" | "airteltigo" | null;
    reference: string | null;
    createdAt: Date;
    idempotencyKey: string;
    orderId: string | null;
  },
) => ({
  id: request.id,
  amount: request.amount.toString(),
  currency: request.currency,
  status: request.status,
  destinationMomo: request.destinationMomo,
  momoNetwork: request.momoNetwork,
  reference: request.reference,
  createdAt: request.createdAt,
  idempotencyKey: request.idempotencyKey,
  orderId: request.orderId,
});

const resolveComplianceSeverity = (riskScore: number): "low" | "medium" | "high" | "critical" => {
  if (riskScore >= 90) return "critical";
  if (riskScore >= 70) return "high";
  if (riskScore >= 50) return "medium";
  return "low";
};

const ensureOpenComplianceCase = async (params: {
  providerId: string;
  payoutRequestId?: string;
  screeningId?: string;
  type: "aml_payout" | "sanctions_match";
  severity: "low" | "medium" | "high" | "critical";
  riskScore?: number;
  title: string;
  summary?: string;
  reasons: string[];
  metadata?: Prisma.InputJsonValue;
}) => {
  const dedupSince = new Date(Date.now() - COMPLIANCE_DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
  const existing = await prisma.complianceCase.findFirst({
    where: {
      providerId: params.providerId,
      type: params.type,
      status: { in: [...OPEN_COMPLIANCE_CASE_STATUSES] },
      createdAt: { gte: dedupSince },
    },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const created = await prisma.complianceCase.create({
    data: {
      providerId: params.providerId,
      payoutRequestId: params.payoutRequestId,
      screeningId: params.screeningId,
      type: params.type,
      status: "open",
      severity: params.severity,
      riskScore: params.riskScore,
      title: params.title,
      summary: params.summary,
      reasons: params.reasons,
      metadata: params.metadata,
    },
    select: { id: true },
  });
  return created.id;
};

payoutsRouter.get(
  "/",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const [wallet, requests, payableTotals, reservedTotals] = await Promise.all([
      ensureWallet(req.user!.id),
      prisma.payoutRequest.findMany({
        where: { providerId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.earningsLedger.aggregate({
        where: { providerId: req.user!.id, state: "payable" },
        _sum: { netAmount: true },
      }),
      prisma.earningsLedger.aggregate({
        where: { providerId: req.user!.id, state: "reserved" },
        _sum: { netAmount: true },
      }),
    ]);

    res.json({
      earnings: {
        payable: (payableTotals._sum.netAmount ?? new Prisma.Decimal(0)).toString(),
        pending_release: wallet.pendingBalance.toString(),
        reserved_for_disbursement: (reservedTotals._sum.netAmount ?? new Prisma.Decimal(0)).toString(),
        currency: wallet.currency,
      },
      disbursement_requests: requests.map((request) => ({
        ...serializeDisbursementRequest(request),
      })),
    });
  }),
);

payoutsRouter.post(
  "/",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const data = requestSchema.parse(req.body);
    const { settings } = await getPlatformSettings();
    const subscription = await getActiveSubscriptionForProvider(req.user!.id);
    const payoutMinOverride = subscription?.benefits.payoutMinAmount;
    const requestedIdempotencyKey = data.idempotencyKey?.trim() || null;

    const provider = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        providerProfile: {
          select: { momoNumber: true, momoNetwork: true, verificationStatus: true },
        },
      },
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found." });
    }

    const momoNumber = provider.providerProfile?.momoNumber ?? null;
    const momoNetwork = provider.providerProfile?.momoNetwork ?? null;

    if (!momoNumber || !momoNetwork) {
      return res.status(400).json({
        error: "Please add your mobile money number and network in account settings.",
      });
    }

    if (provider.providerProfile?.verificationStatus !== "verified") {
      return res.status(403).json({
        error: "KYC verification is required before requesting disbursements.",
      });
    }

    if (!settings.payoutRules.supportedMomoNetworks.includes(momoNetwork)) {
      return res.status(400).json({
        error: "Selected mobile money network is not supported for payouts.",
      });
    }

    const requestedAmount = data.amount !== undefined ? new Prisma.Decimal(data.amount) : null;
    const earningsEntry = data.orderId
      ? await prisma.earningsLedger.findUnique({
          where: { orderId: data.orderId },
          select: {
            id: true,
            orderId: true,
            providerId: true,
            netAmount: true,
            currency: true,
            state: true,
          },
        })
      : await prisma.earningsLedger.findFirst({
          where: {
            providerId: req.user!.id,
            state: "payable",
            netAmount: requestedAmount ?? undefined,
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            orderId: true,
            providerId: true,
            netAmount: true,
            currency: true,
            state: true,
          },
        });

    if (!earningsEntry || earningsEntry.providerId !== req.user!.id) {
      return res.status(404).json({ error: "Payable earnings entry not found for this order." });
    }

    if (earningsEntry.state !== "payable") {
      return res.status(400).json({ error: "This order is not currently payable for disbursement." });
    }

    const amount = earningsEntry.netAmount;
    if (requestedAmount) {
      if (!requestedAmount.equals(amount)) {
        return res.status(400).json({ error: "Amount must match the order payable amount exactly." });
      }
    }

    if (requestedIdempotencyKey) {
      const existingByIdempotency = await prisma.payoutRequest.findUnique({
        where: { idempotencyKey: requestedIdempotencyKey },
      });

      if (existingByIdempotency) {
        if (existingByIdempotency.providerId !== req.user!.id) {
          return res.status(409).json({ error: "Idempotency key is already in use." });
        }

        if (
          !existingByIdempotency.amount.equals(amount) ||
          existingByIdempotency.orderId !== earningsEntry.orderId
        ) {
          return res.status(409).json({
            error: "Idempotency key was already used with different disbursement parameters.",
          });
        }

        return res.json({
          disbursement_request: serializeDisbursementRequest(existingByIdempotency),
          idempotent_replay: true,
        });
      }
    }

    const minAmount =
      typeof payoutMinOverride === "number"
        ? payoutMinOverride
        : settings.payoutRules.minAmount;

    if (minAmount > 0 && amount.lt(minAmount)) {
      return res.status(400).json({
        error: `Minimum disbursement amount is ${minAmount}.`,
      });
    }

    const maxAmount = DEFAULT_MAX_DISBURSEMENT_AMOUNT;
    if (amount.gt(maxAmount)) {
      return res.status(400).json({
        error: `Maximum disbursement amount is ${maxAmount}.`,
      });
    }

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const usedToday = await prisma.payoutRequest.aggregate({
      where: {
        providerId: req.user!.id,
        createdAt: { gte: dayStart, lt: dayEnd },
        status: { in: ["requested", "processing", "paid"] },
      },
      _sum: { amount: true },
    });
    const dailyCap =
      provider.providerProfile?.verificationStatus === "verified"
        ? DAILY_DISBURSEMENT_CAP_VERIFIED
        : DAILY_DISBURSEMENT_CAP_UNVERIFIED;
    const usedAmount = usedToday._sum.amount ?? new Prisma.Decimal(0);
    if (usedAmount.add(amount).gt(dailyCap)) {
      return res.status(400).json({
        error: `Daily disbursement cap exceeded. Cap is ${dailyCap.toFixed(2)}.`,
      });
    }

    const recentRequests = await prisma.payoutRequest.count({
      where: {
        providerId: req.user!.id,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    let riskScore = 0;
    const riskSignals: string[] = [];
    if (amount.gte(5000)) {
      riskScore += 40;
      riskSignals.push("large_amount");
    }
    if (subscription?.benefits.tier === "free") {
      riskScore += 20;
      riskSignals.push("free_plan");
    }
    if (recentRequests >= 3) {
      riskScore += 30;
      riskSignals.push("high_request_frequency");
    }
    if (recentRequests >= 6) {
      riskSignals.push("very_high_request_frequency");
    }
    const dailyCapValue = Number(dailyCap.toString());
    if (dailyCapValue > 0) {
      const projectedUtilization = Number(usedAmount.add(amount).div(dailyCap).toFixed(4));
      if (projectedUtilization >= 0.85) {
        riskSignals.push("high_daily_cap_utilization");
      }
    }
    const complianceReviewRequired = riskScore >= AML_REVIEW_SCORE_THRESHOLD;
    const autoApprovalEligible = riskScore <= 25 && !complianceReviewRequired;

    let sanctionsScreening = await prisma.sanctionsScreening.findFirst({
      where: { providerId: req.user!.id },
      orderBy: [{ screenedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        screenedAt: true,
        matchScore: true,
        watchlistSource: true,
      },
    });

    if (
      sanctionsScreening &&
      (BLOCKING_SANCTIONS_STATUSES as readonly string[]).includes(sanctionsScreening.status)
    ) {
      await ensureOpenComplianceCase({
        providerId: req.user!.id,
        screeningId: sanctionsScreening.id,
        type: "sanctions_match",
        severity:
          sanctionsScreening.status === "confirmed_match"
            ? "critical"
            : sanctionsScreening.status === "possible_match"
              ? "high"
              : "medium",
        riskScore: sanctionsScreening.matchScore,
        title: "Disbursement blocked by sanctions screening",
        summary: "Disbursement request blocked until sanctions screening is cleared by compliance.",
        reasons: [`sanctions_status:${sanctionsScreening.status}`],
        metadata: {
          source: "payout_request_precheck",
          amount: amount.toString(),
          currency: earningsEntry.currency,
          orderId: earningsEntry.orderId,
          screening: {
            id: sanctionsScreening.id,
            status: sanctionsScreening.status,
            matchScore: sanctionsScreening.matchScore,
            watchlistSource: sanctionsScreening.watchlistSource,
            screenedAt: sanctionsScreening.screenedAt.toISOString(),
          },
        },
      });
      return res.status(403).json({
        error: "Disbursement blocked by compliance screening. Contact support for review.",
      });
    }

    const screeningFreshCutoff = new Date(Date.now() - SANCTIONS_RESCREEN_DAYS * 24 * 60 * 60 * 1000);
    if (!sanctionsScreening || sanctionsScreening.screenedAt < screeningFreshCutoff) {
      sanctionsScreening = await prisma.sanctionsScreening.create({
        data: {
          providerId: req.user!.id,
          status: "clear",
          matchScore: 0,
          watchlistSource: "internal_baseline",
          notes: "Auto-cleared internal baseline screening for payout request.",
          metadata: {
            source: "payout_request_precheck",
            amount: amount.toString(),
            currency: earningsEntry.currency,
            orderId: earningsEntry.orderId,
          },
        },
        select: {
          id: true,
          status: true,
          screenedAt: true,
          matchScore: true,
          watchlistSource: true,
        },
      });
    }

    if (riskScore >= AML_BLOCK_SCORE_THRESHOLD) {
      await ensureOpenComplianceCase({
        providerId: req.user!.id,
        screeningId: sanctionsScreening.id,
        type: "aml_payout",
        severity: resolveComplianceSeverity(riskScore),
        riskScore,
        title: "Disbursement blocked by AML risk controls",
        summary: "Disbursement risk score exceeded the automatic blocking threshold.",
        reasons: riskSignals.length > 0 ? riskSignals : ["risk_threshold_exceeded"],
        metadata: {
          source: "payout_request_precheck",
          amount: amount.toString(),
          currency: earningsEntry.currency,
          orderId: earningsEntry.orderId,
          riskScore,
          recentRequests,
          usedToday: usedAmount.toString(),
          dailyCap: dailyCap.toString(),
          subscriptionTier: subscription?.benefits.tier ?? "free",
        },
      });
      return res.status(400).json({
        error: "Disbursement blocked by risk controls. Contact support for review.",
      });
    }

    let request;
    try {
      request = await prisma.$transaction(async (tx) => {
        const activeOrderRequest = await tx.payoutRequest.findFirst({
          where: {
            orderId: earningsEntry.orderId,
            status: { in: ["requested", "processing"] },
          },
          select: { id: true },
        });
        if (activeOrderRequest) {
          throw new Error("An active disbursement request already exists for this order.");
        }

        const reserved = await tx.earningsLedger.updateMany({
          where: {
            orderId: earningsEntry.orderId,
            providerId: req.user!.id,
            state: "payable",
          },
          data: {
            state: "reserved",
            reservedAt: new Date(),
          },
        });
        if (reserved.count === 0) {
          throw new Error("Order earnings are no longer payable.");
        }

        const wallet = await tx.providerWallet.upsert({
          where: { providerId: req.user!.id },
          create: {
            providerId: req.user!.id,
            availableBalance: new Prisma.Decimal(0),
            pendingBalance: amount,
            currency: earningsEntry.currency,
          },
          update: {},
        });
        const availableAfter = wallet.availableBalance.sub(amount);
        await tx.providerWallet.update({
          where: { providerId: req.user!.id },
          data: {
            availableBalance: availableAfter.gte(0) ? availableAfter : new Prisma.Decimal(0),
            pendingBalance: { increment: amount },
          },
        });

        const payoutRequest = await tx.payoutRequest.create({
          data: {
            providerId: req.user!.id,
            orderId: earningsEntry.orderId,
            amount,
            currency: earningsEntry.currency,
            destinationMomo: momoNumber,
            momoNetwork,
            idempotencyKey: requestedIdempotencyKey ?? undefined,
            status: "requested",
            metadata: {
              subscriptionTier: subscription?.benefits.tier ?? "free",
              priority: subscription?.benefits.tier ?? "free",
              riskScore,
              riskSignals,
              autoApprovalEligible,
              complianceReviewRequired,
              sanctionsScreeningId: sanctionsScreening.id,
              sanctionsStatus: sanctionsScreening.status,
              source: "provider_request",
            },
          },
        });

        if (complianceReviewRequired) {
          await tx.complianceCase.create({
            data: {
              providerId: req.user!.id,
              payoutRequestId: payoutRequest.id,
              screeningId: sanctionsScreening.id,
              type: "aml_payout",
              status: "open",
              severity: resolveComplianceSeverity(riskScore),
              riskScore,
              title: "Payout request requires AML review",
              summary: "Payout request exceeded compliance review threshold and requires manual disposition.",
              reasons: riskSignals.length > 0 ? riskSignals : ["risk_threshold_exceeded"],
              metadata: {
                source: "payout_request_precheck",
                amount: amount.toString(),
                currency: earningsEntry.currency,
                orderId: earningsEntry.orderId,
                recentRequests,
                usedToday: usedAmount.toString(),
                dailyCap: dailyCap.toString(),
                subscriptionTier: subscription?.benefits.tier ?? "free",
                autoApprovalEligible,
              },
            },
          });
        }

        return payoutRequest;
      });
    } catch (error) {
      if (
        requestedIdempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingByIdempotency = await prisma.payoutRequest.findUnique({
          where: { idempotencyKey: requestedIdempotencyKey },
        });

        if (existingByIdempotency && existingByIdempotency.providerId === req.user!.id) {
          return res.json({
            disbursement_request: serializeDisbursementRequest(existingByIdempotency),
            idempotent_replay: true,
          });
        }
      }
      if (error instanceof Error && error.message.includes("active disbursement request")) {
        return res.status(409).json({ error: error.message });
      }
      if (error instanceof Error && error.message.includes("no longer payable")) {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }

    res.status(201).json({
      disbursement_request: serializeDisbursementRequest(request),
    });
  }),
);
