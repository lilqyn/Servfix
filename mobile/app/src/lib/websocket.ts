import { API_BASE_URL } from "../config/env";
import { getSessionTokens } from "./api";

type MessageHandler = (msg: Record<string, unknown>) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;
const listeners = new Set<MessageHandler>();

function getWsUrl(): string {
  const token = getSessionTokens()?.accessToken;
  const base = API_BASE_URL.replace(/^http/, "ws");
  return `${base}/ws${token ? `?token=${token}` : ""}`;
}

function scheduleReconnect() {
  if (reconnectTimer || intentionalClose) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

export function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const token = getSessionTokens()?.accessToken;
  if (!token) return;

  intentionalClose = false;

  try {
    ws = new WebSocket(getWsUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    // connected
  };

  ws.onmessage = (event) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    for (const handler of listeners) {
      try {
        handler(msg);
      } catch {
        // ignore handler errors
      }
    }
  };

  ws.onerror = () => {
    // will trigger onclose
  };

  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };
}

export function disconnect() {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function send(payload: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function subscribe(handler: MessageHandler): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}
