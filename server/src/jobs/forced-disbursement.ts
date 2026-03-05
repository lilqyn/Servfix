import { Prisma, type ProviderVerificationStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { getPlatformSettings } from "../utils/platform-settings.js";
import { logError } from "../observability/logger.js";

const DEFAULT_INTERVAL_MS = 60 * 60_000;
const FORCED_DISBURSEMENT_AGE_DAYS = 7;
const MAX_BATCH_SIZE = 100;
const DAILY_DISBURSEMENT_CAP_UNVERIFIED = new Prisma.Decimal(1000);
const DAILY_DISBURSEMENT_CAP_VERIFIED = new Prisma.Decimal(5000);

let intervalHandle: NodeJS.Timeout | null = null;
let running = false;

const resolveDailyCap = (status: ProviderVerificationStatus | null | undefined) =>
  status === "verified" ? DAILY_DISBURSEMENT_CAP_VERIFIED : DAILY_DISBURSEMENT_CAP_UNVERIFIED;

const resolveUtcDayRange = (now = new Date()) => {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const runForcedDisbursementPass = async () => {
  if (running) {
    return;
  }

  running = true;
  try {
    const { settings } = await getPlatformSettings();
    const now = new Date();
    const cutoff = new Date(now.getTime() - FORCED_DISBURSEMENT_AGE_DAYS * 24 * 60 * 60 * 1000);
    const { start: dayStart, end: dayEnd } = resolveUtcDayRange(now);

    const candidates = await prisma.earningsLedger.findMany({
      where: {
        state: "payable",
        createdAt: { lte: cutoff },
        netAmount: { gt: new Prisma.Decimal(0) },
      },
      include: {
        provider: {
          select: {
            id: true,
            providerProfile: {
              select: { verificationStatus: true, momoNumber: true, momoNetwork: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_BATCH_SIZE,
    });

    for (const entry of candidates) {
      const profile = entry.provider.providerProfile;
      const momoNumber = profile?.momoNumber ?? null;
      const momoNetwork = profile?.momoNetwork ?? null;
      if (profile?.verificationStatus !== "verified") {
        continue;
      }
      if (!momoNumber || !momoNetwork) {
        continue;
      }
      if (!settings.payoutRules.supportedMomoNetworks.includes(momoNetwork)) {
        continue;
      }

      const activeRequest = await prisma.payoutRequest.findFirst({
        where: {
          orderId: entry.orderId,
          status: { in: ["requested", "processing"] },
        },
        select: { id: true },
      });
      if (activeRequest) {
        continue;
      }

      const usedToday = await prisma.payoutRequest.aggregate({
        where: {
          providerId: entry.providerId,
          createdAt: { gte: dayStart, lt: dayEnd },
          status: { in: ["requested", "processing", "paid"] },
        },
        _sum: { amount: true },
      });
      const usedAmount = usedToday._sum.amount ?? new Prisma.Decimal(0);
      const dailyCap = resolveDailyCap(profile?.verificationStatus);
      if (usedAmount.add(entry.netAmount).gt(dailyCap)) {
        continue;
      }

      const idempotencyKey = `forced_disbursement_${entry.orderId}_${dayStart.toISOString().slice(0, 10)}`;
      await prisma.$transaction(async (tx) => {
        const existing = await tx.payoutRequest.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existing) {
          return;
        }

        const reserved = await tx.earningsLedger.updateMany({
          where: { orderId: entry.orderId, providerId: entry.providerId, state: "payable" },
          data: { state: "reserved", reservedAt: new Date() },
        });
        if (reserved.count === 0) {
          return;
        }

        const wallet = await tx.providerWallet.upsert({
          where: { providerId: entry.providerId },
          create: {
            providerId: entry.providerId,
            availableBalance: new Prisma.Decimal(0),
            pendingBalance: entry.netAmount,
            currency: entry.currency,
          },
          update: {},
        });
        const availableAfter = wallet.availableBalance.sub(entry.netAmount);
        await tx.providerWallet.update({
          where: { providerId: entry.providerId },
          data: {
            availableBalance: availableAfter.gte(0) ? availableAfter : new Prisma.Decimal(0),
            pendingBalance: { increment: entry.netAmount },
          },
        });

        await tx.payoutRequest.create({
          data: {
            providerId: entry.providerId,
            orderId: entry.orderId,
            amount: entry.netAmount,
            currency: entry.currency,
            destinationMomo: momoNumber,
            momoNetwork,
            status: "requested",
            idempotencyKey,
            metadata: {
              source: "forced_weekly_disbursement",
              generatedAt: new Date().toISOString(),
            },
          },
        });
      });
    }
  } catch (error) {
    logError("forced_disbursement_job_failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    running = false;
  }
};

export const startForcedDisbursementJob = (intervalMs = DEFAULT_INTERVAL_MS) => {
  if (intervalHandle) {
    return;
  }

  void runForcedDisbursementPass();
  intervalHandle = setInterval(() => {
    void runForcedDisbursementPass();
  }, intervalMs);
};

export const stopForcedDisbursementJob = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
