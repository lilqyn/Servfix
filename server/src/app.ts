import { createHash } from "crypto";
import express from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import path from "path";
import { getAccessTokenFromRequest, getCookieValue } from "./auth/session.js";
import { verifyTokenIgnoringExpiration } from "./auth/jwt.js";
import { env } from "./config.js";
import { auditAdmin } from "./middleware/audit.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { servicesRouter } from "./routes/services.js";
import { ordersRouter } from "./routes/orders.js";
import { communityRouter } from "./routes/community.js";
import { uploadsRouter } from "./routes/uploads.js";
import { messagesRouter } from "./routes/messages.js";
import { usersRouter } from "./routes/users.js";
import { notificationsRouter } from "./routes/notifications.js";
import { adminRouter } from "./routes/admin.js";
import { homeRouter } from "./routes/home.js";
import { reportsRouter } from "./routes/reports.js";
import { paymentsRouter } from "./routes/payments.js";
import { payoutsRouter } from "./routes/payouts.js";
import { boostsRouter } from "./routes/boosts.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { settingsRouter } from "./routes/settings.js";
import { supportRouter } from "./routes/support.js";
import { pagesRouter } from "./routes/pages.js";
import { businessRouter } from "./routes/business.js";
import { quotesRouter } from "./routes/quotes.js";
import { callsRouter } from "./routes/calls.js";
import { requestContext, requestLogger } from "./middleware/request-context.js";
import { CSRF_COOKIE_NAME, csrfProtection, ensureCsrfCookie } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/error.js";

export const app = express();
const isProduction = process.env.NODE_ENV === "production";

const resolveTrustProxy = (value: string | undefined) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return isProduction ? 1 : false;
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  const parsed = Number(trimmed);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return trimmed;
};

app.set("trust proxy", resolveTrustProxy(env.TRUST_PROXY));

const hashRateLimitKey = (value: string) =>
  createHash("sha256").update(value).digest("base64url").slice(0, 24);

const getRateLimitKey = (req: express.Request) => {
  const accessToken = getAccessTokenFromRequest(req);
  if (accessToken) {
    try {
      const { sub } = verifyTokenIgnoringExpiration(accessToken);
      if (sub) {
        return `user:${sub}`;
      }
    } catch {
      // Fall back to anonymous identifiers when the token is invalid.
    }
  }

  const csrfToken = getCookieValue(req.get("cookie"), CSRF_COOKIE_NAME);
  if (csrfToken) {
    return `csrf:${hashRateLimitKey(csrfToken)}`;
  }

  const fallbackIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
  return `ip:${ipKeyGenerator(fallbackIp)}`;
};

const fallbackOrigin = env.APP_URL.trim();
const configuredOrigins = (env.CORS_ORIGIN ? env.CORS_ORIGIN.split(",") : [fallbackOrigin])
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllOrigins = !isProduction && configuredOrigins.includes("*");
const allowedOrigins = configuredOrigins.filter((origin) => origin !== "*");
const effectiveOrigins = allowedOrigins.length > 0 ? allowedOrigins : [fallbackOrigin];

const cspScriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "https://accounts.google.com",
  "https://apis.google.com",
  "https://maps.googleapis.com",
  "https://maps.gstatic.com",
  "https://js.stripe.com",
];
if (!isProduction) {
  cspScriptSrc.push("'unsafe-eval'");
}

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowAllOrigins) {
      callback(null, true);
      return;
    }

    if (!isProduction && effectiveOrigins.length === 0) {
      callback(null, true);
      return;
    }

    if (effectiveOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-guest-id", "x-request-id"],
  credentials: true,
  maxAge: 60 * 60 * 24,
};

const API_RATE_LIMIT_EXCLUSIONS = [
  "/auth",
  "/payments",
  "/support",
  "/webhooks",
] as const;

const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 1200 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  skip: (req) =>
    API_RATE_LIMIT_EXCLUSIONS.some((prefix) => req.path.startsWith(prefix)),
  message: { error: "Too many requests. Please try again later." },
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 40 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: "Too many authentication attempts. Please try again later." },
});

const paymentsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: "Too many payment requests. Please try again later." },
});

const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
});

const supportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 150 : 1200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: "Too many support requests. Please try again later." },
});

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        manifestSrc: ["'self'"],
        scriptSrc: cspScriptSrc,
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:", "wss:", ...(isProduction ? [] : ["ws:"])],
        frameSrc: [
          "'self'",
          "https://accounts.google.com",
          "https://js.stripe.com",
          "https://hooks.stripe.com",
          "https://checkout.flutterwave.com",
          "https://checkout.paystack.com",
          "https://paystack.com",
        ],
        formAction: [
          "'self'",
          "https://checkout.flutterwave.com",
          "https://checkout.paystack.com",
          "https://paystack.com",
          "https://checkout.stripe.com",
        ],
        workerSrc: ["'self'", "blob:"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cors(corsOptions));
app.use(ensureCsrfCookie);
app.use(
  express.json({
    limit: "15mb",
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "15mb",
  }),
);
app.use(requestContext);
app.use(requestLogger);
app.use(csrfProtection);

app.use("/api/auth", authRateLimit);
app.use("/api/payments", paymentsRateLimit);
app.use("/api/support", supportRateLimit);
app.use("/api/admin", adminRateLimit);
app.use("/api/admin", auditAdmin);
app.use("/api", apiRateLimit);

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/services", servicesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/community", communityRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/users", usersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/home-content", homeRouter);
app.use("/api/pages", pagesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/payouts", payoutsRouter);
app.use("/api/boosts", boostsRouter);
app.use("/api/subscriptions", subscriptionsRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/support", supportRouter);
app.use("/api/business", businessRouter);
app.use("/api", quotesRouter);
app.use("/api/calls", callsRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

if (isProduction) {
  const distPath = path.resolve(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}

app.use(errorHandler);
