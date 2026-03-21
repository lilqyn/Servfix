import { API_BASE_URL } from "../config/env";
import type {
  AuthUser,
  BoostOption,
  BoostPurchase,
  Call,
  CheckoutMethod,
  CheckoutProvider,
  CheckoutReturnTo,
  CommunityComment,
  CommunityPost,
  Conversation,
  ConversationMessage,
  AppNotification,
  Order,
  OrderPayment,
  OrderProgressReport,
  PaymentCheckoutResponse,
  PaymentVerifyResponse,
  ProviderPublicProfile,
  ProviderSubscription,
  PublicSettings,
  Quote,
  ReportTargetType,
  Review,
  Service,
  ServiceCreateInput,
  SubscriptionPlan,
  SupportTicket,
  SupportTicketMessage,
  Thread,
  WalletData,
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
  attachment?: { key: string; type: "image" | "file"; name?: string },
): Promise<ConversationMessage> {
  const body: Record<string, string | undefined> = { content };
  if (attachment) {
    body.attachmentKey = attachment.key;
    body.attachmentType = attachment.type;
    body.attachmentName = attachment.name;
  }
  const response = await apiFetch<{ message: ConversationMessage }>(
    `/api/messages/threads/${threadId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  return response.message;
}

export async function uploadChatImage(uri: string): Promise<{ key: string; signedUrl: string }> {
  const name = uri.split("/").pop() ?? "photo.jpg";
  const ext = name.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
  const type = mimeMap[ext] ?? "image/jpeg";
  const form = new FormData();
  form.append("file", { uri, type, name } as unknown as Blob);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (sessionTokens?.accessToken) {
    headers["Authorization"] = `Bearer ${sessionTokens.accessToken}`;
  }
  const res = await fetch(`${API_BASE_URL}/api/messages/chat-image`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Image upload failed");
  }
  return res.json();
}

export async function uploadChatFile(uri: string, fileName: string, mimeType: string): Promise<{ key: string; signedUrl: string; name: string }> {
  const form = new FormData();
  form.append("file", { uri, type: mimeType, name: fileName } as unknown as Blob);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (sessionTokens?.accessToken) {
    headers["Authorization"] = `Bearer ${sessionTokens.accessToken}`;
  }
  const res = await fetch(`${API_BASE_URL}/api/messages/chat-file`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "File upload failed");
  }
  return res.json();
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
  imageKeys?: string[];
}): Promise<{ status: string; dispute?: unknown }> {
  const response = await apiFetch<{ status: string; dispute?: unknown }>(
    `/api/orders/${input.orderId}/disputes`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: input.reason.trim(),
        details: input.details?.trim(),
        ...(input.imageKeys && input.imageKeys.length > 0 ? { imageKeys: input.imageKeys } : {}),
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
  const idempotencyKey = `ck_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return apiFetch<PaymentCheckoutResponse>("/api/payments/checkout", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function createOrderPaymentCheckout(input: {
  orderPaymentId: string;
  provider: CheckoutProvider;
  method?: CheckoutMethod;
  returnTo?: CheckoutReturnTo;
}): Promise<PaymentCheckoutResponse> {
  const idempotencyKey = `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return apiFetch<PaymentCheckoutResponse>("/api/payments/order-payment", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
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

// ─── Password reset ───────────────────────────────────────────────────────────

export async function requestPasswordReset(input: { email?: string; phone?: string }): Promise<void> {
  await apiFetch("/api/auth/password-reset", {
    method: "POST",
    body: JSON.stringify(input),
    skipAuthRefresh: true,
  });
}

export async function resetPassword(input: { token: string; password: string }): Promise<void> {
  await apiFetch("/api/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify(input),
    skipAuthRefresh: true,
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function updateProfile(input: {
  displayName?: string;
  bio?: string;
  location?: string;
  username?: string;
  email?: string;
  phone?: string;
  momoNumber?: string;
  momoNetwork?: "mtn" | "vodafone" | "airteltigo";
  categories?: string[];
  avatarKey?: string | null;
  bannerKey?: string | null;
}): Promise<AuthUser> {
  const response = await apiFetch<{ user: AuthUser }>("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return response.user;
}

// ─── Profile media uploads ──────────────────────────────────────────────────

export async function uploadProfileAvatar(uri: string): Promise<{ key: string; signedUrl: string }> {
  const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const form = new FormData();
  form.append("file", { uri, type: `image/${ext === "jpg" ? "jpeg" : ext}`, name: `avatar.${ext}` } as unknown as Blob);
  const response = await fetch(`${API_BASE_URL}/api/uploads/profile-avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionTokens?.accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error("Failed to upload avatar");
  return response.json();
}

export async function uploadProfileBanner(uri: string): Promise<{ key: string; signedUrl: string }> {
  const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const form = new FormData();
  form.append("file", { uri, type: `image/${ext === "jpg" ? "jpeg" : ext}`, name: `banner.${ext}` } as unknown as Blob);
  const response = await fetch(`${API_BASE_URL}/api/uploads/profile-banner`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionTokens?.accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error("Failed to upload banner");
  return response.json();
}

// ─── Account deletion ───────────────────────────────────────────────────────

export async function fetchMyAccountDeletionRequest(): Promise<{ request: { id: string; status: string; createdAt: string } | null }> {
  return apiFetch("/api/users/me/account-deletion-request");
}

export async function requestMyAccountDeletion(reason?: string): Promise<{ status: string }> {
  return apiFetch("/api/users/me", {
    method: "DELETE",
    body: JSON.stringify(reason?.trim() ? { reason: reason.trim() } : {}),
  });
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await apiFetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchPublicUserProfile(userId: string): Promise<ProviderPublicProfile> {
  const response = await apiFetch<{ user: ProviderPublicProfile }>(`/api/users/${userId}`);
  return response.user;
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export async function fetchServiceReviews(serviceId: string): Promise<Review[]> {
  const response = await apiFetch<{ reviews: Review[] }>(`/api/services/${serviceId}/reviews`);
  return response.reviews;
}

export async function submitServiceReview(
  serviceId: string,
  input: { rating: number; comment: string },
): Promise<Review> {
  const response = await apiFetch<{ review: Review }>(`/api/services/${serviceId}/reviews`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.review;
}

// ─── Messaging (threads) ─────────────────────────────────────────────────────

export async function fetchThreads(): Promise<Thread[]> {
  const response = await apiFetch<{ conversations: Thread[] }>("/api/messages/threads");
  return response.conversations;
}

export async function fetchThread(threadId: string): Promise<{
  id: string;
  participants: Array<{ id: string; name: string; avatar: string; isProvider: boolean }>;
  serviceId?: string | null;
  serviceTitle?: string | null;
  orderId?: string | null;
}> {
  const response = await apiFetch<{
    thread: {
      id: string;
      participants: Array<{ id: string; name: string; avatar: string; isProvider: boolean }>;
      serviceId?: string | null;
      serviceTitle?: string | null;
      orderId?: string | null;
    };
  }>(`/api/messages/threads/${threadId}`);
  return response.thread;
}

export async function createThread(input: {
  providerId: string;
  serviceId?: string;
  orderId?: string;
}): Promise<Thread> {
  const response = await apiFetch<{ conversation: Thread }>("/api/messages/threads", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.conversation;
}

// ─── Provider: my services ────────────────────────────────────────────────────

export async function fetchMyServices(): Promise<Service[]> {
  const response = await apiFetch<{ services: Service[] }>("/api/services/mine");
  return response.services;
}

export async function createService(input: ServiceCreateInput): Promise<Service> {
  const response = await apiFetch<{ service: Service }>("/api/services", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.service;
}

export async function updateService(serviceId: string, input: Partial<ServiceCreateInput>): Promise<Service> {
  const response = await apiFetch<{ service: Service }>(`/api/services/${serviceId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return response.service;
}

export async function updateServiceStatus(
  serviceId: string,
  status: "draft" | "published" | "suspended",
): Promise<void> {
  await apiFetch(`/api/services/${serviceId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ─── Wallet & payouts ─────────────────────────────────────────────────────────

export async function fetchWallet(): Promise<WalletData> {
  return apiFetch<WalletData>("/api/payouts");
}

export async function requestPayout(input: {
  amount?: number;
  orderId?: string;
  idempotencyKey?: string;
}): Promise<void> {
  await apiFetch("/api/payouts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── Community ────────────────────────────────────────────────────────────────

type CommunityFeedResponse = {
  posts: CommunityPost[];
  nextCursor?: string | null;
};

type CommunityCommentsResponse = {
  comments: CommunityComment[];
};

type CommunityCommentResponse = {
  comment: CommunityComment;
};

export async function fetchCommunityFeed(params?: {
  cursor?: string;
  limit?: number;
  scope?: "all" | "following";
}): Promise<CommunityFeedResponse> {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.scope) search.set("scope", params.scope);
  const query = search.toString();
  return apiFetch<CommunityFeedResponse>(
    `/api/community/feed${query ? `?${query}` : ""}`,
  );
}

export async function uploadCommunityImage(uri: string, mimeType: string): Promise<{ url: string }> {
  const formData = new FormData();
  const ext = mimeType.split("/")[1] ?? "jpg";
  formData.append("file", {
    uri,
    type: mimeType,
    name: `community_image_${Date.now()}.${ext}`,
  } as unknown as Blob);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (sessionTokens?.accessToken) {
    headers["Authorization"] = `Bearer ${sessionTokens.accessToken}`;
  }
  const response = await fetch(`${API_BASE_URL}/api/uploads/community-image`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to upload image");
  }
  return response.json() as Promise<{ url: string }>;
}

export async function uploadCommunityVideo(uri: string, mimeType: string): Promise<{ url: string }> {
  const formData = new FormData();
  const ext = mimeType.split("/")[1] ?? "mp4";
  formData.append("file", {
    uri,
    type: mimeType,
    name: `community_video_${Date.now()}.${ext}`,
  } as unknown as Blob);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (sessionTokens?.accessToken) {
    headers["Authorization"] = `Bearer ${sessionTokens.accessToken}`;
  }
  const response = await fetch(`${API_BASE_URL}/api/uploads/community-video`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to upload video");
  }
  return response.json() as Promise<{ url: string }>;
}

export async function createCommunityPost(payload: {
  content?: string;
  media?: { url: string; type: string }[];
  mediaLayout?: "grid" | "carousel";
}): Promise<void> {
  await apiFetch("/api/community/posts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}`, { method: "DELETE" });
}

export async function likeCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/like`, { method: "POST" });
}

export async function unlikeCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/like`, { method: "DELETE" });
}

export async function saveCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/save`, { method: "POST" });
}

export async function unsaveCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/save`, { method: "DELETE" });
}

export async function fetchCommunityComments(postId: string): Promise<CommunityComment[]> {
  const response = await apiFetch<CommunityCommentsResponse>(
    `/api/community/posts/${postId}/comments`,
  );
  return response.comments;
}

export async function createCommunityComment(
  postId: string,
  content: string,
): Promise<CommunityComment> {
  const response = await apiFetch<CommunityCommentResponse>(
    `/api/community/posts/${postId}/comments`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
  return response.comment;
}

// ─── Provider public services ─────────────────────────────────────────────────

export async function fetchProviderServices(providerId: string): Promise<Service[]> {
  const response = await apiFetch<{ services: Service[] }>(
    `/api/services?providerId=${encodeURIComponent(providerId)}`,
  );
  return response.services;
}

// ─── Boosts ──────────────────────────────────────────────────────────────────

export async function fetchBoostOptions(): Promise<BoostOption[]> {
  const response = await apiFetch<{ options: BoostOption[] }>("/api/boosts/options");
  return response.options;
}

export async function fetchMyBoosts(): Promise<BoostPurchase[]> {
  const response = await apiFetch<{ boosts: BoostPurchase[] }>("/api/boosts/mine");
  return response.boosts;
}

export async function createBoostCheckout(input: {
  serviceId: string;
  type: string;
  provider: CheckoutProvider;
  method?: CheckoutMethod;
}): Promise<{ checkoutUrl: string; paymentIntentId: string; provider: string }> {
  return apiFetch("/api/boosts/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function purchaseBoostWithWallet(input: {
  serviceId: string;
  type: string;
}): Promise<{ boost: BoostPurchase }> {
  return apiFetch("/api/boosts/purchase", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const response = await apiFetch<{ plans: SubscriptionPlan[] }>("/api/subscriptions/plans");
  return response.plans;
}

export async function fetchMySubscription(): Promise<ProviderSubscription | null> {
  const response = await apiFetch<{ subscription: ProviderSubscription | null }>("/api/subscriptions/mine");
  return response.subscription;
}

export async function createSubscriptionCheckout(input: {
  planId: string;
  provider: CheckoutProvider;
  method?: CheckoutMethod;
}): Promise<{ checkoutUrl: string; paymentIntentId: string; provider: string }> {
  return apiFetch("/api/subscriptions/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cancelSubscription(): Promise<void> {
  await apiFetch("/api/subscriptions/cancel", { method: "POST" });
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

export async function fetchThreadQuotes(threadId: string): Promise<Quote[]> {
  const response = await apiFetch<{ quotes: Quote[] }>(`/api/quotes/threads/${threadId}/quotes`);
  return response.quotes;
}

export async function createQuote(
  threadId: string,
  input: {
    serviceId?: string;
    tierId?: string;
    amount: number;
    currency?: string;
    quantity?: number;
    depositPercent?: number;
    message?: string;
    expiresAt?: string;
  },
): Promise<Quote> {
  const response = await apiFetch<{ quote: Quote }>(`/api/quotes/threads/${threadId}/quotes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.quote;
}

export async function acceptQuote(quoteId: string): Promise<{ order: Order; orderPayment: unknown }> {
  return apiFetch(`/api/quotes/${quoteId}/accept`, { method: "POST" });
}

export async function rejectQuote(quoteId: string): Promise<Quote> {
  const response = await apiFetch<{ quote: Quote }>(`/api/quotes/${quoteId}/reject`, {
    method: "POST",
  });
  return response.quote;
}

// ─── Support ─────────────────────────────────────────────────────────────────

export async function fetchSupportTickets(params?: {
  cursor?: string;
  limit?: number;
}): Promise<{ tickets: SupportTicket[]; nextCursor: string | null }> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch(`/api/support/tickets${qs ? `?${qs}` : ""}`);
}

export async function createSupportTicket(input: {
  subject: string;
  category?: string;
  message: string;
}): Promise<SupportTicket> {
  const response = await apiFetch<{ ticket: SupportTicket }>("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.ticket;
}

export async function fetchSupportTicket(ticketId: string): Promise<SupportTicket> {
  return apiFetch(`/api/support/tickets/${ticketId}`);
}

export async function sendSupportMessage(
  ticketId: string,
  message: string,
): Promise<{ message: SupportTicketMessage; status: string }> {
  return apiFetch(`/api/support/tickets/${ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
}): Promise<{ report: { id: string } }> {
  return apiFetch("/api/reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ── Pages (blog, academy, legal, etc.) ──────────────────────────────
export type StaticPageContent = {
  title?: string;
  intro?: string;
  heroImage?: string;
  heroImageSignedUrl?: string;
  body?: string;
  posts?: Array<{
    title: string;
    body: string;
    image?: string;
    imageSignedUrl?: string;
    videoUrl?: string;
    publishedAt?: string;
  }>;
  sections?: Array<{
    heading: string;
    body: string;
    items?: string[];
  }>;
  checklist?: string[];
};

export async function fetchPage(slug: string): Promise<StaticPageContent> {
  return apiFetch(`/api/pages/${slug}`);
}

// ─── Service management ─────────────────────────────────────────────────────

export async function deleteService(serviceId: string): Promise<void> {
  await apiFetch(`/api/services/${serviceId}`, { method: "DELETE" });
}

export async function uploadServiceImage(uri: string): Promise<{ key: string; signedUrl: string }> {
  const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const form = new FormData();
  form.append("file", { uri, type: `image/${ext === "jpg" ? "jpeg" : ext}`, name: `service.${ext}` } as unknown as Blob);
  const response = await fetch(`${API_BASE_URL}/api/uploads/service-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionTokens?.accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error("Failed to upload service image");
  return response.json();
}

// ─── Order release requests ─────────────────────────────────────────────────

export type OrderReleaseRequest = {
  id: string;
  orderId: string;
  requestedById: string;
  status: "pending" | "approved" | "rejected";
  amount: string;
  currency: string;
  note?: string | null;
  createdAt: string;
};

export async function fetchOrderReleaseRequests(orderId: string): Promise<OrderReleaseRequest[]> {
  const response = await apiFetch<{ requests: OrderReleaseRequest[] }>(
    `/api/orders/${orderId}/release-requests`,
  );
  return response.requests;
}

export async function approveOrderReleaseRequest(requestId: string): Promise<void> {
  await apiFetch(`/api/orders/release-requests/${requestId}/approve`, { method: "POST" });
}

export async function rejectOrderReleaseRequest(requestId: string): Promise<void> {
  await apiFetch(`/api/orders/release-requests/${requestId}/reject`, { method: "POST" });
}

// ─── Dispute images ─────────────────────────────────────────────────────────

export async function uploadDisputeImage(uri: string): Promise<{ key: string; signedUrl: string }> {
  const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const form = new FormData();
  form.append("file", { uri, type: `image/${ext === "jpg" ? "jpeg" : ext}`, name: `dispute.${ext}` } as unknown as Blob);
  const response = await fetch(`${API_BASE_URL}/api/uploads/dispute-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionTokens?.accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error("Failed to upload dispute image");
  return response.json();
}

// ─── Provider reviews ───────────────────────────────────────────────────────

export type ProviderReview = {
  id: string;
  rating: number;
  comment: string;
  reply?: string | null;
  createdAt: string;
  reviewer: {
    id: string;
    username: string | null;
    avatarUrl: string | null;
  };
  service: {
    id: string;
    title: string;
  };
};

export type ProviderReviewAnalytics = {
  averageRating: number;
  totalCount: number;
  breakdown: Record<string, number>;
};

export async function fetchProviderReviews(params?: {
  cursor?: string;
  limit?: number;
  rating?: number;
}): Promise<{ reviews: ProviderReview[]; nextCursor?: string }> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.rating) query.set("rating", String(params.rating));
  const qs = query.toString();
  return apiFetch(`/api/users/me/reviews${qs ? `?${qs}` : ""}`);
}

export async function fetchProviderReviewAnalytics(params?: {
  months?: number;
}): Promise<ProviderReviewAnalytics> {
  const query = params?.months ? `?months=${params.months}` : "";
  return apiFetch(`/api/users/me/reviews/analytics${query}`);
}

export async function replyToProviderReview(reviewId: string, reply: string): Promise<void> {
  await apiFetch(`/api/users/me/reviews/${reviewId}/reply`, {
    method: "PATCH",
    body: JSON.stringify({ reply }),
  });
}

// ─── Community social ───────────────────────────────────────────────────────

export async function followUser(userId: string): Promise<void> {
  await apiFetch(`/api/community/follow/${userId}`, { method: "POST" });
}

export async function unfollowUser(userId: string): Promise<void> {
  await apiFetch(`/api/community/follow/${userId}`, { method: "DELETE" });
}

export async function shareCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/share`, { method: "POST" });
}

export async function updateCommunityPost(
  postId: string,
  payload: { content?: string; media?: Array<string | { url: string; type: string }>; mediaLayout?: "grid" | "carousel" },
): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// ─── User full profile (with stats & viewer) ────────────────────────────────

export type UserFullProfile = {
  user: {
    id: string;
    role: string;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    createdAt?: string;
    location?: string | null;
    providerProfile?: {
      displayName?: string | null;
      bio?: string | null;
      location?: string | null;
      categories?: string[] | null;
      verificationStatus?: "unverified" | "pending" | "verified" | "rejected";
      ratingAvg?: number | string | null;
      ratingCount?: number | null;
    } | null;
  };
  stats: {
    followers: number;
    following: number;
    posts: number;
    services: number;
  };
  viewer?: {
    following: boolean;
    isSelf: boolean;
  } | null;
};

export async function fetchUserFullProfile(userId: string): Promise<UserFullProfile> {
  return apiFetch<UserFullProfile>(`/api/users/${userId}/profile`);
}

// ─── User profile content ───────────────────────────────────────────────────

export type UserPost = {
  id: string;
  content: string;
  media: Array<{ url: string; type: string; signedUrl?: string }>;
  likeCount: number;
  commentCount: number;
  createdAt: string;
};

export type UserGalleryItem = {
  url: string;
  signedUrl?: string;
  type: string;
  postId?: string;
};

export async function fetchUserPosts(
  userId: string,
  params?: { cursor?: string; limit?: number },
): Promise<{ posts: UserPost[]; nextCursor?: string }> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch(`/api/users/${userId}/posts${qs ? `?${qs}` : ""}`);
}

export async function fetchUserGallery(
  userId: string,
  params?: { cursor?: string; limit?: number },
): Promise<{ media: UserGalleryItem[]; nextCursor?: string }> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch(`/api/users/${userId}/gallery${qs ? `?${qs}` : ""}`);
}

// ─── Home content ───────────────────────────────────────────────────────────

export async function fetchHomeContent(): Promise<{
  heroTitle?: string;
  heroSubtitle?: string;
  categories?: Array<{ label: string; emoji: string }>;
  featured?: Service[];
}> {
  return apiFetch("/api/home-content");
}

// ── Business accounts ───────────────────────────────────────────────
export type BusinessAccount = {
  id: string;
  name: string;
  industry: string;
  size: string;
  status: string;
  memberCount: number;
  jobCount: number;
  createdAt: string;
};

export type BusinessInvoice = {
  id: string;
  businessId: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
  createdAt: string;
};

export async function fetchBusinessAccounts(): Promise<BusinessAccount[]> {
  return apiFetch("/api/business");
}

export async function createBusinessAccount(input: {
  name: string;
  industry: string;
  size: string;
  notes?: string;
}): Promise<BusinessAccount> {
  return apiFetch("/api/business", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function addBusinessMember(businessId: string, input: {
  identifier: string;
  role?: string;
}): Promise<void> {
  await apiFetch(`/api/business/${businessId}/members`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchBusinessInvoices(businessId: string): Promise<BusinessInvoice[]> {
  return apiFetch(`/api/business/${businessId}/invoices`);
}

export async function createBusinessJob(businessId: string, input: {
  title: string;
  category: string;
  budget: number;
  description: string;
}): Promise<void> {
  await apiFetch(`/api/business/${businessId}/jobs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type BusinessAccountDetail = {
  id: string;
  name: string;
  industry: string;
  size: string;
  status: string;
  memberCount: number;
  jobCount: number;
  createdAt: string;
  members: Array<{
    id: string;
    role: string;
    status: string;
    user: { id: string; email?: string | null; username?: string | null; avatarUrl?: string | null };
  }>;
  jobs: Array<{
    id: string;
    title: string;
    category: string;
    description: string;
    budget: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
};

export async function fetchBusinessAccount(id: string): Promise<BusinessAccountDetail> {
  return apiFetch(`/api/business/${id}`);
}

export async function createBusinessInvoiceCheckout(input: {
  invoiceId: string;
  provider: CheckoutProvider;
  method?: CheckoutMethod;
}): Promise<{ checkoutUrl: string; paymentIntentId: string; provider: string }> {
  return apiFetch("/api/business/invoices/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function acceptStaffInvite(token: string): Promise<void> {
  await apiFetch("/api/business/accept-invite", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// ─── Calls ──────────────────────────────────────────────────────────────────

export async function createCall(input: {
  calleeId: string;
  threadId?: string;
  callType: "audio" | "video";
}): Promise<Call> {
  const res = await apiFetch<{ call: Call }>("/api/calls", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.call;
}

export async function updateCallStatus(callId: string, status: string): Promise<Call> {
  const res = await apiFetch<{ call: Call }>(`/api/calls/${callId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return res.call;
}

export async function fetchThreadCalls(threadId: string): Promise<Call[]> {
  const res = await apiFetch<{ calls: Call[] }>(`/api/calls/thread/${threadId}`);
  return res.calls;
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  const res = await apiFetch<{ iceServers: RTCIceServer[] }>("/api/calls/ice-servers");
  return res.iceServers;
}

type RTCIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

// ─── User Blocking ──────────────────────────────────────────────────────────

export async function blockUser(userId: string, reason?: string): Promise<void> {
  await apiFetch(`/api/users/${userId}/block`, {
    method: "POST",
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

export async function unblockUser(userId: string): Promise<void> {
  await apiFetch(`/api/users/${userId}/block`, { method: "DELETE" });
}

export async function fetchBlockStatus(userId: string): Promise<{
  iBlockedThem: boolean;
  theyBlockedMe: boolean;
  isBlocked: boolean;
}> {
  return apiFetch(`/api/users/${userId}/block-status`);
}
