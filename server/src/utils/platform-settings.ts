import { z } from "zod";
import { NotificationType, UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../config.js";
import { ADMIN_ROLES } from "./permissions.js";

export const PLATFORM_SETTINGS_KEY = "platform-settings";

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

export type NotificationTemplates = Record<NotificationType, NotificationTemplate>;

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

export const ADMIN_PAGE_KEYS = [
  "overview",
  "users",
  "providers",
  "services",
  "orders",
  "disputes",
  "reviews",
  "community",
  "reports",
  "support",
  "payouts",
  "analytics",
  "home",
  "settings",
] as const;

export type AdminPageKey = (typeof ADMIN_PAGE_KEYS)[number];

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

export type PlatformSettings = {
  platformFeeBps: number;
  taxBps: number;
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
};

const adminRoleSet = new Set(ADMIN_ROLES);

const businessFunctionConfigSchema = z.object({
  enabled: z.boolean(),
  roles: z.array(z.nativeEnum(UserRole)),
});

const businessFunctionsSchema = z
  .object({
    human_resources: businessFunctionConfigSchema,
    finance: businessFunctionConfigSchema,
    accounting: businessFunctionConfigSchema,
    customer_service: businessFunctionConfigSchema,
  })
  .superRefine((value, ctx) => {
    BUSINESS_FUNCTION_KEYS.forEach((key) => {
      const invalidRoles = value[key].roles.filter((role) => !adminRoleSet.has(role));
      if (invalidRoles.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid roles for ${key}.`,
          path: [key, "roles"],
        });
      }
    });
  });

const payoutRulesSchema = z.object({
  minAmount: z.coerce.number().min(0),
  feeBps: z.coerce.number().int().min(0).max(10000),
  schedule: z.enum(["manual", "daily", "weekly", "monthly"]),
  supportedMomoNetworks: z
    .array(z.enum(["mtn", "vodafone", "airteltigo"]))
    .min(1),
});

const disputePolicySchema = z
  .object({
    autoCloseDays: z.coerce.number().int().min(0).max(365),
    allowedStatuses: z
      .array(z.enum(["open", "investigating", "resolved", "cancelled"]))
      .min(1),
    allowedResolutions: z
      .array(z.enum(["refund", "release", "partial_refund", "deny"]))
      .min(1),
    defaultResolution: z
      .enum(["refund", "release", "partial_refund", "deny"])
      .nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.defaultResolution && !value.allowedResolutions.includes(value.defaultResolution)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Default resolution must be part of allowed resolutions.",
        path: ["defaultResolution"],
      });
    }
  });

const orderRulesSchema = z.object({
  autoReleaseDays: z.coerce.number().int().min(0).max(365),
  refundWindowDays: z.coerce.number().int().min(0).max(365),
  cancellationPenaltyBps: z.coerce.number().int().min(0).max(10000),
});

const providerVerificationSchema = z.object({
  requiredDocuments: z.array(z.string().trim().min(1)).max(12),
  expiryReminderDays: z.coerce.number().int().min(0).max(365),
  autoSuspendDays: z.coerce.number().int().min(0).max(365),
});

const reviewModerationSchema = z.object({
  bannedKeywords: z.array(z.string().trim().min(1)).max(200),
  autoHideReportCount: z.coerce.number().int().min(0).max(100),
});

const communityModerationSchema = z.object({
  postLimitPerDay: z.coerce.number().int().min(0).max(500),
  commentLimitPerDay: z.coerce.number().int().min(0).max(1000),
  bannedKeywords: z.array(z.string().trim().min(1)).max(200),
});

const notificationTemplateSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().max(160),
  body: z.string().trim().max(400),
});

const NOTIFICATION_TYPES: NotificationType[] = [
  "message_received",
  "order_created",
  "order_status",
  "review_received",
  "review_reply",
  "follow_received",
  "community_post_liked",
  "community_post_commented",
  "community_new_post",
  "payout_update",
];

const notificationTemplatesSchema = z.object(
  Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, notificationTemplateSchema]),
  ) as unknown as Record<NotificationType, z.ZodTypeAny>,
);

const featureFlagsSchema = z.object({
  community: z.boolean(),
  reviews: z.boolean(),
  promotions: z.boolean(),
  boosts: z.boolean(),
  subscriptions: z.boolean(),
});

const securityControlsSchema = z.object({
  adminIpAllowlist: z.array(z.string().trim().min(1)).max(200),
  adminSessionTimeoutHours: z.coerce.number().int().min(0).max(720),
  requireMfaForAdmins: z.boolean(),
});

const adminAccessSchema = z
  .object(
    Object.fromEntries(
      ADMIN_PAGE_KEYS.map((key) => [key, z.array(z.nativeEnum(UserRole))]),
    ) as unknown as Record<AdminPageKey, z.ZodTypeAny>,
  )
  .superRefine((value, ctx) => {
    ADMIN_PAGE_KEYS.forEach((key) => {
      const invalidRoles = value[key].filter((role: UserRole) => !adminRoleSet.has(role));
      if (invalidRoles.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid roles for ${key}.`,
          path: [key],
        });
      }
    });
  });

