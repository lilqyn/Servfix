import { Prisma } from "@prisma/client";

const LOW_VALUE_REVIEW_HOURS = 24;
const MID_VALUE_REVIEW_HOURS = 48;
const HIGH_VALUE_REVIEW_HOURS = 72;

const LOW_VALUE_THRESHOLD = new Prisma.Decimal(500);
const MID_VALUE_THRESHOLD = new Prisma.Decimal(2000);

export const resolveReviewDeadlineHours = (amountGross: Prisma.Decimal) => {
  if (amountGross.lte(LOW_VALUE_THRESHOLD)) {
    return LOW_VALUE_REVIEW_HOURS;
  }
  if (amountGross.lte(MID_VALUE_THRESHOLD)) {
    return MID_VALUE_REVIEW_HOURS;
  }
  return HIGH_VALUE_REVIEW_HOURS;
};

export const resolveReviewDeadlineAt = (amountGross: Prisma.Decimal, now = new Date()) => {
  const hours = resolveReviewDeadlineHours(amountGross);
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
};

type OrderReleaseSource = "buyer_approval" | "auto_release" | "dispute_resolution" | "admin";

const resolveReleaseMethod = (source: OrderReleaseSource) => {
  if (source === "buyer_approval") {
    return "buyer_approved" as const;
  }
  if (source === "auto_release") {
    return "auto_release" as const;
  }
  return "admin_decision" as const;
};

export const markOrderReleaseApproved = async (
  tx: Prisma.TransactionClient,
  params: {
    orderId: string;
    actorId: string | null;
    source: OrderReleaseSource;
    amountOverride?: Prisma.Decimal;
  },
) => {
  const now = new Date();
  const order = await tx.order.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      providerId: true,
      status: true,
      currency: true,
      amountGross: true,
      platformFee: true,
      amountPaidNet: true,
      amountReleasedNet: true,
      approvedAt: true,
      releaseApprovedAt: true,
      releaseMethod: true,
      releaseVersion: true,
    },
  });

  if (!order) {
    throw new Error("Order not found.");
  }

  if (["cancelled", "refunded", "chargeback"].includes(order.status)) {
    throw new Error("Order is not eligible for release.");
  }

  if (params.source === "auto_release") {
    const hasOpenDispute = await tx.dispute.findFirst({
      where: {
        orderId: order.id,
        status: { in: ["open", "investigating"] },
      },
      select: { id: true },
    });

    if (hasOpenDispute) {
      const current = await tx.order.findUnique({ where: { id: order.id } });
      if (!current) {
        throw new Error("Order not found.");
      }
      return { order: current, amountReleased: new Prisma.Decimal(0) };
    }
  }

  const releasableAmount = order.amountPaidNet.sub(order.amountReleasedNet);
  if (releasableAmount.lte(0)) {
    const current = await tx.order.findUnique({ where: { id: order.id } });
    if (!current) {
      throw new Error("Order not found.");
    }
    return { order: current, amountReleased: new Prisma.Decimal(0) };
  }

  const requestedAmount = params.amountOverride
    ? params.amountOverride.gte(releasableAmount)
      ? releasableAmount
      : params.amountOverride
    : releasableAmount;
  const safeReleaseAmount = requestedAmount.gt(0) ? requestedAmount : new Prisma.Decimal(0);
  if (safeReleaseAmount.lte(0)) {
    const current = await tx.order.findUnique({ where: { id: order.id } });
    if (!current) {
      throw new Error("Order not found.");
    }
    return { order: current, amountReleased: new Prisma.Decimal(0) };
  }

  const releaseMethod = order.releaseMethod ?? resolveReleaseMethod(params.source);
  const claimed = await tx.order.updateMany({
    where: {
      id: order.id,
      releaseVersion: order.releaseVersion,
    },
    data: {
      status: "release_approved",
      approvedAt: order.approvedAt ?? now,
      releaseApprovedAt: order.releaseApprovedAt ?? now,
      releaseMethod,
      releasedAt: now,
      amountReleasedNet: { increment: safeReleaseAmount },
      releaseVersion: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    const concurrent = await tx.order.findUnique({ where: { id: order.id } });
    if (
      concurrent &&
      ["release_approved", "released", "disbursement_initiated", "disbursed"].includes(
        concurrent.status,
      )
    ) {
      return { order: concurrent, amountReleased: new Prisma.Decimal(0) };
    }
    throw new Error("Order release could not be applied due to concurrent updates.");
  }

  const wallet = await tx.providerWallet.upsert({
    where: { providerId: order.providerId },
    create: {
      providerId: order.providerId,
      availableBalance: new Prisma.Decimal(0),
      pendingBalance: new Prisma.Decimal(0),
      currency: order.currency,
    },
    update: {},
  });

  const pendingAfter = wallet.pendingBalance.sub(safeReleaseAmount);
  await tx.providerWallet.update({
    where: { providerId: order.providerId },
    data: {
      availableBalance: { increment: safeReleaseAmount },
      pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
    },
  });

  await tx.earningsLedger.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      providerId: order.providerId,
      grossAmount: order.amountGross,
      platformFee: order.platformFee,
      netAmount: safeReleaseAmount,
      currency: order.currency,
      state: "payable",
    },
    update: {
      netAmount: { increment: safeReleaseAmount },
      state: "payable",
      reservedAt: null,
      disbursedAt: null,
      pspPayoutRef: null,
    },
  });

  await tx.ledgerEntry.create({
    data: {
      orderId: order.id,
      userId: order.providerId,
      type: "provider_earnings",
      direction: "credit",
      amount: safeReleaseAmount,
      currency: order.currency,
      reference: order.id,
      metadata: {
        state: "payable",
        source: params.source,
        actorId: params.actorId,
      },
    },
  });

  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      type: "release_approved",
      payload: {
        actorId: params.actorId,
        source: params.source,
        amount: safeReleaseAmount.toString(),
      },
    },
  });

  const updatedOrder = await tx.order.findUnique({
    where: { id: order.id },
  });
  if (!updatedOrder) {
    throw new Error("Order not found.");
  }

  return { order: updatedOrder, amountReleased: safeReleaseAmount };
};

