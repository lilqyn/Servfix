import type { UserRole } from "@/lib/roles";
import { getGuestId } from "@/lib/guest";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD ? "" : "http://localhost:4000");

type ApiError = {
  error: string;
  issues?: unknown;
  meta?: unknown;
};

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  if (options.body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  const token =
    localStorage.getItem("servfix-token") ??
    localStorage.getItem("serveghana-token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    const guestId = getGuestId();
    if (guestId) {
      headers.set("x-guest-id", guestId);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const payload = await parseJson<ApiError>(response);
    const message = payload?.error ?? response.statusText;
    throw new Error(message);
  }

  return parseJson<T>(response);
}

export type ApiServiceTier = {
  id: string;
  name: "basic" | "standard" | "premium";
  price: string;
  currency: "GHS" | "USD" | "EUR";
  pricingType?: "flat" | "per_unit";
  unitLabel?: string | null;
  deliveryDays: number;
  revisionCount: number;
};

export type ApiServiceMedia = {
  id: string;
  url: string;
  signedUrl?: string | null;
  type: string;
  sortOrder: number;
};

export type ApiProviderProfile = {
  displayName: string;
  bio?: string | null;
  location?: string | null;
  categories: string[];
  momoNumber?: string | null;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  ratingAvg: string;
  ratingCount: number;
};

export type ApiOrderUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  role: UserRole;
  providerProfile?: {
    displayName: string;
    location?: string | null;
    ratingAvg: string;
    ratingCount: number;
    verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  } | null;
};

export type ApiService = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: "draft" | "published" | "suspended";
  locationCity?: string | null;
  locationAreas?: string[];
  isRemote?: boolean;
  availabilityDays?: string[];
  availabilityStartTime?: string | null;
  availabilityEndTime?: string | null;
  advanceBookingDays?: number | null;
  maxBookingsPerDay?: number | null;
  coverMediaId?: string | null;
  coverMedia?: ApiServiceMedia | null;
  tiers: ApiServiceTier[];
  media: ApiServiceMedia[];
  provider: {
    id: string;
    avatarUrl?: string | null;
    username?: string | null;
    providerProfile?: ApiProviderProfile | null;
  };
  _count?: {
    orders: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type ApiOrderStatus =
  | "created"
  | "paid_to_escrow"
  | "accepted"
  | "in_progress"
  | "delivered"
  | "approved"
  | "released"
  | "cancelled"
  | "expired"
  | "disputed"
  | "refund_pending"
  | "refunded"
  | "chargeback";

export type ApiOrder = {
  id: string;
  status: ApiOrderStatus;
  quantity?: number;
  amountGross: string;
  platformFee: string;
  taxAmount: string;
  amountNetProvider: string;
  currency: "GHS" | "USD" | "EUR";
  service: {
    id: string;
    title: string;
    locationCity?: string | null;
  };
  tier: ApiServiceTier;
  buyer?: ApiOrderUser | null;
  provider?: ApiOrderUser | null;
  createdAt: string;
  updatedAt: string;
};

export type CheckoutProvider = "flutterwave" | "stripe";
export type CheckoutMethod = "card" | "mobile_money";

export type PaymentCheckoutResponse = {
  checkoutUrl: string;
  paymentIntentId: string;
  provider: CheckoutProvider;
  orderIds: string[];
};

export type PaymentVerifyResponse = {
  status: "success" | "failed";
  paymentIntentId?: string;
  orders?: ApiOrder[];
};

export type ApiCommunityAuthor = {
  id: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  providerProfile?: {
    displayName?: string | null;
    location?: string | null;
    verificationStatus?: "unverified" | "pending" | "verified" | "rejected";
  } | null;
};

export type ApiCommunityMedia = {
  id: string;
  url: string;
  signedUrl?: string | null;
  type: "image" | "video";
  sortOrder: number;
};

export type CommunityPostMediaInput = {
  url: string;
  type?: "image" | "video";
};

export type ApiCommunityPost = {
  id: string;
  content: string;
  shareCount: number;
  createdAt: string;
  updatedAt: string;
  author: ApiCommunityAuthor;
  media: ApiCommunityMedia[];
  counts: {
    likes: number;
    comments: number;
    saves: number;
  };
  viewer?: {
    liked: boolean;
    saved: boolean;
    following: boolean;
  } | null;
};

export type ApiNotificationActor = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
};

export type ApiNotification = {
  id: string;
  type:
    | "message_received"
    | "order_created"
    | "order_status"
    | "review_received"
    | "review_reply"
    | "follow_received"
    | "community_post_liked"
    | "community_post_commented"
    | "community_new_post"
    | "payout_update";
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  actor?: ApiNotificationActor | null;
};

export type ProviderReview = {
  id: string;
  author: string;
  avatar: string;
  rating: number;
  date: string;
  comment: string;
  images?: string[];
  helpful: number;
  providerReply?: string | null;
  providerReplyAt?: string | null;
  providerReplyUpdatedAt?: string | null;
  service: { id: string; title: string };
};

