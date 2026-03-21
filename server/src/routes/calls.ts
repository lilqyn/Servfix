import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../config.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired } from "../middleware/auth.js";
import { isBlocked } from "../utils/blocks.js";

export const callsRouter = Router();

const createCallSchema = z.object({
  calleeId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  callType: z.enum(["audio", "video"]).default("audio"),
});

const updateStatusSchema = z.object({
  status: z.enum(["answered", "ended", "missed", "rejected"]),
});

const callIdSchema = z.object({
  id: z.string(),
});

const threadIdSchema = z.object({
  threadId: z.string().uuid(),
});

// POST /api/calls — Create a call record
callsRouter.post(
  "/",
  authRequired,
  asyncHandler(async (req, res) => {
    const data = createCallSchema.parse(req.body);
    const callerId = req.user!.id;

    if (callerId === data.calleeId) {
      return res.status(400).json({ error: "Cannot call yourself." });
    }

    const callee = await prisma.user.findUnique({
      where: { id: data.calleeId },
      select: { id: true, status: true },
    });

    if (!callee || callee.status !== "active") {
      return res.status(404).json({ error: "User not found." });
    }

    if (await isBlocked(callerId, data.calleeId)) {
      return res.status(403).json({ error: "You cannot call this user." });
    }

    const call = await prisma.call.create({
      data: {
        callerId,
        calleeId: data.calleeId,
        threadId: data.threadId ?? null,
        callType: data.callType,
        status: "ringing",
      },
    });

    res.status(201).json({ call });
  }),
);

// PATCH /api/calls/:id/status — Update call status
callsRouter.patch(
  "/:id/status",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = callIdSchema.parse(req.params);
    const data = updateStatusSchema.parse(req.body);
    const userId = req.user!.id;

    const call = await prisma.call.findUnique({
      where: { id: params.id },
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found." });
    }

    if (call.callerId !== userId && call.calleeId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = { status: data.status };

    if (data.status === "answered") {
      updateData.startedAt = now;
    }

    if (data.status === "ended" || data.status === "missed" || data.status === "rejected") {
      updateData.endedAt = now;
      if (call.startedAt) {
        updateData.duration = Math.round((now.getTime() - call.startedAt.getTime()) / 1000);
      }
    }

    const updated = await prisma.call.update({
      where: { id: params.id },
      data: updateData,
    });

    res.json({ call: updated });
  }),
);

// GET /api/calls/thread/:threadId — Get call history for a thread
callsRouter.get(
  "/thread/:threadId",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = threadIdSchema.parse(req.params);
    const userId = req.user!.id;

    // Verify user is a participant in this thread
    const thread = await prisma.thread.findUnique({
      where: { id: params.threadId },
      select: { buyerId: true, providerId: true },
    });

    if (!thread || (thread.buyerId !== userId && thread.providerId !== userId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const calls = await prisma.call.findMany({
      where: { threadId: params.threadId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ calls });
  }),
);

// GET /api/calls/ice-servers — Get TURN/STUN credentials for WebRTC
const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let cachedIceServers: { servers: unknown[]; expiresAt: number } | null = null;

async function fetchMeteredCredentials(apiKey: string): Promise<unknown[] | null> {
  // Try v1 API (apiKey param)
  try {
    const v1 = await fetch(
      `https://servfixgh.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
    );
    if (v1.ok) {
      const servers = await v1.json();
      if (Array.isArray(servers) && servers.length > 0) return servers;
    }
  } catch { /* try v2 */ }

  // Try v2 API (secretKey param)
  try {
    const v2 = await fetch(
      `https://servfixgh.metered.live/api/v2/turn/credentials?secretKey=${apiKey}`,
    );
    if (v2.ok) {
      const body = (await v2.json()) as { data?: unknown[] };
      if (Array.isArray(body.data) && body.data.length > 0) return body.data;
    }
  } catch { /* fall through */ }

  return null;
}

callsRouter.get(
  "/ice-servers",
  authRequired,
  asyncHandler(async (_req, res) => {
    const apiKey = env.METERED_TURN_API_KEY;

    if (!apiKey) {
      return res.json({ iceServers: STUN_SERVERS });
    }

    // Cache for 20 minutes (Metered credentials last ~24h)
    if (cachedIceServers && Date.now() < cachedIceServers.expiresAt) {
      return res.json({ iceServers: cachedIceServers.servers });
    }

    const meteredServers = await fetchMeteredCredentials(apiKey);

    if (!meteredServers) {
      return res.json({ iceServers: STUN_SERVERS });
    }

    const iceServers = [...STUN_SERVERS, ...meteredServers];

    cachedIceServers = {
      servers: iceServers,
      expiresAt: Date.now() + 20 * 60 * 1000,
    };

    res.json({ iceServers });
  }),
);
