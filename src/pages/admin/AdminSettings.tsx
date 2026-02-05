import { useEffect, useState } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "@/components/ui/use-toast";
import {
  fetchAdminSettings,
  updateAdminSettings,
  type AdminSettings,
  type BusinessFunctionKey,
  type BusinessFunctionSettings,
  type CommunityModeration,
  type DisputePolicy,
  type FeatureFlags,
  type AdminAccessSettings,
  type AdminPageKey,
  type Integrations,
  type LocalizationSettings,
  type NotificationTemplates,
  type OrderRules,
  type PayoutRules,
  type PaymentIntegrationProvider,
  type ProviderVerificationRules,
  type ReviewModeration,
  type SecurityControls,
} from "@/lib/api";
import { ADMIN_ROLES, getRoleLabel } from "@/lib/roles";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";

const BUSINESS_FUNCTIONS: Array<{
  key: BusinessFunctionKey;
  title: string;
  description: string;
}> = [
  {
    key: "human_resources",
    title: "Human resources",
    description: "Control access to staff and workforce management tools.",
  },
  {
    key: "finance",
    title: "Finance",
    description: "Manage payouts and finance operations.",
  },
  {
    key: "accounting",
    title: "Accounting",
    description: "Access financial reporting and analytics.",
  },
  {
    key: "customer_service",
    title: "Customer service",
    description: "Resolve disputes, reviews, community, and reports workflows.",
  },
];

const DEFAULT_BUSINESS_FUNCTIONS: BusinessFunctionSettings = {
  human_resources: { enabled: true, roles: [...ADMIN_ROLES] },
  finance: { enabled: true, roles: [...ADMIN_ROLES] },
  accounting: { enabled: true, roles: [...ADMIN_ROLES] },
  customer_service: { enabled: true, roles: [...ADMIN_ROLES] },
};

const MOMO_NETWORKS = [
  { value: "mtn", label: "MTN" },
  { value: "vodafone", label: "Vodafone" },
  { value: "airteltigo", label: "AirtelTigo" },
] as const;

