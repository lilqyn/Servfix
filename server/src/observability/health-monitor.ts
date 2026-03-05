import { prisma } from "../db.js";
import { env } from "../config.js";
import { logError, logInfo, logWarn } from "./logger.js";
import { sendOpsAlert } from "./alerts.js";

let intervalHandle: NodeJS.Timeout | null = null;
let lastDbHealthy = true;

const runDbHealthCheck = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (!lastDbHealthy) {
      lastDbHealthy = true;
      logWarn("db_health_recovered");
      void sendOpsAlert("db_health_recovered");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database health check failed";
    logError("db_health_check_failed", { message });
    if (lastDbHealthy) {
      lastDbHealthy = false;
      void sendOpsAlert("db_health_check_failed", { message });
    }
  }
};

export const startHealthMonitor = () => {
  if (intervalHandle) {
    return;
  }

  const intervalMs = env.DB_HEALTHCHECK_INTERVAL_MS;
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
    return;
  }

  intervalHandle = setInterval(() => {
    void runDbHealthCheck();
  }, intervalMs);
  intervalHandle.unref?.();

  logInfo("db_health_monitor_started", { intervalMs });
};

export const stopHealthMonitor = () => {
  if (!intervalHandle) {
    return;
  }
  clearInterval(intervalHandle);
  intervalHandle = null;
  logInfo("db_health_monitor_stopped");
};
