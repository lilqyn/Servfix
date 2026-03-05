import { env } from "../config.js";
import { logError } from "./logger.js";

type AlertPayload = Record<string, unknown>;

const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const lastAlertAtByEvent = new Map<string, number>();

const shouldSendAlert = (event: string) => {
  const now = Date.now();
  const last = lastAlertAtByEvent.get(event) ?? 0;
  if (now - last < ALERT_COOLDOWN_MS) {
    return false;
  }
  lastAlertAtByEvent.set(event, now);
  return true;
};

export const sendOpsAlert = async (event: string, payload: AlertPayload = {}) => {
  const webhookUrl = env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl || !shouldSendAlert(event)) {
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        service: "servfix-api",
        ts: new Date().toISOString(),
        ...payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`Alert webhook responded ${response.status}`);
    }
  } catch (error) {
    logError("ops_alert_failed", {
      event,
      message: error instanceof Error ? error.message : "Unknown alert error",
    });
  }
};
