import { API_BASE_URL } from "../config/env";
import type {
  AuthUser,
  CheckoutMethod,
  CheckoutProvider,
  CheckoutReturnTo,
  Conversation,
  ConversationMessage,
  AppNotification,
  Order,
  OrderPayment,
  OrderProgressReport,
  PaymentCheckoutResponse,
  PaymentVerifyResponse,
  PublicSettings,
  Service,
} from "../types";
import { getIdentifierPayload } from "./auth";

type ApiError = {
  error?: string;
};

type ApiFetchOptions = RequestInit & {
  _retried?: boolean;
  skipAuthRefresh?: boolean;
};

type MobileTokenPair = {
  accessToken: string;
  refreshToken: string;
};

type MobileAuthResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
};

let sessionTokens: MobileTokenPair | null = null;
let sessionTokenListener: ((tokens: MobileTokenPair | null) => void) | null = null;
const CHECKOUT_PROVIDERS: CheckoutProvider[] = [
  "flutterwave",
  "stripe",
  "paystack",
  "hubtel",
  "expresspay",
];
const DEFAULT_CHECKOUT_PROVIDER: CheckoutProvider = "flutterwave";

export function getSessionTokens() {
  return sessionTokens;
}

export function subscribeToSessionTokens(listener: (tokens: MobileTokenPair | null) => void) {
  sessionTokenListener = listener;
  return () => {
    if (sessionTokenListener === listener) {
      sessionTokenListener = null;
    }
  };
}

export function setSessionTokens(tokens: MobileTokenPair | null) {
  sessionTokens = tokens;
  sessionTokenListener?.(tokens);
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

const shouldAttemptAuthRefresh = (path: string) => {
  const authPaths = [
    "/api/auth/mobile/login",
    "/api/auth/mobile/register",
    "/api/auth/mobile/google",
    "/api/auth/mobile/refresh",
    "/api/auth/mobile/logout",
    "/api/auth/mobile/admin-mfa/verify",
  ];
  return !authPaths.some((authPath) => path.startsWith(authPath));
};

async function refreshMobileSession(): Promise<boolean> {
  if (!sessionTokens?.refreshToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/mobile/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: sessionTokens.refreshToken }),
    });

    if (!response.ok) {
      setSessionTokens(null);
      return false;
    }

    const payload = await parseJson<MobileAuthResponse>(response);
    setSessionTokens({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
    });
    return true;
  } catch {
    setSessionTokens(null);
    return false;
  }
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    _retried = false,
    skipAuthRefresh = false,
    ...init
  } = options;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (sessionTokens?.accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${sessionTokens.accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    !_retried &&
    !skipAuthRefresh &&
    shouldAttemptAuthRefresh(path)
  ) {
    const refreshed = await refreshMobileSession();
    if (refreshed) {
      return apiFetch<T>(path, {
        ...init,
        _retried: true,
        skipAuthRefresh: true,
      });
    }
  }

  if (!response.ok) {
    const payload = await parseJson<ApiError>(response);
    throw new Error(payload.error || response.statusText || "Request failed");
  }

  return parseJson<T>(response);
}

export async function fetchServices(): Promise<Service[]> {
  const response = await apiFetch<{ services: Service[] }>("/api/services");
  return response.services;
}

export async function fetchService(serviceId: string): Promise<Service> {
  const response = await apiFetch<{ service: Service }>(`/api/services/${serviceId}`);
  return response.service;
}

export async function fetchOrders(): Promise<Order[]> {
  const response = await apiFetch<{ orders: Order[] }>("/api/orders");
  return response.orders;
}

export async function fetchOrderPayments(orderId: string): Promise<OrderPayment[]> {
  const response = await apiFetch<{ payments: OrderPayment[] }>(`/api/orders/${orderId}/payments`);
  return response.payments;
}

export async function fetchOrderProgressReports(
  orderId: string,
): Promise<OrderProgressReport[]> {
  const response = await apiFetch<{ reports: OrderProgressReport[] }>(
    `/api/orders/${orderId}/progress-reports`,
  );
  return response.reports;
}

