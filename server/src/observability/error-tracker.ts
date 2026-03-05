import * as Sentry from "@sentry/node";
import { env } from "../config.js";
import { logInfo } from "./logger.js";

const isProduction = process.env.NODE_ENV === "production";
let initialized = false;

export const initErrorTracking = () => {
  if (initialized) {
    return;
  }

  if (!env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    environment: process.env.NODE_ENV ?? "development",
    enabled: isProduction,
  });

  initialized = true;
  logInfo("sentry_initialized", {
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    environment: process.env.NODE_ENV ?? "development",
  });
};

export const captureException = (error: unknown, context: Record<string, unknown> = {}) => {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setContext("request", context);

    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }

    Sentry.captureException(new Error(typeof error === "string" ? error : "Unknown error"));
  });
};