export type ProviderReviewsResponse = {
  reviews: ProviderReview[];
  summary: {
    averageRating: number;
    totalReviews: number;
    ratingBreakdown: Record<number, number>;
  };
  nextCursor?: string | null;
};

export type ProviderReviewAnalytics = {
  nps: {
    promoters: number;
    passives: number;
    detractors: number;
    total: number;
    score: number;
  };
  trend: {
    months: Array<{
      key: string;
      label: string;
      averageRating: number;
      count: number;
    }>;
    totalReviews: number;
    averageRating: number;
    ratingBreakdown: Record<number, number>;
  };
  topServices: Array<{
    id: string;
    title: string;
    reviewCount: number;
    averageRating: number;
  }>;
};

export type ApiCommunityComment = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: ApiCommunityAuthor;
};

export type ReportTargetType =
  | "user"
  | "service"
  | "community_post"
  | "community_comment"
  | "review"
  | "order";

export type ApiUserProfile = {
  user: {
    id: string;
    role: UserRole;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    createdAt?: string;
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

export type ApiUserGalleryItem = {
  id: string;
  url: string;
  signedUrl?: string | null;
  type: "image" | "video";
  sortOrder: number;
  createdAt: string;
  postId: string;
};

export type ApiConversationMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  read: boolean;
};

export type ApiConversation = {
  id: string;
  participants: {
    id: string;
    name: string;
    avatar: string;
    isProvider: boolean;
  }[];
  serviceId?: string | null;
  serviceName?: string | null;
  lastMessage?: ApiConversationMessage | null;
  unreadCount: number;
  createdAt: string;
};

export type ApiReviewSummary = {
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: Record<number, number>;
};

export type ApiReview = {
  id: string;
  author: string;
  avatar: string;
  rating: number;
  date: string;
  comment: string;
  images?: string[];
  helpful: number;
};

export type HomeContentPayload = {
  hero: {
    badge: string;
    headline: {
      prefix: string;
      highlight: string;
      suffix: string;
    };
    subheadline: string;
    primaryCta: {
      label: string;
      href: string;
    };
    secondaryCta: {
      label: string;
      href: string;
    };
    trustIndicators: Array<{
      icon: string;
      title: string;
      subtitle: string;
    }>;
    floatingCards: {
      onlineTitle: string;
      onlineSubtitle: string;
      escrowTitle: string;
      escrowSubtitle: string;
      escrowIcon?: string;
    };
  };
  categories: {
    badge: string;
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaHref: string;
    items: Array<{
      name: string;
      description: string;
      icon: string;
      color: string;
      keywords: string[];
    }>;
  };
  howItWorks: {
    badge: string;
    title: string;
    subtitle: string;
    steps: Array<{
      number: string;
      title: string;
      description: string;
      icon: string;
      color: string;
    }>;
  };
};

export type HomeContent = HomeContentPayload & {
  updatedAt?: string;
};

export type StaticPageKey = "about" | "blog";

export type StaticPagePayload = {
  title: string;
  body: string;
};

export type StaticPage = StaticPagePayload & {
  slug: StaticPageKey;
  updatedAt?: string | null;
};

export type AdminPagesPayload = Record<StaticPageKey, StaticPagePayload>;

export type AdminPagesResponse = {
  pages: Record<StaticPageKey, StaticPage>;
};

export type PublicSettings = {
  featureFlags: FeatureFlags;
  payments?: {
    enabledProviders: PaymentIntegrationProvider[];
    defaultProvider: PaymentIntegrationProvider;
  };
  updatedAt?: string | null;
};

type ServicesResponse = {
  services: ApiService[];
};

type ServiceResponse = {
  service: ApiService;
};

type OrdersResponse = {
  orders: ApiOrder[];
};

export async function fetchHomeContent(): Promise<HomeContentPayload> {
  return apiFetch<HomeContent>("/api/home-content");
}

export async function fetchStaticPage(slug: StaticPageKey): Promise<StaticPage> {
  return apiFetch<StaticPage>(`/api/pages/${slug}`);
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  return apiFetch<PublicSettings>("/api/settings");
}

export async function fetchServices(params?: {
  status?: "draft" | "published" | "suspended";
  category?: string;
  providerId?: string;
}): Promise<ApiService[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.category) search.set("category", params.category);
  if (params?.providerId) search.set("providerId", params.providerId);

  const query = search.toString();
  const response = await apiFetch<ServicesResponse>(
    `/api/services${query ? `?${query}` : ""}`,
  );
  return response.services;
}

export async function fetchMyServices(params?: {
  status?: "draft" | "published" | "suspended";
  category?: string;
}): Promise<ApiService[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.category) search.set("category", params.category);

  const query = search.toString();
  const response = await apiFetch<ServicesResponse>(
    `/api/services/mine${query ? `?${query}` : ""}`,
  );
  return response.services;
}