const PAYOUT_SCHEDULES = [
  { value: "manual", label: "Manual approval" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const DISPUTE_STATUSES = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const DISPUTE_RESOLUTIONS = [
  { value: "refund", label: "Refund" },
  { value: "release", label: "Release" },
  { value: "partial_refund", label: "Partial refund" },
  { value: "deny", label: "Deny" },
] as const;

const VERIFICATION_DOCUMENTS = [
  { value: "government_id", label: "Government ID" },
  { value: "business_registration", label: "Business registration" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "professional_certification", label: "Professional certification" },
  { value: "insurance", label: "Insurance" },
] as const;

const EMAIL_PROVIDERS = [
  { value: "disabled", label: "Disabled" },
  { value: "smtp", label: "SMTP" },
  { value: "sendgrid", label: "SendGrid" },
  { value: "mailgun", label: "Mailgun" },
  { value: "postmark", label: "Postmark" },
  { value: "custom", label: "Custom" },
] as const;

const SMS_PROVIDERS = [
  { value: "disabled", label: "Disabled" },
  { value: "twilio", label: "Twilio" },
  { value: "hubtel", label: "Hubtel" },
  { value: "mnotify", label: "MNotify" },
  { value: "termii", label: "Termii" },
  { value: "custom", label: "Custom" },
] as const;

const PAYMENT_PROVIDERS: Array<{ value: PaymentIntegrationProvider; label: string }> = [
  { value: "flutterwave", label: "Flutterwave" },
  { value: "stripe", label: "Stripe" },
];

const CURRENCY_OPTIONS = [
  { value: "GHS", label: "GHS (Ghana cedi)" },
  { value: "USD", label: "USD (US dollar)" },
  { value: "EUR", label: "EUR (Euro)" },
] as const;

const NOTIFICATION_TYPES: Array<{
  key: keyof NotificationTemplates;
  label: string;
  description: string;
}> = [
  {
    key: "message_received",
    label: "Message received",
    description: "Direct messages from buyers or providers.",
  },
  {
    key: "order_created",
    label: "Order created",
    description: "New order placed or received.",
  },
  {
    key: "order_status",
    label: "Order status",
    description: "Order status changes and updates.",
  },
  {
    key: "review_received",
    label: "Review received",
    description: "New review for a service or provider.",
  },
  {
    key: "review_reply",
    label: "Review reply",
    description: "Provider reply to a review.",
  },
  {
    key: "follow_received",
    label: "Follow received",
    description: "New follower notifications.",
  },
  {
    key: "community_post_liked",
    label: "Community post liked",
    description: "Likes on community posts.",
  },
  {
    key: "community_post_commented",
    label: "Community post commented",
    description: "Comments on community posts.",
  },
  {
    key: "community_new_post",
    label: "Community new post",
    description: "New post by a followed account.",
  },
  {
    key: "payout_update",
    label: "Payout update",
    description: "Payout status changes.",
  },
] as const;

const DEFAULT_PAYOUT_RULES: PayoutRules = {
  minAmount: 0,
  feeBps: 0,
  schedule: "manual",
  supportedMomoNetworks: ["mtn", "vodafone", "airteltigo"],
};

const DEFAULT_DISPUTE_POLICY: DisputePolicy = {
  autoCloseDays: 0,
  allowedStatuses: ["open", "investigating", "resolved", "cancelled"],
  allowedResolutions: ["refund", "release", "partial_refund", "deny"],
  defaultResolution: null,
};

const DEFAULT_ORDER_RULES: OrderRules = {
  autoReleaseDays: 0,
  refundWindowDays: 0,
  cancellationPenaltyBps: 0,
};

const DEFAULT_PROVIDER_VERIFICATION: ProviderVerificationRules = {
  requiredDocuments: [],
  expiryReminderDays: 0,
  autoSuspendDays: 0,
};

const DEFAULT_REVIEW_MODERATION: ReviewModeration = {
  bannedKeywords: [],
  autoHideReportCount: 0,
};

const DEFAULT_COMMUNITY_MODERATION: CommunityModeration = {
  postLimitPerDay: 0,
  commentLimitPerDay: 0,
  bannedKeywords: [],
};

const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplates = NOTIFICATION_TYPES.reduce(
  (acc, item) => {
    acc[item.key] = { enabled: false, title: "{title}", body: "{body}" };
    return acc;
  },
  {} as NotificationTemplates,
);

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  community: true,
  reviews: true,
  promotions: false,
  boosts: false,
  subscriptions: false,
};

const DEFAULT_SECURITY_CONTROLS: SecurityControls = {
  adminIpAllowlist: [],
  adminSessionTimeoutHours: 0,
  requireMfaForAdmins: false,
};

const ADMIN_PAGE_ACCESS: Array<{
  key: AdminPageKey;
  title: string;
  description: string;
}> = [
  { key: "overview", title: "Overview", description: "Admin dashboard and key metrics." },
  { key: "users", title: "Users", description: "Manage users and admin accounts." },
  { key: "providers", title: "Providers", description: "Provider onboarding and status." },
  { key: "services", title: "Services", description: "Service catalog and approvals." },
  { key: "orders", title: "Orders", description: "Order management and fulfillment." },
  { key: "disputes", title: "Disputes", description: "Dispute cases and resolutions." },
  { key: "reviews", title: "Reviews", description: "Review moderation and replies." },
  { key: "community", title: "Community", description: "Community posts and engagement." },
  { key: "reports", title: "Reports", description: "Reported content and incidents." },
  { key: "support", title: "Support", description: "Buyer support tickets and replies." },
  { key: "payouts", title: "Payouts", description: "Payout approvals and history." },
  { key: "analytics", title: "Analytics", description: "Analytics dashboards and insights." },
  { key: "home", title: "Home content", description: "Homepage and marketing content." },
  { key: "settings", title: "Settings", description: "Platform-wide settings and controls." },
];

const DEFAULT_ADMIN_ACCESS: AdminAccessSettings = ADMIN_PAGE_ACCESS.reduce((acc, item) => {
  acc[item.key] = [...ADMIN_ROLES];
  return acc;
}, {} as AdminAccessSettings);

const DEFAULT_INTEGRATIONS: Integrations = {
  email: {
    provider: "disabled",
    fromAddress: "",
    apiKey: "",
  },
  sms: {
    provider: "disabled",
    senderId: "",
    apiKey: "",
  },
  payments: {
    enabledProviders: ["flutterwave"],
    defaultProvider: "flutterwave",
    flutterwaveSecretKey: "",
    stripeSecretKey: "",
  },
  webhooks: {
    stripeWebhookSecret: "",
    flutterwaveWebhookHash: "",
    outboundSigningKey: "",
  },
};

const DEFAULT_LOCALIZATION: LocalizationSettings = {
  currency: "GHS",
  locale: "en-GH",
  timezone: "Africa/Accra",
};

const DEFAULT_SECRET_DRAFTS = {
  emailApiKey: "",
  smsApiKey: "",
  flutterwaveSecretKey: "",
  stripeSecretKey: "",
  stripeWebhookSecret: "",
  flutterwaveWebhookHash: "",
  outboundSigningKey: "",
};

type SettingsDraft = Pick<
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
>;

const DEFAULT_SETTINGS: SettingsDraft = {
  platformFeeBps: 1000,
  taxBps: 0,
  businessFunctions: DEFAULT_BUSINESS_FUNCTIONS,
  payoutRules: DEFAULT_PAYOUT_RULES,
  disputePolicy: DEFAULT_DISPUTE_POLICY,
  orderRules: DEFAULT_ORDER_RULES,
  providerVerification: DEFAULT_PROVIDER_VERIFICATION,
  reviewModeration: DEFAULT_REVIEW_MODERATION,
  communityModeration: DEFAULT_COMMUNITY_MODERATION,
  notificationTemplates: DEFAULT_NOTIFICATION_TEMPLATES,
  featureFlags: DEFAULT_FEATURE_FLAGS,
  securityControls: DEFAULT_SECURITY_CONTROLS,
  adminAccess: DEFAULT_ADMIN_ACCESS,
  integrations: DEFAULT_INTEGRATIONS,
  localization: DEFAULT_LOCALIZATION,
};

const SETTINGS_NAV = [
  {
    group: "Commerce",
    items: [
      { slug: "platform-fees", label: "Platform fees" },
      { slug: "payout-rules", label: "Payout rules" },
      { slug: "order-rules", label: "Order rules" },
      { slug: "dispute-policy", label: "Dispute policy" },
    ],
  },
  {
    group: "Trust & Safety",
    items: [
      { slug: "provider-verification", label: "Provider verification" },
      { slug: "review-moderation", label: "Review moderation" },
      { slug: "community-moderation", label: "Community moderation" },
      { slug: "security-controls", label: "Security controls" },
    ],
  },
  {
    group: "Access",
    items: [{ slug: "admin-access", label: "Admin page access" }],
  },
  {
    group: "Engagement",
    items: [
      { slug: "notification-templates", label: "Notification templates" },
      { slug: "feature-flags", label: "Feature flags" },
    ],
  },
  {
    group: "Operations",
    items: [
      { slug: "integrations", label: "Integrations" },
      { slug: "localization", label: "Localization" },
      { slug: "business-functions", label: "Business functions" },
    ],
  },
] as const;

type AdminRole = (typeof ADMIN_ROLES)[number];

const joinList = (items: string[]) => items.join("\n");

const parseList = (value: string) =>
  value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const AdminSettings = () => {
  const { user } = useAuth();
  const { section } = useParams();
  const canUpdate = hasPermission(user?.role ?? null, "settings.update");
  const [draft, setDraft] = useState<SettingsDraft>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [secretDrafts, setSecretDrafts] = useState(DEFAULT_SECRET_DRAFTS);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: fetchAdminSettings,
  });

  useEffect(() => {
    if (data) {
      setDraft({
        platformFeeBps: data.platformFeeBps,
        taxBps: data.taxBps,
        businessFunctions: data.businessFunctions ?? DEFAULT_BUSINESS_FUNCTIONS,
        payoutRules: data.payoutRules ?? DEFAULT_PAYOUT_RULES,
        disputePolicy: data.disputePolicy ?? DEFAULT_DISPUTE_POLICY,
        orderRules: data.orderRules ?? DEFAULT_ORDER_RULES,
        providerVerification: data.providerVerification ?? DEFAULT_PROVIDER_VERIFICATION,
        reviewModeration: data.reviewModeration ?? DEFAULT_REVIEW_MODERATION,
        communityModeration: data.communityModeration ?? DEFAULT_COMMUNITY_MODERATION,
        notificationTemplates: data.notificationTemplates ?? DEFAULT_NOTIFICATION_TEMPLATES,
        featureFlags: data.featureFlags ?? DEFAULT_FEATURE_FLAGS,
        securityControls: data.securityControls ?? DEFAULT_SECURITY_CONTROLS,
        adminAccess: { ...DEFAULT_ADMIN_ACCESS, ...(data.adminAccess ?? {}) },
        integrations: data.integrations ?? DEFAULT_INTEGRATIONS,
        localization: data.localization ?? DEFAULT_LOCALIZATION,
      });
      setSecretDrafts(DEFAULT_SECRET_DRAFTS);
    }
  }, [data]);

  const updateDraft = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updatePayoutRules = (updates: Partial<PayoutRules>) => {
    setDraft((prev) => ({ ...prev, payoutRules: { ...prev.payoutRules, ...updates } }));
  };

  const updateDisputePolicy = (updates: Partial<DisputePolicy>) => {
    setDraft((prev) => ({ ...prev, disputePolicy: { ...prev.disputePolicy, ...updates } }));
  };

  const updateOrderRules = (updates: Partial<OrderRules>) => {
    setDraft((prev) => ({ ...prev, orderRules: { ...prev.orderRules, ...updates } }));
  };

  const updateProviderVerification = (updates: Partial<ProviderVerificationRules>) => {
    setDraft((prev) => ({
      ...prev,
      providerVerification: { ...prev.providerVerification, ...updates },
    }));
  };

  const updateReviewModeration = (updates: Partial<ReviewModeration>) => {
    setDraft((prev) => ({
      ...prev,
      reviewModeration: { ...prev.reviewModeration, ...updates },
    }));
  };

  const updateCommunityModeration = (updates: Partial<CommunityModeration>) => {
    setDraft((prev) => ({
      ...prev,
      communityModeration: { ...prev.communityModeration, ...updates },
    }));
  };

  const updateNotificationTemplate = (
    key: keyof NotificationTemplates,
    updates: Partial<NotificationTemplates[keyof NotificationTemplates]>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      notificationTemplates: {
        ...prev.notificationTemplates,
        [key]: { ...prev.notificationTemplates[key], ...updates },
      },
    }));
  };

  const updateFeatureFlags = (updates: Partial<FeatureFlags>) => {
    setDraft((prev) => ({
      ...prev,
      featureFlags: { ...prev.featureFlags, ...updates },
    }));
  };

  const updateSecurityControls = (updates: Partial<SecurityControls>) => {
    setDraft((prev) => ({
      ...prev,
      securityControls: { ...prev.securityControls, ...updates },
    }));
  };

  const updateAdminAccess = (pageKey: AdminPageKey, role: AdminRole, checked: boolean) => {
    if (!canUpdate) return;
    setDraft((prev) => {
      const roleSet = new Set(prev.adminAccess[pageKey] ?? []);
      if (checked) {
        roleSet.add(role);
      } else {
        roleSet.delete(role);
      }
      return {
        ...prev,
        adminAccess: {
          ...prev.adminAccess,
          [pageKey]: ADMIN_ROLES.filter((item) => roleSet.has(item)),
        },
      };
    });
  };

  const updateEmailIntegration = (updates: Partial<Integrations["email"]>) => {
    setDraft((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        email: { ...prev.integrations.email, ...updates },
      },
    }));
  };

  const updateSmsIntegration = (updates: Partial<Integrations["sms"]>) => {
    setDraft((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        sms: { ...prev.integrations.sms, ...updates },
      },
    }));
  };

  const updatePaymentIntegration = (updates: Partial<Integrations["payments"]>) => {
    setDraft((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        payments: { ...prev.integrations.payments, ...updates },
      },
    }));
  };

  const updateLocalization = (updates: Partial<LocalizationSettings>) => {
    setDraft((prev) => ({
      ...prev,
      localization: { ...prev.localization, ...updates },
    }));
  };

  const handleToggle = (key: BusinessFunctionKey, enabled: boolean) => {
    if (!canUpdate) return;
    setDraft((prev) => ({
      ...prev,
      businessFunctions: {
        ...prev.businessFunctions,
        [key]: { ...prev.businessFunctions[key], enabled },
      },
    }));
  };

  const handleRoleToggle = (key: BusinessFunctionKey, role: AdminRole, checked: boolean) => {
    if (!canUpdate) return;
    setDraft((prev) => {
      const roleSet = new Set(prev.businessFunctions[key].roles);
      if (checked) {
        roleSet.add(role);
      } else {
        roleSet.delete(role);
      }
      return {
        ...prev,
        businessFunctions: {
          ...prev.businessFunctions,
          [key]: {
            ...prev.businessFunctions[key],
            roles: ADMIN_ROLES.filter((item) => roleSet.has(item)),
          },
        },
      };
    });
  };

  const handleNetworkToggle = (network: (typeof MOMO_NETWORKS)[number]["value"], checked: boolean) => {
    if (!canUpdate) return;
    setDraft((prev) => {
      const networkSet = new Set(prev.payoutRules.supportedMomoNetworks);
      if (checked) {
        networkSet.add(network);
      } else if (networkSet.size > 1) {
        networkSet.delete(network);
      }
      return {
        ...prev,
        payoutRules: {
          ...prev.payoutRules,
          supportedMomoNetworks: Array.from(networkSet),
        },
      };
    });
  };

  const handlePaymentProviderToggle = (provider: PaymentIntegrationProvider, checked: boolean) => {
    if (!canUpdate) return;
    setDraft((prev) => {
      const providerSet = new Set(prev.integrations.payments.enabledProviders);
      if (checked) {
        providerSet.add(provider);
      } else if (providerSet.size > 1) {
        providerSet.delete(provider);
      }

      const orderedProviders = PAYMENT_PROVIDERS.map((item) => item.value).filter((value) =>
        providerSet.has(value),
      );
      const enabledProviders =
        orderedProviders.length > 0
          ? orderedProviders
          : [...prev.integrations.payments.enabledProviders];

      const defaultProvider = enabledProviders.includes(prev.integrations.payments.defaultProvider)
        ? prev.integrations.payments.defaultProvider
        : enabledProviders[0];

      return {
        ...prev,
        integrations: {
          ...prev.integrations,
          payments: {
            ...prev.integrations.payments,
            enabledProviders,
            defaultProvider,
          },
        },
      };
    });
  };

  const handleDisputeStatusToggle = (
    status: (typeof DISPUTE_STATUSES)[number]["value"],
    checked: boolean,
  ) => {
    if (!canUpdate) return;
    setDraft((prev) => {
      const statusSet = new Set(prev.disputePolicy.allowedStatuses);
      if (checked) {
        statusSet.add(status);
      } else if (statusSet.size > 1) {
        statusSet.delete(status);
      }
      return {
        ...prev,
        disputePolicy: {
          ...prev.disputePolicy,
          allowedStatuses: Array.from(statusSet),
        },
      };
    });
  };

  const handleDisputeResolutionToggle = (
    resolution: (typeof DISPUTE_RESOLUTIONS)[number]["value"],
    checked: boolean,
  ) => {
    if (!canUpdate) return;
    setDraft((prev) => {
      const resolutionSet = new Set(prev.disputePolicy.allowedResolutions);
      if (checked) {
        resolutionSet.add(resolution);
      } else if (resolutionSet.size > 1) {
        resolutionSet.delete(resolution);
      }
      const defaultResolution = resolutionSet.has(prev.disputePolicy.defaultResolution ?? "")
        ? prev.disputePolicy.defaultResolution
        : null;
      return {
        ...prev,
        disputePolicy: {
          ...prev.disputePolicy,
          allowedResolutions: Array.from(resolutionSet),
          defaultResolution,
        },
      };
    });
  };

  const handleDefaultResolutionChange = (value: string) => {
    if (!canUpdate) return;
    setDraft((prev) => {
      if (value === "none") {
        return {
          ...prev,
          disputePolicy: { ...prev.disputePolicy, defaultResolution: null },
        };
      }
      const resolution = value as DisputePolicy["defaultResolution"];
      const resolutionSet = new Set(prev.disputePolicy.allowedResolutions);
      resolutionSet.add(resolution);
      return {
        ...prev,
        disputePolicy: {
          ...prev.disputePolicy,
          defaultResolution: resolution,
          allowedResolutions: Array.from(resolutionSet),
        },
      };
    });
  };

  const handleDocumentToggle = (
    documentKey: (typeof VERIFICATION_DOCUMENTS)[number]["value"],
    checked: boolean,
  ) => {
    if (!canUpdate) return;
    setDraft((prev) => {
      const documentSet = new Set(prev.providerVerification.requiredDocuments);
      if (checked) {
        documentSet.add(documentKey);
      } else {
        documentSet.delete(documentKey);
      }
      return {
        ...prev,
        providerVerification: {
          ...prev.providerVerification,
          requiredDocuments: Array.from(documentSet),
        },
      };
    });
  };

  const handleSave = async () => {
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }
    try {
      setIsSaving(true);
      const payload: SettingsDraft = {
        ...draft,
        integrations: {
          ...draft.integrations,
          email: {
            ...draft.integrations.email,
            apiKey: secretDrafts.emailApiKey.trim()
              ? secretDrafts.emailApiKey.trim()
              : draft.integrations.email.apiKey,
          },
          sms: {
            ...draft.integrations.sms,
            apiKey: secretDrafts.smsApiKey.trim()
              ? secretDrafts.smsApiKey.trim()
              : draft.integrations.sms.apiKey,
          },
          payments: {
            ...draft.integrations.payments,
            flutterwaveSecretKey: secretDrafts.flutterwaveSecretKey.trim()
              ? secretDrafts.flutterwaveSecretKey.trim()
              : draft.integrations.payments.flutterwaveSecretKey,
            stripeSecretKey: secretDrafts.stripeSecretKey.trim()
              ? secretDrafts.stripeSecretKey.trim()
              : draft.integrations.payments.stripeSecretKey,
          },
          webhooks: {
            ...draft.integrations.webhooks,
            stripeWebhookSecret: secretDrafts.stripeWebhookSecret.trim()
              ? secretDrafts.stripeWebhookSecret.trim()
              : draft.integrations.webhooks.stripeWebhookSecret,
            flutterwaveWebhookHash: secretDrafts.flutterwaveWebhookHash.trim()
              ? secretDrafts.flutterwaveWebhookHash.trim()
              : draft.integrations.webhooks.flutterwaveWebhookHash,
            outboundSigningKey: secretDrafts.outboundSigningKey.trim()
              ? secretDrafts.outboundSigningKey.trim()
              : draft.integrations.webhooks.outboundSigningKey,
          },
        },
      };
      await updateAdminSettings(payload);
      toast({ title: "Settings updated." });
      await refetch();
      setSecretDrafts(DEFAULT_SECRET_DRAFTS);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update settings.";
      toast({ title: message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (data) {
      setDraft({
        platformFeeBps: data.platformFeeBps,
        taxBps: data.taxBps,
        businessFunctions: data.businessFunctions ?? DEFAULT_BUSINESS_FUNCTIONS,
        payoutRules: data.payoutRules ?? DEFAULT_PAYOUT_RULES,
        disputePolicy: data.disputePolicy ?? DEFAULT_DISPUTE_POLICY,
        orderRules: data.orderRules ?? DEFAULT_ORDER_RULES,
        providerVerification: data.providerVerification ?? DEFAULT_PROVIDER_VERIFICATION,
        reviewModeration: data.reviewModeration ?? DEFAULT_REVIEW_MODERATION,
        communityModeration: data.communityModeration ?? DEFAULT_COMMUNITY_MODERATION,
        notificationTemplates: data.notificationTemplates ?? DEFAULT_NOTIFICATION_TEMPLATES,
        featureFlags: data.featureFlags ?? DEFAULT_FEATURE_FLAGS,
        securityControls: data.securityControls ?? DEFAULT_SECURITY_CONTROLS,
        adminAccess: { ...DEFAULT_ADMIN_ACCESS, ...(data.adminAccess ?? {}) },
        integrations: data.integrations ?? DEFAULT_INTEGRATIONS,
        localization: data.localization ?? DEFAULT_LOCALIZATION,
      });
      setSecretDrafts(DEFAULT_SECRET_DRAFTS);
    } else {
      setDraft(DEFAULT_SETTINGS);
      setSecretDrafts(DEFAULT_SECRET_DRAFTS);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  }

  if (isError) {
    return (
      <div className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Unable to load settings."}{" "}
        <button className="text-primary underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const enabledPaymentProviders = new Set(draft.integrations.payments.enabledProviders);
  const navItems = SETTINGS_NAV.flatMap((group) => group.items);
  const defaultSection = navItems[0]?.slug ?? "";
  const sectionParam = section ?? "";
  const activeSection = sectionParam || defaultSection;
  const isValidSection = navItems.some((item) => item.slug === activeSection);
  if (!defaultSection) return null;

  if (!sectionParam || !isValidSection) {
    return <Navigate to={`/admin/settings/${defaultSection}`} replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure platform settings and access controls.
        </p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 lg:hidden">
            {navItems.map((item) => (
              <Button key={item.slug} size="sm" variant="outline" asChild>
                <NavLink
                  to={`/admin/settings/${item.slug}`}
                  className={({ isActive }) =>
                    isActive ? "bg-muted text-foreground" : ""
                  }
                >
                  {item.label}
                </NavLink>
              </Button>
            ))}
          </div>
          <div className="hidden lg:grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {SETTINGS_NAV.map((group) => (
              <div key={group.group} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.group}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.slug}
                      to={`/admin/settings/${item.slug}`}
                      className={({ isActive }) =>
                        [
                          "block w-full rounded-md px-2 py-1.5 text-sm",
                          isActive
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        ].join(" ")
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {activeSection === "platform-fees" && (
        <Card className="border-border/60" id="settings-platform-fees">
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Platform fees</h3>
              <p className="text-sm text-muted-foreground">
                Configure platform fee and tax rates (basis points).
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="platform-fee-bps">Platform fee (bps)</Label>
                <Input
                  id="platform-fee-bps"
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  value={draft.platformFeeBps}
                  onChange={(event) =>
                    updateDraft("platformFeeBps", Number(event.target.value || 0))
                  }
                  disabled={!canUpdate}
                />
                <p className="text-xs text-muted-foreground">100 bps = 1%.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax-bps">Tax (bps)</Label>
                <Input
                  id="tax-bps"
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  value={draft.taxBps}
                  onChange={(event) => updateDraft("taxBps", Number(event.target.value || 0))}
                  disabled={!canUpdate}
                />
                <p className="text-xs text-muted-foreground">Applied on the platform fee.</p>
              </div>
            </div>
            {data.updatedAt && (
              <div className="text-xs text-muted-foreground">
                Last updated {new Date(data.updatedAt).toLocaleString()}.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeSection === "payout-rules" && (
        <Card className="border-border/60" id="settings-payout-rules">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Payout rules</h3>
            <p className="text-sm text-muted-foreground">
              Control payout thresholds, fees, and supported networks.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="payout-min">Minimum payout</Label>
              <Input
                id="payout-min"
                type="number"
                min={0}
                value={draft.payoutRules.minAmount}
                onChange={(event) =>
                  updatePayoutRules({ minAmount: Number(event.target.value || 0) })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Set to 0 to disable.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-fee">Payout fee (bps)</Label>
              <Input
                id="payout-fee"
                type="number"
                min={0}
                max={10000}
                step={1}
                value={draft.payoutRules.feeBps}
                onChange={(event) =>
                  updatePayoutRules({ feeBps: Number(event.target.value || 0) })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">100 bps = 1%.</p>
            </div>
            <div className="space-y-2">
              <Label>Payout schedule</Label>
              <Select
                value={draft.payoutRules.schedule}
                onValueChange={(value) =>
                  updatePayoutRules({ schedule: value as PayoutRules["schedule"] })
                }
                disabled={!canUpdate}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  {PAYOUT_SCHEDULES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Supported MoMo networks</p>
            <div className="flex flex-wrap gap-3">
              {MOMO_NETWORKS.map((network) => (
                <label key={network.value} className="flex items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={draft.payoutRules.supportedMomoNetworks.includes(network.value)}
                    onCheckedChange={(value) =>
                      handleNetworkToggle(network.value, Boolean(value))
                    }
                    disabled={!canUpdate}
                  />
                  <span>{network.label}</span>
                </label>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Payout schedules apply when automated payouts are enabled.
          </p>
        </CardContent>
        </Card>
      )}

      {activeSection === "dispute-policy" && (
        <Card className="border-border/60" id="settings-dispute-policy">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Dispute policy</h3>
            <p className="text-sm text-muted-foreground">
              Define dispute workflows, allowed statuses, and default resolutions.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dispute-auto-close">Auto-close after (days)</Label>
              <Input
                id="dispute-auto-close"
                type="number"
                min={0}
                step={1}
                value={draft.disputePolicy.autoCloseDays}
                onChange={(event) =>
                  updateDisputePolicy({ autoCloseDays: Number(event.target.value || 0) })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Set to 0 to disable.</p>
            </div>
            <div className="space-y-2">
              <Label>Default resolution</Label>
              <Select
                value={draft.disputePolicy.defaultResolution ?? "none"}
                onValueChange={handleDefaultResolutionChange}
                disabled={!canUpdate}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select resolution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No default</SelectItem>
                  {DISPUTE_RESOLUTIONS.map((resolution) => (
                    <SelectItem key={resolution.value} value={resolution.value}>
                      {resolution.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Allowed statuses</p>
            <div className="flex flex-wrap gap-3">
              {DISPUTE_STATUSES.map((status) => (
                <label key={status.value} className="flex items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={draft.disputePolicy.allowedStatuses.includes(status.value)}
                    onCheckedChange={(value) =>
                      handleDisputeStatusToggle(status.value, Boolean(value))
                    }
                    disabled={!canUpdate}
                  />
                  <span>{status.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Allowed resolutions</p>
            <div className="flex flex-wrap gap-3">
              {DISPUTE_RESOLUTIONS.map((resolution) => (
                <label
                  key={resolution.value}
                  className="flex items-center gap-2 text-xs text-foreground"
                >
                  <Checkbox
                    checked={draft.disputePolicy.allowedResolutions.includes(resolution.value)}
                    onCheckedChange={(value) =>
                      handleDisputeResolutionToggle(resolution.value, Boolean(value))
                    }
                    disabled={!canUpdate}
                  />
                  <span>{resolution.label}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
        </Card>
      )}

      {activeSection === "order-rules" && (
        <Card className="border-border/60" id="settings-order-rules">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Order & escrow rules</h3>
            <p className="text-sm text-muted-foreground">
              Set automated release and refund windows for orders.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="auto-release-days">Auto-release after (days)</Label>
              <Input
                id="auto-release-days"
                type="number"
                min={0}
                step={1}
                value={draft.orderRules.autoReleaseDays}
                onChange={(event) =>
                  updateOrderRules({ autoReleaseDays: Number(event.target.value || 0) })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Set to 0 to disable.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-window-days">Refund window (days)</Label>
              <Input
                id="refund-window-days"
                type="number"
                min={0}
                step={1}
                value={draft.orderRules.refundWindowDays}
                onChange={(event) =>
                  updateOrderRules({ refundWindowDays: Number(event.target.value || 0) })
                }
                disabled={!canUpdate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancel-penalty">Cancellation penalty (bps)</Label>
              <Input
                id="cancel-penalty"
                type="number"
                min={0}
                max={10000}
                step={1}
                value={draft.orderRules.cancellationPenaltyBps}
                onChange={(event) =>
                  updateOrderRules({ cancellationPenaltyBps: Number(event.target.value || 0) })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Applied when refunds are issued.</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Auto-release and refund windows require automated workflows to be enabled.
          </p>
        </CardContent>
        </Card>
      )}

      {activeSection === "provider-verification" && (
        <Card className="border-border/60" id="settings-provider-verification">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Provider verification rules</h3>
            <p className="text-sm text-muted-foreground">
              Manage documentation requirements and verification reminders.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Required documents</p>
            <div className="flex flex-wrap gap-3">
              {VERIFICATION_DOCUMENTS.map((document) => (
                <label
                  key={document.value}
                  className="flex items-center gap-2 text-xs text-foreground"
                >
                  <Checkbox
                    checked={draft.providerVerification.requiredDocuments.includes(document.value)}
                    onCheckedChange={(value) =>
                      handleDocumentToggle(document.value, Boolean(value))
                    }
                    disabled={!canUpdate}
                  />
                  <span>{document.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="verification-reminder">Expiry reminder (days)</Label>
              <Input
                id="verification-reminder"
                type="number"
                min={0}
                step={1}
                value={draft.providerVerification.expiryReminderDays}
                onChange={(event) =>
                  updateProviderVerification({
                    expiryReminderDays: Number(event.target.value || 0),
                  })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Set to 0 to disable reminders.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="verification-suspend">Auto-suspend after (days)</Label>
              <Input
                id="verification-suspend"
                type="number"
                min={0}
                step={1}
                value={draft.providerVerification.autoSuspendDays}
                onChange={(event) =>
                  updateProviderVerification({
                    autoSuspendDays: Number(event.target.value || 0),
                  })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Set to 0 to disable.</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Document tracking is required to enforce verification reminders and suspensions.
          </p>
        </CardContent>
        </Card>
      )}

      {activeSection === "review-moderation" && (
        <Card className="border-border/60" id="settings-review-moderation">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Review moderation</h3>
            <p className="text-sm text-muted-foreground">
              Configure automatic review moderation thresholds and blocked keywords.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="review-auto-hide">Auto-hide after reports (count)</Label>
              <Input
                id="review-auto-hide"
                type="number"
                min={0}
                step={1}
                value={draft.reviewModeration.autoHideReportCount}
                onChange={(event) =>
                  updateReviewModeration({
                    autoHideReportCount: Number(event.target.value || 0),
                  })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Set to 0 to disable auto-hide.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-banned-words">Blocked keywords</Label>
            <Textarea
              id="review-banned-words"
              value={joinList(draft.reviewModeration.bannedKeywords)}
              onChange={(event) =>
                updateReviewModeration({ bannedKeywords: parseList(event.target.value) })
              }
              placeholder="one per line or comma separated"
              rows={4}
              disabled={!canUpdate}
            />
            <p className="text-xs text-muted-foreground">
              Reviews containing these keywords will be rejected.
            </p>
          </div>
        </CardContent>
        </Card>
      )}

      {activeSection === "community-moderation" && (
        <Card className="border-border/60" id="settings-community-moderation">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Community moderation</h3>
            <p className="text-sm text-muted-foreground">
              Rate limits and keyword blocks for community posts and comments.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="community-post-limit">Post limit per day</Label>
              <Input
                id="community-post-limit"
                type="number"
                min={0}
                step={1}
                value={draft.communityModeration.postLimitPerDay}
                onChange={(event) =>
                  updateCommunityModeration({
                    postLimitPerDay: Number(event.target.value || 0),
                  })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Set to 0 to disable.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="community-comment-limit">Comment limit per day</Label>
              <Input
                id="community-comment-limit"
                type="number"
                min={0}
                step={1}
                value={draft.communityModeration.commentLimitPerDay}
                onChange={(event) =>
                  updateCommunityModeration({
                    commentLimitPerDay: Number(event.target.value || 0),
                  })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Set to 0 to disable.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="community-banned-words">Blocked keywords</Label>
            <Textarea
              id="community-banned-words"
              value={joinList(draft.communityModeration.bannedKeywords)}
              onChange={(event) =>
                updateCommunityModeration({ bannedKeywords: parseList(event.target.value) })
              }
              placeholder="one per line or comma separated"
              rows={4}
              disabled={!canUpdate}
            />
          </div>
        </CardContent>
        </Card>
      )}

      {activeSection === "notification-templates" && (
        <Card className="border-border/60" id="settings-notification-templates">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Notification templates</h3>
            <p className="text-sm text-muted-foreground">
              Customize in-app notification text. Use tokens like {"{title}"} and {"{body}"}.
            </p>
          </div>
          <Accordion type="multiple" className="rounded-xl border border-border/60">
            {NOTIFICATION_TYPES.map((item) => {
              const template = draft.notificationTemplates[item.key];
              return (
                <AccordionItem key={item.key} value={item.key} className="border-border/60">
                  <AccordionTrigger className="px-4">
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Template enabled</p>
                          <p className="text-xs text-muted-foreground">
                            Toggle to override the default notification text.
                          </p>
                        </div>
                        <Switch
                          checked={template.enabled}
                          onCheckedChange={(checked) =>
                            updateNotificationTemplate(item.key, { enabled: checked })
                          }
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`template-title-${item.key}`}>Title template</Label>
                        <Input
                          id={`template-title-${item.key}`}
                          value={template.title}
                          onChange={(event) =>
                            updateNotificationTemplate(item.key, { title: event.target.value })
                          }
                          disabled={!canUpdate || !template.enabled}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`template-body-${item.key}`}>Body template</Label>
                        <Textarea
                          id={`template-body-${item.key}`}
                          value={template.body}
                          onChange={(event) =>
                            updateNotificationTemplate(item.key, { body: event.target.value })
                          }
                          rows={3}
                          disabled={!canUpdate || !template.enabled}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Available tokens: {"{title}"}, {"{body}"}, {"{type}"}.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
        </Card>
      )}

      {activeSection === "feature-flags" && (
        <Card className="border-border/60" id="settings-feature-flags">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Feature flags</h3>
            <p className="text-sm text-muted-foreground">
              Toggle optional features across the platform.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { key: "community", label: "Community feed" },
              { key: "reviews", label: "Reviews" },
              { key: "promotions", label: "Promotions" },
              { key: "boosts", label: "Service boosts" },
              { key: "subscriptions", label: "Subscriptions" },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                </div>
                <Switch
                  checked={draft.featureFlags[item.key as keyof FeatureFlags]}
                  onCheckedChange={(checked) =>
                    updateFeatureFlags({ [item.key]: checked } as Partial<FeatureFlags>)
                  }
                  disabled={!canUpdate}
                />
              </div>
            ))}
          </div>
        </CardContent>
        </Card>
      )}

      {activeSection === "security-controls" && (
        <Card className="border-border/60" id="settings-security-controls">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Security controls</h3>
            <p className="text-sm text-muted-foreground">
              Enforce additional protections for admin accounts.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-ip-allowlist">Admin IP allowlist</Label>
            <Textarea
              id="admin-ip-allowlist"
              value={joinList(draft.securityControls.adminIpAllowlist)}
              onChange={(event) =>
                updateSecurityControls({ adminIpAllowlist: parseList(event.target.value) })
              }
              placeholder="one IP per line or comma separated"
              rows={3}
              disabled={!canUpdate}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to allow all IPs.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="admin-session-timeout">Admin session timeout (hours)</Label>
              <Input
                id="admin-session-timeout"
                type="number"
                min={0}
                step={1}
                value={draft.securityControls.adminSessionTimeoutHours}
                onChange={(event) =>
                  updateSecurityControls({
                    adminSessionTimeoutHours: Number(event.target.value || 0),
                  })
                }
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">Set to 0 to disable.</p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Require MFA for admins</p>
                <p className="text-xs text-muted-foreground">Requires MFA implementation.</p>
              </div>
              <Switch
                checked={draft.securityControls.requireMfaForAdmins}
                onCheckedChange={(checked) =>
                  updateSecurityControls({ requireMfaForAdmins: checked })
                }
                disabled={!canUpdate}
              />
            </div>
          </div>
        </CardContent>
        </Card>
      )}

      {activeSection === "admin-access" && (
        <Card className="border-border/60" id="settings-admin-access">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Admin page access</h3>
            <p className="text-sm text-muted-foreground">
              Assign which admin roles can see each admin page in the sidebar.
            </p>
            <p className="text-xs text-muted-foreground">
              This only hides UI navigation. Direct URLs are not blocked.
            </p>
          </div>
          <div className="space-y-4">
            {ADMIN_PAGE_ACCESS.map((item) => {
              const roles = draft.adminAccess[item.key] ?? [];
              return (
                <div
                  key={item.key}
                  className="rounded-xl border border-border/60 bg-card px-4 py-4 space-y-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Roles with access</p>
                    <div className="flex flex-wrap gap-3">
                      {ADMIN_ROLES.map((role) => (
                        <label key={role} className="flex items-center gap-2 text-xs text-foreground">
                          <Checkbox
                            checked={roles.includes(role)}
                            onCheckedChange={(value) =>
                              updateAdminAccess(item.key, role, Boolean(value))
                            }
                            disabled={!canUpdate}
                          />
                          <span>{getRoleLabel(role)}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Uncheck all roles to hide this page for everyone.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {!canUpdate && (
            <div className="text-xs text-muted-foreground">
              You do not have permission to update settings.
            </div>
          )}
        </CardContent>
        </Card>
      )}

      {activeSection === "integrations" && (
        <Card className="border-border/60" id="settings-integrations">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Integrations</h3>
            <p className="text-sm text-muted-foreground">
              Configure external providers for messaging, payments, and webhooks.
            </p>
            <p className="text-xs text-muted-foreground">
              Secrets are masked after saving. Leave a secret field blank to keep the existing value.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Email provider</p>
                <p className="text-xs text-muted-foreground">
                  Use SMTP or a transactional email provider for system emails.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Email provider</Label>
                  <Select
                    value={draft.integrations.email.provider}
                    onValueChange={(value) =>
                      updateEmailIntegration({
                        provider: value as Integrations["email"]["provider"],
                      })
                    }
                    disabled={!canUpdate}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {EMAIL_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>From address</Label>
                  <Input
                    value={draft.integrations.email.fromAddress}
                    onChange={(event) =>
                      updateEmailIntegration({ fromAddress: event.target.value })
                    }
                    placeholder="noreply@servfix.com"
                    disabled={!canUpdate}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Email API key / password</Label>
                  <Input
                    type="password"
                    value={secretDrafts.emailApiKey}
                    onChange={(event) =>
                      setSecretDrafts((prev) => ({ ...prev, emailApiKey: event.target.value }))
                    }
                    placeholder={
                      draft.integrations.email.apiKey
                        ? "•••••••• (saved)"
                        : "Enter provider API key"
                    }
                    disabled={!canUpdate}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to keep the existing server configuration.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">SMS provider</p>
                <p className="text-xs text-muted-foreground">
                  Configure SMS delivery for alerts and verification flows.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>SMS provider</Label>
                  <Select
                    value={draft.integrations.sms.provider}
                    onValueChange={(value) =>
                      updateSmsIntegration({
                        provider: value as Integrations["sms"]["provider"],
                      })
                    }
                    disabled={!canUpdate}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {SMS_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sender ID</Label>
                  <Input
                    value={draft.integrations.sms.senderId}
                    onChange={(event) =>
                      updateSmsIntegration({ senderId: event.target.value })
                    }
                    placeholder="SERVFIX"
                    disabled={!canUpdate}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>SMS API key</Label>
                  <Input
                    type="password"
                    value={secretDrafts.smsApiKey}
                    onChange={(event) =>
                      setSecretDrafts((prev) => ({ ...prev, smsApiKey: event.target.value }))
                    }
                    placeholder={
                      draft.integrations.sms.apiKey ? "•••••••• (saved)" : "Enter provider API key"
                    }
                    disabled={!canUpdate}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Payment gateways</p>
                <p className="text-xs text-muted-foreground">
                  Enable payment providers and configure gateway secrets.
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Enabled providers</p>
                <div className="flex flex-wrap gap-3">
                  {PAYMENT_PROVIDERS.map((provider) => (
                    <label
                      key={provider.value}
                      className="flex items-center gap-2 text-xs text-foreground"
                    >
                      <Checkbox
                        checked={enabledPaymentProviders.has(provider.value)}
                        onCheckedChange={(value) =>
                          handlePaymentProviderToggle(provider.value, Boolean(value))
                        }
                        disabled={!canUpdate}
                      />
                      <span>{provider.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default provider</Label>
                  <Select
                    value={draft.integrations.payments.defaultProvider}
                    onValueChange={(value) =>
                      updatePaymentIntegration({
                        defaultProvider: value as PaymentIntegrationProvider,
                      })
                    }
                    disabled={!canUpdate}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select default provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_PROVIDERS.filter((provider) =>
                        enabledPaymentProviders.has(provider.value),
                      ).map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Flutterwave secret key</Label>
                  <Input
                    type="password"
                    value={secretDrafts.flutterwaveSecretKey}
                    onChange={(event) =>
                      setSecretDrafts((prev) => ({
                        ...prev,
                        flutterwaveSecretKey: event.target.value,
                      }))
                    }
                    placeholder={
                      draft.integrations.payments.flutterwaveSecretKey
                        ? "•••••••• (saved)"
                        : "FLWSECK-..."
                    }
                    disabled={!canUpdate}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Stripe secret key</Label>
                  <Input
                    type="password"
                    value={secretDrafts.stripeSecretKey}
                    onChange={(event) =>
                      setSecretDrafts((prev) => ({
                        ...prev,
                        stripeSecretKey: event.target.value,
                      }))
                    }
                    placeholder={
                      draft.integrations.payments.stripeSecretKey
                        ? "•••••••• (saved)"
                        : "sk_live_..."
                    }
                    disabled={!canUpdate}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Webhook keys</p>
                <p className="text-xs text-muted-foreground">
                  Used to validate incoming webhooks or sign outbound events.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Stripe webhook secret</Label>
                  <Input
                    type="password"
                    value={secretDrafts.stripeWebhookSecret}
                    onChange={(event) =>
                      setSecretDrafts((prev) => ({
                        ...prev,
                        stripeWebhookSecret: event.target.value,
                      }))
                    }
                    placeholder={
                      draft.integrations.webhooks.stripeWebhookSecret
                        ? "•••••••• (saved)"
                        : "whsec_..."
                    }
                    disabled={!canUpdate}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Flutterwave webhook hash</Label>
                  <Input
                    type="password"
                    value={secretDrafts.flutterwaveWebhookHash}
                    onChange={(event) =>
                      setSecretDrafts((prev) => ({
                        ...prev,
                        flutterwaveWebhookHash: event.target.value,
                      }))
                    }
                    placeholder={
                      draft.integrations.webhooks.flutterwaveWebhookHash
                        ? "•••••••• (saved)"
                        : "Enter Flutterwave hash"
                    }
                    disabled={!canUpdate}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Outbound signing key</Label>
                  <Input
                    type="password"
                    value={secretDrafts.outboundSigningKey}
                    onChange={(event) =>
                      setSecretDrafts((prev) => ({
                        ...prev,
                        outboundSigningKey: event.target.value,
                      }))
                    }
                    placeholder={
                      draft.integrations.webhooks.outboundSigningKey
                        ? "•••••••• (saved)"
                        : "Optional signing key"
                    }
                    disabled={!canUpdate}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        </Card>
      )}

      {activeSection === "localization" && (
        <Card className="border-border/60" id="settings-localization">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Localization (Analytics)</h3>
            <p className="text-sm text-muted-foreground">
              Set the default currency, locale, and timezone used in admin analytics.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Default currency</Label>
              <Select
                value={draft.localization.currency}
                onValueChange={(value) =>
                  updateLocalization({
                    currency: value as LocalizationSettings["currency"],
                  })
                }
                disabled={!canUpdate}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Locale</Label>
              <Input
                value={draft.localization.locale}
                onChange={(event) => updateLocalization({ locale: event.target.value })}
                placeholder="en-GH"
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">
                Used for number/date formatting. Example: en-GH, en-US.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input
                value={draft.localization.timezone}
                onChange={(event) => updateLocalization({ timezone: event.target.value })}
                placeholder="Africa/Accra"
                disabled={!canUpdate}
              />
              <p className="text-xs text-muted-foreground">
                Used for analytics reporting windows. Example: Africa/Accra, UTC.
              </p>
            </div>
          </div>
        </CardContent>
        </Card>
      )}

      {activeSection === "business-functions" && (
        <Card className="border-border/60" id="settings-business-functions">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Non-core business functions</h3>
            <p className="text-sm text-muted-foreground">
              Automate and optimize non-core business functions, such as human resources, finance,
              accounting, and customer service.
            </p>
          </div>

          <div className="space-y-4">
            {BUSINESS_FUNCTIONS.map((item) => {
              const config = draft.businessFunctions[item.key];
              return (
                <div
                  key={item.key}
                  className="rounded-xl border border-border/60 bg-card px-4 py-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(checked) => handleToggle(item.key, checked)}
                      disabled={!canUpdate}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Roles with access</p>
                    <div className="flex flex-wrap gap-3">
                      {ADMIN_ROLES.map((role) => (
                        <label key={role} className="flex items-center gap-2 text-xs text-foreground">
                          <Checkbox
                            checked={config.roles.includes(role)}
                            onCheckedChange={(value) =>
                              handleRoleToggle(item.key, role, Boolean(value))
                            }
                            disabled={!canUpdate}
                          />
                          <span>{getRoleLabel(role)}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Roles apply when the function is enabled.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {!canUpdate && (
            <div className="text-xs text-muted-foreground">
              You do not have permission to update settings.
            </div>
          )}
        </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" onClick={handleReset} disabled={isSaving}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={!canUpdate || isSaving}>
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
};

export default AdminSettings;
