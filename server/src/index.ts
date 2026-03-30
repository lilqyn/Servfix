import http from "http";
import { app } from "./app.js";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { initWebsocket } from "./websocket.js";
import { initErrorTracking } from "./observability/error-tracker.js";
import { startHealthMonitor, stopHealthMonitor } from "./observability/health-monitor.js";
import { logError, logInfo } from "./observability/logger.js";
import { setShuttingDown } from "./observability/runtime-state.js";
import {
  startOrderReviewDeadlineJob,
  stopOrderReviewDeadlineJob,
} from "./jobs/order-review-deadline.js";
import {
  startForcedDisbursementJob,
  stopForcedDisbursementJob,
} from "./jobs/forced-disbursement.js";
import { startWeeklyFollowerSummary } from "./jobs/weekly-follower-summary.js";

const server = http.createServer(app);
initWebsocket(server);
initErrorTracking();
startHealthMonitor();
startOrderReviewDeadlineJob();
startForcedDisbursementJob();
startWeeklyFollowerSummary();

server.listen(env.PORT, () => {
  logInfo("server_started", { port: env.PORT });
});

const shutdown = async () => {
  setShuttingDown(true);
  logInfo("server_shutdown_started");
  stopHealthMonitor();
  stopOrderReviewDeadlineJob();
  stopForcedDisbursementJob();

  await prisma.$disconnect();
  server.close((err) => {
    if (err) {
      logError("server_shutdown_failed", { message: err.message });
      process.exit(1);
      return;
    }
    logInfo("server_shutdown_completed");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