export async function createOrderProgressReport(
  orderId: string,
  payload: { title: string; body?: string; percentComplete?: number },
): Promise<{ report: OrderProgressReport; balancePayment?: OrderPayment | null }> {
  return apiFetch<{ report: OrderProgressReport; balancePayment?: OrderPayment | null }>(
    `/api/orders/${orderId}/progress-reports`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function createOrderConversation(orderId: string): Promise<Conversation> {
  const response = await apiFetch<{ conversation: Conversation }>(
    "/api/messages/threads/from-order",
    {
      method: "POST",
      body: JSON.stringify({ orderId }),
    },
  );
  return response.conversation;
}

export async function fetchConversationMessages(threadId: string): Promise<ConversationMessage[]> {
  const response = await apiFetch<{ messages: ConversationMessage[] }>(
    `/api/messages/threads/${threadId}/messages`,
  );
  return response.messages;
}

export async function sendConversationMessage(
  threadId: string,
  content: string,
): Promise<ConversationMessage> {
  const response = await apiFetch<{ message: ConversationMessage }>(
    `/api/messages/threads/${threadId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
  return response.message;
}

export async function markConversationRead(threadId: string): Promise<void> {
  await apiFetch(`/api/messages/threads/${threadId}/read`, {
    method: "POST",
  });
}

export async function fetchNotifications(params: {
  cursor?: string;
  limit?: number;
} = {}): Promise<{
  notifications: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}> {
  const query = new URLSearchParams();
  query.set("limit", String(Math.max(1, Math.min(params.limit ?? 20, 50))));
  if (params.cursor) {
    query.set("cursor", params.cursor);
  }
  return apiFetch(`/api/notifications?${query.toString()}`);
}

export async function markNotificationsRead(input: {
  ids?: string[];
  all?: boolean;
}): Promise<{ unreadCount: number }> {
  return apiFetch("/api/notifications/mark-read", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function registerPushToken(input: {
  token: string;
  platform?: string;
  projectId?: string | null;
}): Promise<void> {
  await apiFetch("/api/notifications/push-tokens", {
    method: "POST",
    body: JSON.stringify({
      token: input.token,
      platform: input.platform ?? "unknown",
      projectId: input.projectId ?? undefined,
    }),
  });
}

export async function unregisterPushToken(input: { token: string }): Promise<void> {
  await apiFetch("/api/notifications/push-tokens", {
    method: "DELETE",
    body: JSON.stringify({ token: input.token }),
  });
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  const response = await apiFetch<Partial<PublicSettings>>("/api/settings");
  const configuredProviders = response.payments?.enabledProviders ?? [];
  const enabledProviders = configuredProviders.filter((provider) =>
    CHECKOUT_PROVIDERS.includes(provider),
  );
  const safeEnabledProviders =
    enabledProviders.length > 0 ? enabledProviders : [DEFAULT_CHECKOUT_PROVIDER];
  const requestedDefault = response.payments?.defaultProvider;
  const defaultProvider =
    requestedDefault && safeEnabledProviders.includes(requestedDefault)
      ? requestedDefault
      : safeEnabledProviders[0];

  return {
    payments: {
      enabledProviders: safeEnabledProviders,
      defaultProvider,
    },
  };
}

export async function createOrder(input: {
  serviceId: string;
  tierId: string;
  quantity?: number;
}): Promise<Order> {
  const response = await apiFetch<{ order: Order }>("/api/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.order;
}

export async function updateOrderStatus(input: {
  orderId: string;
  status: "accepted" | "cancelled" | "delivered";
}): Promise<Order> {
  const response = await apiFetch<{ order: Order }>(`/api/orders/${input.orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: input.status }),
  });
  return response.order;
}

export async function approveOrderCompletion(orderId: string): Promise<Order> {
  const response = await apiFetch<{ order: Order }>(`/api/orders/${orderId}/approve-completion`, {
    method: "POST",
  });
  return response.order;
}

export async function openOrderDispute(input: {
  orderId: string;
  reason: string;
  details?: string;
}): Promise<{ status: string; dispute?: unknown }> {
  const response = await apiFetch<{ status: string; dispute?: unknown }>(
    `/api/orders/${input.orderId}/disputes`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: input.reason.trim(),
        details: input.details?.trim(),
      }),
    },
  );
  return response;
}

