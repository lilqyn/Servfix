import { env } from "../config.js";
import type { PlatformSettings } from "./platform-settings.js";

export type ExpresspayConfig = {
  merchantId: string;
  apiKey: string;
  baseUrl: string;
};

export type ExpresspayCustomer = {
  firstname: string;
  lastname: string;
  email: string;
  phonenumber?: string;
  username?: string;
  accountnumber?: string;
};

export type ExpresspaySubmitPayload = {
  status?: number | string;
  "status-text"?: string;
  token?: string;
  "order-id"?: string;
  "redirect-url"?: string;
  [key: string]: unknown;
};

export type ExpresspayQueryPayload = {
  result?: number | string;
  "result-text"?: string;
  token?: string;
  "order-id"?: string;
  amount?: number | string;
  currency?: string;
  "transaction-id"?: string;
  [key: string]: unknown;
};

const DEFAULT_BASE_URL = "https://expresspaygh.com/api";

export const resolveExpresspayConfig = (
  settings?: PlatformSettings | null,
): ExpresspayConfig | null => {
  const merchantId =
    settings?.integrations.payments.expresspayMerchantId || env.EXPRESSPAY_MERCHANT_ID;
  const apiKey =
    settings?.integrations.payments.expresspayApiKey || env.EXPRESSPAY_API_KEY;
  const baseUrl = (
    settings?.integrations.payments.expresspayBaseUrl ||
    env.EXPRESSPAY_BASE_URL ||
    DEFAULT_BASE_URL
  )
    .trim()
    .replace(/\/+$/, "");

  if (!merchantId || !apiKey || !baseUrl) {
    return null;
  }

  return {
    merchantId: merchantId.trim(),
    apiKey: apiKey.trim(),
    baseUrl,
  };
};

export const normalizeExpresspayPhone = (phone?: string | null) => {
  if (!phone) return null;
  const raw = phone.toString().trim().replace(/\s+/g, "");
  if (!raw) return null;

  if (raw.startsWith("+233") && raw.length === 13) {
    return `0${raw.slice(4)}`;
  }
  if (raw.startsWith("233") && raw.length === 12) {
    return `0${raw.slice(3)}`;
  }
  if (/^0\d{9}$/.test(raw)) {
    return raw;
  }
  if (/^\d{9}$/.test(raw)) {
    return `0${raw}`;
  }

  return null;
};

export const buildExpresspayCustomer = (user: {
  id: string;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
}): ExpresspayCustomer => {
  const fallback = user.username ?? user.email?.split("@")[0] ?? "servfix-user";
  const parts = fallback
    .toString()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstname = parts[0] ?? "Servfix";
  const lastname = parts.slice(1).join(" ") || "Customer";

  return {
    firstname,
    lastname,
    email: user.email ?? `${user.id}@servfix.local`,
    phonenumber: normalizeExpresspayPhone(user.phone) ?? undefined,
    username: user.username ?? fallback,
  };
};

export const createExpresspayCheckout = async (
  config: ExpresspayConfig,
  payload: {
    amount: string;
    currency: string;
    orderId: string;
    redirectUrl: string;
    postUrl: string;
    customer: ExpresspayCustomer;
    orderDesc?: string;
    orderImgUrl?: string;
  },
) => {
  const body = new URLSearchParams();
  body.set("merchant-id", config.merchantId);
  body.set("api-key", config.apiKey);
  body.set("amount", payload.amount);
  body.set("order-id", payload.orderId);
  body.set("currency", payload.currency);
  body.set("redirect-url", payload.redirectUrl);
  body.set("post-url", payload.postUrl);
  body.set("firstname", payload.customer.firstname);
  body.set("lastname", payload.customer.lastname);
  body.set("email", payload.customer.email);

  if (payload.customer.phonenumber) {
    body.set("phonenumber", payload.customer.phonenumber);
  }
  if (payload.customer.username) {
    body.set("username", payload.customer.username);
  }
  if (payload.customer.accountnumber) {
    body.set("accountnumber", payload.customer.accountnumber);
  }
  if (payload.orderDesc) {
    body.set("order-desc", payload.orderDesc);
  }
  if (payload.orderImgUrl) {
    body.set("order-img-url", payload.orderImgUrl);
  }

  const response = await fetch(`${config.baseUrl}/submit.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const raw = await response.text();
  let data: ExpresspaySubmitPayload;
  try {
    data = JSON.parse(raw) as ExpresspaySubmitPayload;
  } catch {
    throw new Error("Unable to parse ExpressPay response.");
  }

  const status =
    typeof data.status === "string" ? Number.parseInt(data.status, 10) : data.status;
  if (!response.ok || status !== 1 || !data.token) {
    throw new Error(data["status-text"]?.toString() ?? "Unable to initialize ExpressPay payment.");
  }

  return {
    payload: data,
    token: data.token,
    orderId: data["order-id"] ?? payload.orderId,
    checkoutUrl:
      data["redirect-url"] ?? `${config.baseUrl}/checkout.php?token=${data.token}`,
  };
};

export const queryExpresspayPayment = async (
  config: ExpresspayConfig,
  token: string,
) => {
  const body = new URLSearchParams();
  body.set("merchant-id", config.merchantId);
  body.set("api-key", config.apiKey);
  body.set("token", token);

  const response = await fetch(`${config.baseUrl}/query.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const raw = await response.text();
  let data: ExpresspayQueryPayload;
  try {
    data = JSON.parse(raw) as ExpresspayQueryPayload;
  } catch {
    throw new Error("Unable to parse ExpressPay response.");
  }

  return { ok: response.ok, payload: data };
};
