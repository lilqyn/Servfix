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

type ApiFetchOptions = RequestInit & {
  skipAuthRefresh?: boolean;
  _retried?: boolean;
};

const CSRF_COOKIE_NAME = "servfix_csrf";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const readCookie = (name: string) => {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  const found = document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(prefix));

  if (!found) {
    return null;
  }

  try {
    return decodeURIComponent(found.slice(prefix.length));
  } catch {
    return found.slice(prefix.length);
  }
};

const shouldAttemptAuthRefresh = (path: string) => {
  const authPaths = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/google",
    "/api/auth/phone",
    "/api/auth/staff-invite",
    "/api/auth/admin-mfa/verify",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/password-reset",
  ];
  return !authPaths.some((authPath) => path.startsWith(authPath));
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
  options: ApiFetchOptions = {},
): Promise<T> {
  const { skipAuthRefresh = false, _retried = false, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  headers.set("Accept", "application/json");
  const method = (requestOptions.method ?? "GET").toUpperCase();

  const isFormData =
    typeof FormData !== "undefined" && requestOptions.body instanceof FormData;

  if (requestOptions.body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (MUTATING_METHODS.has(method) && !headers.has("x-csrf-token")) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers.set("x-csrf-token", csrfToken);
    }
  }

  const hasStoredUser =
    typeof window !== "undefined" &&
    Boolean(localStorage.getItem("servfix-user") ?? localStorage.getItem("serveghana-user"));

  if (!hasStoredUser) {
    const guestId = getGuestId();
    if (guestId) {
      headers.set("x-guest-id", guestId);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    method,
    headers,
    credentials: "include",
  });

  if (
    response.status === 401 &&
    !_retried &&
    !skipAuthRefresh &&
    shouldAttemptAuthRefresh(path)
  ) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    const refreshResponse = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      credentials: "include",
    });

    if (refreshResponse.ok) {
      return apiFetch<T>(path, {
        ...requestOptions,
        _retried: true,
        skipAuthRefresh,
      });
    }
  }

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
  pricingModel?: "fixed" | "negotiable" | "market";
  priceMax?: string | null;
  priceNote?: string | null;
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
  providerPlan?: {
    tier: "free" | "pro" | "business";
    badgeLabel?: string | null;
    rankingWeight?: number;
    planId?: string;
    planName?: string;
  };
  boosts?: {
    types: BoostType[];
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
  | "delivery_submitted"
  | "delivered"
  | "release_approved"
  | "approved"
  | "released"
  | "disbursed"
  | "cancelled"
  | "expired"
  | "dispute_open"
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
  amountPaid?: string;
  amountPaidNet?: string;
  amountReleasedNet?: string;
  amountDisbursedNet?: string;
  depositPercent?: number | null;
  depositAmount?: string | null;
  balanceAmount?: string | null;
  quoteId?: string | null;
  deliverySubmittedAt?: string | null;
  reviewDeadlineAt?: string | null;
  disputeOpenedAt?: string | null;
  disbursedAt?: string | null;
  currency: "GHS" | "USD" | "EUR";
  service: {
    id: string;
    title: string;
    locationCity?: string | null;
  };
  tier?: ApiServiceTier | null;
  buyer?: ApiOrderUser | null;
  provider?: ApiOrderUser | null;
  createdAt: string;
  updatedAt: string;
};

export type CheckoutProvider =
  | "flutterwave"
  | "stripe"
  | "paystack"
  | "hubtel"
  | "expresspay";
export type CheckoutMethod = "card" | "mobile_money";

export type BoostType = "featured" | "feed_boost" | "category_top";

export type BoostOption = {
  type: BoostType;
  label: string;
  description: string;
  price: number;
  currency: "GHS" | "USD" | "EUR";
  durationHours: number;
};

export type ProviderBoost = {
  id: string;
  type: BoostType;
  status: "scheduled" | "active" | "ended" | "cancelled";
  startsAt: string;
  endsAt: string;
  price: string;
  currency: "GHS" | "USD" | "EUR";
  metadata?: Record<string, unknown> | null;
  service?: { id: string; title: string; category: string } | null;
};

export type PlanTier = "free" | "pro" | "business";

