import { prisma } from "../db.js";
import { markOrderReleaseApproved } from "../utils/order-flow.js";
import { createNotification } from "../utils/notifications.js";
import { logError } from "../observability/logger.js";

const DEFAULT_INTERVAL_MS = 5 * 60_000;

let intervalHandle: NodeJS.Timeout | null = null;
let running = false;

const runAutoReleasePass = async () => {
  if (running) {
    return;
  }

  running = true;
  try {
    const now = new Date();
    const candidates = await prisma.order.findMany({
      where: {
        status: "delivery_submitted",
        reviewDeadlineAt: { lte: now },
      },
      select: {
        id: true,
        buyerId: true,
        providerId: true,
        serviceId: true,
        service: { select: { title: true } },
      },
      take: 100,
      orderBy: { reviewDeadlineAt: "asc" },
    });

    for (const order of candidates) {
      const hasOpenDispute = await prisma.dispute.findFirst({
        where: {
          orderId: order.id,
          status: { in: ["open", "investigating"] },
        },
        select: { id: true },
      });
      if (hasOpenDispute) {
        continue;
      }

      const result = await prisma.$transaction(async (tx) =>
        markOrderReleaseApproved(tx, {
          orderId: order.id,
          actorId: null,
          source: "auto_release",
        }),
      );

      if (result.amountReleased.lte(0)) {
        continue;
      }

      const serviceTitle = order.service?.title ?? "service";
      await Promise.all([
        createNotification({
          userId: order.providerId,
          actorId: null,
          type: "order_status",
          title: "Auto-release completed",
          body: `Buyer review window ended for ${serviceTitle}. Earnings are now payable.`,
          data: { orderId: order.id, serviceId: order.serviceId },
        }),
        createNotification({
          userId: order.buyerId,
          actorId: order.providerId,
          type: "order_status",
          title: "Order auto-approved",
          body: `The review window ended. ${serviceTitle} was auto-approved.`,
          data: { orderId: order.id, serviceId: order.serviceId },
        }),
      ]);
    }
  } catch (error) {
    logError("order_review_auto_release_failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    running = false;
  }
};

export const startOrderReviewDeadlineJob = (intervalMs = DEFAULT_INTERVAL_MS) => {
  if (intervalHandle) {
    return;
  }

  void runAutoReleasePass();
  intervalHandle = setInterval(() => {
    void runAutoReleasePass();
  }, intervalMs);
};

export const stopOrderReviewDeadlineJob = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
