import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired } from "../middleware/auth.js";

export const reportsRouter = Router();

const createReportSchema = z.object({
  targetType: z.enum([
    "user",
    "service",
    "community_post",
    "community_comment",
    "review",
    "order",
  ]),
  targetId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(200),
  details: z.string().trim().max(500).optional(),
});

reportsRouter.post(
  "/",
  authRequired,
  asyncHandler(async (req, res) => {
    const data = createReportSchema.parse(req.body);

    const report = await prisma.report.create({
      data: {
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        details: data.details ?? null,
        reporterId: req.user!.id,
      },
      select: { id: true },
    });

    res.status(201).json({ report });
  }),
);