export type PlanBenefits = {
  tier: PlanTier;
  badgeLabel?: string | null;
  rankingWeight?: number;
  payoutMinAmount?: number;
  payoutFeeBps?: number;
  features?: string[];
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  monthlyPrice: string;
  currency: "GHS" | "USD" | "EUR";
  benefits: PlanBenefits;
  isActive: boolean;
};

export type ProviderSubscription = {
  id: string;
  status: "active" | "past_due" | "cancelled" | "expired";
  renewsAt?: string | null;
  endsAt?: string | null;
  plan: SubscriptionPlan;
};

export type BusinessAccountMembership = {
  role: "owner" | "admin" | "member";
  status: "active" | "invited" | "removed";
};

export type BusinessAccount = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  industry?: string | null;
  size?: string | null;
  notes?: string | null;
  memberCount?: number;
  jobCount?: number;
  membership?: BusinessAccountMembership | null;
  createdAt?: string;
  updatedAt?: string;
  members?: BusinessMember[];
  jobs?: BusinessJob[];
};

export type BusinessMember = {
  id: string;
  role: "owner" | "admin" | "member";
  status: "active" | "invited" | "removed";
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
    role: UserRole;
  };
};

export type BusinessJob = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget?: string | null;
  currency: "GHS" | "USD" | "EUR";
  status: "open" | "assigned" | "closed" | "cancelled";
  assignedProviderId?: string | null;
  orderId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type BusinessInvoice = {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  total: string;
  currency: "GHS" | "USD" | "EUR";
  status: "draft" | "issued" | "paid" | "void";
  issuedAt?: string | null;
  paidAt?: string | null;
  orderCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type PaymentCheckoutResponse = {
  checkoutUrl: string;
  paymentIntentId: string;
  provider: CheckoutProvider;
  orderIds?: string[];
  orderId?: string;
  orderPaymentId?: string;
};

export type PaymentVerifyResponse = {
  status: "success" | "failed";
  paymentIntentId?: string;
  orders?: ApiOrder[];
  purpose?: "orders" | "boost" | "subscription" | "invoice";
  boost?: ProviderBoost | null;
  subscription?: ProviderSubscription | null;
  invoice?: BusinessInvoice | null;
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
  mediaLayout: "grid" | "carousel";
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
  orderId?: string | null;
  lastMessage?: ApiConversationMessage | null;
  unreadCount: number;
  createdAt: string;
};

export type QuoteStatus = "sent" | "accepted" | "rejected" | "cancelled" | "expired";

export type ApiQuote = {
  id: string;
  threadId: string;
  serviceId: string;
  tierId?: string | null;
  providerId: string;
  buyerId: string;
  status: QuoteStatus;
  amount: string;
  currency: "GHS" | "USD" | "EUR";
  quantity: number;
  depositPercent: number;
  depositAmount: string;
  balanceAmount: string;
  message?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderPaymentStage = "deposit" | "balance";
export type OrderPaymentStatus = "pending" | "paid" | "cancelled" | "refunded";

export type ApiOrderPayment = {
  id: string;
  orderId: string;
  stage: OrderPaymentStage;
  status: OrderPaymentStatus;
  amount: string;
  platformFee: string;
  taxAmount: string;
  amountNetProvider: string;
  currency: "GHS" | "USD" | "EUR";
  paymentIntentId?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderProgressReport = {
  id: string;
  orderId: string;
  providerId: string;
  title: string;
  body?: string | null;
  percentComplete: number;
  createdAt: string;
};

export type OrderReleaseRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type OrderReleaseRequest = {
  id: string;
  orderId: string;
  paymentId?: string | null;
  requestedById: string;
  approvedById?: string | null;
  amount: string;
  currency: "GHS" | "USD" | "EUR";
  status: OrderReleaseRequestStatus;
  note?: string | null;
  createdAt: string;
  decidedAt?: string | null;
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

export type StaticPageKey = "about" | "blog" | "academy" | "providerResources";

export type BlogPost = {
  title: string;
  summary?: string | null;
  body: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  publishedAt: string;
};

export type BlogPostView = BlogPost & {
  imageSignedUrl?: string | null;
};

export type StaffProfile = {
  name: string;
  role: string;
  bio?: string | null;
  photoUrl?: string | null;
};

export type StaffProfileView = StaffProfile & {
  photoSignedUrl?: string | null;
};

export type AboutFontOption =
  | "space_grotesk"
  | "plus_jakarta_sans"
  | "georgia_serif"
  | "times_serif"
  | "system_sans"
  | "mono";

export type AboutPageConfig = {
  introLabel: string;
  heroImageUrl?: string | null;
  heroImageSignedUrl?: string | null;
  missionTitle: string;
  missionBody: string;
  missionBullets: string[];
  whatWeDoTitle: string;
  whatWeDoLeft: string[];
  whatWeDoRight: string[];
  visionTitle: string;
  visionLeft: string;
  visionRight: string[];
  headingFont: AboutFontOption;
  bodyFont: AboutFontOption;
};

export type ProviderLaunchChecklistKey =
  | "profile_completed"
  | "profile_photo_uploaded"
  | "service_photos_uploaded"
  | "pricing_calculated"
  | "service_description_optimized"
  | "payment_policy_understood"
  | "cancellation_rules_reviewed"
  | "tax_record_process_started";

export type ProviderResourceBlock = {
  heading: string;
  items: string[];
};

export type ProviderResourceSection = {
  id: string;
  title: string;
  description: string;
  blocks: ProviderResourceBlock[];
};

export type ProviderLaunchChecklistItem = {
  key: ProviderLaunchChecklistKey;
  label: string;
  editable: boolean;
};

export type ProviderResourcesContent = {
  sections: ProviderResourceSection[];
  checklistItems: ProviderLaunchChecklistItem[];
  advancedResources: string[];
};

export type StaticPagePayload = {
  title: string;
  body: string;
  aboutConfig?: AboutPageConfig;
  posts?: BlogPost[];
  staff?: StaffProfile[];
  resourcesConfig?: ProviderResourcesContent;
};

export type StaticPage = Omit<StaticPagePayload, "posts" | "staff"> & {
  slug: StaticPageKey;
  posts?: BlogPostView[];
  staff?: StaffProfileView[];
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
  localization?: {
    currency: "GHS" | "USD" | "EUR";
    enabledCurrencies: Array<"GHS" | "USD" | "EUR">;
  };
  socialLinks?: SocialLink[];
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

export async function updateServiceStatus(
  serviceId: string,
  status: "draft" | "published" | "suspended",
): Promise<ApiService> {
  const response = await apiFetch<ServiceResponse>(`/api/services/${serviceId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return response.service;
}

export async function deleteService(serviceId: string): Promise<void> {
  await apiFetch(`/api/services/${serviceId}`, {
    method: "DELETE",
  });
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

export type OrderDispute = {
  id: string;
  orderId: string;
  openedById: string;
  reason: string;
  details?: string | null;
  status: "open" | "investigating" | "resolved" | "cancelled";
  resolution?: "refund" | "release" | "partial_refund" | "deny" | null;
  createdAt: string;
  resolvedAt?: string | null;
};

export async function approveOrderCompletion(orderId: string): Promise<ApiOrder> {
  const response = await apiFetch<{ order: ApiOrder }>(`/api/orders/${orderId}/approve-completion`, {
    method: "POST",
  });
  return response.order;
}

export async function openOrderDispute(
  orderId: string,
  payload: { reason: string; details?: string; evidence?: string[] },
): Promise<OrderDispute> {
  const response = await apiFetch<{ dispute: OrderDispute }>(`/api/orders/${orderId}/disputes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.dispute;
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

export type AccountDeletionRequestStatus = "pending" | "approved" | "rejected";

export type AccountDeletionRequest = {
  id: string;
  status: AccountDeletionRequestStatus;
  reason?: string | null;
  requestedAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  reviewedBy?: {
    id: string;
    email?: string | null;
    username?: string | null;
  } | null;
};

export type MyAccountDeletionResponse =
  | { status: "deleted" }
  | { status: "pending_approval"; request: AccountDeletionRequest };

export type ProviderDeletionEligibility = {
  eligible: boolean;
  activeOrders: number;
  pendingPayoutRequests: number;
  openComplianceCases: number;
  reasons: string[];
};

export type AdminAccountDeletionRequest = {
  id: string;
  status: AccountDeletionRequestStatus;
  reason?: string | null;
  requestedAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  user: {
    id: string;
    role: UserRole;
    status: "active" | "suspended" | "deleted";
    email?: string | null;
    phone?: string | null;
    username?: string | null;
    providerProfile?: { displayName?: string | null } | null;
  };
  reviewedBy?: {
    id: string;
    email?: string | null;
    username?: string | null;
  } | null;
  eligibility?: ProviderDeletionEligibility | null;
};

export type AdminStaffInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type AdminStaffInvitation = {
  id: string;
  email: string;
  role: UserRole;
  status: AdminStaffInvitationStatus;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  invitedBy: {
    id: string;
    email?: string | null;
    username?: string | null;
  };
  acceptedBy?: {
    id: string;
    email?: string | null;
    username?: string | null;
  } | null;
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

export type AdminReleaseRequest = {
  id: string;
  orderId: string;
  amount: string;
  currency: "GHS" | "USD" | "EUR";
  status: OrderReleaseRequestStatus;
  note?: string | null;
  createdAt: string;
  requestedBy: {
    id: string;
    email?: string | null;
    phone?: string | null;
    username?: string | null;
    providerProfile?: { displayName?: string | null } | null;
  };
  order?: {
    id: string;
    amountPaidNet: string;
    amountReleasedNet: string;
    currency: "GHS" | "USD" | "EUR";
    service: { id: string; title: string };
    buyer: { id: string; email?: string | null; phone?: string | null; username?: string | null };
    provider: {
      id: string;
      email?: string | null;
      phone?: string | null;
      username?: string | null;
      providerProfile?: { displayName?: string | null } | null;
    };
  } | null;
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
  reason: string;
  details?: string | null;
  status: "open" | "investigating" | "resolved" | "cancelled";
  resolution?: "refund" | "release" | "partial_refund" | "deny" | null;
  createdAt: string;
  evidence?: string[];
  order: { id: string; status: string };
  openedBy: { id: string; email?: string | null; username?: string | null };
};

export type AdminPayoutSummary = {
  provider: AdminProvider;
  totals: { released: string; pending: string };
};

export type ProviderEarningsLedger = {
  payable: string;
  pending_release: string;
  currency: "GHS" | "USD" | "EUR";
};

export type ProviderDisbursementRequest = {
  id: string;
  amount: string;
  currency: "GHS" | "USD" | "EUR";
  status: "requested" | "processing" | "paid" | "failed" | "cancelled";
  destinationMomo: string;
  momoNetwork?: "mtn" | "vodafone" | "airteltigo" | null;
  reference?: string | null;
  createdAt: string;
};

export type ProviderWallet = ProviderEarningsLedger;
export type ProviderPayoutRequest = ProviderDisbursementRequest;

export type ProviderPayoutsResponse = {
  earnings: ProviderEarningsLedger;
  disbursement_requests: ProviderDisbursementRequest[];
};

export type AdminPayoutRequest = {
  id: string;
  amount: string;
  currency: "GHS" | "USD" | "EUR";
  status: "requested" | "processing" | "paid" | "failed" | "cancelled";
  destinationMomo: string;
  momoNetwork?: "mtn" | "vodafone" | "airteltigo" | null;
  reference?: string | null;
  failureReason?: string | null;
  createdAt: string;
  provider: AdminProvider;
};

export type AdminPayoutComplianceCaseStatus =
  | "open"
  | "investigating"
  | "cleared"
  | "escalated"
  | "reported"
  | "closed";

export type AdminPayoutComplianceCaseSeverity = "low" | "medium" | "high" | "critical";
export type AdminPayoutComplianceCaseType = "aml_payout" | "sanctions_match";

export type AdminPayoutComplianceCase = {
  id: string;
  type: AdminPayoutComplianceCaseType;
  status: AdminPayoutComplianceCaseStatus;
  severity: AdminPayoutComplianceCaseSeverity;
  riskScore?: number | null;
  title: string;
  summary?: string | null;
  reasons: string[];
  metadata?: Record<string, unknown> | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  provider: AdminProvider;
  payoutRequest?: {
    id: string;
    amount: string;
    currency: "GHS" | "USD" | "EUR";
    status: "requested" | "processing" | "paid" | "failed" | "cancelled";
    createdAt: string;
    destinationMomo: string;
    momoNetwork?: "mtn" | "vodafone" | "airteltigo" | null;
  } | null;
  screening?: {
    id: string;
    status: "pending" | "clear" | "possible_match" | "confirmed_match" | "error";
    matchScore: number;
    watchlistSource?: string | null;
    screenedAt: string;
    reviewedAt?: string | null;
  } | null;
  assignedTo?: { id: string; email?: string | null; username?: string | null } | null;
  createdBy?: { id: string; email?: string | null; username?: string | null } | null;
  closedBy?: { id: string; email?: string | null; username?: string | null } | null;
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
  provider: "flutterwave" | "paystack";
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
  | "business"
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

export type PaymentIntegrationProvider =
  | "flutterwave"
  | "stripe"
  | "paystack"
  | "hubtel"
  | "expresspay";

export type SocialLinkPlatform =
  | "facebook"
  | "instagram"
  | "twitter"
  | "youtube"
  | "linkedin";

export type SocialLink = {
  platform: SocialLinkPlatform;
  url: string;
};

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
    paystackSecretKey: string;
    stripeSecretKey: string;
    hubtelClientId: string;
    hubtelClientSecret: string;
    hubtelBaseUrl: string;
    expresspayMerchantId: string;
    expresspayApiKey: string;
    expresspayBaseUrl: string;
  };
  webhooks: {
    stripeWebhookSecret: string;
    flutterwaveWebhookHash: string;
    outboundSigningKey: string;
  };
  socialLinks: SocialLink[];
};

export type LocalizationSettings = {
  currency: "GHS" | "USD" | "EUR";
  enabledCurrencies: Array<"GHS" | "USD" | "EUR">;
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
  boostCatalog: BoostOption[];
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

export async function fetchMyAccountDeletionRequest(): Promise<{
  request: AccountDeletionRequest | null;
}> {
  return apiFetch<{ request: AccountDeletionRequest | null }>("/api/users/me/account-deletion-request");
}

export async function requestMyAccountDeletion(reason?: string): Promise<MyAccountDeletionResponse> {
  const payload = reason?.trim() ? { reason: reason.trim() } : {};
  return apiFetch<MyAccountDeletionResponse>("/api/users/me", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export async function createCommunityPost(payload: {
  content?: string;
  media?: Array<string | CommunityPostMediaInput>;
  mediaLayout?: "grid" | "carousel";
}): Promise<void> {
  await apiFetch("/api/community/posts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCommunityPost(
  postId: string,
  payload: {
    content?: string;
    media?: Array<string | CommunityPostMediaInput>;
    mediaLayout?: "grid" | "carousel";
  },
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

export async function uploadDisputeImage(file: File): Promise<UploadImageResponse> {
  const form = new FormData();
  form.append("file", file);

  return apiFetch<UploadImageResponse>("/api/uploads/dispute-image", {
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

export async function uploadPageImage(file: File): Promise<UploadImageResponse> {
  const form = new FormData();
  form.append("file", file);

  return apiFetch<UploadImageResponse>("/api/uploads/page-image", {
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

export async function deleteAdminStaffUser(id: string): Promise<void> {
  await apiFetch(`/api/admin/users/${id}/delete`, {
    method: "POST",
  });
}

export async function fetchAdminStaffInvitations(params?: {
  status?: AdminStaffInvitationStatus;
  limit?: number;
}): Promise<{ invitations: AdminStaffInvitation[]; invitableRoles: UserRole[] }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/staff-invitations${query ? `?${query}` : ""}`);
}

export async function createAdminStaffInvitation(payload: {
  email: string;
  role: UserRole;
}): Promise<AdminStaffInvitation> {
  const response = await apiFetch<{ invitation: AdminStaffInvitation }>("/api/admin/staff-invitations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.invitation;
}

export async function revokeAdminStaffInvitation(id: string): Promise<AdminStaffInvitation> {
  const response = await apiFetch<{ invitation: AdminStaffInvitation }>(`/api/admin/staff-invitations/${id}/revoke`, {
    method: "PATCH",
  });
  return response.invitation;
}

export async function fetchAdminAccountDeletionRequests(params?: {
  status?: AccountDeletionRequestStatus;
  limit?: number;
}): Promise<{ requests: AdminAccountDeletionRequest[] }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/account-deletion-requests${query ? `?${query}` : ""}`);
}

export async function approveAdminAccountDeletionRequest(
  id: string,
  note?: string,
): Promise<AdminAccountDeletionRequest> {
  const response = await apiFetch<{ request: AdminAccountDeletionRequest }>(
    `/api/admin/account-deletion-requests/${id}/approve`,
    {
      method: "POST",
      body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
    },
  );
  return response.request;
}

export async function rejectAdminAccountDeletionRequest(
  id: string,
  note?: string,
): Promise<AdminAccountDeletionRequest> {
  const response = await apiFetch<{ request: AdminAccountDeletionRequest }>(
    `/api/admin/account-deletion-requests/${id}/reject`,
    {
      method: "POST",
      body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
    },
  );
  return response.request;
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

export async function fetchAdminReleaseRequests(params?: {
  status?: OrderReleaseRequestStatus;
  cursor?: string;
  limit?: number;
}): Promise<{ requests: AdminReleaseRequest[]; nextCursor?: string | null }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/orders/release-requests${query ? `?${query}` : ""}`);
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

export async function requestProviderDisbursement(amount: number): Promise<void> {
  await apiFetch("/api/payouts", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export async function requestProviderPayout(amount: number): Promise<void> {
  await requestProviderDisbursement(amount);
}

export async function fetchBoostOptions(): Promise<BoostOption[]> {
  const response = await apiFetch<{ options: BoostOption[] }>("/api/boosts/options");
  return response.options;
}

export async function fetchProviderBoosts(): Promise<ProviderBoost[]> {
  const response = await apiFetch<{ boosts: ProviderBoost[] }>("/api/boosts/mine");
  return response.boosts;
}

export async function purchaseBoost(payload: {
  serviceId: string;
  type: BoostType;
}): Promise<ProviderBoost> {
  const response = await apiFetch<{ boost: ProviderBoost }>("/api/boosts/purchase", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.boost;
}

export async function createBoostCheckout(payload: {
  serviceId: string;
  type: BoostType;
  provider: CheckoutProvider;
  method?: CheckoutMethod;
}): Promise<PaymentCheckoutResponse> {
  return apiFetch("/api/boosts/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const response = await apiFetch<{ plans: SubscriptionPlan[] }>("/api/subscriptions/plans");
  return response.plans;
}

export async function fetchMySubscription(): Promise<ProviderSubscription | null> {
  const response = await apiFetch<{ subscription: ProviderSubscription | null }>(
    "/api/subscriptions/mine",
  );
  return response.subscription ?? null;
}

export async function createSubscriptionCheckout(payload: {
  planId: string;
  provider: CheckoutProvider;
  method?: CheckoutMethod;
}): Promise<PaymentCheckoutResponse> {
  return apiFetch("/api/subscriptions/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelSubscription(): Promise<void> {
  await apiFetch("/api/subscriptions/cancel", { method: "POST" });
}

export async function fetchMyBusinessAccounts(): Promise<BusinessAccount[]> {
  const response = await apiFetch<{ accounts: BusinessAccount[] }>("/api/business/accounts/mine");
  return response.accounts;
}

export async function fetchAdminBusinessAccounts(): Promise<BusinessAccount[]> {
  const response = await apiFetch<{ accounts: BusinessAccount[] }>("/api/business/accounts");
  return response.accounts;
}

export async function createBusinessAccount(payload: {
  name: string;
  industry?: string;
  size?: string;
  notes?: string;
}): Promise<BusinessAccount> {
  const response = await apiFetch<{ account: BusinessAccount }>("/api/business/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.account;
}

export async function fetchBusinessAccount(id: string): Promise<BusinessAccount> {
  const response = await apiFetch<{ account: BusinessAccount }>(`/api/business/accounts/${id}`);
  return response.account;
}

export async function addBusinessMember(payload: {
  accountId: string;
  identifier: string;
  role?: "owner" | "admin" | "member";
}): Promise<BusinessMember> {
  const response = await apiFetch<{ member: BusinessMember }>(
    `/api/business/accounts/${payload.accountId}/members`,
    {
      method: "POST",
      body: JSON.stringify({ identifier: payload.identifier, role: payload.role }),
    },
  );
  return response.member;
}

export async function updateBusinessMember(payload: {
  accountId: string;
  memberId: string;
  role?: "owner" | "admin" | "member";
  status?: "active" | "invited" | "removed";
}): Promise<BusinessMember> {
  const response = await apiFetch<{ member: BusinessMember }>(
    `/api/business/accounts/${payload.accountId}/members/${payload.memberId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role: payload.role, status: payload.status }),
    },
  );
  return response.member;
}

export async function removeBusinessMember(payload: {
  accountId: string;
  memberId: string;
}): Promise<void> {
  await apiFetch(`/api/business/accounts/${payload.accountId}/members/${payload.memberId}`, {
    method: "DELETE",
  });
}

export async function fetchBusinessJobs(accountId: string): Promise<BusinessJob[]> {
  const response = await apiFetch<{ jobs: BusinessJob[] }>(
    `/api/business/accounts/${accountId}/jobs`,
  );
  return response.jobs;
}

export async function fetchBusinessInvoices(accountId: string): Promise<BusinessInvoice[]> {
  const response = await apiFetch<{ invoices: BusinessInvoice[] }>(
    `/api/business/accounts/${accountId}/invoices`,
  );
  return response.invoices;
}

export async function createBusinessInvoice(payload: {
  accountId: string;
  periodStart: string;
  periodEnd: string;
  status?: "draft" | "issued";
}): Promise<BusinessInvoice> {
  const response = await apiFetch<{ invoice: BusinessInvoice }>(
    `/api/business/accounts/${payload.accountId}/invoices`,
    {
      method: "POST",
      body: JSON.stringify({
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        status: payload.status,
      }),
    },
  );
  return response.invoice;
}

export async function createBusinessInvoiceCheckout(payload: {
  invoiceId: string;
  provider: CheckoutProvider;
  method?: CheckoutMethod;
}): Promise<PaymentCheckoutResponse> {
  return apiFetch(`/api/business/invoices/${payload.invoiceId}/checkout`, {
    method: "POST",
    body: JSON.stringify({ provider: payload.provider, method: payload.method }),
  });
}

export async function createBusinessJob(payload: {
  accountId: string;
  title: string;
  description: string;
  category: string;
  budget?: number;
  currency?: "GHS" | "USD" | "EUR";
}): Promise<BusinessJob> {
  const response = await apiFetch<{ job: BusinessJob }>(
    `/api/business/accounts/${payload.accountId}/jobs`,
    {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        category: payload.category,
        budget: payload.budget,
        currency: payload.currency,
      }),
    },
  );
  return response.job;
}

export async function updateBusinessJob(payload: {
  accountId: string;
  jobId: string;
  status?: "open" | "assigned" | "closed" | "cancelled";
  assignedProviderId?: string;
}): Promise<BusinessJob> {
  const response = await apiFetch<{ job: BusinessJob }>(
    `/api/business/accounts/${payload.accountId}/jobs/${payload.jobId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: payload.status,
        assignedProviderId: payload.assignedProviderId,
      }),
    },
  );
  return response.job;
}

export async function createBusinessJobOrder(payload: {
  accountId: string;
  jobId: string;
  serviceId: string;
  tierId: string;
  quantity?: number;
}): Promise<ApiOrder> {
  const response = await apiFetch<{ order: ApiOrder }>(
    `/api/business/accounts/${payload.accountId}/jobs/${payload.jobId}/order`,
    {
      method: "POST",
      body: JSON.stringify({
        serviceId: payload.serviceId,
        tierId: payload.tierId,
        quantity: payload.quantity,
      }),
    },
  );
  return response.order;
}

export async function fetchAdminPayouts(): Promise<{ payouts: AdminPayoutSummary[] }> {
  return apiFetch("/api/admin/payouts");
}

export async function fetchAdminPayoutRequests(): Promise<{ requests: AdminPayoutRequest[] }> {
  return apiFetch("/api/admin/payout-requests");
}

export async function fetchAdminPayoutComplianceCases(params?: {
  status?: AdminPayoutComplianceCaseStatus;
  severity?: AdminPayoutComplianceCaseSeverity;
  type?: AdminPayoutComplianceCaseType;
  limit?: number;
}): Promise<{ cases: AdminPayoutComplianceCase[] }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.severity) searchParams.set("severity", params.severity);
  if (params?.type) searchParams.set("type", params.type);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiFetch(`/api/admin/payout-compliance-cases${query ? `?${query}` : ""}`);
}

export async function updateAdminPayoutComplianceCase(
  id: string,
  payload: {
    status: AdminPayoutComplianceCaseStatus;
    assignedToId?: string | null;
    note?: string;
  },
): Promise<AdminPayoutComplianceCase> {
  const response = await apiFetch<{ case: AdminPayoutComplianceCase }>(
    `/api/admin/payout-compliance-cases/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  return response.case;
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
    | "boostCatalog"
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
  returnTo?: "web" | "mobile";
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

  return apiFetch(`/api/payments/verify?${query.toString()}`);
}

export async function createOrderPaymentCheckout(payload: {
  orderPaymentId: string;
  provider: CheckoutProvider;
  method?: CheckoutMethod;
  returnTo?: "web" | "mobile";
}): Promise<PaymentCheckoutResponse> {
  return apiFetch("/api/payments/order-payment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchThreadQuotes(threadId: string): Promise<ApiQuote[]> {
  const response = await apiFetch<{ quotes: ApiQuote[] }>(`/api/threads/${threadId}/quotes`);
  return response.quotes;
}

export async function createThreadQuote(
  threadId: string,
  payload: {
    serviceId?: string;
    tierId?: string;
    amount: number;
    currency?: "GHS" | "USD" | "EUR";
    quantity?: number;
    depositPercent?: number;
    message?: string;
    expiresAt?: string;
  },
): Promise<ApiQuote> {
  const response = await apiFetch<{ quote: ApiQuote }>(`/api/threads/${threadId}/quotes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.quote;
}

export async function acceptQuote(quoteId: string): Promise<{
  order: ApiOrder;
  orderPayment: ApiOrderPayment;
}> {
  return apiFetch(`/api/quotes/${quoteId}/accept`, { method: "POST" });
}

export async function rejectQuote(quoteId: string): Promise<{ quote: ApiQuote }> {
  return apiFetch(`/api/quotes/${quoteId}/reject`, { method: "POST" });
}

export async function fetchOrderProgressReports(orderId: string): Promise<OrderProgressReport[]> {
  const response = await apiFetch<{ reports: OrderProgressReport[] }>(
    `/api/orders/${orderId}/progress-reports`,
  );
  return response.reports;
}

export async function fetchOrderPayments(orderId: string): Promise<ApiOrderPayment[]> {
  const response = await apiFetch<{ payments: ApiOrderPayment[] }>(
    `/api/orders/${orderId}/payments`,
  );
  return response.payments;
}

export async function createOrderProgressReport(
  orderId: string,
  payload: { title: string; body?: string; percentComplete?: number },
): Promise<{ report: OrderProgressReport; balancePayment?: ApiOrderPayment | null }> {
  return apiFetch(`/api/orders/${orderId}/progress-reports`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchOrderReleaseRequests(orderId: string): Promise<OrderReleaseRequest[]> {
  const response = await apiFetch<{ requests: OrderReleaseRequest[] }>(
    `/api/orders/${orderId}/release-requests`,
  );
  return response.requests;
}

export async function requestOrderRelease(
  orderId: string,
  payload: { percent: number; note?: string },
): Promise<{ request: OrderReleaseRequest }> {
  return apiFetch(`/api/orders/${orderId}/release-requests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveOrderReleaseRequest(
  requestId: string,
): Promise<{ status: "approved" }> {
  return apiFetch(`/api/orders/release-requests/${requestId}/approve`, {
    method: "POST",
  });
}

export async function rejectOrderReleaseRequest(
  requestId: string,
): Promise<{ status: "rejected" }> {
  return apiFetch(`/api/orders/release-requests/${requestId}/reject`, {
    method: "POST",
  });
}