export async function fetchService(id: string): Promise<ApiService> {
  const response = await apiFetch<ServiceResponse>(`/api/services/${id}`);
  return response.service;
}

export async function fetchOrders(): Promise<ApiOrder[]> {
  const response = await apiFetch<OrdersResponse>("/api/orders");
  return response.orders;
}

export async function updateOrderStatus(
  orderId: string,
  status: "accepted" | "cancelled" | "delivered",
): Promise<ApiOrder> {
  const response = await apiFetch<{ order: ApiOrder }>(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return response.order;
}

type CommunityFeedResponse = {
  posts: ApiCommunityPost[];
  nextCursor?: string | null;
};

type UserPostsResponse = {
  posts: ApiCommunityPost[];
  nextCursor?: string | null;
};

type UserGalleryResponse = {
  media: ApiUserGalleryItem[];
};

type NotificationsResponse = {
  notifications: ApiNotification[];
  nextCursor?: string | null;
  unreadCount: number;
};

export type UpdateMyProfilePayload = {
  email?: string;
  phone?: string;
  username?: string;
  displayName?: string;
  bio?: string;
  location?: string;
  categories?: string[];
  momoNumber?: string;
  momoNetwork?: "mtn" | "vodafone" | "airteltigo";
  avatarKey?: string;
  bannerKey?: string;
};

type CommunityCommentsResponse = {
  comments: ApiCommunityComment[];
};

type CommunityCommentResponse = {
  comment: ApiCommunityComment;
};

type UploadImageResponse = {
  key: string;
  signedUrl?: string | null;
};

type ConversationsResponse = {
  conversations: ApiConversation[];
};

type ConversationResponse = {
  conversation: ApiConversation;
};

type ConversationMessagesResponse = {
  messages: ApiConversationMessage[];
};

type ConversationMessageResponse = {
  message: ApiConversationMessage;
};

type ServiceReviewsResponse = {
  reviews: ApiReview[];
  summary: ApiReviewSummary;
};

type ServiceReviewResponse = {
  review: ApiReview;
  summary: ApiReviewSummary;
};

type ReportResponse = {
  report: { id: string };
};

export type AdminOverview = {
  totals: {
    users: number;
    providers: number;
    services: number;
    orders: number;
    reviews: number;
    posts: number;
    reports: number;
    disputes: number;
  };
};

export type AdminUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  role: UserRole;
  status: "active" | "suspended" | "deleted";
  createdAt: string;
  providerProfile?: { displayName?: string | null } | null;
};

export type AdminProvider = {
  id: string;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  status: "active" | "suspended" | "deleted";
  createdAt: string;
  providerProfile?: {
    displayName?: string | null;
    location?: string | null;
    categories?: string[] | null;
    momoNumber?: string | null;
    momoNetwork?: "mtn" | "vodafone" | "airteltigo" | null;
    verificationStatus?: "unverified" | "pending" | "verified" | "rejected";
    ratingAvg?: string | number | null;
    ratingCount?: number | null;
  } | null;
};

export type AdminService = {
  id: string;
  title: string;
  category: string;
  status: "draft" | "published" | "suspended";
  createdAt: string;
  provider: {
    id: string;
    username?: string | null;
    email?: string | null;
    phone?: string | null;
    providerProfile?: { displayName?: string | null } | null;
  };
};

export type AdminOrder = {
  id: string;
  status: ApiOrderStatus;
  amountGross: string;
  currency: "GHS" | "USD" | "EUR";
  createdAt: string;
  service: { id: string; title: string };
  buyer: { id: string; email?: string | null; phone?: string | null; username?: string | null };
  provider: {
    id: string;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
    providerProfile?: { displayName?: string | null } | null;
  };
};

export type AdminReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  service: { id: string; title: string };
  author: { id: string; email?: string | null; phone?: string | null; username?: string | null };
  provider: { id: string; username?: string | null };
};

export type AdminCommunityPost = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; username?: string | null; email?: string | null; phone?: string | null };
  _count: { comments: number; likes: number; saves: number };
};

export type AdminCommunityComment = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; username?: string | null; email?: string | null; phone?: string | null };
  post: { id: string; content: string };
};

export type AdminReport = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string | null;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  reporter?: { id: string; email?: string | null; phone?: string | null; username?: string | null } | null;
  resolvedBy?: { id: string; email?: string | null; username?: string | null } | null;
};

export type AdminDispute = {
  id: string;
  status: "open" | "investigating" | "resolved" | "cancelled";
  resolution?: "refund" | "release" | "partial_refund" | "deny" | null;
  createdAt: string;
  order: { id: string; status: string };
  openedBy: { id: string; email?: string | null; username?: string | null };
};

export type AdminPayoutSummary = {
  provider: AdminProvider;
  totals: { released: string; pending: string };
};

export type ProviderWallet = {
  availableBalance: string;
  pendingBalance: string;
  currency: "GHS" | "USD" | "EUR";
};

