import { prisma } from "../db.js";
import { signS3Key } from "./s3.js";
import { pushToUser } from "../websocket.js";
import { getPlatformSettings } from "./platform-settings.js";
import type { NotificationType, Prisma } from "@prisma/client";

type ActorSummary = {
  id: string;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  avatarKey?: string | null;
  providerProfile?: { displayName?: string | null } | null;
};

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

const formatActorName = (actor: ActorSummary) => {
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

const renderTemplate = (template: string, tokens: Record<string, string>) => {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match;
  });
};

const formatNotification = async (notification: {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Prisma.JsonValue | null;
  isRead: boolean;
  createdAt: Date;
  actor?: ActorSummary | null;
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

export const createNotification = async (params: {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  data?: Prisma.InputJsonValue;
}) => {
  let title = params.title;
  let body = params.body ?? null;

  try {
    const { settings } = await getPlatformSettings();
    const template = settings.notificationTemplates?.[params.type];
    if (template?.enabled) {
      const tokens = {
        title: params.title,
        body: params.body ?? "",
        type: params.type,
      };
      const renderedTitle = renderTemplate(template.title || "{title}", tokens).trim();
      const renderedBody = renderTemplate(template.body || "{body}", tokens).trim();
      title = renderedTitle || params.title;
      body = renderedBody.length > 0 ? renderedBody : params.body ?? null;
    }
  } catch {
    // ignore template failures
  }

  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      actorId: params.actorId ?? null,
      type: params.type,
      title,
      body,
      data: params.data,
    },
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

  const formatted = await formatNotification(notification);
  pushToUser(params.userId, { type: "notification", notification: formatted });
  return formatted;
};
