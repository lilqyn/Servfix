export type UserRole = "buyer" | "provider" | "admin" | "super_admin" | "staff";

export type AuthUser = {
  id: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  location?: string | null;
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

export type ServiceTier = {
  id: string;
  name: "basic" | "standard" | "premium";
  price: string;
  currency: "GHS" | "USD" | "EUR";
  deliveryDays: number;
  revisionCount: number;
  pricingType?: "flat" | "per_unit";
  unitLabel?: string | null;
  pricingModel?: "fixed" | "negotiable" | "market";
  priceMax?: string | null;
  priceNote?: string | null;
};

export type ServiceMedia = {
  id: string;
  url: string;
  signedUrl?: string | null;
  type: string;
  sortOrder: number;
};

export type Service = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status?: "draft" | "published" | "paused" | "archived";
  locationCity?: string | null;
  locationAreas?: string[];
  isRemote?: boolean;
  createdAt: string;
  updatedAt: string;
  tiers: ServiceTier[];
  media: ServiceMedia[];
  coverMedia?: ServiceMedia | null;
  provider: {
    id: string;
    username?: string | null;
    avatarUrl?: string | null;
    providerProfile?: {
      displayName?: string | null;
      location?: string | null;
      ratingAvg?: number | string | null;
      ratingCount?: number | null;
      verificationStatus?: "unverified" | "pending" | "verified" | "rejected";
    } | null;
  };
};

export type OrderStatus =
  | "created"
  | "payment_pending"
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

export type OrderUser = {
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

export type OrderPaymentIntent = {
  id: string;
  provider: CheckoutProvider | "other";
  providerRef?: string | null;
  status: "created" | "pending" | "succeeded" | "failed" | "cancelled";
  events?: Array<{
    providerEventId: string;
  }>;
};

export type OrderPaymentStage = "deposit" | "balance";
export type OrderPaymentStatus = "pending" | "paid" | "cancelled" | "refunded";

export type OrderPayment = {
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

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  attachmentUrl?: string | null;
  attachmentType?: "image" | "file" | null;
  attachmentName?: string | null;
  timestamp: string;
  read: boolean;
};

export type Conversation = {
  id: string;
  orderId?: string | null;
  participants?: {
    id: string;
    name: string;
    avatar: string;
    isProvider: boolean;
  }[];
};

export type NotificationActor = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
};

export type AppNotificationData = {
  orderId?: string;
  serviceId?: string;
  threadId?: string;
  [key: string]: unknown;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: AppNotificationData | null;
  isRead: boolean;
  createdAt: string;
  actor: NotificationActor | null;
};

export type Order = {
  id: string;
  status: OrderStatus;
  quantity?: number;
  amountGross: string;
  platformFee: string;
  taxAmount: string;
  amountNetProvider: string;
  amountPaidNet?: string;
  amountReleasedNet?: string;
  depositPercent?: number | null;
  paymentIntentId?: string | null;
  paymentIntent?: OrderPaymentIntent | null;
  currency: "GHS" | "USD" | "EUR";
  service: {
    id: string;
    title: string;
    locationCity?: string | null;
  };
  tier?: ServiceTier | null;
  buyer?: OrderUser | null;
  provider?: OrderUser | null;
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
export type CheckoutReturnTo = "web" | "mobile";

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
  orders?: Order[];
  purpose?: "orders" | "boost" | "subscription" | "invoice" | "order_payment";
};

export type PaymentReturnParams = {
  provider?: string;
  purpose?: string;
  return_to?: string;
  status?: string;
  payment?: string;
  payment_intent_id?: string;
  transaction_id?: string;
  tx_ref?: string;
  session_id?: string;
  reference?: string;
  trxref?: string;
  token?: string;
  order_id?: string;
  "order-id"?: string;
};

export type PublicSettings = {
  payments: {
    enabledProviders: CheckoutProvider[];
    defaultProvider: CheckoutProvider;
  };
};

export type Review = {
  id: string;
  rating: number;
  comment: string;
  images?: string[];
  createdAt: string;
  formattedDate?: string;
  author: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
};

export type ThreadParticipant = {
  id: string;
  name: string;
  avatar: string;
  isProvider: boolean;
};

export type ThreadLastMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  read: boolean;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  attachmentName?: string | null;
};

export type Thread = {
  id: string;
  orderId?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  lastMessage?: ThreadLastMessage | null;
  unreadCount: number;
  createdAt?: string | null;
  participants: ThreadParticipant[];
};

export type ProviderPublicProfile = {
  id: string;
  username?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  role: string;
  providerProfile?: {
    displayName?: string | null;
    bio?: string | null;
    location?: string | null;
    categories?: string[] | null;
    verificationStatus?: "unverified" | "pending" | "verified" | "rejected";
    ratingAvg?: number | string | null;
    ratingCount?: number | null;
  } | null;
  services?: Service[];
};

