import { prisma } from "../db.js";
import { createNotification } from "../utils/notifications.js";
import { logError } from "../observability/logger.js";

const ONE_WEEK_MS = 7 * 24 * 60 * 60_000;
const DEFAULT_INTERVAL_MS = ONE_WEEK_MS;

let intervalHandle: NodeJS.Timeout | null = null;
let running = false;

const runWeeklySummary = async () => {
  if (running) return;
  running = true;

  try {
    const oneWeekAgo = new Date(Date.now() - ONE_WEEK_MS);

    // Find all providers who have at least one follower
    const providers = await prisma.user.findMany({
      where: {
        role: "provider",
        followers: { some: {} },
      },
      select: {
        id: true,
        providerProfile: { select: { displayName: true } },
        _count: { select: { followers: true } },
      },
    });

    for (const provider of providers) {
      // Count new followers in the past week
      const newFollowers = await prisma.userFollow.count({
        where: {
          followingId: provider.id,
          createdAt: { gte: oneWeekAgo },
        },
      });

      // Count completed orders in the past week
      const completedOrders = await prisma.order.count({
        where: {
          providerId: provider.id,
          status: { in: ["delivery_submitted", "delivered", "release_approved", "approved", "released", "disbursed"] },
          updatedAt: { gte: oneWeekAgo },
        },
      });

      const totalFollowers = provider._count.followers;

      // Only send if there's something to report
      if (newFollowers > 0 || completedOrders > 0) {
        const parts: string[] = [];
        if (newFollowers > 0) parts.push(`${newFollowers} new follower${newFollowers > 1 ? "s" : ""}`);
        if (completedOrders > 0) parts.push(`${completedOrders} completed order${completedOrders > 1 ? "s" : ""}`);
        const body = `This week: ${parts.join(", ")}. You now have ${totalFollowers} total follower${totalFollowers > 1 ? "s" : ""}.`;

        await createNotification({
          userId: provider.id,
          actorId: provider.id,
          type: "provider_milestone",
          title: "Weekly summary",
          body,
          data: { followerId: provider.id },
        });
      }
    }
  } catch (err) {
    logError("weekly-follower-summary", { error: String(err) });
  } finally {
    running = false;
  }
};

export const startWeeklyFollowerSummary = (intervalMs = DEFAULT_INTERVAL_MS) => {
  if (intervalHandle) return;
  // Run first check after 1 minute, then weekly
  setTimeout(() => {
    void runWeeklySummary();
    intervalHandle = setInterval(() => void runWeeklySummary(), intervalMs);
  }, 60_000);
};

export const stopWeeklyFollowerSummary = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
