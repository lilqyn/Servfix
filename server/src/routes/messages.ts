import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { signS3Key } from "../utils/s3.js";
import { createNotification } from "../utils/notifications.js";

export const messagesRouter = Router();

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop";

const createThreadSchema = z.object({
  providerId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
});

const orderThreadSchema = z.object({
  orderId: z.string().uuid(),
});

const threadIdSchema = z.object({
  id: z.string().uuid(),
});

const messageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

type UserSummary = {
  id: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  avatarKey?: string | null;
  providerProfile?: { displayName?: string | null } | null;
};

const formatUserName = (user: UserSummary) => {
  if (user.providerProfile?.displayName) {
    return user.providerProfile.displayName;
  }
  if (user.username) {
    return `@${user.username}`;
  }
  if (user.email) {
    return user.email;
  }
  if (user.phone) {
    return user.phone;
  }
  return user.role === "provider" ? "Provider" : "Buyer";
};

const resolveMediaUrl = async (key?: string | null) => {
  if (!key) {
    return DEFAULT_AVATAR;
  }
  if (key.startsWith("http")) {
    return key;
  }
  const signed = await signS3Key(key);
  return signed ?? DEFAULT_AVATAR;
};

const formatParticipant = async (user: UserSummary) => ({
  id: user.id,
  name: formatUserName(user),
  avatar: await resolveMediaUrl(user.avatarKey),
  isProvider: user.role === "provider",
});

const formatMessage = (message: {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}, viewerId: string) => ({
  id: message.id,
  conversationId: message.threadId,
  senderId: message.senderId === viewerId ? "current-user" : message.senderId,
  content: message.body,
  timestamp: message.createdAt,
  read: message.senderId === viewerId ? true : Boolean(message.readAt),
});

const formatParticipantForViewer = async (user: UserSummary, viewerId: string) => ({
  id: user.id === viewerId ? "current-user" : user.id,
  name: formatUserName(user),
  avatar: await resolveMediaUrl(user.avatarKey),
  isProvider: user.role === "provider",
});

