import { Prisma, type OrderStatus, type PrismaClient, type PayoutRequestStatus } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

const BUYER_BLOCKING_ORDER_STATUSES: OrderStatus[] = [
  "created",
  "payment_pending",
  "paid_to_escrow",
  "accepted",
  "in_progress",
  "delivery_submitted",
  "delivered",
  "release_approved",
  "approved",
  "released",
  "disbursement_initiated",
  "dispute_open",
  "disputed",
  "refund_pending",
];

const BUYER_DEPOSIT_BLOCKING_ORDER_STATUSES: OrderStatus[] = [
  "paid_to_escrow",
  "accepted",
  "in_progress",
  "delivery_submitted",
  "delivered",
  "release_approved",
  "approved",
  "released",
  "disbursement_initiated",
  "dispute_open",
  "disputed",
  "refund_pending",
];

const PROVIDER_BLOCKING_ORDER_STATUSES: OrderStatus[] = [...BUYER_BLOCKING_ORDER_STATUSES];
const PROVIDER_BLOCKING_PAYOUT_STATUSES: PayoutRequestStatus[] = ["requested", "processing"];
const PROVIDER_BLOCKING_COMPLIANCE_STATUSES = [
  "open",
  "investigating",
  "escalated",
  "reported",
] satisfies Array<"open" | "investigating" | "escalated" | "reported">;

export type BuyerDeletionEligibility = {
  eligible: boolean;
  activeOrders: number;
  depositOrders: number;
  reasons: string[];
};

export type ProviderDeletionEligibility = {
  eligible: boolean;
  activeOrders: number;
  pendingPayoutRequests: number;
  openComplianceCases: number;
  reasons: string[];
};

const toDeletedUsername = (userId: string) => {
  const compact = userId.replace(/-/g, "");
  return `deleted_${compact.slice(0, 12)}`;
};

const toDeletedEmail = (userId: string) => {
  const compact = userId.replace(/-/g, "");
  return `deleted+${compact}@servfix.local`;
};

export const evaluateBuyerDeletionEligibility = async (
  db: DbClient,
  userId: string,
): Promise<BuyerDeletionEligibility> => {
  const [activeOrders, depositOrders] = await Promise.all([
    db.order.count({
      where: {
        buyerId: userId,
        status: { in: BUYER_BLOCKING_ORDER_STATUSES },
      },
    }),
    db.order.count({
      where: {
        buyerId: userId,
        status: { in: BUYER_DEPOSIT_BLOCKING_ORDER_STATUSES },
        amountPaid: { gt: new Prisma.Decimal(0) },
      },
    }),
  ]);

  const reasons: string[] = [];
  if (activeOrders > 0) {
    reasons.push("You still have active buyer orders.");
  }
  if (depositOrders > 0) {
    reasons.push("You still have orders with active deposits or escrowed funds.");
  }

  return {
    eligible: reasons.length === 0,
    activeOrders,
    depositOrders,
    reasons,
  };
};

export const evaluateProviderDeletionEligibility = async (
  db: DbClient,
  userId: string,
): Promise<ProviderDeletionEligibility> => {
  const [activeOrders, pendingPayoutRequests, openComplianceCases] = await Promise.all([
    db.order.count({
      where: {
        providerId: userId,
        status: { in: PROVIDER_BLOCKING_ORDER_STATUSES },
      },
    }),
    db.payoutRequest.count({
      where: {
        providerId: userId,
        status: { in: PROVIDER_BLOCKING_PAYOUT_STATUSES },
      },
    }),
    db.complianceCase.count({
      where: {
        providerId: userId,
        status: { in: PROVIDER_BLOCKING_COMPLIANCE_STATUSES },
      },
    }),
  ]);

  const reasons: string[] = [];
  if (activeOrders > 0) {
    reasons.push("Provider has active orders.");
  }
  if (pendingPayoutRequests > 0) {
    reasons.push("Provider has pending payout requests.");
  }
  if (openComplianceCases > 0) {
    reasons.push("Provider has open compliance cases.");
  }

  return {
    eligible: reasons.length === 0,
    activeOrders,
    pendingPayoutRequests,
    openComplianceCases,
    reasons,
  };
};

export const softDeleteUserAccount = async (
  db: DbClient,
  userId: string,
  options: { now?: Date } = {},
) => {
  const now = options.now ?? new Date();

  await db.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });

  await db.user.update({
    where: { id: userId },
    data: {
      status: "deleted",
      email: toDeletedEmail(userId),
      phone: null,
      username: toDeletedUsername(userId),
      googleSub: null,
      passwordHash: null,
      avatarKey: null,
      bannerKey: null,
      location: null,
    },
  });

  await db.service.updateMany({
    where: {
      providerId: userId,
      status: { in: ["published", "draft"] },
    },
    data: { status: "suspended" },
  });

  await db.providerProfile.updateMany({
    where: { userId },
    data: {
      momoNumber: null,
      momoNetwork: null,
    },
  });

  await db.businessMember.updateMany({
    where: { userId, status: "active" },
    data: { status: "removed" },
  });
};
