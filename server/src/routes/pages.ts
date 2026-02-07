import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { DEFAULT_PAGES, PAGE_KEYS, type StaticPageKey } from "../utils/pages.js";

export const pagesRouter = Router();

const pageKeySchema = z.enum(PAGE_KEYS as [StaticPageKey, ...StaticPageKey[]]);

pagesRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const slug = pageKeySchema.parse(req.params.slug);
    const page = await prisma.staticPage.findUnique({ where: { slug } });
    const fallback = DEFAULT_PAGES[slug];

    if (!page) {
      return res.json({ slug, ...fallback, updatedAt: null });
    }

    res.json({
      slug,
      title: page.title,
      body: page.body,
      updatedAt: page.updatedAt,
    });
  }),
);
