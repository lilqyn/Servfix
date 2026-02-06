import { Router } from "express";
import { z } from "zod";
import type { Prisma, UserRole } from "@prisma/client";
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

const FULL_ACCESS_ROLES: UserRole[] = ["buyer", "provider", "admin"];

const ROUTE_ACCESS_RULES: Array<{ match: RegExp; roles: UserRole[] }> = [
  { match: /^\/messages\b/, roles: ["buyer", "provider", "admin"] },
  { match: /^\/cart\b/, roles: ["buyer", "admin"] },
  { match: /^\/dashboard\b/, roles: ["provider", "admin"] },
  { match: /^\/account\b/, roles: ["buyer", "provider", "admin"] },
  { match: /^\/support\b/, roles: ["buyer", "provider", "admin"] },
];

const canAccessRoute = (href: string, role: UserRole) => {
  const rule = ROUTE_ACCESS_RULES.find((entry) => entry.match.test(href));
  if (!rule) {
    return true;
  }
  return rule.roles.includes(role);
};

const getNotificationData = (data: Prisma.JsonValue | null) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {} as Record<string, unknown>;
  }
  return data as Record<string, unknown>;
};

const getNotificationHref = (notification: { type: string; data: Prisma.JsonValue | null }, role: UserRole) => {
  const data = getNotificationData(notification.data);
  const postId = typeof data.postId === "string" ? data.postId : null;
  const followerId = typeof data.followerId === "string" ? data.followerId : null;
  const serviceId = typeof data.serviceId === "string" ? data.serviceId : null;

  switch (notification.type) {
    case "message_received":
      return "/messages";
    case "order_created":
    case "order_status":
      return role === "buyer" ? "/cart" : "/dashboard";
    case "review_received":
      return "/dashboard";
    case "review_reply":
      return serviceId ? `/service/${serviceId}` : "/dashboard";
    case "follow_received":
      return followerId ? `/profile/${followerId}` : "/community";
    case "community_post_liked":
    case "community_post_commented":
    case "community_new_post":
      return postId ? `/community?post=${postId}` : "/community";
    case "payout_update":
      return "/dashboard/payouts";
    default:
      return "/notifications";
  }
};

const canAccessNotification = (
  notification: { type: string; data: Prisma.JsonValue | null },
  role: UserRole,
) => {
  const href = getNotificationHref(notification, role);
  return canAccessRoute(href, role);
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

type NotificationRecord = Prisma.NotificationGetPayload<{
  include: {
    actor: {
      select: {
        id: true;
        email: true;
        phone: true;
        username: true;
        avatarKey: true;
        providerProfile: { select: { displayName: true } };
      };
    };
  };
}>;

const fetchAccessibleNotifications = async (params: {
  userId: string;
  role: UserRole;
  limit: number;
  cursor?: string;
}) => {
  const { userId, role, limit, cursor } = params;
  const pageSize = Math.min(50, Math.max(10, limit));
  const collected: NotificationRecord[] = [];
  let nextCursor = cursor ?? null;
  let hasMore = true;

  while (collected.length < limit && hasMore) {
    const batch = await prisma.notification.findMany({
      where: { userId },
      take: pageSize,
      ...(nextCursor
        ? {
            cursor: { id: nextCursor },
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

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    for (const item of batch) {
      if (canAccessNotification(item, role)) {
        collected.push(item);
        if (collected.length >= limit) {
          break;
        }
      }
    }

    if (batch.length < pageSize) {
      hasMore = false;
      break;
    }

    nextCursor = batch[batch.length - 1].id;
  }

  const responseNextCursor =
    hasMore && collected.length > 0 ? collected[collected.length - 1].id : null;

  return { notifications: collected, nextCursor: responseNextCursor };
};

const countAccessibleUnreadNotifications = async (params: {
  userId: string;
  role: UserRole;
}) => {
  const { userId, role } = params;
  const pageSize = 50;
  let nextCursor: string | null = null;
  let hasMore = true;
  let count = 0;

  while (hasMore) {
    const batch = await prisma.notification.findMany({
      where: { userId, isRead: false },
      take: pageSize,
      ...(nextCursor
        ? {
            cursor: { id: nextCursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, type: true, data: true },
    });

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    for (const item of batch) {
      if (canAccessNotification(item, role)) {
        count += 1;
      }
    }

    if (batch.length < pageSize) {
      hasMore = false;
      break;
    }

    nextCursor = batch[batch.length - 1].id;
  }

  return count;
};

notificationsRouter.get(
  "/",
  authRequired,
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const limit = query.limit ?? 20;
    const userId = req.user!.id;
    const role = req.user!.role as UserRole;

    const shouldFilter = !FULL_ACCESS_ROLES.includes(role);

    let notifications: NotificationRecord[] = [];
    let nextCursor: string | null = null;

    if (shouldFilter) {
      const result = await fetchAccessibleNotifications({
        userId,
        role,
        limit,
        cursor: query.cursor,
      });
      notifications = result.notifications;
      nextCursor = result.nextCursor;
    } else {
      const fetched = await prisma.notification.findMany({
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

      const hasNext = fetched.length > limit;
      notifications = hasNext ? fetched.slice(0, limit) : fetched;
      nextCursor = hasNext ? notifications[notifications.length - 1]?.id ?? null : null;
    }

    const formatted = await Promise.all(notifications.map((item) => formatNotification(item)));
    const unreadCount = shouldFilter
      ? await countAccessibleUnreadNotifications({ userId, role })
      : await prisma.notification.count({
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
