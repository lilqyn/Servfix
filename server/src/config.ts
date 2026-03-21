import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const weakJwtSecrets = new Set([
  "change-me",
  "changeme",
  "secret",
  "password",
  "jwt_secret",
  "test",
  "dev",
  "development",
]);

const isWeakJwtSecret = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (weakJwtSecrets.has(normalized)) {
    return true;
  }
  return /^(.)\1+$/.test(value);
};

const hasDiverseCharacters = (value: string) => {
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
};

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().trim().min(1, "JWT_SECRET is required"),
  PORT: z.coerce.number().int().positive().default(4000),
  TRUST_PROXY: z.string().optional(),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(1000),
  TAX_BPS: z.coerce.number().int().min(0).max(10000).default(0),
  CORS_ORIGIN: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.05),
  OPS_ALERT_WEBHOOK_URL: z.string().url().optional(),
  DB_HEALTHCHECK_INTERVAL_MS: z.coerce.number().int().min(1000).default(60000),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:5173"),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_HASH: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  HUBTEL_CLIENT_ID: z.string().optional(),
  HUBTEL_CLIENT_SECRET: z.string().optional(),
  HUBTEL_BASE_URL: z.string().optional(),
  EXPRESSPAY_MERCHANT_ID: z.string().optional(),
  EXPRESSPAY_API_KEY: z.string().optional(),
  EXPRESSPAY_BASE_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  METERED_TURN_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

if (process.env.NODE_ENV !== "test") {
  if (env.JWT_SECRET.length < 16) {
    throw new Error("JWT_SECRET must be at least 16 characters.");
  }

  if (isWeakJwtSecret(env.JWT_SECRET)) {
    throw new Error("JWT_SECRET is too weak. Use a random value.");
  }
}

if (process.env.NODE_ENV === "production") {
  if (env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production.");
  }

  if (!hasDiverseCharacters(env.JWT_SECRET)) {
    throw new Error(
      "JWT_SECRET must include uppercase, lowercase, and numeric characters in production.",
    );
  }

  const corsOrigins = (env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0) {
    throw new Error("CORS_ORIGIN is required in production.");
  }

  if (corsOrigins.includes("*")) {
    throw new Error("CORS_ORIGIN cannot include '*' in production.");
  }

  if (corsOrigins.some((origin) => !origin.startsWith("https://"))) {
    throw new Error("CORS_ORIGIN must include only HTTPS origins in production.");
  }

  if (!env.APP_URL.startsWith("https://")) {
    throw new Error("APP_URL must use HTTPS in production.");
  }

  if (!env.SENTRY_DSN) {
    console.warn("WARNING: SENTRY_DSN is not set — Sentry error tracking will be disabled.");
  }

  if (!env.OPS_ALERT_WEBHOOK_URL) {
    console.warn("WARNING: OPS_ALERT_WEBHOOK_URL is not set — ops alerts will be disabled.");
  }
}
