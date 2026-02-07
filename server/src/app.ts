import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./config.js";
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
import { webhooksRouter } from "./routes/webhooks.js";
import { settingsRouter } from "./routes/settings.js";
import { supportRouter } from "./routes/support.js";
import { pagesRouter } from "./routes/pages.js";
import { errorHandler } from "./middleware/error.js";

export const app = express();
const isProduction = process.env.NODE_ENV === "production";

const allowedOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : "*";

app.use(cors({ origin: allowedOrigins }));
app.use(
  express.json({
    limit: "15mb",
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);

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
app.use("/api/webhooks", webhooksRouter);
app.use("/api/support", supportRouter);

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