export type ProviderPayoutRequest = {
  id: string;
  amount: string;
  currency: "GHS" | "USD" | "EUR";
  status: "requested" | "processing" | "paid" | "failed" | "cancelled";
  destinationMomo: string;
  momoNetwork?: "mtn" | "vodafone" | "airteltigo" | null;
  reference?: string | null;
  createdAt: string;
};

export type ProviderPayoutsResponse = {
  wallet: ProviderWallet;
  requests: ProviderPayoutRequest[];
};

export type AdminPayoutRequest = {
  id: string;
  amount: string;
  currency: "GHS" | "USD" | "EUR";
  status: "requested" | "processing" | "paid" | "failed" | "cancelled";
  destinationMomo: string;
  momoNetwork?: "mtn" | "vodafone" | "airteltigo" | null;
  reference?: string | null;
  createdAt: string;
  provider: AdminProvider;
};

export type AdminAnalytics = {
  totals: {
    users: number;
    activeUsers: number;
    suspendedUsers: number;
    orders: number;
    posts: number;
    reviews: number;
  };
  revenue: {
    gross: string;
    netProvider: string;
    platformFee: string;
    tax: string;
  };
  localization: LocalizationSettings;
  trend: {
    months: number;
    series: Array<{
      key: string;
      label: string;
      users: number;
      orders: number;
      posts: number;
      reviews: number;
      gross: string;
      platformFee: string;
    }>;
  };
};

export const BUSINESS_FUNCTION_KEYS = [
  "human_resources",
  "finance",
  "accounting",
  "customer_service",
] as const;

export type BusinessFunctionKey = (typeof BUSINESS_FUNCTION_KEYS)[number];

export type BusinessFunctionSettings = Record<
  BusinessFunctionKey,
  { enabled: boolean; roles: UserRole[] }
>;

export type PayoutSchedule = "manual" | "daily" | "weekly" | "monthly";

export type PayoutRules = {
  minAmount: number;
  feeBps: number;
  schedule: PayoutSchedule;
  supportedMomoNetworks: Array<"mtn" | "vodafone" | "airteltigo">;
};

export type DisputePolicy = {
  autoCloseDays: number;
  allowedStatuses: Array<"open" | "investigating" | "resolved" | "cancelled">;
  allowedResolutions: Array<"refund" | "release" | "partial_refund" | "deny">;
  defaultResolution: "refund" | "release" | "partial_refund" | "deny" | null;
};

export type OrderRules = {
  autoReleaseDays: number;
  refundWindowDays: number;
  cancellationPenaltyBps: number;
};

export type ProviderVerificationRules = {
  requiredDocuments: string[];
  expiryReminderDays: number;
  autoSuspendDays: number;
};

export type ReviewModeration = {
  bannedKeywords: string[];
  autoHideReportCount: number;
};

export type CommunityModeration = {
  postLimitPerDay: number;
  commentLimitPerDay: number;
  bannedKeywords: string[];
};

export type NotificationTemplate = {
  enabled: boolean;
  title: string;
  body: string;
};

export type NotificationType =
  | "message_received"
  | "order_created"
  | "order_status"
  | "review_received"
  | "review_reply"
  | "follow_received"
  | "community_post_liked"
  | "community_post_commented"
  | "community_new_post"
  | "payout_update";

export type NotificationTemplates = Record<NotificationType, NotificationTemplate>;

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type SupportDepartment =
  | "general"
  | "customer_service"
  | "finance"
  | "accounting"
  | "operations"
  | "disputes"
  | "technical";

export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";

export type SupportTicketMessageSummary = {
  id: string;
  body: string;
  senderRole: UserRole;
  isInternal?: boolean;
  createdAt: string;
};

export type SupportTicketMessage = SupportTicketMessageSummary & {
  senderId?: string;
};

export type SupportTicketSummary = {
  id: string;
  ticketNumber: string;
  subject: string;
  category?: string | null;
  status: SupportTicketStatus;
  department: SupportDepartment;
  priority: SupportTicketPriority;
  assignedRole?: UserRole | null;
  assignedUser?: {
    id: string;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
    role?: UserRole | null;
  } | null;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt: string;
  lastMessage?: SupportTicketMessageSummary | null;
};

export type SupportTicketMeeting = {
  id: string;
  scheduledAt: string;
  durationMinutes?: number | null;
  meetingUrl?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type SupportTicketEvent = {
  id: string;
  type:
    | "created"
    | "status_changed"
    | "assigned"
    | "forwarded"
    | "note_added"
    | "meeting_scheduled"
    | "meeting_updated"
    | "meeting_cancelled";
  data?: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
  } | null;
};

export type SupportTicketDetail = SupportTicketSummary & {
  messages: SupportTicketMessage[];
  meetings?: SupportTicketMeeting[];
};

export type AdminSupportTicket = SupportTicketSummary & {
  requester: {
    id: string;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
  };
};

export type AdminSupportTicketMessage = SupportTicketMessageSummary & {
  sender: {
    id: string;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
  };
};