export const allocateDisbursementToOrders = async (
  tx: Prisma.TransactionClient,
  params: {
    providerId: string;
    orderId?: string;
    amount: Prisma.Decimal;
    currency: "GHS" | "USD" | "EUR";
    reference: string;
  },
) => {
  let remaining = params.amount;
  const now = new Date();

  if (remaining.lte(0)) {
    return { applied: new Prisma.Decimal(0), remaining };
  }

  const orders = await tx.order.findMany({
    where: {
      providerId: params.providerId,
      ...(params.orderId ? { id: params.orderId } : {}),
      status: { in: ["release_approved", "released", "disbursement_initiated", "disbursed"] },
      amountReleasedNet: { gt: new Prisma.Decimal(0) },
    },
    orderBy: [{ releasedAt: "asc" }, { updatedAt: "asc" }],
    select: {
      id: true,
      status: true,
      currency: true,
      amountReleasedNet: true,
      amountDisbursedNet: true,
      disbursedAt: true,
    },
  });

  for (const order of orders) {
    if (remaining.lte(0)) {
      break;
    }

    const outstanding = order.amountReleasedNet.sub(order.amountDisbursedNet);
    if (outstanding.lte(0)) {
      continue;
    }

    const applied = remaining.gte(outstanding) ? outstanding : remaining;
    const nextDisbursed = order.amountDisbursedNet.add(applied);
    const isFullyDisbursed = nextDisbursed.gte(order.amountReleasedNet);

    await tx.order.update({
      where: { id: order.id },
      data: {
        amountDisbursedNet: nextDisbursed,
        status: isFullyDisbursed ? "disbursed" : "disbursement_initiated",
        disbursedAt: isFullyDisbursed ? now : order.disbursedAt ?? undefined,
        pspPayoutRef: params.reference,
      },
    });

    if (isFullyDisbursed) {
      await tx.earningsLedger.updateMany({
        where: { orderId: order.id, state: { in: ["payable", "reserved"] } },
        data: {
          state: "disbursed",
          disbursedAt: now,
          pspPayoutRef: params.reference,
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "disbursed",
          payload: {
            amount: applied.toString(),
            reference: params.reference,
          },
        },
      });
    }

    remaining = remaining.sub(applied);
  }

  const applied = params.amount.sub(remaining);
  if (applied.gt(0)) {
    await tx.ledgerEntry.create({
      data: {
        userId: params.providerId,
        type: "payout",
        direction: "debit",
        amount: applied,
        currency: params.currency,
        reference: params.reference,
        metadata: {
          state: "disbursed",
        },
      },
    });
  }

  return { applied, remaining };
};
