import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  PORT: z.coerce.number().int().positive().default(4000),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(1000),
  TAX_BPS: z.coerce.number().int().min(0).max(10000).default(0),
  CORS_ORIGIN: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:5173"),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_HASH: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
