export type UserRole = "buyer" | "provider" | "admin" | "super_admin" | "staff";

export type AuthUser = {
  id: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
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
