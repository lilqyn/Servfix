import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { isS3Configured, signS3Key, uploadToS3 } from "../utils/s3.js";
import { createNotification } from "../utils/notifications.js";
import { isBlocked } from "../utils/blocks.js";

export const messagesRouter = Router();


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
  attachmentKey: z.string().optional(),
  attachmentType: z.enum(["image", "file"]).optional(),
  attachmentName: z.string().max(255).optional(),
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
    return null;
  }
  if (key.startsWith("http")) {
    return key;
  }
  return await signS3Key(key);
};

const formatParticipant = async (user: UserSummary) => ({
  id: user.id,
  name: formatUserName(user),
  avatar: await resolveMediaUrl(user.avatarKey),
  isProvider: user.role === "provider",
});

const formatMessage = async (message: {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  attachmentKey?: string | null;
  attachmentType?: string | null;
  attachmentName?: string | null;
  createdAt: Date;
  readAt: Date | null;
}, viewerId: string) => ({
  id: message.id,
  conversationId: message.threadId,
  senderId: message.senderId === viewerId ? "current-user" : message.senderId,
  content: message.body,
  attachmentUrl: message.attachmentKey ? await resolveMediaUrl(message.attachmentKey) : null,
  attachmentType: message.attachmentType ?? null,
  attachmentName: message.attachmentName ?? null,
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
        orderId: thread.orderId ?? null,
        lastMessage: lastMessage ? await formatMessage(lastMessage, userId) : null,
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

// GET /api/messages/threads/:id — Get single thread detail
messagesRouter.get(
  "/threads/:id",
  authRequired,
  asyncHandler(async (req, res) => {
    const { id } = threadIdSchema.parse(req.params);
    const userId = req.user!.id;

    const thread = await prisma.thread.findUnique({
      where: { id },
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

    if (!thread || (thread.buyerId !== userId && thread.providerId !== userId)) {
      return res.status(404).json({ error: "Thread not found." });
    }

    const participants = await Promise.all([
      formatParticipantForViewer(thread.buyer, userId),
      formatParticipantForViewer(thread.provider, userId),
    ]);

    res.json({
      thread: {
        id: thread.id,
        participants,
        serviceId: thread.serviceId ?? thread.service?.id ?? null,
        serviceTitle: thread.service?.title ?? null,
        orderId: thread.orderId ?? null,
      },
    });
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

    if (await isBlocked(userId, data.providerId)) {
      return res.status(403).json({ error: "You cannot message this user." });
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
        orderId: thread.orderId ?? null,
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
        orderId: thread.orderId ?? null,
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
      messages: await Promise.all(messages.map((message) => formatMessage(message, userId))),
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

    const otherUserId = thread.buyerId === userId ? thread.providerId : thread.buyerId;
    if (await isBlocked(userId, otherUserId)) {
      return res.status(403).json({ error: "You cannot send messages to this user." });
    }

    // Validate attachment key belongs to sender's uploads
    if (data.attachmentKey && !data.attachmentKey.startsWith(`chat/${userId}/`)) {
      return res.status(400).json({ error: "Invalid attachment." });
    }

    const message = await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: userId,
        body: data.content.trim(),
        attachmentKey: data.attachmentKey ?? null,
        attachmentType: data.attachmentType ?? null,
        attachmentName: data.attachmentName ?? null,
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

    res.status(201).json({ message: await formatMessage(message, userId) });
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

/* ── Chat attachment uploads ── */

const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CHAT_FILE_BYTES = 15 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
]);

const chatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHAT_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!SUPPORTED_IMAGE_TYPES.has(file.mimetype?.toLowerCase())) {
      cb(new Error("Only JPG, PNG, or WebP images are supported."));
      return;
    }
    cb(null, true);
  },
});

const chatFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHAT_FILE_BYTES },
});

const handleChatImageUpload = (req: any, res: any, next: any) => {
  chatImageUpload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Image must be 10MB or less." });
    }
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    res.status(400).json({ error: "Unable to upload image." });
  });
};

const handleChatFileUpload = (req: any, res: any, next: any) => {
  chatFileUpload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File must be 15MB or less." });
    }
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    res.status(400).json({ error: "Unable to upload file." });
  });
};

const convertToWebp = async (buffer: Buffer) => {
  const qualitySteps = [82, 72, 60, 50, 40];
  const pipeline = sharp(buffer)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true });
  for (const quality of qualitySteps) {
    const output = await pipeline.clone().webp({ quality }).toBuffer();
    if (output.length <= 3 * 1024 * 1024) return output;
  }
  throw new Error("Image is too large after compression.");
};

messagesRouter.post(
  "/chat-image",
  authRequired,
  handleChatImageUpload,
  asyncHandler(async (req, res) => {
    if (!isS3Configured()) {
      return res.status(500).json({ error: "S3 is not configured." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Image file is required." });
    }
    const webpBuffer = await convertToWebp(req.file.buffer);
    const key = `chat/${req.user!.id}/${Date.now()}-${randomUUID()}.webp`;
    await uploadToS3({ key, body: webpBuffer, contentType: "image/webp" });
    const signedUrl = await signS3Key(key);
    res.json({ key, signedUrl });
  }),
);

messagesRouter.post(
  "/chat-file",
  authRequired,
  handleChatFileUpload,
  asyncHandler(async (req, res) => {
    if (!isS3Configured()) {
      return res.status(500).json({ error: "S3 is not configured." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "File is required." });
    }
    const ALLOWED_FILE_EXTENSIONS = new Set([
      "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
      "txt", "csv", "rtf", "odt", "ods",
      "jpg", "jpeg", "png", "gif", "webp", "heic",
      "mp4", "mov", "mp3", "wav", "m4a",
      "zip", "rar", "7z",
    ]);
    const ext = (req.file.originalname?.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: "File type not allowed." });
    }
    const key = `chat/${req.user!.id}/${Date.now()}-${randomUUID()}.${ext}`;
    await uploadToS3({ key, body: req.file.buffer, contentType: req.file.mimetype });
    const signedUrl = await signS3Key(key);
    res.json({ key, signedUrl, name: req.file.originalname });
  }),
);