export type PayoutRequest = {
  id: string;
  amount: string;
  currency: string;
  status: "requested" | "processing" | "paid" | "failed" | "cancelled";
  destinationMomo: string;
  momoNetwork: string | null;
  reference: string | null;
  createdAt: string;
  orderId: string | null;
};

export type WalletData = {
  earnings: {
    payable: string;
    pending_release: string;
    reserved_for_disbursement: string;
    currency: string;
  };
  disbursement_requests: PayoutRequest[];
};

export type ServiceCreateInput = {
  title: string;
  description: string;
  category: string;
  tags: string[];
  status?: "draft" | "published";
  images?: string[];
  location?: {
    city?: string;
    areas?: string[];
    isRemote?: boolean;
  };
  availability?: {
    days: string[];
    startTime: string;
    endTime: string;
    advanceBooking: number;
    maxBookingsPerDay: number;
  };
  tiers: Array<{
    name: "basic" | "standard" | "premium";
    price: number;
    currency?: "GHS" | "USD" | "EUR";
    deliveryDays: number;
    revisionCount?: number;
    pricingType?: "flat" | "per_unit";
    unitLabel?: string;
    pricingModel?: "fixed" | "negotiable" | "market";
    priceMax?: number;
    priceNote?: string;
    description?: string;
    features?: string[];
  }>;
};

// ─── Community ────────────────────────────────────────────────────────────────

export type CommunityAuthor = {
  id: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  providerProfile?: {
    displayName?: string | null;
  } | null;
};

export type CommunityMedia = {
  id: string;
  url: string;
  signedUrl?: string | null;
  type: "image" | "video";
  sortOrder: number;
};

export type CommunityPost = {
  id: string;
  content: string;
  shareCount: number;
  mediaLayout: "grid" | "carousel";
  createdAt: string;
  updatedAt: string;
  author: CommunityAuthor;
  media: CommunityMedia[];
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

export type CommunityComment = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: CommunityAuthor;
};

// ─── Boosts ──────────────────────────────────────────────────────────────────

export type BoostType = "featured" | "feed_boost" | "category_top";
export type BoostStatus = "scheduled" | "active" | "ended" | "cancelled";

export type BoostOption = {
  type: BoostType;
  label: string;
  description: string;
  price: string;
  currency: string;
  durationDays: number;
};

export type BoostPurchase = {
  id: string;
  serviceId?: string | null;
  type: BoostType;
  status: BoostStatus;
  startsAt: string;
  endsAt: string;
  price: string;
  currency: string;
  createdAt: string;
  service?: { id: string; title: string } | null;
};

// ─── Subscriptions ───────────────────────────────────────────────────────────

export type SubscriptionStatus = "active" | "past_due" | "cancelled" | "expired";

export type SubscriptionPlan = {
  id: string;
  name: string;
  monthlyPrice: string;
  currency: string;
  benefits: Record<string, unknown> | string[];
  isActive: boolean;
};

export type ProviderSubscription = {
  id: string;
  status: SubscriptionStatus;
  renewsAt?: string | null;
  endsAt?: string | null;
  plan: SubscriptionPlan;
};

// ─── Quotes ──────────────────────────────────────────────────────────────────

export type QuoteStatus = "sent" | "accepted" | "rejected" | "cancelled" | "expired";

export type Quote = {
  id: string;
  threadId: string;
  serviceId: string;
  tierId?: string | null;
  providerId: string;
  buyerId: string;
  status: QuoteStatus;
  amount: string;
  currency: string;
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
  service?: { id: string; title: string } | null;
  provider?: { id: string; username?: string | null; providerProfile?: { displayName?: string | null } | null } | null;
};

// ─── Support ─────────────────────────────────────────────────────────────────

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";

export type SupportTicketMessage = {
  id: string;
  body: string;
  senderId?: string;
  senderRole: string;
  createdAt: string;
};

export type SupportTicketMeeting = {
  id: string;
  scheduledAt: string;
  durationMinutes?: number | null;
  meetingUrl?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  ticketNumber: number | string;
  subject: string;
  category?: string | null;
  status: SupportTicketStatus;
  department: string;
  priority: SupportTicketPriority;
  assignedRole?: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessage?: SupportTicketMessage | null;
  messages?: SupportTicketMessage[];
  meetings?: SupportTicketMeeting[];
};

// ─── Reports ─────────────────────────────────────────────────────────────────

export type ReportTargetType = "user" | "service" | "community_post" | "community_comment" | "review" | "order";

// ─── Calls ──────────────────────────────────────────────────────────────────

export type CallType = "audio" | "video";
export type CallStatus = "ringing" | "answered" | "ended" | "missed" | "rejected";

export type Call = {
  id: string;
  callerId: string;
  calleeId: string;
  threadId?: string | null;
  callType: CallType;
  status: CallStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  duration?: number | null;
  createdAt: string;
};