const emailIntegrationSchema = z.object({
  provider: z.enum(["disabled", "smtp", "sendgrid", "mailgun", "postmark", "custom"]),
  fromAddress: z.string().trim().max(160),
  apiKey: z.string().trim().max(200),
});

const smsIntegrationSchema = z.object({
  provider: z.enum(["disabled", "twilio", "hubtel", "mnotify", "termii", "custom"]),
  senderId: z.string().trim().max(80),
  apiKey: z.string().trim().max(200),
});

const paymentsIntegrationSchema = z
  .object({
    enabledProviders: z.array(z.enum(["flutterwave", "stripe"])).min(1),
    defaultProvider: z.enum(["flutterwave", "stripe"]),
    flutterwaveSecretKey: z.string().trim().max(200),
    stripeSecretKey: z.string().trim().max(200),
  })
  .superRefine((value, ctx) => {
    if (!value.enabledProviders.includes(value.defaultProvider)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Default provider must be enabled.",
        path: ["defaultProvider"],
      });
    }
  });

const webhooksIntegrationSchema = z.object({
  stripeWebhookSecret: z.string().trim().max(200),
  flutterwaveWebhookHash: z.string().trim().max(200),
  outboundSigningKey: z.string().trim().max(200),
});

const integrationsSchema = z.object({
  email: emailIntegrationSchema,
  sms: smsIntegrationSchema,
  payments: paymentsIntegrationSchema,
  webhooks: webhooksIntegrationSchema,
});

const localizationSchema = z.object({
  currency: z.enum(["GHS", "USD", "EUR"]),
  locale: z.string().trim().min(2).max(32),
  timezone: z.string().trim().min(2).max(64),
});

const platformSettingsSchema = z.object({
  platformFeeBps: z.coerce.number().int().min(0).max(10000),
  taxBps: z.coerce.number().int().min(0).max(10000),
  businessFunctions: businessFunctionsSchema,
  payoutRules: payoutRulesSchema,
  disputePolicy: disputePolicySchema,
  orderRules: orderRulesSchema,
  providerVerification: providerVerificationSchema,
  reviewModeration: reviewModerationSchema,
  communityModeration: communityModerationSchema,
  notificationTemplates: notificationTemplatesSchema,
  featureFlags: featureFlagsSchema,
  securityControls: securityControlsSchema,
  adminAccess: adminAccessSchema,
  integrations: integrationsSchema,
  localization: localizationSchema,
});

const defaultBusinessFunctions: BusinessFunctionSettings = {
  human_resources: { enabled: true, roles: [...ADMIN_ROLES] },
  finance: { enabled: true, roles: [...ADMIN_ROLES] },
  accounting: { enabled: true, roles: [...ADMIN_ROLES] },
  customer_service: { enabled: true, roles: [...ADMIN_ROLES] },
};

const defaultPayoutRules: PayoutRules = {
  minAmount: 0,
  feeBps: 0,
  schedule: "manual",
  supportedMomoNetworks: ["mtn", "vodafone", "airteltigo"],
};