export type AdminSupportTicketDetail = AdminSupportTicket & {
  messages: AdminSupportTicketMessage[];
  meetings?: SupportTicketMeeting[];
  events?: SupportTicketEvent[];
};

export type AdminSupportAgent = {
  id: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
};

export type SupportTicketRoutingUpdate = {
  department?: SupportDepartment;
  priority?: SupportTicketPriority;
  assignedRole?: UserRole | null;
  assignedUserId?: string | null;
};

export type SupportTicketMeetingInput = {
  scheduledAt: string;
  durationMinutes?: number;
  meetingUrl?: string;
  notes?: string;
};

export type FeatureFlags = {
  community: boolean;
  reviews: boolean;
  promotions: boolean;
  boosts: boolean;
  subscriptions: boolean;
};

export type SecurityControls = {
  adminIpAllowlist: string[];
  adminSessionTimeoutHours: number;
  requireMfaForAdmins: boolean;
};

export type AdminPageKey =
  | "overview"
  | "users"
  | "providers"
  | "services"
  | "orders"
  | "disputes"
  | "reviews"
  | "community"
  | "reports"
  | "support"
  | "payouts"
  | "analytics"
  | "pages"
  | "home"
  | "settings";

export type AdminAccessSettings = Record<AdminPageKey, UserRole[]>;

export type EmailIntegrationProvider =
  | "disabled"
  | "smtp"
  | "sendgrid"
  | "mailgun"
  | "postmark"
  | "custom";

export type SmsIntegrationProvider =
  | "disabled"
  | "twilio"
  | "hubtel"
  | "mnotify"
  | "termii"
  | "custom";

export type PaymentIntegrationProvider = "flutterwave" | "stripe";

export type Integrations = {
  email: {
    provider: EmailIntegrationProvider;
    fromAddress: string;
    apiKey: string;
  };
  sms: {
    provider: SmsIntegrationProvider;
    senderId: string;
    apiKey: string;
  };
  payments: {
    enabledProviders: PaymentIntegrationProvider[];
    defaultProvider: PaymentIntegrationProvider;
    flutterwaveSecretKey: string;
    stripeSecretKey: string;
  };
  webhooks: {
    stripeWebhookSecret: string;
    flutterwaveWebhookHash: string;
    outboundSigningKey: string;
  };
};

export type LocalizationSettings = {
  currency: "GHS" | "USD" | "EUR";
  locale: string;
  timezone: string;
};

export type AdminSettings = {
  platformFeeBps: number;
  taxBps: number;
  mode: string;
  businessFunctions: BusinessFunctionSettings;
  payoutRules: PayoutRules;
  disputePolicy: DisputePolicy;
  orderRules: OrderRules;
  providerVerification: ProviderVerificationRules;
  reviewModeration: ReviewModeration;
  communityModeration: CommunityModeration;
  notificationTemplates: NotificationTemplates;
  featureFlags: FeatureFlags;
  securityControls: SecurityControls;
  adminAccess: AdminAccessSettings;
  integrations: Integrations;
  localization: LocalizationSettings;
  updatedAt?: string | null;
};

export type AdminNavigation = {
  businessFunctions: BusinessFunctionSettings;
  featureFlags: FeatureFlags;
  adminAccess: AdminAccessSettings;
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

export async function fetchUserProfile(userId: string): Promise<ApiUserProfile> {
  return apiFetch<ApiUserProfile>(`/api/users/${userId}/profile`);
}

export async function fetchUserPosts(
  userId: string,
  params?: { cursor?: string; limit?: number },
): Promise<UserPostsResponse> {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));

  const query = search.toString();
  return apiFetch<UserPostsResponse>(
    `/api/users/${userId}/posts${query ? `?${query}` : ""}`,
  );
}

export async function fetchUserGallery(
  userId: string,
  params?: { limit?: number },
): Promise<ApiUserGalleryItem[]> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  const response = await apiFetch<UserGalleryResponse>(
    `/api/users/${userId}/gallery${query ? `?${query}` : ""}`,
  );
  return response.media;
}

export async function fetchNotifications(params?: {
  cursor?: string;
  limit?: number;
}): Promise<NotificationsResponse> {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return apiFetch<NotificationsResponse>(
    `/api/notifications${query ? `?${query}` : ""}`,
  );
}

export async function fetchProviderReviews(params?: {
  cursor?: string;
  limit?: number;
  rating?: number;
}): Promise<ProviderReviewsResponse> {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.rating) search.set("rating", String(params.rating));
  const query = search.toString();
  return apiFetch<ProviderReviewsResponse>(
    `/api/users/me/reviews${query ? `?${query}` : ""}`,
  );
}

export async function fetchProviderReviewAnalytics(params?: {
  months?: number;
}): Promise<ProviderReviewAnalytics> {
  const search = new URLSearchParams();
  if (params?.months) search.set("months", String(params.months));
  const query = search.toString();
  return apiFetch<ProviderReviewAnalytics>(
    `/api/users/me/reviews/analytics${query ? `?${query}` : ""}`,
  );
}

