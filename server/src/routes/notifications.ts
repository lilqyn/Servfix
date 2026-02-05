import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired } from "../middleware/auth.js";
import { signS3Key } from "../utils/s3.js";

export const notificationsRouter = Router();

const querySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const markReadSchema = z
  .object({
    ids: z.array(z.string().uuid()).optional(),
    all: z.boolean().optional(),
  })
  .refine((data) => data.all || (data.ids && data.ids.length > 0), {
    message: "Provide ids or set all=true.",
  });

const resolveMediaUrl = async (key?: string | null) => {
  if (!key) {
    return null;
  }
  if (key.startsWith("http")) {
    return key;
  }
  const signed = await signS3Key(key);
  return signed ?? null;
};

const formatActorName = (actor: {
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  providerProfile?: { displayName?: string | null } | null;
}) => {
  if (actor.providerProfile?.displayName) {
    return actor.providerProfile.displayName;
  }
  if (actor.username) {
    return `@${actor.username}`;
  }
  if (actor.email) {
    return actor.email;
  }
  if (actor.phone) {
    return actor.phone;
  }
  return "User";
};

const formatNotification = async (notification: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  isRead: boolean;
  createdAt: Date;
  actor: {
    id: string;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
    avatarKey?: string | null;
    providerProfile?: { displayName?: string | null } | null;
  } | null;
}) => {
  const actor = notification.actor
    ? {
        id: notification.actor.id,
        name: formatActorName(notification.actor),
        username: notification.actor.username ?? null,
        avatarUrl: await resolveMediaUrl(notification.actor.avatarKey),
      }
    : null;

  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
    actor,
  };
};

notificationsRouter.get(
  "/",
  authRequired,
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const limit = query.limit ?? 20;
    const userId = req.user!.id;

    const notifications = await prisma.notification.findMany({
      where: { userId },
      take: limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            avatarKey: true,
            providerProfile: { select: { displayName: true } },
          },
        },
      },
    });

    const hasNext = notifications.length > limit;
    const trimmed = hasNext ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;
    const formatted = await Promise.all(trimmed.map((item) => formatNotification(item)));
    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    res.json({ notifications: formatted, nextCursor, unreadCount });
  }),
);

notificationsRouter.post(
  "/mark-read",
  authRequired,
  asyncHandler(async (req, res) => {
    const data = markReadSchema.parse(req.body);
    const userId = req.user!.id;

    if (data.all) {
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
    } else if (data.ids && data.ids.length > 0) {
      await prisma.notification.updateMany({
        where: { userId, id: { in: data.ids } },
        data: { isRead: true },
      });
    }

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    res.json({ unreadCount });
  }),
);
