import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { logInfo } from "../observability/logger.js";

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header("x-request-id")?.trim();
  const requestId = incoming || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = process.hrtime.bigint();
  const route = req.originalUrl || req.url;
  const method = req.method;
  const requestId = req.requestId;

  res.on("finish", () => {
    const elapsedNs = process.hrtime.bigint() - startedAt;
    const durationMs = Number(elapsedNs) / 1_000_000;

    logInfo("http_request", {
      requestId,
      method,
      route,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.user?.id ?? null,
      userRole: req.user?.role ?? null,
    });
  });

  next();
};