export async function replyToProviderReview(reviewId: string, reply: string): Promise<void> {
  await apiFetch(`/api/users/me/reviews/${reviewId}/reply`, {
    method: "PATCH",
    body: JSON.stringify({ reply }),
  });
}

export async function markNotificationsRead(payload: {
  ids?: string[];
  all?: boolean;
}): Promise<{ unreadCount: number }> {
  return apiFetch<{ unreadCount: number }>("/api/notifications/mark-read", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMyProfile(payload: UpdateMyProfilePayload): Promise<void> {
  await apiFetch("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function createCommunityPost(payload: {
  content?: string;
  media?: Array<string | CommunityPostMediaInput>;
}): Promise<void> {
  await apiFetch("/api/community/posts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCommunityPost(
  postId: string,
  payload: { content?: string; media?: Array<string | CommunityPostMediaInput> },
): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}`, {
    method: "DELETE",
  });
}

export async function likeCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/like`, {
    method: "POST",
  });
}

export async function unlikeCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/like`, {
    method: "DELETE",
  });
}

export async function saveCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/save`, {
    method: "POST",
  });
}

export async function unsaveCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/save`, {
    method: "DELETE",
  });
}

export async function shareCommunityPost(postId: string): Promise<void> {
  await apiFetch(`/api/community/posts/${postId}/share`, {
    method: "POST",
  });
}

export async function fetchCommunityComments(postId: string): Promise<ApiCommunityComment[]> {
  const response = await apiFetch<CommunityCommentsResponse>(
    `/api/community/posts/${postId}/comments`,
  );
  return response.comments;
}

export async function createCommunityComment(postId: string, content: string): Promise<ApiCommunityComment> {
  const response = await apiFetch<CommunityCommentResponse>(
    `/api/community/posts/${postId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
  return response.comment;
}

export async function followUser(userId: string): Promise<void> {
  await apiFetch(`/api/community/follow/${userId}`, {
    method: "POST",
  });
}

export async function unfollowUser(userId: string): Promise<void> {
  await apiFetch(`/api/community/follow/${userId}`, {
    method: "DELETE",
  });
}

export async function uploadServiceImage(file: File): Promise<UploadImageResponse> {
  const form = new FormData();
  form.append("file", file);

  return apiFetch<UploadImageResponse>("/api/uploads/service-image", {
    method: "POST",
    body: form,
  });
}

export async function uploadCommunityImage(file: File): Promise<UploadImageResponse> {
  const form = new FormData();
  form.append("file", file);

  return apiFetch<UploadImageResponse>("/api/uploads/community-image", {
    method: "POST",
    body: form,
  });
}

export async function uploadCommunityVideo(file: File): Promise<UploadImageResponse> {
  const form = new FormData();
  form.append("file", file);

  return apiFetch<UploadImageResponse>("/api/uploads/community-video", {
    method: "POST",
    body: form,
  });
}

export async function uploadProfileAvatar(file: File): Promise<UploadImageResponse> {
  const form = new FormData();
  form.append("file", file);

  return apiFetch<UploadImageResponse>("/api/uploads/profile-avatar", {
    method: "POST",
    body: form,
  });
}

export async function uploadProfileBanner(file: File): Promise<UploadImageResponse> {
  const form = new FormData();
  form.append("file", file);

  return apiFetch<UploadImageResponse>("/api/uploads/profile-banner", {
    method: "POST",
    body: form,
  });
}

export async function fetchConversations(): Promise<ApiConversation[]> {
  const response = await apiFetch<ConversationsResponse>("/api/messages/threads");
  return response.conversations;
}

