import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "./auth/jwt.js";
import { getAccessTokenFromHeaders } from "./auth/session.js";
import { prisma } from "./db.js";
import { listPushTokens } from "./utils/push-tokens.js";

type AuthedSocket = WebSocket & { userId?: string; isAlive?: boolean };

const connections = new Map<string, Set<AuthedSocket>>();

const getTokenFromRequest = (req: { url?: string | null; headers?: Record<string, string | string[] | undefined> }) => {
  const rawUrl = req.url ?? "";
  const url = new URL(rawUrl, "http://localhost");
  const queryToken = url.searchParams.get("token");
  if (queryToken) {
    return queryToken;
  }

  const headerToken = getAccessTokenFromHeaders(req.headers ?? {});
  return headerToken;
};

export const initWebsocket = (server: Server) => {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: AuthedSocket, req) => {
    const token = getTokenFromRequest(req);
    if (!token) {
      ws.close(1008, "Unauthorized");
      return;
    }

    let payload: { sub: string };
    try {
      payload = verifyToken(token);
    } catch {
      ws.close(1008, "Unauthorized");
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true },
    });

    if (!user || user.status !== "active") {
      ws.close(1008, "Unauthorized");
      return;
    }

    ws.userId = user.id;
    ws.isAlive = true;

    const userConnections = connections.get(user.id) ?? new Set<AuthedSocket>();
    userConnections.add(ws);
    connections.set(user.id, userConnections);

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const type = msg.type as string | undefined;
      if (!type) {
        return;
      }

      const CALL_SIGNAL_TYPES = [
        "call:offer",
        "call:answer",
        "call:ice-candidate",
        "call:hangup",
        "call:reject",
        "call:busy",
      ] as const;

      if (!CALL_SIGNAL_TYPES.includes(type as (typeof CALL_SIGNAL_TYPES)[number])) {
        return;
      }

      const targetUserId = msg.targetUserId as string | undefined;
      if (!targetUserId) {
        return;
      }

      // Build the forwarded payload — replace targetUserId with authenticated sender id
      const forwarded = { ...msg, from: user.id };
      delete (forwarded as Record<string, unknown>).targetUserId;

      const delivered = pushToUser(targetUserId, forwarded);

      // For call:offer, if the target has no active WS connections, send a push notification
      if (type === "call:offer" && !delivered) {
        void sendCallPushNotification(user.id, targetUserId, msg.callId as string | undefined);
      }
    });

    ws.on("close", () => {
      const active = connections.get(user.id);
      if (!active) {
        return;
      }
      active.delete(ws);
      if (active.size === 0) {
        connections.delete(user.id);
      }
    });
  });

  const interval = setInterval(() => {
    for (const userSockets of connections.values()) {
      for (const socket of userSockets) {
        if (!socket.isAlive) {
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  return wss;
};

export const pushToUser = (userId: string, payload: unknown): boolean => {
  const sockets = connections.get(userId);
  if (!sockets || sockets.size === 0) {
    return false;
  }
  const message = JSON.stringify(payload);
  let sent = false;
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
      sent = true;
    }
  }
  return sent;
};

export const isUserOnline = (userId: string): boolean => {
  const sockets = connections.get(userId);
  if (!sockets) {
    return false;
  }
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
};

const sendCallPushNotification = async (callerId: string, calleeId: string, callId?: string) => {
  try {
    const tokens = await listPushTokens(calleeId);
    if (tokens.length === 0) {
      return;
    }

    const caller = await prisma.user.findUnique({
      where: { id: callerId },
      select: {
        username: true,
        email: true,
        phone: true,
        providerProfile: { select: { displayName: true } },
      },
    });

    let callerName = "Someone";
    if (caller) {
      if (caller.providerProfile?.displayName) {
        callerName = caller.providerProfile.displayName;
      } else if (caller.username) {
        callerName = `@${caller.username}`;
      } else if (caller.email) {
        callerName = caller.email;
      } else if (caller.phone) {
        callerName = caller.phone;
      }
    }

    const payload = {
      to: tokens.map((t) => t.token),
      sound: "default",
      title: "Incoming call",
      body: `${callerName} is calling you`,
      data: {
        type: "call_incoming",
        callId: callId ?? null,
        callerId,
      },
      priority: "high",
    };

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("Failed to send call push notification", error);
  }
};
