import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../server/src/db.js";

const TARGET_STATUSES = [
  "release_approved",
  "released",
  "disbursement_initiated",
  "disbursed",
] as const;

const BATCH_SIZE = 500;

type BackfillState = "payable" | "reserved" | "disbursed";

const resolveState = (params: {
  status: (typeof TARGET_STATUSES)[number];
  amountReleasedNet: Prisma.Decimal;
  amountDisbursedNet: Prisma.Decimal;
}): BackfillState => {
  if (
    params.status === "disbursed" ||
    params.amountDisbursedNet.gte(params.amountReleasedNet)
  ) {
    return "disbursed";
  }
  if (params.status === "disbursement_initiated") {
    return "reserved";
  }
  return "payable";
};

const run = async () => {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");

  let totalScanned = 0;
  let totalPrepared = 0;
  let totalCreated = 0;
  let cursorId: string | undefined;

  while (true) {
    const orders = await prisma.order.findMany({
      where: {
        status: { in: TARGET_STATUSES },
        amountReleasedNet: { gt: new Prisma.Decimal(0) },
        earningsLedger: { is: null },
      },
      select: {
        id: true,
        providerId: true,
        status: true,
        amountGross: true,
        platformFee: true,
        amountReleasedNet: true,
        amountDisbursedNet: true,
        currency: true,
        disbursedAt: true,
        updatedAt: true,
        pspPayoutRef: true,
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    if (orders.length === 0) {
      break;
    }

    totalScanned += orders.length;
    const entries = orders.map((order) => {
      const state = resolveState({
        status: order.status,
        amountReleasedNet: order.amountReleasedNet,
        amountDisbursedNet: order.amountDisbursedNet,
      });
      return {
        orderId: order.id,
        providerId: order.providerId,
        grossAmount: order.amountGross,
        platformFee: order.platformFee,
        netAmount: order.amountReleasedNet,
        currency: order.currency,
        state,
        reservedAt: state === "reserved" ? order.updatedAt : null,
        disbursedAt: state === "disbursed" ? order.disbursedAt ?? order.updatedAt : null,
        pspPayoutRef: state === "disbursed" ? order.pspPayoutRef : null,
      };
    });

    totalPrepared += entries.length;
    if (!dryRun && entries.length > 0) {
      const created = await prisma.earningsLedger.createMany({
        data: entries,
        skipDuplicates: true,
      });
      totalCreated += created.count;
    }

    cursorId = orders[orders.length - 1]?.id;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        scannedOrdersWithoutLedger: totalScanned,
        preparedLedgerEntries: totalPrepared,
        createdLedgerEntries: dryRun ? 0 : totalCreated,
      },
      null,
      2,
    ),
  );
};

run()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