const defaultDisputePolicy: DisputePolicy = {
  autoCloseDays: 0,
  allowedStatuses: ["open", "investigating", "resolved", "cancelled"],
  allowedResolutions: ["refund", "release", "partial_refund", "deny"],
  defaultResolution: null,
};

const defaultOrderRules: OrderRules = {
  autoReleaseDays: 0,
  refundWindowDays: 0,
  cancellationPenaltyBps: 0,
};

const defaultProviderVerification: ProviderVerificationRules = {
  requiredDocuments: [],
  expiryReminderDays: 0,
  autoSuspendDays: 0,
};

const defaultReviewModeration: ReviewModeration = {
  bannedKeywords: [],
  autoHideReportCount: 0,
};

const defaultCommunityModeration: CommunityModeration = {
  postLimitPerDay: 0,
  commentLimitPerDay: 0,
  bannedKeywords: [],
};

const defaultNotificationTemplates: NotificationTemplates = NOTIFICATION_TYPES.reduce(
  (acc, type) => {
    acc[type] = { enabled: false, title: "{title}", body: "{body}" };
    return acc;
  },
  {} as NotificationTemplates,
);

const defaultFeatureFlags: FeatureFlags = {
  community: true,
  reviews: true,
  promotions: false,
  boosts: false,
  subscriptions: false,
};

const defaultSecurityControls: SecurityControls = {
  adminIpAllowlist: [],
  adminSessionTimeoutHours: 0,
  requireMfaForAdmins: false,
};

const defaultAdminAccess: AdminAccessSettings = ADMIN_PAGE_KEYS.reduce((acc, key) => {
  acc[key] = [...ADMIN_ROLES];
  return acc;
}, {} as AdminAccessSettings);