export async function createConversation(payload: {
  providerId: string;
  serviceId?: string;
  orderId?: string;
}): Promise<ApiConversation> {
  const response = await apiFetch<ConversationResponse>("/api/messages/threads", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.conversation;
}

export async function createOrderConversation(orderId: string): Promise<ApiConversation> {
  const response = await apiFetch<ConversationResponse>("/api/messages/threads/from-order", {
    method: "POST",
    body: JSON.stringify({ orderId }),
  });
  return response.conversation;
}

export async function fetchConversationMessages(threadId: string): Promise<ApiConversationMessage[]> {
  const response = await apiFetch<ConversationMessagesResponse>(`/api/messages/threads/${threadId}/messages`);
  return response.messages;
}

export async function sendConversationMessage(threadId: string, content: string): Promise<ApiConversationMessage> {
  const response = await apiFetch<ConversationMessageResponse>(`/api/messages/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  return response.message;
}

export async function markConversationRead(threadId: string): Promise<void> {
  await apiFetch(`/api/messages/threads/${threadId}/read`, {
    method: "POST",
  });
}

export async function fetchServiceReviews(serviceId: string): Promise<ServiceReviewsResponse> {
  return apiFetch<ServiceReviewsResponse>(`/api/services/${serviceId}/reviews`);
}

export async function createServiceReview(serviceId: string, payload: {
  rating: number;
  comment: string;
  images?: string[];
}): Promise<ServiceReviewResponse> {
  return apiFetch<ServiceReviewResponse>(`/api/services/${serviceId}/reviews`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createReport(payload: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
}): Promise<string> {
  const response = await apiFetch<ReportResponse>("/api/reports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.report.id;
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>("/api/admin/overview");
}

export async function fetchAdminUsers(params?: {
  search?: string;
  role?: UserRole;
  status?: "active" | "suspended" | "deleted";
  cursor?: string;
  limit?: number;
}): Promise<{ users: AdminUser[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.role) searchParams.set("role", params.role);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/users${query ? `?${query}` : ""}`);
}

export async function updateAdminUserStatus(id: string, status: "active" | "suspended"): Promise<void> {
  await apiFetch(`/api/admin/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateAdminUserRole(id: string, role: UserRole): Promise<void> {
  await apiFetch(`/api/admin/users/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function fetchAdminProviders(params?: {
  verificationStatus?: "unverified" | "pending" | "verified" | "rejected";
  cursor?: string;
  limit?: number;
}): Promise<{ providers: AdminProvider[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.verificationStatus) searchParams.set("verificationStatus", params.verificationStatus);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/providers${query ? `?${query}` : ""}`);
}

export async function updateAdminProviderVerification(
  id: string,
  status: "unverified" | "pending" | "verified" | "rejected",
): Promise<void> {
  await apiFetch(`/api/admin/providers/${id}/verification`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function fetchAdminServices(params?: {
  status?: "draft" | "published" | "suspended";
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ services: AdminService[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/services${query ? `?${query}` : ""}`);
}

export async function updateAdminServiceStatus(
  id: string,
  status: "draft" | "published" | "suspended",
): Promise<void> {
  await apiFetch(`/api/admin/services/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function fetchAdminOrders(params?: {
  status?: ApiOrderStatus;
  cursor?: string;
  limit?: number;
}): Promise<{ orders: AdminOrder[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/orders${query ? `?${query}` : ""}`);
}

export async function updateAdminOrderStatus(id: string, status: ApiOrderStatus, note?: string): Promise<void> {
  await apiFetch(`/api/admin/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, note }),
  });
}

export async function fetchAdminReviews(params?: {
  rating?: number;
  cursor?: string;
  limit?: number;
}): Promise<{ reviews: AdminReview[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.rating) searchParams.set("rating", String(params.rating));
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/reviews${query ? `?${query}` : ""}`);
}

export async function deleteAdminReview(id: string): Promise<void> {
  await apiFetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
}

export async function fetchAdminCommunityPosts(params?: {
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ posts: AdminCommunityPost[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/community/posts${query ? `?${query}` : ""}`);
}

export async function deleteAdminCommunityPost(id: string): Promise<void> {
  await apiFetch(`/api/admin/community/posts/${id}`, { method: "DELETE" });
}

export async function fetchAdminCommunityComments(params?: {
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ comments: AdminCommunityComment[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/community/comments${query ? `?${query}` : ""}`);
}

export async function deleteAdminCommunityComment(id: string): Promise<void> {
  await apiFetch(`/api/admin/community/comments/${id}`, { method: "DELETE" });
}

export async function fetchAdminReports(params?: {
  status?: "open" | "resolved" | "dismissed";
  cursor?: string;
  limit?: number;
}): Promise<{ reports: AdminReport[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/reports${query ? `?${query}` : ""}`);
}

export async function updateAdminReportStatus(
  id: string,
  status: "open" | "resolved" | "dismissed",
  note?: string,
): Promise<void> {
  await apiFetch(`/api/admin/reports/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, note }),
  });
}

