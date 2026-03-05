import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { randomUUID } from "crypto";
import { sendOpsAlert } from "../observability/alerts.js";
import { captureException } from "../observability/error-tracker.js";
import { logError } from "../observability/logger.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const errorId = randomUUID();
  const requestId = req.requestId ?? null;

  if (err instanceof ZodError) {
    logError("request_validation_error", {
      errorId,
      requestId,
      route: req.originalUrl || req.url,
      method: req.method,
      issues: err.issues,
    });
    return res.status(400).json({
      error: "Validation error",
      issues: err.issues,
      requestId,
      errorId,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      logError("request_prisma_unique_violation", {
        errorId,
        requestId,
        route: req.originalUrl || req.url,
        method: req.method,
        code: err.code,
        meta: err.meta,
      });
      return res.status(409).json({
        error: "Unique constraint failed",
        meta: err.meta,
        requestId,
        errorId,
      });
    }
  }

  logError("request_unhandled_error", {
    errorId,
    requestId,
    route: req.originalUrl || req.url,
    method: req.method,
    message: err instanceof Error ? err.message : "Unknown error",
    stack: err instanceof Error ? err.stack : undefined,
  });

  captureException(err, {
    errorId,
    requestId,
    route: req.originalUrl || req.url,
    method: req.method,
  });
  void sendOpsAlert("api_unhandled_error", {
    errorId,
    requestId,
    route: req.originalUrl || req.url,
    method: req.method,
  });

  return res.status(500).json({
    error: "Internal server error",
    requestId,
    errorId,
  });
}
