import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "./auth/jwt.js";
import { prisma } from "./db.js";

type AuthedSocket = WebSocket & { userId?: string; isAlive?: boolean };

const connections = new Map<string, Set<AuthedSocket>>();

const getTokenFromRequest = (req: { url?: string | null }) => {
  const rawUrl = req.url ?? "";
  const url = new URL(rawUrl, "http://localhost");
  const token = url.searchParams.get("token");
  return token;
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

export const pushToUser = (userId: string, payload: unknown) => {
  const sockets = connections.get(userId);
  if (!sockets) {
    return;
  }
  const message = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  }
};
