import { env } from "../config.js";
import type { PlatformSettings } from "./platform-settings.js";

export type HubtelConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

export type HubtelPaylinkResponse = {
  responseCode?: string;
  message?: string;
  data?: {
    paylinkId?: string;
    paylinkUrl?: string;
    hubtelPreapprovalId?: string;
    transactionId?: string;
    clientReference?: string;
  };
};

type HubtelPaylinkRequest = {
  mobileNumber: string;
  amount: number;
  title: string;
  description: string;
  clientReference: string;
  callbackUrl: string;
  returnUrl: string;
  cancellationUrl?: string;
};

const trimBaseUrl = (value: string) => value.replace(/\/+$/, "");

export const resolveHubtelConfig = (settings: PlatformSettings): HubtelConfig | null => {
  const clientId =
    settings.integrations.payments.hubtelClientId || env.HUBTEL_CLIENT_ID;
  const clientSecret =
    settings.integrations.payments.hubtelClientSecret || env.HUBTEL_CLIENT_SECRET;
  const baseUrl =
    settings.integrations.payments.hubtelBaseUrl || env.HUBTEL_BASE_URL;

  if (!clientId || !clientSecret || !baseUrl) {
    return null;
  }

  return {
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    baseUrl: trimBaseUrl(baseUrl.trim()),
  };
};

export const normalizeHubtelPhone = (phone?: string | null) => {
  if (!phone) {
    return null;
  }
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (!cleaned) {
    return null;
  }
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("233") && cleaned.length >= 12) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return `+233${cleaned.slice(1)}`;
  }
  return null;
};

export const createHubtelPaylink = async (
  config: HubtelConfig,
  params: HubtelPaylinkRequest,
) => {
  const authToken = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch(
    `${config.baseUrl}/request-money/${encodeURIComponent(params.mobileNumber)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amount,
        title: params.title,
        description: params.description,
        clientReference: params.clientReference,
        callbackUrl: params.callbackUrl,
        returnUrl: params.returnUrl,
        cancellationUrl: params.cancellationUrl,
      }),
    },
  );

  const payload = (await response.json()) as HubtelPaylinkResponse;

  if (!response.ok || !payload?.data?.paylinkUrl) {
    const message =
      payload?.message ??
      "Unable to initialize Hubtel payment.";
    throw new Error(message);
  }

  return payload;
};