messagesRouter.get(
  "/threads",
  authRequired,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const threads = await prisma.thread.findMany({
      where: {
        OR: [{ buyerId: userId }, { providerId: userId }],
      },
      include: {
        buyer: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
        provider: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
        service: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (threads.length === 0) {
      return res.json({ conversations: [] });
    }

    const threadIds = threads.map((thread) => thread.id);

    const [lastMessages, unreadGroups] = await Promise.all([
      prisma.message.findMany({
        where: { threadId: { in: threadIds } },
        orderBy: { createdAt: "desc" },
        distinct: ["threadId"],
      }),
      prisma.message.groupBy({
        by: ["threadId"],
        where: {
          threadId: { in: threadIds },
          senderId: { not: userId },
          readAt: null,
        },
        _count: { _all: true },
      }),
    ]);

    const lastMessageByThread = new Map(lastMessages.map((msg) => [msg.threadId, msg]));
    const unreadByThread = new Map(unreadGroups.map((row) => [row.threadId, row._count._all]));

    const conversations = (await Promise.all(threads.map(async (thread) => {
      const lastMessage = lastMessageByThread.get(thread.id);
      const unreadCount = unreadByThread.get(thread.id) ?? 0;

      return {
        id: thread.id,
        participants: await Promise.all([
          formatParticipantForViewer(thread.buyer, userId),
          formatParticipantForViewer(thread.provider, userId),
        ]),
        serviceId: thread.serviceId ?? thread.service?.id ?? null,
        serviceName: thread.service?.title ?? null,
        lastMessage: lastMessage ? formatMessage(lastMessage, userId) : null,
        unreadCount,
        createdAt: thread.createdAt,
      };
    }))).sort((a, b) => {
      const aTime = a.lastMessage?.timestamp ?? a.createdAt;
      const bTime = b.lastMessage?.timestamp ?? b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    res.json({ conversations });
  }),
);

messagesRouter.post(
  "/threads",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const data = createThreadSchema.parse(req.body);
    const userId = req.user!.id;

    if (data.providerId === userId) {
      return res.status(400).json({ error: "You cannot message yourself" });
    }

    const provider = await prisma.user.findUnique({
      where: { id: data.providerId },
      select: { id: true, role: true },
    });

    if (!provider || provider.role !== "provider") {
      return res.status(404).json({ error: "Provider not found" });
    }

    if (data.serviceId) {
      const service = await prisma.service.findUnique({
        where: { id: data.serviceId },
        select: { id: true, providerId: true },
      });
      if (!service || service.providerId !== data.providerId) {
        return res.status(400).json({ error: "Service does not belong to provider" });
      }
    }

    const existing = await prisma.thread.findFirst({
      where: {
        buyerId: userId,
        providerId: data.providerId,
        serviceId: data.serviceId ?? null,
        orderId: data.orderId ?? null,
      },
      include: {
        buyer: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
        provider: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
        service: { select: { id: true, title: true } },
      },
    });

    const thread = existing ?? (await prisma.thread.create({
      data: {
        buyerId: userId,
        providerId: data.providerId,
        serviceId: data.serviceId ?? null,
        orderId: data.orderId ?? null,
      },
      include: {
        buyer: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
        provider: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
        service: { select: { id: true, title: true } },
      },
    }));

    res.status(existing ? 200 : 201).json({
      conversation: {
        id: thread.id,
        participants: await Promise.all([
          formatParticipantForViewer(thread.buyer, userId),
          formatParticipantForViewer(thread.provider, userId),
        ]),
        serviceId: thread.serviceId ?? thread.service?.id ?? null,
        serviceName: thread.service?.title ?? null,
        lastMessage: null,
        unreadCount: 0,
        createdAt: thread.createdAt,
      },
    });
  }),
);

messagesRouter.post(
  "/threads/from-order",
  authRequired,
  requireRole("buyer", "provider", "admin"),
  asyncHandler(async (req, res) => {
    const data = orderThreadSchema.parse(req.body);
    const userId = req.user!.id;

    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
      select: {
        id: true,
        buyerId: true,
        providerId: true,
        serviceId: true,
        service: { select: { id: true, title: true } },
        buyer: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
        provider: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (req.user!.role !== "admin" && order.buyerId !== userId && order.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const existing = await prisma.thread.findFirst({
      where: {
        buyerId: order.buyerId,
        providerId: order.providerId,
        orderId: order.id,
      },
      include: {
        buyer: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
        provider: {
          select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
        },
        service: { select: { id: true, title: true } },
      },
    });

    const thread =
      existing ??
      (await prisma.thread.create({
        data: {
          buyerId: order.buyerId,
          providerId: order.providerId,
          orderId: order.id,
          serviceId: order.serviceId ?? null,
        },
        include: {
          buyer: {
            select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
          },
          provider: {
            select: { id: true, role: true, email: true, phone: true, username: true, avatarKey: true, providerProfile: true },
          },
          service: { select: { id: true, title: true } },
        },
      }));

    res.status(existing ? 200 : 201).json({
      conversation: {
        id: thread.id,
        participants: await Promise.all([
          formatParticipantForViewer(thread.buyer, userId),
          formatParticipantForViewer(thread.provider, userId),
        ]),
        serviceId: thread.serviceId ?? thread.service?.id ?? null,
        serviceName: thread.service?.title ?? null,
        lastMessage: null,
        unreadCount: 0,
        createdAt: thread.createdAt,
      },
    });
  }),
);

messagesRouter.get(
  "/threads/:id/messages",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = threadIdSchema.parse(req.params);
    const userId = req.user!.id;

    const thread = await prisma.thread.findUnique({
      where: { id: params.id },
      select: { id: true, buyerId: true, providerId: true },
    });

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    if (thread.buyerId !== userId && thread.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const messages = await prisma.message.findMany({
      where: { threadId: params.id },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      messages: messages.map((message) => formatMessage(message, userId)),
    });
  }),
);

messagesRouter.post(
  "/threads/:id/messages",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = threadIdSchema.parse(req.params);
    const data = messageSchema.parse(req.body);
    const userId = req.user!.id;

    const thread = await prisma.thread.findUnique({
      where: { id: params.id },
      select: { id: true, buyerId: true, providerId: true },
    });

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    if (thread.buyerId !== userId && thread.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const message = await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: userId,
        body: data.content.trim(),
      },
    });

    await prisma.thread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    const recipientId = thread.buyerId === userId ? thread.providerId : thread.buyerId;
    if (recipientId && recipientId !== userId) {
      const preview = data.content.trim().slice(0, 140);
      await createNotification({
        userId: recipientId,
        actorId: userId,
        type: "message_received",
        title: "New message",
        body: preview,
        data: { threadId: thread.id },
      });
    }

    res.status(201).json({ message: formatMessage(message, userId) });
  }),
);

messagesRouter.post(
  "/threads/:id/read",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = threadIdSchema.parse(req.params);
    const userId = req.user!.id;

    const thread = await prisma.thread.findUnique({
      where: { id: params.id },
      select: { id: true, buyerId: true, providerId: true },
    });

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    if (thread.buyerId !== userId && thread.providerId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.message.updateMany({
      where: {
        threadId: thread.id,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    res.status(204).send();
  }),
);
