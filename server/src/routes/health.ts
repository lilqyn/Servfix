import { Router } from "express";
import { prisma } from "../db.js";
import { isShuttingDown } from "../observability/runtime-state.js";

export const healthRouter = Router();

healthRouter.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "servfix-api",
    uptimeSeconds: Math.floor(process.uptime()),
    time: new Date().toISOString(),
    requestId: req.requestId ?? null,
  });
});

healthRouter.get("/live", (req, res) => {
  res.json({
    status: "ok",
    service: "servfix-api",
    uptimeSeconds: Math.floor(process.uptime()),
    requestId: req.requestId ?? null,
  });
});

healthRouter.get("/ready", async (req, res) => {
  if (isShuttingDown()) {
    return res.status(503).json({
      status: "not_ready",
      reason: "shutdown_in_progress",
      requestId: req.requestId ?? null,
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      status: "ready",
      checks: { database: "ok" },
      requestId: req.requestId ?? null,
    });
  } catch {
    return res.status(503).json({
      status: "not_ready",
      checks: { database: "failed" },
      requestId: req.requestId ?? null,
    });
  }
});
