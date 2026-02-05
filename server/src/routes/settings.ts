import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { getPlatformSettings } from "../utils/platform-settings.js";

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { settings, record } = await getPlatformSettings();
    res.json({
      featureFlags: settings.featureFlags,
      payments: {
        enabledProviders: settings.integrations.payments.enabledProviders,
        defaultProvider: settings.integrations.payments.defaultProvider,
      },
      updatedAt: record.updatedAt,
    });
  }),
);