export async function requestOrderRelease(input: {
  orderId: string;
  percent: number;
  note: string;
}): Promise<{ request: unknown; status?: string }> {
  const response = await apiFetch<{ request: unknown; status?: string }>(
    `/api/orders/${input.orderId}/release-requests`,
    {
      method: "POST",
      body: JSON.stringify({
        percent: input.percent,
        note: input.note.trim(),
      }),
    },
  );
  return response;
}

export async function createPaymentCheckout(input: {
  provider: CheckoutProvider;
  method?: CheckoutMethod;
  returnTo?: CheckoutReturnTo;
  items: {
    serviceId: string;
    tierId: string;
    quantity?: number;
  }[];
}): Promise<PaymentCheckoutResponse> {
  return apiFetch<PaymentCheckoutResponse>("/api/payments/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createOrderPaymentCheckout(input: {
  orderPaymentId: string;
  provider: CheckoutProvider;
  method?: CheckoutMethod;
  returnTo?: CheckoutReturnTo;
}): Promise<PaymentCheckoutResponse> {
  return apiFetch<PaymentCheckoutResponse>("/api/payments/order-payment", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyPayment(params: {
  provider: CheckoutProvider;
  paymentIntentId?: string | null;
  transactionId?: string | null;
  txRef?: string | null;
  sessionId?: string | null;
  reference?: string | null;
  token?: string | null;
  orderId?: string | null;
}): Promise<PaymentVerifyResponse> {
  const query = new URLSearchParams();
  query.set("provider", params.provider);
  if (params.paymentIntentId) {
    query.set("payment_intent_id", params.paymentIntentId);
  }
  if (params.transactionId) {
    query.set("transaction_id", params.transactionId);
  }
  if (params.txRef) {
    query.set("tx_ref", params.txRef);
  }
  if (params.sessionId) {
    query.set("session_id", params.sessionId);
  }
  if (params.reference) {
    query.set("reference", params.reference);
  }
  if (params.token) {
    query.set("token", params.token);
  }
  if (params.orderId) {
    query.set("order_id", params.orderId);
  }
  return apiFetch<PaymentVerifyResponse>(`/api/payments/verify?${query.toString()}`);
}

export async function signIn(input: {
  identifier: string;
  password: string;
}): Promise<AuthUser> {
  const response = await apiFetch<MobileAuthResponse>("/api/auth/mobile/login", {
    method: "POST",
    body: JSON.stringify({
      ...getIdentifierPayload(input.identifier),
      password: input.password,
    }),
    skipAuthRefresh: true,
  });

  setSessionTokens({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  });

  return response.user;
}

export async function signUp(input: {
  email?: string;
  phone?: string;
  username?: string;
  password: string;
  role: "buyer" | "provider";
  displayName?: string;
}): Promise<AuthUser> {
  const response = await apiFetch<MobileAuthResponse>("/api/auth/mobile/register", {
    method: "POST",
    body: JSON.stringify(input),
    skipAuthRefresh: true,
  });

  setSessionTokens({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  });

  return response.user;
}

export async function signInWithGoogle(input: {
  idToken: string;
  mode: "login" | "register";
  role?: "buyer" | "provider";
  username?: string;
  displayName?: string;
}): Promise<AuthUser> {
  const response = await apiFetch<MobileAuthResponse>("/api/auth/mobile/google", {
    method: "POST",
    body: JSON.stringify(input),
    skipAuthRefresh: true,
  });

  setSessionTokens({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  });

  return response.user;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await apiFetch<{ user: AuthUser }>("/api/auth/me");
  return response.user;
}

export async function signOut(): Promise<void> {
  const currentTokens = sessionTokens;

  try {
    await apiFetch("/api/auth/mobile/logout", {
      method: "POST",
      body: JSON.stringify({
        refreshToken: currentTokens?.refreshToken,
      }),
      skipAuthRefresh: true,
    });
  } finally {
    setSessionTokens(null);
  }
}
