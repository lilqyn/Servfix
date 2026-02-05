import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { defaultHomeContent, HOME_CONTENT_KEY } from "../utils/home-content.js";

export const homeRouter = Router();

homeRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const content = await prisma.homeContent.findUnique({
      where: { key: HOME_CONTENT_KEY },
    });

    if (!content) {
      return res.json(defaultHomeContent);
    }

    res.json({
      hero: content.hero,
      categories: content.categories,
      howItWorks: content.howItWorks,
      updatedAt: content.updatedAt,
    });
  }),
);