const defaultIntegrations: Integrations = {
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

const defaultLocalization: LocalizationSettings = {
  currency: "GHS",
  locale: "en-GH",
  timezone: "Africa/Accra",
};

const normalizeBusinessFunctions = (input: BusinessFunctionSettings) => {
  return BUSINESS_FUNCTION_KEYS.reduce((acc, key) => {
    const roleSet = new Set(input[key].roles.filter((role) => adminRoleSet.has(role)));
    acc[key] = {
      enabled: input[key].enabled,
      roles: ADMIN_ROLES.filter((role) => roleSet.has(role)),
    };
    return acc;
  }, {} as BusinessFunctionSettings);
};

const normalizePayoutRules = (input: PayoutRules): PayoutRules => {
  const allowed = ["mtn", "vodafone", "airteltigo"] as const;
  const networkSet = new Set(
    input.supportedMomoNetworks.filter((network) => allowed.includes(network)),
  );
  const supported = allowed.filter((network) => networkSet.has(network));
  return {
    ...input,
    supportedMomoNetworks: supported.length > 0 ? supported : [...defaultPayoutRules.supportedMomoNetworks],
  };
};

const normalizeDisputePolicy = (input: DisputePolicy): DisputePolicy => {
  const statusOrder = ["open", "investigating", "resolved", "cancelled"] as const;
  const resolutionOrder = ["refund", "release", "partial_refund", "deny"] as const;
  const statusSet = new Set(input.allowedStatuses.filter((status) => statusOrder.includes(status)));
  const resolutionSet = new Set(
    input.allowedResolutions.filter((resolution) => resolutionOrder.includes(resolution)),
  );
  const allowedStatuses = statusOrder.filter((status) => statusSet.has(status));
  const allowedResolutions = resolutionOrder.filter((resolution) => resolutionSet.has(resolution));
  const defaultResolution =
    input.defaultResolution && allowedResolutions.includes(input.defaultResolution)
      ? input.defaultResolution
      : null;
  return {
    ...input,
    allowedStatuses: allowedStatuses.length > 0 ? allowedStatuses : [...defaultDisputePolicy.allowedStatuses],
    allowedResolutions:
      allowedResolutions.length > 0
        ? allowedResolutions
        : [...defaultDisputePolicy.allowedResolutions],
    defaultResolution,
  };
};

const normalizeOrderRules = (input: OrderRules): OrderRules => {
  return {
    ...input,
  };
};

const normalizeProviderVerification = (input: ProviderVerificationRules): ProviderVerificationRules => {
  const documents = Array.from(new Set(input.requiredDocuments.filter(Boolean))).slice(0, 12);
  return {
    ...input,
    requiredDocuments: documents,
  };
};

const normalizeReviewModeration = (input: ReviewModeration): ReviewModeration => {
  const bannedKeywords = Array.from(
    new Set(input.bannedKeywords.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 200);
  return {
    ...input,
    bannedKeywords,
  };
};

const normalizeCommunityModeration = (input: CommunityModeration): CommunityModeration => {
  const bannedKeywords = Array.from(
    new Set(input.bannedKeywords.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 200);
  return {
    ...input,
    bannedKeywords,
  };
};

const normalizeNotificationTemplates = (input: NotificationTemplates): NotificationTemplates => {
  return NOTIFICATION_TYPES.reduce((acc, type) => {
    const template = input[type] ?? defaultNotificationTemplates[type];
    acc[type] = {
      enabled: Boolean(template.enabled),
      title: template.title?.toString() ?? "{title}",
      body: template.body?.toString() ?? "{body}",
    };
    return acc;
  }, {} as NotificationTemplates);
};

const normalizeFeatureFlags = (input: FeatureFlags): FeatureFlags => {
  return {
    community: Boolean(input.community),
    reviews: Boolean(input.reviews),
    promotions: Boolean(input.promotions),
    boosts: Boolean(input.boosts),
    subscriptions: Boolean(input.subscriptions),
  };
};

const normalizeSecurityControls = (input: SecurityControls): SecurityControls => {
  const allowlist = Array.from(new Set(input.adminIpAllowlist.map((value) => value.trim()).filter(Boolean)));
  return {
    ...input,
    adminIpAllowlist: allowlist,
  };
};

const normalizeAdminAccess = (input: AdminAccessSettings): AdminAccessSettings => {
  return ADMIN_PAGE_KEYS.reduce((acc, key) => {
    const roles = input[key] ?? defaultAdminAccess[key];
    const roleSet = new Set(roles.filter((role) => adminRoleSet.has(role)));
    acc[key] = ADMIN_ROLES.filter((role) => roleSet.has(role));
    return acc;
  }, {} as AdminAccessSettings);
};

const normalizeIntegrations = (input: Integrations): Integrations => {
  const paymentProviders: PaymentIntegrationProvider[] = ["flutterwave", "stripe"];
  const enabledSet = new Set(
    (input.payments.enabledProviders ?? []).filter((provider) => paymentProviders.includes(provider)),
  );
  const enabledProviders = paymentProviders.filter((provider) => enabledSet.has(provider));
  const normalizedEnabled =
    enabledProviders.length > 0 ? enabledProviders : [...defaultIntegrations.payments.enabledProviders];
  const defaultProvider = normalizedEnabled.includes(input.payments.defaultProvider)
    ? input.payments.defaultProvider
    : normalizedEnabled[0];

  return {
    email: {
      provider: input.email.provider,
      fromAddress: input.email.fromAddress?.toString().trim() ?? "",
      apiKey: input.email.apiKey?.toString().trim() ?? "",
    },
    sms: {
      provider: input.sms.provider,
      senderId: input.sms.senderId?.toString().trim() ?? "",
      apiKey: input.sms.apiKey?.toString().trim() ?? "",
    },
    payments: {
      enabledProviders: normalizedEnabled,
      defaultProvider,
      flutterwaveSecretKey: input.payments.flutterwaveSecretKey?.toString().trim() ?? "",
      stripeSecretKey: input.payments.stripeSecretKey?.toString().trim() ?? "",
    },
    webhooks: {
      stripeWebhookSecret: input.webhooks.stripeWebhookSecret?.toString().trim() ?? "",
      flutterwaveWebhookHash: input.webhooks.flutterwaveWebhookHash?.toString().trim() ?? "",
      outboundSigningKey: input.webhooks.outboundSigningKey?.toString().trim() ?? "",
    },
  };
};

const normalizeLocalization = (input: LocalizationSettings): LocalizationSettings => {
  const locale = input.locale?.toString().trim() || defaultLocalization.locale;
  const timezone = input.timezone?.toString().trim() || defaultLocalization.timezone;
  return {
    currency: input.currency ?? defaultLocalization.currency,
    locale,
    timezone,
  };
};

const normalizePlatformSettings = (input: PlatformSettings): PlatformSettings => {
  return {
    ...input,
    businessFunctions: normalizeBusinessFunctions(input.businessFunctions),
    payoutRules: normalizePayoutRules(input.payoutRules),
    disputePolicy: normalizeDisputePolicy(input.disputePolicy),
    orderRules: normalizeOrderRules(input.orderRules),
    providerVerification: normalizeProviderVerification(input.providerVerification),
    reviewModeration: normalizeReviewModeration(input.reviewModeration),
    communityModeration: normalizeCommunityModeration(input.communityModeration),
    notificationTemplates: normalizeNotificationTemplates(input.notificationTemplates),
    featureFlags: normalizeFeatureFlags(input.featureFlags),
    securityControls: normalizeSecurityControls(input.securityControls),
    adminAccess: normalizeAdminAccess(input.adminAccess),
    integrations: normalizeIntegrations(input.integrations),
    localization: normalizeLocalization(input.localization),
  };
};

const buildSettingsPayload = (record: {
  platformFeeBps: number | null;
  taxBps: number | null;
  businessFunctions: unknown;
  payoutRules: unknown | null;
  disputePolicy: unknown | null;
  orderRules: unknown | null;
  providerVerification: unknown | null;
  reviewModeration: unknown | null;
  communityModeration: unknown | null;
  notificationTemplates: unknown | null;
  featureFlags: unknown | null;
  securityControls: unknown | null;
  adminAccess: unknown | null;
  integrations: unknown | null;
  localization: unknown | null;
} | null): PlatformSettings => {
  return {
    platformFeeBps: record?.platformFeeBps ?? env.PLATFORM_FEE_BPS,
    taxBps: record?.taxBps ?? env.TAX_BPS,
    businessFunctions:
      (record?.businessFunctions as BusinessFunctionSettings | undefined) ??
      defaultBusinessFunctions,
    payoutRules: (record?.payoutRules as PayoutRules | undefined) ?? defaultPayoutRules,
    disputePolicy: (record?.disputePolicy as DisputePolicy | undefined) ?? defaultDisputePolicy,
    orderRules: (record?.orderRules as OrderRules | undefined) ?? defaultOrderRules,
    providerVerification:
      (record?.providerVerification as ProviderVerificationRules | undefined) ??
      defaultProviderVerification,
    reviewModeration:
      (record?.reviewModeration as ReviewModeration | undefined) ?? defaultReviewModeration,
    communityModeration:
      (record?.communityModeration as CommunityModeration | undefined) ??
      defaultCommunityModeration,
    notificationTemplates:
      (record?.notificationTemplates as NotificationTemplates | undefined) ??
      defaultNotificationTemplates,
    featureFlags:
      (record?.featureFlags as FeatureFlags | undefined) ?? defaultFeatureFlags,
    securityControls:
      (record?.securityControls as SecurityControls | undefined) ??
      defaultSecurityControls,
    adminAccess: {
      ...defaultAdminAccess,
      ...((record?.adminAccess as AdminAccessSettings | undefined) ?? {}),
    },
    integrations:
      (record?.integrations as Integrations | undefined) ?? defaultIntegrations,
    localization:
      (record?.localization as LocalizationSettings | undefined) ??
      defaultLocalization,
  };
};

export const parsePlatformSettings = (payload: unknown) => {
  return platformSettingsSchema.parse(payload);
};

export const getPlatformSettings = async () => {
  const record = await prisma.platformSettings.findUnique({
    where: { key: PLATFORM_SETTINGS_KEY },
  });

  if (!record) {
    const created = await prisma.platformSettings.create({
      data: {
        key: PLATFORM_SETTINGS_KEY,
        platformFeeBps: env.PLATFORM_FEE_BPS,
        taxBps: env.TAX_BPS,
        businessFunctions: defaultBusinessFunctions,
        payoutRules: defaultPayoutRules,
        disputePolicy: defaultDisputePolicy,
        orderRules: defaultOrderRules,
        providerVerification: defaultProviderVerification,
        reviewModeration: defaultReviewModeration,
        communityModeration: defaultCommunityModeration,
        notificationTemplates: defaultNotificationTemplates,
        featureFlags: defaultFeatureFlags,
        securityControls: defaultSecurityControls,
        adminAccess: defaultAdminAccess,
        integrations: defaultIntegrations,
        localization: defaultLocalization,
      },
    });

    return { record: created, settings: buildSettingsPayload(created) };
  }

  const payload = buildSettingsPayload(record);
  const parsed = platformSettingsSchema.safeParse(payload);

  if (!parsed.success) {
    const fallback = normalizePlatformSettings(buildSettingsPayload(null));
    const updated = await prisma.platformSettings.update({
      where: { key: PLATFORM_SETTINGS_KEY },
      data: {
        platformFeeBps: fallback.platformFeeBps,
        taxBps: fallback.taxBps,
        businessFunctions: fallback.businessFunctions,
        payoutRules: fallback.payoutRules,
        disputePolicy: fallback.disputePolicy,
        orderRules: fallback.orderRules,
        providerVerification: fallback.providerVerification,
        reviewModeration: fallback.reviewModeration,
        communityModeration: fallback.communityModeration,
        notificationTemplates: fallback.notificationTemplates,
        featureFlags: fallback.featureFlags,
        securityControls: fallback.securityControls,
        adminAccess: fallback.adminAccess,
        integrations: fallback.integrations,
        localization: fallback.localization,
      },
    });
    return { record: updated, settings: fallback };
  }

  const normalized = normalizePlatformSettings(parsed.data as PlatformSettings);
  return { record, settings: normalized };
};

export const updatePlatformSettings = async (payload: PlatformSettings) => {
  const parsed = platformSettingsSchema.parse(payload);
  const normalized = normalizePlatformSettings(parsed as PlatformSettings);

  const record = await prisma.platformSettings.upsert({
    where: { key: PLATFORM_SETTINGS_KEY },
    update: {
      platformFeeBps: normalized.platformFeeBps,
      taxBps: normalized.taxBps,
      businessFunctions: normalized.businessFunctions,
      payoutRules: normalized.payoutRules,
      disputePolicy: normalized.disputePolicy,
      orderRules: normalized.orderRules,
      providerVerification: normalized.providerVerification,
      reviewModeration: normalized.reviewModeration,
      communityModeration: normalized.communityModeration,
      notificationTemplates: normalized.notificationTemplates,
      featureFlags: normalized.featureFlags,
      securityControls: normalized.securityControls,
      adminAccess: normalized.adminAccess,
      integrations: normalized.integrations,
      localization: normalized.localization,
    },
    create: {
      key: PLATFORM_SETTINGS_KEY,
      platformFeeBps: normalized.platformFeeBps,
      taxBps: normalized.taxBps,
      businessFunctions: normalized.businessFunctions,
      payoutRules: normalized.payoutRules,
      disputePolicy: normalized.disputePolicy,
      orderRules: normalized.orderRules,
      providerVerification: normalized.providerVerification,
      reviewModeration: normalized.reviewModeration,
      communityModeration: normalized.communityModeration,
      notificationTemplates: normalized.notificationTemplates,
      featureFlags: normalized.featureFlags,
      securityControls: normalized.securityControls,
      adminAccess: normalized.adminAccess,
      integrations: normalized.integrations,
      localization: normalized.localization,
    },
  });

  return { record, settings: normalized };
};