export async function fetchAdminSupportTickets(params?: {
  status?: SupportTicketStatus;
  department?: SupportDepartment;
  priority?: SupportTicketPriority;
  assignedRole?: UserRole;
  assignedUserId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ tickets: AdminSupportTicket[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.department) searchParams.set("department", params.department);
  if (params?.priority) searchParams.set("priority", params.priority);
  if (params?.assignedRole) searchParams.set("assignedRole", params.assignedRole);
  if (params?.assignedUserId) searchParams.set("assignedUserId", params.assignedUserId);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/support/tickets${query ? `?${query}` : ""}`);
}

export async function fetchAdminSupportTicket(id: string): Promise<AdminSupportTicketDetail> {
  return apiFetch(`/api/admin/support/tickets/${id}`);
}

export async function fetchSupportAgents(): Promise<{ agents: AdminSupportAgent[] }> {
  return apiFetch("/api/admin/support/agents");
}

export async function updateAdminSupportTicketAssignment(
  id: string,
  payload: SupportTicketRoutingUpdate,
): Promise<void> {
  await apiFetch(`/api/admin/support/tickets/${id}/assignment`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminSupportTicketStatus(
  id: string,
  status: SupportTicketStatus,
): Promise<void> {
  await apiFetch(`/api/admin/support/tickets/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function addAdminSupportTicketNote(id: string, message: string): Promise<void> {
  await apiFetch(`/api/admin/support/tickets/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function addAdminSupportTicketMessage(
  id: string,
  message: string,
): Promise<void> {
  await apiFetch(`/api/admin/support/tickets/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function createAdminSupportTicketMeeting(
  id: string,
  payload: SupportTicketMeetingInput,
): Promise<void> {
  await apiFetch(`/api/admin/support/tickets/${id}/meetings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminDisputes(params?: {
  status?: "open" | "investigating" | "resolved" | "cancelled";
  cursor?: string;
  limit?: number;
}): Promise<{ disputes: AdminDispute[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/disputes${query ? `?${query}` : ""}`);
}

export async function updateAdminDisputeStatus(
  id: string,
  payload: {
    status: "open" | "investigating" | "resolved" | "cancelled";
    resolution?: "refund" | "release" | "partial_refund" | "deny";
    note?: string;
  },
): Promise<void> {
  await apiFetch(`/api/admin/disputes/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchProviderPayouts(): Promise<ProviderPayoutsResponse> {
  return apiFetch("/api/payouts");
}

export async function requestProviderPayout(amount: number): Promise<void> {
  await apiFetch("/api/payouts", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export async function fetchAdminPayouts(): Promise<{ payouts: AdminPayoutSummary[] }> {
  return apiFetch("/api/admin/payouts");
}

export async function fetchAdminPayoutRequests(): Promise<{ requests: AdminPayoutRequest[] }> {
  return apiFetch("/api/admin/payout-requests");
}

export async function approveAdminPayoutRequest(id: string): Promise<void> {
  await apiFetch(`/api/admin/payout-requests/${id}/approve`, {
    method: "POST",
  });
}

export async function denyAdminPayoutRequest(id: string): Promise<void> {
  await apiFetch(`/api/admin/payout-requests/${id}/deny`, {
    method: "POST",
  });
}

export async function fetchAdminAnalytics(params?: { months?: number }): Promise<AdminAnalytics> {
  const search = new URLSearchParams();
  if (params?.months) search.set("months", String(params.months));
  const query = search.toString();
  return apiFetch(`/api/admin/analytics${query ? `?${query}` : ""}`);
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  return apiFetch("/api/admin/settings");
}

export async function fetchAdminNavigation(): Promise<AdminNavigation> {
  return apiFetch("/api/admin/navigation");
}

export async function updateAdminSettings(
  payload: Pick<
    AdminSettings,
    | "platformFeeBps"
    | "taxBps"
    | "businessFunctions"
    | "payoutRules"
    | "disputePolicy"
    | "orderRules"
    | "providerVerification"
    | "reviewModeration"
    | "communityModeration"
    | "notificationTemplates"
    | "featureFlags"
    | "securityControls"
    | "adminAccess"
    | "integrations"
    | "localization"
  >,
): Promise<void> {
  await apiFetch("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchSupportTickets(params?: {
  cursor?: string;
  limit?: number;
}): Promise<{ tickets: SupportTicketSummary[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/support/tickets${query ? `?${query}` : ""}`);
}

export async function createSupportTicket(payload: {
  subject: string;
  category?: string;
  message: string;
}): Promise<{ ticket: SupportTicketSummary }> {
  return apiFetch("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchSupportTicket(id: string): Promise<SupportTicketDetail> {
  return apiFetch(`/api/support/tickets/${id}`);
}

export async function addSupportTicketMessage(
  id: string,
  message: string,
): Promise<void> {
  await apiFetch(`/api/support/tickets/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function fetchAdminHomeContent(): Promise<HomeContent> {
  return apiFetch("/api/admin/home-content");
}

export async function updateAdminHomeContent(payload: HomeContentPayload): Promise<void> {
  await apiFetch("/api/admin/home-content", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminPages(): Promise<AdminPagesResponse> {
  return apiFetch("/api/admin/pages");
}

export async function updateAdminPages(payload: AdminPagesPayload): Promise<void> {
  await apiFetch("/api/admin/pages", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createPaymentCheckout(input: {
  provider: CheckoutProvider;
  method?: CheckoutMethod;
  items: {
    serviceId: string;
    tierId: string;
    quantity?: number;
  }[];
}): Promise<PaymentCheckoutResponse> {
  return apiFetch("/api/payments/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyPayment(params: {
  provider: CheckoutProvider;
  transactionId?: string | null;
  txRef?: string | null;
  sessionId?: string | null;
}): Promise<PaymentVerifyResponse> {
  const query = new URLSearchParams();
  query.set("provider", params.provider);
  if (params.transactionId) {
    query.set("transaction_id", params.transactionId);
  }
  if (params.txRef) {
    query.set("tx_ref", params.txRef);
  }
  if (params.sessionId) {
    query.set("session_id", params.sessionId);
  }

  return apiFetch(`/api/payments/verify?${query.toString()}`);
}
