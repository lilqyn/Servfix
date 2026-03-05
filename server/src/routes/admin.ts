import { Router } from "express";
import { z } from "zod";
import { Prisma, SupportDepartment, SupportTicketPriority, UserRole } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { ADMIN_ROLES, canAssignRole, canManageRole } from "../utils/permissions.js";
import { env } from "../config.js";
import { createNotification } from "../utils/notifications.js";
import { sendEmail } from "../utils/email.js";
import { createSupportTicketEvent, formatTicketNumber } from "../utils/tickets.js";
import { defaultHomeContent, HOME_CONTENT_KEY } from "../utils/home-content.js";
import {
  DEFAULT_PAGES,
  PAGE_KEYS,
  type StaticPageContent,
  type StaticPageKey,
  type BlogPost,
  type StaffProfile,
  type AboutPageConfig,
  type ProviderResourcesContent,
  type ProviderResourceSection,
  type ProviderLaunchChecklistItem,
} from "../utils/pages.js";
import { normalizeS3Key, signS3Key } from "../utils/s3.js";
import {
  getPlatformSettings,
  updatePlatformSettings,
  type AdminPageKey,
  type BusinessFunctionKey,
} from "../utils/platform-settings.js";
import { logWarn } from "../observability/logger.js";
import {
  allocateDisbursementToOrders,
  markOrderReleaseApproved,
  resolveReviewDeadlineAt,
} from "../utils/order-flow.js";
import {
  evaluateProviderDeletionEligibility,
  softDeleteUserAccount,
  type ProviderDeletionEligibility,
} from "../utils/account-deletion.js";

export const adminRouter = Router();

const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const usersQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.enum(["active", "suspended", "deleted"]).optional(),
});

const providersQuerySchema = paginationSchema.extend({
  verificationStatus: z
    .enum(["unverified", "pending", "verified", "rejected"])
    .optional(),
});

const servicesQuerySchema = paginationSchema.extend({
  status: z.enum(["draft", "published", "suspended"]).optional(),
  search: z.string().trim().min(1).optional(),
});

const ordersQuerySchema = paginationSchema.extend({
  status: z
    .enum([
      "created",
      "payment_pending",
      "paid_to_escrow",
      "accepted",
      "in_progress",
      "delivery_submitted",
      "delivered",
      "release_approved",
      "approved",
      "released",
      "disbursement_initiated",
      "disbursed",
      "cancelled",
      "expired",
      "dispute_open",
      "disputed",
      "refund_pending",
      "refunded",
      "chargeback",
    ])
    .optional(),
});

const releaseRequestsQuerySchema = paginationSchema.extend({
  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
});

const reviewsQuerySchema = paginationSchema.extend({
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const communityQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
});

const reportsQuerySchema = paginationSchema.extend({
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
});

const disputesQuerySchema = paginationSchema.extend({
  status: z.enum(["open", "investigating", "resolved", "cancelled"]).optional(),
});

const supportTicketsQuerySchema = paginationSchema.extend({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  search: z.string().trim().min(1).optional(),
  department: z.nativeEnum(SupportDepartment).optional(),
  priority: z.nativeEnum(SupportTicketPriority).optional(),
  assignedRole: z.nativeEnum(UserRole).optional(),
  assignedUserId: z.string().uuid().optional(),
});

const payoutComplianceCasesQuerySchema = z.object({
  status: z
    .enum(["open", "investigating", "cleared", "escalated", "reported", "closed"])
    .optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  type: z.enum(["aml_payout", "sanctions_match"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const analyticsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional(),
});

const iconNameSchema = z.string().trim().min(1).max(40);

const heroContentSchema = z.object({
  badge: z.string().trim().min(1).max(120),
  headline: z.object({
    prefix: z.string().trim().min(1).max(120),
    highlight: z.string().trim().min(1).max(120),
    suffix: z.string().trim().min(1).max(120),
  }),
  subheadline: z.string().trim().min(1).max(400),
  primaryCta: z.object({
    label: z.string().trim().min(1).max(40),
    href: z.string().trim().min(1).max(120),
  }),
  secondaryCta: z.object({
    label: z.string().trim().min(1).max(40),
    href: z.string().trim().min(1).max(120),
  }),
  trustIndicators: z
    .array(
      z.object({
        icon: iconNameSchema,
        title: z.string().trim().min(1).max(60),
        subtitle: z.string().trim().min(1).max(80),
      }),
    )
    .min(1)
    .max(4),
  floatingCards: z.object({
    onlineTitle: z.string().trim().min(1).max(40),
    onlineSubtitle: z.string().trim().min(1).max(60),
    escrowTitle: z.string().trim().min(1).max(40),
    escrowSubtitle: z.string().trim().min(1).max(60),
    escrowIcon: iconNameSchema.optional(),
  }),
});

const categoryItemSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(80),
  icon: iconNameSchema,
  color: z.string().trim().min(1).max(60),
  keywords: z.array(z.string().trim().min(1).max(30)).max(12),
});

const categoriesContentSchema = z.object({
  badge: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().min(1).max(200),
  ctaLabel: z.string().trim().min(1).max(40),
  ctaHref: z.string().trim().min(1).max(120),
  items: z.array(categoryItemSchema).min(1).max(24),
});

const howItWorksStepSchema = z.object({
  number: z.string().trim().min(1).max(4),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(200),
  icon: iconNameSchema,
  color: z.string().trim().min(1).max(60),
});

const howItWorksContentSchema = z.object({
  badge: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().min(1).max(200),
  steps: z.array(howItWorksStepSchema).min(1).max(8),
});

const homeContentSchema = z.object({
  hero: heroContentSchema,
  categories: categoriesContentSchema,
  howItWorks: howItWorksContentSchema,
});

const pageContentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10000),
});

const blogPostSchema = z.object({
  title: z.string().trim().min(1).max(140),
  summary: z.string().trim().max(240).optional().nullable(),
  body: z.string().trim().max(5000),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  videoUrl: z.string().trim().url().max(500).optional().nullable(),
  publishedAt: z.string().trim().min(1).max(40),
});

const staffProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  bio: z.string().trim().max(600).optional().nullable(),
  photoUrl: z.string().trim().max(500).optional().nullable(),
});

const aboutFontOptionSchema = z.enum([
  "space_grotesk",
  "plus_jakarta_sans",
  "georgia_serif",
  "times_serif",
  "system_sans",
  "mono",
]);

const aboutPageConfigSchema = z.object({
  introLabel: z.string().trim().min(1).max(80),
  heroImageUrl: z.string().trim().max(500).optional().nullable(),
  missionTitle: z.string().trim().min(1).max(120),
  missionBody: z.string().trim().min(1).max(1200),
  missionBullets: z.array(z.string().trim().min(1).max(260)).min(1).max(12),
  whatWeDoTitle: z.string().trim().min(1).max(120),
  whatWeDoLeft: z.array(z.string().trim().min(1).max(260)).min(1).max(20),
  whatWeDoRight: z.array(z.string().trim().min(1).max(260)).min(1).max(20),
  visionTitle: z.string().trim().min(1).max(120),
  visionLeft: z.string().trim().min(1).max(1200),
  visionRight: z.array(z.string().trim().min(1).max(260)).min(1).max(12),
  headingFont: aboutFontOptionSchema,
  bodyFont: aboutFontOptionSchema,
});

const aboutPageSchema = pageContentSchema.extend({
  staff: z.array(staffProfileSchema).max(12).optional(),
  aboutConfig: aboutPageConfigSchema.optional(),
});

const blogPageSchema = pageContentSchema.extend({
  posts: z.array(blogPostSchema).max(20).optional(),
});

const providerResourceBlockSchema = z.object({
  heading: z.string().trim().min(1).max(160),
  items: z.array(z.string().trim().min(1).max(260)).min(1).max(20),
});

const providerResourceSectionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(300),
  blocks: z.array(providerResourceBlockSchema).min(1).max(12),
});

const providerChecklistKeySchema = z.enum([
  "profile_completed",
  "profile_photo_uploaded",
  "service_photos_uploaded",
  "pricing_calculated",
  "service_description_optimized",
  "payment_policy_understood",
  "cancellation_rules_reviewed",
  "tax_record_process_started",
]);

const providerChecklistItemSchema = z.object({
  key: providerChecklistKeySchema,
  label: z.string().trim().min(1).max(160),
  editable: z.boolean(),
});

const providerResourcesContentSchema = z.object({
  sections: z.array(providerResourceSectionSchema).min(1).max(24),
  checklistItems: z.array(providerChecklistItemSchema).min(1).max(16),
  advancedResources: z.array(z.string().trim().min(1).max(200)).max(20),
});

const providerResourcesPageSchema = pageContentSchema.extend({
  resourcesConfig: providerResourcesContentSchema.optional(),
});

const pagesSchema = z.object({
  about: aboutPageSchema,
  blog: blogPageSchema,
  academy: blogPageSchema,
  providerResources: providerResourcesPageSchema,
});

const requireBusinessFunctionAccess = (key: BusinessFunctionKey) =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const { settings } = await getPlatformSettings();
    const config = settings.businessFunctions[key];

    if (!config?.enabled) {
      return res.status(403).json({ error: "This function is currently disabled." });
    }

    if (!config.roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  });

const requireAdminPageAccess = (key: AdminPageKey) =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const { settings } = await getPlatformSettings();
    const roles = settings.adminAccess?.[key] ?? [];

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  });

const updateStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

const updateRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

const deleteUserParamsSchema = z.object({
  id: z.string().uuid(),
});

const staffInvitationsQuerySchema = z.object({
  status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const createStaffInvitationSchema = z.object({
  email: z.string().trim().email(),
  role: z.nativeEnum(UserRole),
});

const staffInvitationParamsSchema = z.object({
  id: z.string().uuid(),
});

const accountDeletionRequestsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const reviewAccountDeletionRequestSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const accountDeletionRequestParamsSchema = z.object({
  id: z.string().uuid(),
});

const updateProviderVerificationSchema = z.object({
  status: z.enum(["unverified", "pending", "verified", "rejected"]),
});

const updateServiceStatusSchema = z.object({
  status: z.enum(["draft", "published", "suspended"]),
});

const updateOrderStatusSchema = z.object({
  status: z.enum([
    "created",
    "payment_pending",
    "paid_to_escrow",
    "accepted",
    "in_progress",
    "delivery_submitted",
    "delivered",
    "release_approved",
    "approved",
    "released",
    "disbursement_initiated",
    "disbursed",
    "cancelled",
    "expired",
    "dispute_open",
    "disputed",
    "refund_pending",
    "refunded",
    "chargeback",
  ]),
  note: z.string().trim().max(500).optional(),
});

const updateReportStatusSchema = z.object({
  status: z.enum(["open", "resolved", "dismissed"]),
  note: z.string().trim().max(500).optional(),
});

const updateDisputeStatusSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "cancelled"]),
  resolution: z.enum(["refund", "release", "partial_refund", "deny"]).optional(),
  releaseAmountNet: z.coerce.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
});

const updateSupportTicketStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
});

const updateSupportTicketRoutingSchema = z.object({
  department: z.nativeEnum(SupportDepartment).optional(),
  priority: z.nativeEnum(SupportTicketPriority).optional(),
  assignedRole: z.nativeEnum(UserRole).nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
});

const supportTicketMessageSchema = z.object({
  message: z.string().trim().min(2).max(2000),
});

const supportTicketNoteSchema = z.object({
  message: z.string().trim().min(2).max(2000),
});

const supportTicketMeetingSchema = z.object({
  scheduledAt: z.string().trim().min(1),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  meetingUrl: z.string().trim().url().optional(),
  notes: z.string().trim().max(1000).optional(),
});

const updatePayoutComplianceCaseSchema = z.object({
  status: z.enum(["open", "investigating", "cleared", "escalated", "reported", "closed"]),
  assignedToId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(1000).optional(),
});

const STAFF_INVITE_TTL_DAYS = 7;
const STAFF_INVITABLE_ROLES: UserRole[] = ADMIN_ROLES.filter((role) => role !== "super_admin");
const STAFF_INVITABLE_ROLE_SET = new Set<UserRole>(STAFF_INVITABLE_ROLES);
const STAFF_DELETABLE_ROLE_SET = new Set<UserRole>(STAFF_INVITABLE_ROLES);
const appUrlBase = env.APP_URL.trim().replace(/\/+$/, "");
const staffInviteBaseUrl = `${appUrlBase.split("#")[0].replace(/\/+$/, "")}/#/staff-invite`;

const normalizeInviteEmail = (value: string) => value.trim().toLowerCase();

const createStaffInviteToken = () => randomBytes(32).toString("base64url");

const hashStaffInviteToken = (token: string) =>
  createHash("sha256").update(`staff-invite:${token}`).digest("hex");

const canInviteStaffRole = (targetRole: UserRole, actorRole: UserRole) =>
  (targetRole === "super_admin" || STAFF_INVITABLE_ROLE_SET.has(targetRole)) &&
  canAssignRole(actorRole, targetRole);

const canDeleteStaffRole = (targetRole: UserRole) => STAFF_DELETABLE_ROLE_SET.has(targetRole);

const formatRoleLabel = (role: UserRole) =>
  role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

type StaffInvitationRecord = {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  invitedBy: {
    id: string;
    email: string | null;
    username: string | null;
  };
  acceptedBy: {
    id: string;
    email: string | null;
    username: string | null;
  } | null;
};

const getStaffInvitationStatus = (
  invitation: Pick<StaffInvitationRecord, "acceptedAt" | "revokedAt" | "expiresAt">,
  now: Date,
) => {
  if (invitation.acceptedAt) {
    return "accepted" as const;
  }
  if (invitation.revokedAt) {
    return "revoked" as const;
  }
  if (invitation.expiresAt <= now) {
    return "expired" as const;
  }
  return "pending" as const;
};

const serializeStaffInvitation = (invitation: StaffInvitationRecord, now = new Date()) => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  status: getStaffInvitationStatus(invitation, now),
  expiresAt: invitation.expiresAt,
  acceptedAt: invitation.acceptedAt,
  revokedAt: invitation.revokedAt,
  createdAt: invitation.createdAt,
  invitedBy: invitation.invitedBy,
  acceptedBy: invitation.acceptedBy,
});

const accountDeletionRequestSelect = {
  id: true,
  status: true,
  reason: true,
  requestedAt: true,
  reviewedAt: true,
  reviewNote: true,
  user: {
    select: {
      id: true,
      role: true,
      status: true,
      email: true,
      username: true,
      phone: true,
      providerProfile: {
        select: { displayName: true },
      },
    },
  },
  reviewedBy: {
    select: {
      id: true,
      email: true,
      username: true,
    },
  },
} satisfies Prisma.AccountDeletionRequestSelect;

type AccountDeletionRequestRecord = {
  id: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  user: {
    id: string;
    role: UserRole;
    status: "active" | "suspended" | "deleted";
    email: string | null;
    username: string | null;
    phone: string | null;
    providerProfile: {
      displayName: string;
    } | null;
  };
  reviewedBy: {
    id: string;
    email: string | null;
    username: string | null;
  } | null;
};

const serializeAccountDeletionRequest = (
  request: AccountDeletionRequestRecord,
  eligibility: ProviderDeletionEligibility | null = null,
) => ({
  id: request.id,
  status: request.status,
  reason: request.reason,
  requestedAt: request.requestedAt,
  reviewedAt: request.reviewedAt,
  reviewNote: request.reviewNote,
  user: request.user,
  reviewedBy: request.reviewedBy,
  eligibility,
});

const buildAdminTrend = async (months: number, locale: string, timeZone: string) => {
  const now = new Date();
  const formatLabel = (date: Date) => {
    try {
      return new Intl.DateTimeFormat(locale, { month: "short", timeZone }).format(date);
    } catch {
      return date.toLocaleDateString("en-US", { month: "short" });
    }
  };
  const ranges = Array.from({ length: months }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = formatLabel(date);
    return { key, label, start, end };
  });

  const series = [];
  for (const range of ranges) {
    const [
      users,
      orders,
      orderRevenue,
      posts,
      reviews,
    ] = await prisma.$transaction([
      prisma.user.count({ where: { createdAt: { gte: range.start, lt: range.end } } }),
      prisma.order.count({ where: { createdAt: { gte: range.start, lt: range.end } } }),
      prisma.order.aggregate({
        where: { createdAt: { gte: range.start, lt: range.end } },
        _sum: { amountGross: true, platformFee: true },
      }),
      prisma.communityPost.count({ where: { createdAt: { gte: range.start, lt: range.end } } }),
      prisma.review.count({ where: { createdAt: { gte: range.start, lt: range.end } } }),
    ]);

    series.push({
      key: range.key,
      label: range.label,
      users,
      orders,
      posts,
      reviews,
      gross: orderRevenue._sum.amountGross?.toString() ?? "0",
      platformFee: orderRevenue._sum.platformFee?.toString() ?? "0",
    });
  }

  return series;
};

const payoutNetworkMap: Record<string, string> = {
  mtn: "MTN",
  vodafone: "VOD",
  airteltigo: "TGO",
};

const paystackPayoutNetworkMap: Record<string, string> = {
  mtn: "MTN",
  vodafone: "VOD",
  airteltigo: "ATL",
};

const normalizeMomoNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return digits;
  if (digits.startsWith("233") && digits.length >= 12) {
    const local = digits.slice(3);
    return local.startsWith("0") ? local : `0${local}`;
  }
  return digits;
};

const getPayoutFailureReason = (metadata: Prisma.JsonValue | null): string | null => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const meta = metadata as Record<string, unknown>;
  const payload = meta.payload && typeof meta.payload === "object" ? (meta.payload as Record<string, unknown>) : null;
  if (!payload) {
    return null;
  }
  if (typeof payload.error === "string") {
    return payload.error;
  }
  if (typeof payload.message === "string") {
    return payload.message;
  }
  const transfer = payload.transfer && typeof payload.transfer === "object"
    ? (payload.transfer as Record<string, unknown>)
    : null;
  if (transfer && typeof transfer.message === "string") {
    return transfer.message;
  }
  return null;
};

const extractDisputeEvidence = (payload: Prisma.JsonValue | null): string[] => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const record = payload as Record<string, unknown>;
  const evidence = record.evidence;
  if (!Array.isArray(evidence)) {
    return [];
  }
  return evidence.filter((item): item is string => typeof item === "string" && item.length > 0);
};

const OPEN_PAYOUT_COMPLIANCE_STATUSES = ["open", "investigating", "escalated", "reported"] as const;

const serializePayoutComplianceCase = (
  item: {
    id: string;
    type: "aml_payout" | "sanctions_match";
    status: "open" | "investigating" | "cleared" | "escalated" | "reported" | "closed";
    severity: "low" | "medium" | "high" | "critical";
    riskScore: number | null;
    title: string;
    summary: string | null;
    reasons: string[];
    metadata: Prisma.JsonValue | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    provider: {
      id: string;
      email: string | null;
      phone: string | null;
      username: string | null;
      providerProfile: {
        displayName: string;
        verificationStatus: "unverified" | "pending" | "verified" | "rejected";
      } | null;
    };
    payoutRequest: {
      id: string;
      amount: Prisma.Decimal;
      currency: "GHS" | "USD" | "EUR";
      status: "requested" | "processing" | "paid" | "failed" | "cancelled";
      createdAt: Date;
      destinationMomo: string;
      momoNetwork: "mtn" | "vodafone" | "airteltigo" | null;
    } | null;
    screening: {
      id: string;
      status: "pending" | "clear" | "possible_match" | "confirmed_match" | "error";
      matchScore: number;
      watchlistSource: string | null;
      screenedAt: Date;
      reviewedAt: Date | null;
    } | null;
    assignedTo: { id: string; email: string | null; username: string | null } | null;
    createdBy: { id: string; email: string | null; username: string | null } | null;
    closedBy: { id: string; email: string | null; username: string | null } | null;
  },
) => ({
  id: item.id,
  type: item.type,
  status: item.status,
  severity: item.severity,
  riskScore: item.riskScore,
  title: item.title,
  summary: item.summary,
  reasons: item.reasons,
  metadata: item.metadata,
  resolvedAt: item.resolvedAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  provider: item.provider,
  payoutRequest: item.payoutRequest
    ? {
        id: item.payoutRequest.id,
        amount: item.payoutRequest.amount.toString(),
        currency: item.payoutRequest.currency,
        status: item.payoutRequest.status,
        createdAt: item.payoutRequest.createdAt,
        destinationMomo: item.payoutRequest.destinationMomo,
        momoNetwork: item.payoutRequest.momoNetwork,
      }
    : null,
  screening: item.screening,
  assignedTo: item.assignedTo,
  createdBy: item.createdBy,
  closedBy: item.closedBy,
});

const initiateFlutterwaveTransfer = async (params: {
  amount: Prisma.Decimal;
  currency: string;
  momoNumber: string;
  momoNetwork: string;
  reference: string;
  narration: string;
  secretKey: string;
}) => {
  if (!params.secretKey) {
    throw new Error("Flutterwave is not configured.");
  }

  const bankCode = payoutNetworkMap[params.momoNetwork];
  if (!bankCode) {
    throw new Error("Unsupported mobile money network.");
  }

  const response = await fetch("https://api.flutterwave.com/v3/transfers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account_bank: bankCode,
      account_number: params.momoNumber,
      amount: Number(params.amount.toFixed(2)),
      currency: params.currency,
      narration: params.narration,
      reference: params.reference,
    }),
  });

  const payload = (await response.json()) as {
    status?: string;
    message?: string;
    data?: { id?: number | string; status?: string; reference?: string };
  };

  if (!response.ok || payload.status !== "success") {
    throw new Error(payload.message ?? "Flutterwave transfer failed.");
  }

  return payload;
};

const createPaystackRecipient = async (params: {
  momoNumber: string;
  momoNetwork: string;
  name: string;
  currency: string;
  secretKey: string;
}) => {
  if (!params.secretKey) {
    throw new Error("Paystack is not configured.");
  }
  const bankCode = paystackPayoutNetworkMap[params.momoNetwork];
  if (!bankCode) {
    throw new Error("Unsupported mobile money network.");
  }
  const normalizedNumber = normalizeMomoNumber(params.momoNumber);
  if (!normalizedNumber) {
    throw new Error("Invalid mobile money number.");
  }

  const response = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "mobile_money",
      name: params.name,
      account_number: normalizedNumber,
      bank_code: bankCode,
      currency: params.currency,
    }),
  });

  const payload = (await response.json()) as {
    status?: boolean;
    message?: string;
    data?: { recipient_code?: string };
  };

  if (!response.ok || !payload.status || !payload.data?.recipient_code) {
    throw new Error(payload.message ?? "Paystack transfer recipient failed.");
  }

  return { recipientCode: payload.data.recipient_code, payload };
};

const initiatePaystackTransfer = async (params: {
  amount: Prisma.Decimal;
  currency: string;
  momoNumber: string;
  momoNetwork: string;
  reference: string;
  narration: string;
  name: string;
  secretKey: string;
}) => {
  if (!params.secretKey) {
    throw new Error("Paystack is not configured.");
  }

  const { recipientCode, payload: recipientPayload } = await createPaystackRecipient({
    momoNumber: params.momoNumber,
    momoNetwork: params.momoNetwork,
    name: params.name,
    currency: params.currency,
    secretKey: params.secretKey,
  });

  const amountMinor = Number(params.amount.mul(100).toFixed(0));
  const response = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: amountMinor,
      recipient: recipientCode,
      reference: params.reference,
      reason: params.narration,
    }),
  });

  const payload = (await response.json()) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; transfer_code?: string; id?: number | string };
  };

  if (!response.ok || !payload.status) {
    throw new Error(payload.message ?? "Paystack transfer failed.");
  }

  return { transfer: payload, recipient: recipientPayload };
};

const logAdminAction = async (params: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Prisma.InputJsonValue;
}) => {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      payload: params.payload,
    },
  });
};

adminRouter.get(
  "/overview",
  authRequired,
  requirePermission("admin.access"),
  requireAdminPageAccess("overview"),
  asyncHandler(async (_req, res) => {
    const [users, providers, services, orders, reviews, posts, reports, disputes] =
      await prisma.$transaction([
        prisma.user.count(),
        prisma.user.count({ where: { role: "provider" } }),
        prisma.service.count(),
        prisma.order.count(),
        prisma.review.count(),
        prisma.communityPost.count(),
        prisma.report.count(),
        prisma.dispute.count(),
      ]);

    res.json({
      totals: {
        users,
        providers,
        services,
        orders,
        reviews,
        posts,
        reports,
        disputes,
      },
    });
  }),
);

adminRouter.get(
  "/navigation",
  authRequired,
  requirePermission("admin.access"),
  asyncHandler(async (_req, res) => {
    const { settings } = await getPlatformSettings();

    res.json({
      businessFunctions: settings.businessFunctions,
      featureFlags: settings.featureFlags,
      adminAccess: settings.adminAccess,
    });
  }),
);

adminRouter.get(
  "/users",
  authRequired,
  requirePermission("users.read"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const query = usersQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = {};
    if (query.role) {
      where.role = query.role;
    }
    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
        { username: { contains: query.search, mode: "insensitive" } },
        {
          providerProfile: {
            is: {
              displayName: { contains: query.search, mode: "insensitive" },
            },
          },
        },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
        providerProfile: { select: { displayName: true } },
      },
    });

    const hasNext = users.length > limit;
    const trimmed = hasNext ? users.slice(0, limit) : users;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ users: trimmed, nextCursor });
  }),
);

adminRouter.patch(
  "/users/:id/status",
  authRequired,
  requirePermission("users.write"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateStatusSchema.parse(req.body);

    if (params.id === req.user!.id) {
      return res.status(400).json({ error: "You cannot change your own status." });
    }

    const existing = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!canManageRole(req.user!.role, existing.role)) {
      return res.status(403).json({ error: "You cannot change this user's status." });
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: { status: data.status },
      select: { id: true, status: true },
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "user.status.update",
      entityType: "User",
      entityId: user.id,
      payload: { status: data.status },
    });

    res.json({ user });
  }),
);

adminRouter.patch(
  "/users/:id/role",
  authRequired,
  requirePermission("users.role"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateRoleSchema.parse(req.body);

    if (params.id === req.user!.id) {
      return res.status(400).json({ error: "You cannot change your own role." });
    }

    const existing = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!canManageRole(req.user!.role, existing.role)) {
      return res.status(403).json({ error: "You cannot change this user's role." });
    }

    if (!canAssignRole(req.user!.role, data.role)) {
      return res.status(403).json({ error: "You cannot assign this role." });
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: { role: data.role },
      select: { id: true, role: true },
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "user.role.update",
      entityType: "User",
      entityId: user.id,
      payload: { role: data.role },
    });

    res.json({ user });
  }),
);

adminRouter.post(
  "/users/:id/delete",
  authRequired,
  requirePermission("users.write"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const params = deleteUserParamsSchema.parse(req.params);

    if (params.id === req.user!.id) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!target) {
      return res.status(404).json({ error: "User not found." });
    }

    if (target.status === "deleted") {
      return res.status(400).json({ error: "Account already deleted." });
    }

    if (!canManageRole(req.user!.role, target.role)) {
      return res.status(403).json({ error: "You cannot delete this staff account." });
    }

    if (!canDeleteStaffRole(target.role)) {
      return res.status(400).json({
        error: "Only staff accounts can be deleted from this action.",
      });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.accountDeletionRequest.create({
        data: {
          userId: target.id,
          status: "approved",
          requestedAt: now,
          reviewedAt: now,
          reviewedById: req.user!.id,
          reviewNote: "Admin-initiated staff offboarding deletion.",
        },
      });

      await softDeleteUserAccount(tx, target.id, { now });
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "user.staff.delete",
      entityType: "User",
      entityId: target.id,
      payload: {
        role: target.role,
      },
    });

    res.json({
      user: {
        id: target.id,
        status: "deleted",
      },
    });
  }),
);

adminRouter.post(
  "/staff-invitations",
  authRequired,
  requirePermission("users.role"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const data = createStaffInvitationSchema.parse(req.body);

    if (!canInviteStaffRole(data.role, req.user!.role)) {
      return res.status(403).json({ error: "You cannot invite this role." });
    }

    const now = new Date();
    const email = normalizeInviteEmail(data.email);
    const token = createStaffInviteToken();
    const tokenHash = hashStaffInviteToken(token);
    const expiresAt = new Date(now.getTime() + STAFF_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await prisma.$transaction(async (tx) => {
      await tx.staffInvitation.updateMany({
        where: {
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      return tx.staffInvitation.create({
        data: {
          email,
          role: data.role,
          tokenHash,
          invitedById: req.user!.id,
          expiresAt,
        },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          createdAt: true,
          invitedBy: { select: { id: true, email: true, username: true } },
          acceptedBy: { select: { id: true, email: true, username: true } },
        },
      });
    });

    const inviteUrl = `${staffInviteBaseUrl}?token=${encodeURIComponent(token)}`;
    const invitedRoleLabel = formatRoleLabel(data.role);
    const inviterName = req.user!.username ?? req.user!.email ?? "Servfix admin";
    const subject = `Servfix staff invitation (${invitedRoleLabel})`;
    const text = [
      "You have been invited to join Servfix staff.",
      "",
      `Role: ${invitedRoleLabel}`,
      `Invited by: ${inviterName}`,
      "",
      `Accept invitation: ${inviteUrl}`,
      "",
      `This link expires on ${expiresAt.toISOString()}.`,
      "If you were not expecting this invitation, you can ignore this email.",
    ].join("\n");

    let emailResult: Awaited<ReturnType<typeof sendEmail>>;
    try {
      emailResult = await sendEmail({
        to: email,
        subject,
        text,
        tag: "staff_invitation",
        metadata: {
          invitationId: invitation.id,
          role: data.role,
          inviterId: req.user!.id,
        },
      });
    } catch (error) {
      await prisma.staffInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
      });
      logWarn("staff_invitation_email_send_failed", {
        invitationId: invitation.id,
        inviterId: req.user!.id,
        inviteeEmail: email,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      return res
        .status(503)
        .json({ error: "Staff invitation email delivery failed. Check email integration settings." });
    }

    if (!emailResult.sent) {
      await prisma.staffInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
      });
      return res.status(503).json({ error: "Staff invitation email delivery is not configured." });
    }

    await logAdminAction({
      actorId: req.user!.id,
      action: "staff.invitation.create",
      entityType: "StaffInvitation",
      entityId: invitation.id,
      payload: {
        email,
        role: data.role,
        expiresAt: expiresAt.toISOString(),
      },
    });

    res.status(201).json({ invitation: serializeStaffInvitation(invitation, now) });
  }),
);

adminRouter.get(
  "/staff-invitations",
  authRequired,
  requirePermission("users.read"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const query = staffInvitationsQuerySchema.parse(req.query);
    const limit = query.limit ?? 100;
    const now = new Date();

    const where: Prisma.StaffInvitationWhereInput = {};
    if (query.status === "pending") {
      where.acceptedAt = null;
      where.revokedAt = null;
      where.expiresAt = { gt: now };
    } else if (query.status === "accepted") {
      where.acceptedAt = { not: null };
    } else if (query.status === "revoked") {
      where.revokedAt = { not: null };
    } else if (query.status === "expired") {
      where.acceptedAt = null;
      where.revokedAt = null;
      where.expiresAt = { lte: now };
    }

    const invitations = await prisma.staffInvitation.findMany({
      where,
      take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        invitedBy: { select: { id: true, email: true, username: true } },
        acceptedBy: { select: { id: true, email: true, username: true } },
      },
    });
    const invitableRoles: UserRole[] = [
      ...STAFF_INVITABLE_ROLES.filter((role) => canInviteStaffRole(role, req.user!.role)),
      ...(canInviteStaffRole("super_admin", req.user!.role) ? (["super_admin"] as const) : []),
    ];

    res.json({
      invitations: invitations.map((invitation) => serializeStaffInvitation(invitation, now)),
      invitableRoles,
    });
  }),
);

adminRouter.patch(
  "/staff-invitations/:id/revoke",
  authRequired,
  requirePermission("users.role"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const params = staffInvitationParamsSchema.parse(req.params);
    const now = new Date();

    const existing = await prisma.staffInvitation.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        invitedBy: { select: { id: true, email: true, username: true } },
        acceptedBy: { select: { id: true, email: true, username: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Staff invitation not found." });
    }

    if (!canInviteStaffRole(existing.role, req.user!.role)) {
      return res.status(403).json({ error: "You cannot revoke this invitation." });
    }

    if (existing.acceptedAt) {
      return res.status(400).json({ error: "Accepted invitations cannot be revoked." });
    }

    if (existing.revokedAt) {
      return res.json({ invitation: serializeStaffInvitation(existing, now) });
    }

    const invitation = await prisma.staffInvitation.update({
      where: { id: params.id },
      data: { revokedAt: now },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        invitedBy: { select: { id: true, email: true, username: true } },
        acceptedBy: { select: { id: true, email: true, username: true } },
      },
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "staff.invitation.revoke",
      entityType: "StaffInvitation",
      entityId: invitation.id,
      payload: {
        email: invitation.email,
        role: invitation.role,
      },
    });

    res.json({ invitation: serializeStaffInvitation(invitation, now) });
  }),
);

adminRouter.get(
  "/account-deletion-requests",
  authRequired,
  requirePermission("users.read"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const query = accountDeletionRequestsQuerySchema.parse(req.query);
    const limit = query.limit ?? 100;
    const where: Prisma.AccountDeletionRequestWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }

    const requests = await prisma.accountDeletionRequest.findMany({
      where,
      take: limit,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      select: accountDeletionRequestSelect,
    });

    const eligibilityByRequestId = new Map<string, ProviderDeletionEligibility>();
    await Promise.all(
      requests.map(async (request) => {
        if (request.status !== "pending" || request.user.role !== "provider") {
          return;
        }
        const eligibility = await evaluateProviderDeletionEligibility(prisma, request.user.id);
        eligibilityByRequestId.set(request.id, eligibility);
      }),
    );

    res.json({
      requests: requests.map((request) =>
        serializeAccountDeletionRequest(
          request,
          eligibilityByRequestId.get(request.id) ?? null,
        ),
      ),
    });
  }),
);

adminRouter.post(
  "/account-deletion-requests/:id/approve",
  authRequired,
  requirePermission("users.write"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const params = accountDeletionRequestParamsSchema.parse(req.params);
    const data = reviewAccountDeletionRequestSchema.parse(req.body ?? {});

    const request = await prisma.accountDeletionRequest.findUnique({
      where: { id: params.id },
      select: accountDeletionRequestSelect,
    });

    if (!request) {
      return res.status(404).json({ error: "Account deletion request not found." });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: "Only pending requests can be approved." });
    }

    if (request.user.role !== "provider") {
      return res.status(400).json({ error: "Only provider deletion requests require approval." });
    }

    const eligibility = await evaluateProviderDeletionEligibility(prisma, request.user.id);
    if (!eligibility.eligible) {
      return res.status(409).json({
        error: "Provider does not qualify for deletion yet.",
        eligibility,
      });
    }

    const now = new Date();
    let reviewedRequest: AccountDeletionRequestRecord;

    try {
      reviewedRequest = await prisma.$transaction(async (tx) => {
        const updated = await tx.accountDeletionRequest.updateMany({
          where: {
            id: params.id,
            status: "pending",
          },
          data: {
            status: "approved",
            reviewedAt: now,
            reviewedById: req.user!.id,
            reviewNote: data.note?.trim() || null,
          },
        });

        if (updated.count === 0) {
          throw new Error("account_deletion_request_already_reviewed");
        }

        const nextReviewedRequest = await tx.accountDeletionRequest.findUnique({
          where: { id: params.id },
          select: accountDeletionRequestSelect,
        });

        if (!nextReviewedRequest) {
          throw new Error("account_deletion_request_not_found_after_update");
        }

        await softDeleteUserAccount(tx, request.user.id, { now });
        return nextReviewedRequest;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "account_deletion_request_already_reviewed") {
        return res.status(409).json({ error: "This request has already been reviewed." });
      }
      throw error;
    }

    await logAdminAction({
      actorId: req.user!.id,
      action: "account.deletion.approve",
      entityType: "AccountDeletionRequest",
      entityId: reviewedRequest.id,
      payload: {
        userId: request.user.id,
        role: request.user.role,
        note: data.note?.trim() || null,
      },
    });

    res.json({
      request: serializeAccountDeletionRequest(reviewedRequest, eligibility),
    });
  }),
);

adminRouter.post(
  "/account-deletion-requests/:id/reject",
  authRequired,
  requirePermission("users.write"),
  requireAdminPageAccess("users"),
  requireBusinessFunctionAccess("human_resources"),
  asyncHandler(async (req, res) => {
    const params = accountDeletionRequestParamsSchema.parse(req.params);
    const data = reviewAccountDeletionRequestSchema.parse(req.body ?? {});
    const now = new Date();

    const existing = await prisma.accountDeletionRequest.findUnique({
      where: { id: params.id },
      select: accountDeletionRequestSelect,
    });

    if (!existing) {
      return res.status(404).json({ error: "Account deletion request not found." });
    }

    if (existing.status !== "pending") {
      return res.status(400).json({ error: "Only pending requests can be rejected." });
    }

    const updated = await prisma.accountDeletionRequest.update({
      where: { id: params.id },
      data: {
        status: "rejected",
        reviewedAt: now,
        reviewedById: req.user!.id,
        reviewNote: data.note?.trim() || null,
      },
      select: accountDeletionRequestSelect,
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "account.deletion.reject",
      entityType: "AccountDeletionRequest",
      entityId: updated.id,
      payload: {
        userId: existing.user.id,
        role: existing.user.role,
        note: data.note?.trim() || null,
      },
    });

    res.json({
      request: serializeAccountDeletionRequest(updated, null),
    });
  }),
);

adminRouter.get(
  "/providers",
  authRequired,
  requirePermission("providers.read"),
  requireAdminPageAccess("providers"),
  asyncHandler(async (req, res) => {
    const query = providersQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = { role: "provider" };
    if (query.verificationStatus) {
      where.providerProfile = { is: { verificationStatus: query.verificationStatus } };
    }

    const providers = await prisma.user.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        status: true,
        createdAt: true,
        providerProfile: true,
      },
    });

    const hasNext = providers.length > limit;
    const trimmed = hasNext ? providers.slice(0, limit) : providers;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ providers: trimmed, nextCursor });
  }),
);

adminRouter.patch(
  "/providers/:id/verification",
  authRequired,
  requirePermission("providers.verify"),
  requireAdminPageAccess("providers"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateProviderVerificationSchema.parse(req.body);

    const provider = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true, providerProfile: { select: { userId: true } } },
    });

    if (!provider || provider.role !== "provider") {
      return res.status(404).json({ error: "Provider not found" });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: {
        providerProfile: provider.providerProfile
          ? { update: { verificationStatus: data.status } }
          : { create: { displayName: "Provider", categories: [], verificationStatus: data.status } },
      },
      select: { id: true, providerProfile: true },
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "provider.verification.update",
      entityType: "ProviderProfile",
      entityId: updated.id,
      payload: { status: data.status },
    });

    res.json({ provider: updated });
  }),
);

adminRouter.get(
  "/services",
  authRequired,
  requirePermission("services.read"),
  requireAdminPageAccess("services"),
  asyncHandler(async (req, res) => {
    const query = servicesQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.ServiceWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { category: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const services = await prisma.service.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        createdAt: true,
        provider: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            providerProfile: { select: { displayName: true } },
          },
        },
      },
    });

    const hasNext = services.length > limit;
    const trimmed = hasNext ? services.slice(0, limit) : services;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ services: trimmed, nextCursor });
  }),
);

adminRouter.patch(
  "/services/:id/status",
  authRequired,
  requirePermission("services.moderate"),
  requireAdminPageAccess("services"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateServiceStatusSchema.parse(req.body);

    const service = await prisma.service.update({
      where: { id: params.id },
      data: { status: data.status },
      select: { id: true, status: true },
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "service.status.update",
      entityType: "Service",
      entityId: service.id,
      payload: { status: data.status },
    });

    res.json({ service });
  }),
);

adminRouter.get(
  "/orders",
  authRequired,
  requirePermission("orders.read"),
  requireAdminPageAccess("orders"),
  asyncHandler(async (req, res) => {
    const query = ordersQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.OrderWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }

    const orders = await prisma.order.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        service: { select: { id: true, title: true } },
        buyer: { select: { id: true, email: true, phone: true, username: true } },
        provider: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            providerProfile: { select: { displayName: true } },
          },
        },
      },
    });

    const hasNext = orders.length > limit;
    const trimmed = hasNext ? orders.slice(0, limit) : orders;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ orders: trimmed, nextCursor });
  }),
);

adminRouter.get(
  "/orders/release-requests",
  authRequired,
  requirePermission("orders.read"),
  requireAdminPageAccess("orders"),
  asyncHandler(async (req, res) => {
    const query = releaseRequestsQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.OrderReleaseRequestWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }

    const requests = await prisma.orderReleaseRequest.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        requestedBy: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            providerProfile: { select: { displayName: true } },
          },
        },
        order: {
          select: {
            id: true,
            amountPaidNet: true,
            amountReleasedNet: true,
            currency: true,
            service: { select: { id: true, title: true } },
            buyer: { select: { id: true, email: true, phone: true, username: true } },
            provider: {
              select: {
                id: true,
                email: true,
                phone: true,
                username: true,
                providerProfile: { select: { displayName: true } },
              },
            },
          },
        },
      },
    });

    const hasNext = requests.length > limit;
    const trimmed = hasNext ? requests.slice(0, limit) : requests;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ requests: trimmed, nextCursor });
  }),
);

adminRouter.patch(
  "/orders/:id/status",
  authRequired,
  requirePermission("orders.update"),
  requireAdminPageAccess("orders"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateOrderStatusSchema.parse(req.body);

  const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        providerId: true,
        amountGross: true,
        amountNetProvider: true,
        amountPaid: true,
        amountPaidNet: true,
        amountReleasedNet: true,
        amountDisbursedNet: true,
        currency: true,
        depositAmount: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const timestampUpdates: Prisma.OrderUpdateInput = {};
    const now = new Date();
    if (data.status === "accepted") timestampUpdates.acceptedAt = now;
    if (data.status === "delivery_submitted") {
      timestampUpdates.deliverySubmittedAt = now;
      timestampUpdates.reviewDeadlineAt = resolveReviewDeadlineAt(order.amountGross, now);
    }
    if (data.status === "delivered") timestampUpdates.deliveredAt = now;
    if (data.status === "dispute_open") timestampUpdates.disputeOpenedAt = now;
    if (data.status === "release_approved") {
      timestampUpdates.approvedAt = now;
      timestampUpdates.releasedAt = now;
    }
    if (data.status === "approved") timestampUpdates.approvedAt = now;
    if (data.status === "released") timestampUpdates.releasedAt = now;
    if (data.status === "disbursed") timestampUpdates.disbursedAt = now;
    if (data.status === "cancelled") timestampUpdates.cancelledAt = now;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: params.id },
        data: {
          status: data.status,
          ...timestampUpdates,
          events: {
            create: {
              type: "admin_action",
              payload: {
                previousStatus: order.status,
                nextStatus: data.status,
                note: data.note ?? null,
              },
            },
          },
        },
        select: { id: true, status: true },
      });

      if (data.status === "paid_to_escrow" && order.amountGross.greaterThan(0)) {
        const targetPaid =
          order.depositAmount && order.depositAmount.greaterThan(0)
            ? order.depositAmount
            : order.amountGross;

        const paidRatio = order.amountGross.equals(0)
          ? new Prisma.Decimal(0)
          : targetPaid.div(order.amountGross);
        const targetPaidNet = order.amountNetProvider.mul(paidRatio);

        const paidDelta = targetPaid.sub(order.amountPaid);
        const paidNetDelta = targetPaidNet.sub(order.amountPaidNet);

        if (paidDelta.greaterThan(0) || paidNetDelta.greaterThan(0)) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              amountPaid: paidDelta.greaterThan(0) ? targetPaid : undefined,
              amountPaidNet: paidNetDelta.greaterThan(0) ? targetPaidNet : undefined,
            },
          });

          if (paidNetDelta.greaterThan(0)) {
            await tx.providerWallet.upsert({
              where: { providerId: order.providerId },
              create: {
                providerId: order.providerId,
                availableBalance: new Prisma.Decimal(0),
                pendingBalance: paidNetDelta,
                currency: order.currency,
              },
              update: {
                pendingBalance: { increment: paidNetDelta },
              },
            });
          }
        }
      }

      if (
        ["release_approved", "released"].includes(data.status) &&
        !["release_approved", "released", "disbursed"].includes(order.status)
      ) {
        await markOrderReleaseApproved(tx, {
          orderId: order.id,
          actorId: req.user!.id,
          source: "admin",
        });

        if (data.status === "released") {
          await tx.order.update({
            where: { id: order.id },
            data: { status: "released" },
          });
        }
      }

      return next;
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "order.status.update",
      entityType: "Order",
      entityId: updated.id,
      payload: { from: order.status, to: data.status, note: data.note ?? null },
    });

    res.json({ order: updated });
  }),
);

adminRouter.get(
  "/reviews",
  authRequired,
  requirePermission("reviews.read"),
  requireAdminPageAccess("reviews"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const query = reviewsQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.ReviewWhereInput = {};
    if (query.rating) {
      where.rating = query.rating;
    }

    const reviews = await prisma.review.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        service: { select: { id: true, title: true } },
        author: { select: { id: true, email: true, phone: true, username: true } },
        provider: { select: { id: true, username: true } },
      },
    });

    const hasNext = reviews.length > limit;
    const trimmed = hasNext ? reviews.slice(0, limit) : reviews;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ reviews: trimmed, nextCursor });
  }),
);

adminRouter.delete(
  "/reviews/:id",
  authRequired,
  requirePermission("reviews.moderate"),
  requireAdminPageAccess("reviews"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    await prisma.review.delete({ where: { id: params.id } });

    await logAdminAction({
      actorId: req.user!.id,
      action: "review.delete",
      entityType: "Review",
      entityId: params.id,
    });

    res.status(204).send();
  }),
);

adminRouter.get(
  "/community/posts",
  authRequired,
  requirePermission("community.read"),
  requireAdminPageAccess("community"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const query = communityQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.CommunityPostWhereInput = {};
    if (query.search) {
      where.content = { contains: query.search, mode: "insensitive" };
    }

    const posts = await prisma.communityPost.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        author: { select: { id: true, username: true, email: true, phone: true } },
        _count: { select: { comments: true, likes: true, saves: true } },
      },
    });

    const hasNext = posts.length > limit;
    const trimmed = hasNext ? posts.slice(0, limit) : posts;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ posts: trimmed, nextCursor });
  }),
);

adminRouter.delete(
  "/community/posts/:id",
  authRequired,
  requirePermission("community.moderate"),
  requireAdminPageAccess("community"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    await prisma.communityPost.delete({ where: { id: params.id } });

    await logAdminAction({
      actorId: req.user!.id,
      action: "community.post.delete",
      entityType: "CommunityPost",
      entityId: params.id,
    });

    res.status(204).send();
  }),
);

adminRouter.get(
  "/community/comments",
  authRequired,
  requirePermission("community.read"),
  requireAdminPageAccess("community"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const query = communityQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.CommunityPostCommentWhereInput = {};
    if (query.search) {
      where.content = { contains: query.search, mode: "insensitive" };
    }

    const comments = await prisma.communityPostComment.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        author: { select: { id: true, username: true, email: true, phone: true } },
        post: { select: { id: true, content: true } },
      },
    });

    const hasNext = comments.length > limit;
    const trimmed = hasNext ? comments.slice(0, limit) : comments;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ comments: trimmed, nextCursor });
  }),
);

adminRouter.delete(
  "/community/comments/:id",
  authRequired,
  requirePermission("community.moderate"),
  requireAdminPageAccess("community"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    await prisma.communityPostComment.delete({ where: { id: params.id } });

    await logAdminAction({
      actorId: req.user!.id,
      action: "community.comment.delete",
      entityType: "CommunityPostComment",
      entityId: params.id,
    });

    res.status(204).send();
  }),
);

adminRouter.get(
  "/reports",
  authRequired,
  requirePermission("reports.read"),
  requireAdminPageAccess("reports"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const query = reportsQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.ReportWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }

    const reports = await prisma.report.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        reporter: { select: { id: true, email: true, phone: true, username: true } },
        resolvedBy: { select: { id: true, email: true, username: true } },
      },
    });

    const hasNext = reports.length > limit;
    const trimmed = hasNext ? reports.slice(0, limit) : reports;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ reports: trimmed, nextCursor });
  }),
);

adminRouter.patch(
  "/reports/:id/status",
  authRequired,
  requirePermission("reports.update"),
  requireAdminPageAccess("reports"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateReportStatusSchema.parse(req.body);

    const report = await prisma.report.update({
      where: { id: params.id },
      data: {
        status: data.status,
        resolvedAt: data.status === "open" ? null : new Date(),
        resolvedById: data.status === "open" ? null : req.user!.id,
      },
      select: { id: true, status: true },
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "report.status.update",
      entityType: "Report",
      entityId: report.id,
      payload: { status: data.status, note: data.note ?? null },
    });

    res.json({ report });
  }),
);

adminRouter.get(
  "/support/tickets",
  authRequired,
  requirePermission("support.read"),
  requireAdminPageAccess("support"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const query = supportTicketsQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.SupportTicketWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.department) {
      where.department = query.department;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.assignedRole) {
      where.assignedRole = query.assignedRole;
    }
    if (query.assignedUserId) {
      where.assignedUserId = query.assignedUserId;
    }
    if (query.search) {
      const normalizedSearch = query.search.trim();
      const digits = normalizedSearch.replace(/\D/g, "");
      const ticketNumber = digits ? Number(digits) : null;
      where.OR = [
        { subject: { contains: query.search, mode: "insensitive" } },
        { category: { contains: query.search, mode: "insensitive" } },
        {
          user: {
            is: {
              email: { contains: query.search, mode: "insensitive" },
            },
          },
        },
        {
          user: {
            is: {
              phone: { contains: query.search, mode: "insensitive" },
            },
          },
        },
        {
          user: {
            is: {
              username: { contains: query.search, mode: "insensitive" },
            },
          },
        },
        ...(ticketNumber ? [{ ticketNumber }] : []),
      ];
    }

    const tickets = await prisma.supportTicket.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      include: {
        user: { select: { id: true, email: true, phone: true, username: true } },
        assignedUser: { select: { id: true, email: true, phone: true, username: true, role: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, body: true, senderRole: true, createdAt: true },
        },
      },
    });

    const hasNext = tickets.length > limit;
    const trimmed = hasNext ? tickets.slice(0, limit) : tickets;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

      res.json({
        tickets: trimmed.map((ticket) => ({
          id: ticket.id,
          ticketNumber: formatTicketNumber(ticket.ticketNumber, ticket.id),
          subject: ticket.subject,
          category: ticket.category,
          status: ticket.status,
          department: ticket.department,
          priority: ticket.priority,
          assignedRole: ticket.assignedRole,
          assignedUser: ticket.assignedUser,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          lastMessageAt: ticket.lastMessageAt,
          requester: ticket.user,
          lastMessage: ticket.messages[0] ?? null,
      })),
      nextCursor,
    });
  }),
);

adminRouter.get(
  "/support/agents",
  authRequired,
  requirePermission("support.read"),
  requireAdminPageAccess("support"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (_req, res) => {
    const agents = await prisma.user.findMany({
      where: { role: { in: ADMIN_ROLES } },
      select: { id: true, role: true, email: true, phone: true, username: true },
      orderBy: { createdAt: "asc" },
    });

    res.json({ agents });
  }),
);

adminRouter.get(
  "/support/tickets/:id",
  authRequired,
  requirePermission("support.read"),
  requireAdminPageAccess("support"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

      const ticket = await prisma.supportTicket.findUnique({
        where: { id: params.id },
        include: {
          user: { select: { id: true, email: true, phone: true, username: true } },
          assignedUser: { select: { id: true, email: true, phone: true, username: true, role: true } },
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              body: true,
              senderId: true,
              senderRole: true,
              isInternal: true,
              createdAt: true,
              sender: { select: { id: true, email: true, phone: true, username: true } },
            },
          },
          meetings: {
            orderBy: { scheduledAt: "desc" },
            select: {
              id: true,
              scheduledAt: true,
              durationMinutes: true,
              meetingUrl: true,
              notes: true,
              createdAt: true,
              createdBy: { select: { id: true, email: true, phone: true, username: true } },
            },
          },
          events: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              type: true,
              data: true,
              createdAt: true,
              actor: { select: { id: true, email: true, phone: true, username: true } },
            },
          },
        },
      });

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    res.json({
      id: ticket.id,
      ticketNumber: formatTicketNumber(ticket.ticketNumber, ticket.id),
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      department: ticket.department,
      priority: ticket.priority,
      assignedRole: ticket.assignedRole,
      assignedUser: ticket.assignedUser,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      lastMessageAt: ticket.lastMessageAt,
      requester: ticket.user,
      messages: ticket.messages,
      meetings: ticket.meetings,
      events: ticket.events,
    });
  }),
);

adminRouter.patch(
  "/support/tickets/:id/status",
  authRequired,
  requirePermission("support.update"),
  requireAdminPageAccess("support"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateSupportTicketStatusSchema.parse(req.body);

    const existing = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: params.id },
      data: { status: data.status },
      select: { id: true, status: true, updatedAt: true },
    });

    if (existing.status !== data.status) {
      await createSupportTicketEvent({
        ticketId: ticket.id,
        actorId: req.user!.id,
        type: "status_changed",
        data: { from: existing.status, to: data.status },
      });
    }

    res.json({ ticket });
  }),
);

adminRouter.patch(
  "/support/tickets/:id/assignment",
  authRequired,
  requirePermission("support.update"),
  requireAdminPageAccess("support"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateSupportTicketRoutingSchema.parse(req.body);

    const existing = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        department: true,
        priority: true,
        assignedRole: true,
        assignedUserId: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    if (data.assignedUserId) {
      const assignee = await prisma.user.findUnique({
        where: { id: data.assignedUserId },
        select: { id: true, role: true },
      });
      if (!assignee || !ADMIN_ROLES.includes(assignee.role)) {
        return res.status(400).json({ error: "Assigned user must be an admin role." });
      }
    }

    const updates: Prisma.SupportTicketUpdateInput = {};
    if (data.department !== undefined) updates.department = data.department;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.assignedRole !== undefined) updates.assignedRole = data.assignedRole;
    if (data.assignedUserId !== undefined) {
      updates.assignedUser = data.assignedUserId
        ? { connect: { id: data.assignedUserId } }
        : { disconnect: true };
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: params.id },
      data: updates,
      select: {
        id: true,
        department: true,
        priority: true,
        assignedRole: true,
        assignedUserId: true,
        updatedAt: true,
      },
    });

    if (data.department && data.department !== existing.department) {
      await createSupportTicketEvent({
        ticketId: ticket.id,
        actorId: req.user!.id,
        type: "forwarded",
        data: { from: existing.department, to: data.department },
      });
    }

    if (
      data.assignedRole !== undefined ||
      data.assignedUserId !== undefined ||
      data.priority !== undefined
    ) {
      await createSupportTicketEvent({
        ticketId: ticket.id,
        actorId: req.user!.id,
        type: "assigned",
        data: {
          assignedRole: ticket.assignedRole,
          assignedUserId: ticket.assignedUserId,
          priority: ticket.priority,
        },
      });
    }

    res.json({ ticket });
  }),
);

adminRouter.post(
  "/support/tickets/:id/notes",
  authRequired,
  requirePermission("support.update"),
  requireAdminPageAccess("support"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = supportTicketNoteSchema.parse(req.body);

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    const message = await prisma.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: req.user!.id,
        senderRole: req.user!.role,
        body: data.message,
        isInternal: true,
      },
      select: { id: true, body: true, senderRole: true, createdAt: true, isInternal: true },
    });

    await createSupportTicketEvent({
      ticketId: ticket.id,
      actorId: req.user!.id,
      type: "note_added",
      data: { internal: true },
    });

    res.status(201).json({ message });
  }),
);

adminRouter.post(
  "/support/tickets/:id/meetings",
  authRequired,
  requirePermission("support.update"),
  requireAdminPageAccess("support"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = supportTicketMeetingSchema.parse(req.body);

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    const scheduledAt = new Date(data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ error: "Invalid meeting time." });
    }

    const meeting = await prisma.supportTicketMeeting.create({
      data: {
        ticketId: ticket.id,
        scheduledAt,
        durationMinutes: data.durationMinutes ?? null,
        meetingUrl: data.meetingUrl ?? null,
        notes: data.notes ?? null,
        createdById: req.user!.id,
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        meetingUrl: true,
        notes: true,
        createdAt: true,
      },
    });

    await createSupportTicketEvent({
      ticketId: ticket.id,
      actorId: req.user!.id,
      type: "meeting_scheduled",
      data: { meetingId: meeting.id, scheduledAt: meeting.scheduledAt.toISOString() },
    });

    res.status(201).json({ meeting });
  }),
);

adminRouter.post(
  "/support/tickets/:id/messages",
  authRequired,
  requirePermission("support.update"),
  requireAdminPageAccess("support"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = supportTicketMessageSchema.parse(req.body);

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        ticketNumber: true,
        subject: true,
        user: { select: { email: true, username: true } },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({ error: "This ticket is closed." });
    }

    const nextStatus = ticket.status === "open" ? "in_progress" : ticket.status;
    const now = new Date();

    const [message] = await prisma.$transaction([
      prisma.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: req.user!.id,
          senderRole: req.user!.role,
          body: data.message,
          isInternal: false,
        },
        select: { id: true, body: true, senderRole: true, createdAt: true },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: nextStatus,
          lastMessageAt: now,
        },
      }),
    ]);

    const recipientEmail = ticket.user?.email ?? null;
    if (recipientEmail) {
      const ticketNumber = formatTicketNumber(ticket.ticketNumber, ticket.id);
      const recipientName = ticket.user?.username ?? "there";
      const subject = `Update on your support ticket ${ticketNumber}`;
      const text = [
        `Hi ${recipientName},`,
        "",
        "Our support team replied to your ticket:",
        "",
        data.message,
        "",
        `Ticket: ${ticketNumber}`,
        `Subject: ${ticket.subject}`,
        "",
        "You can view and reply in the app under Support.",
      ].join("\n");

      void sendEmail({
        to: recipientEmail,
        subject,
        text,
        tag: "support_ticket_reply",
        metadata: { ticketId: ticket.id },
      }).catch((error) => {
        console.warn("Failed to send support ticket reply email.", error);
      });
    }

    res.json({ message, status: nextStatus });
  }),
);

adminRouter.get(
  "/disputes",
  authRequired,
  requirePermission("orders.read"),
  requireAdminPageAccess("disputes"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    const autoCloseDays = settings.disputePolicy.autoCloseDays;
    if (autoCloseDays > 0 && settings.disputePolicy.allowedStatuses.includes("resolved")) {
      const cutoff = new Date(Date.now() - autoCloseDays * 24 * 60 * 60 * 1000);
      const resolution = settings.disputePolicy.defaultResolution ?? null;
      await prisma.dispute.updateMany({
        where: {
          status: { in: ["open", "investigating"] },
          createdAt: { lt: cutoff },
        },
        data: {
          status: "resolved",
          resolution,
          resolvedAt: new Date(),
        },
      });
    }

    const query = disputesQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.DisputeWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }

    const disputes = await prisma.dispute.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        order: {
          select: {
            id: true,
            status: true,
            events: {
              where: { type: "dispute_opened" },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { payload: true },
            },
          },
        },
        openedBy: { select: { id: true, email: true, username: true } },
      },
    });

    const hasNext = disputes.length > limit;
    const trimmed = hasNext ? disputes.slice(0, limit) : disputes;
    const serialized = trimmed.map((dispute) => {
      const evidencePayload = dispute.order.events[0]?.payload ?? null;
      return {
        ...dispute,
        evidence: extractDisputeEvidence(evidencePayload),
        order: {
          id: dispute.order.id,
          status: dispute.order.status,
        },
      };
    });
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ disputes: serialized, nextCursor });
  }),
);

adminRouter.patch(
  "/disputes/:id/status",
  authRequired,
  requirePermission("orders.update"),
  requireAdminPageAccess("disputes"),
  requireBusinessFunctionAccess("customer_service"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updateDisputeStatusSchema.parse(req.body);
    const { settings } = await getPlatformSettings();

    if (!settings.disputePolicy.allowedStatuses.includes(data.status)) {
      return res.status(400).json({ error: "Dispute status not allowed by policy." });
    }

    if (data.resolution && !settings.disputePolicy.allowedResolutions.includes(data.resolution)) {
      return res.status(400).json({ error: "Dispute resolution not allowed by policy." });
    }

    const resolvedResolution =
      data.status === "resolved"
        ? data.resolution ?? settings.disputePolicy.defaultResolution ?? null
        : null;

    if (data.status === "resolved" && resolvedResolution === "partial_refund") {
      if (data.releaseAmountNet === undefined) {
        return res.status(400).json({ error: "releaseAmountNet is required for partial refunds." });
      }

      const preview = await prisma.dispute.findUnique({
        where: { id: params.id },
        include: {
          order: {
            select: {
              id: true,
              amountPaidNet: true,
              amountReleasedNet: true,
            },
          },
        },
      });

      if (!preview || !preview.order) {
        return res.status(404).json({ error: "Dispute not found." });
      }

      const releasableNet = preview.order.amountPaidNet.sub(preview.order.amountReleasedNet);
      const requestedRelease = new Prisma.Decimal(data.releaseAmountNet);

      if (releasableNet.lte(0)) {
        return res.status(400).json({ error: "No releasable amount remains on this order." });
      }

      if (requestedRelease.lte(0) || requestedRelease.gte(releasableNet)) {
        return res.status(400).json({
          error:
            "Partial refund requires releaseAmountNet greater than 0 and less than the current releasable amount.",
        });
      }
    }

    const disputeExists = await prisma.dispute.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!disputeExists) {
      return res.status(404).json({ error: "Dispute not found." });
    }

    const dispute = await prisma.$transaction(async (tx) => {
      const existing = await tx.dispute.findUnique({
        where: { id: params.id },
        include: {
          order: {
            select: {
              id: true,
              buyerId: true,
              providerId: true,
              serviceId: true,
              status: true,
              currency: true,
              amountPaidNet: true,
              amountReleasedNet: true,
              service: { select: { title: true } },
            },
          },
        },
      });

      if (!existing || !existing.order) {
        throw new Error("Dispute not found.");
      }
      const now = new Date();
      const releasableNet = existing.order.amountPaidNet.sub(existing.order.amountReleasedNet);
      const backoutPending = async (amount: Prisma.Decimal) => {
        if (amount.lte(0)) {
          return;
        }
        const wallet = await tx.providerWallet.upsert({
          where: { providerId: existing.order!.providerId },
          create: {
            providerId: existing.order!.providerId,
            availableBalance: new Prisma.Decimal(0),
            pendingBalance: new Prisma.Decimal(0),
            currency: existing.order!.currency,
          },
          update: {},
        });

        const pendingAfter = wallet.pendingBalance.sub(amount);
        await tx.providerWallet.update({
          where: { providerId: existing.order!.providerId },
          data: {
            pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
          },
        });
      };

      const updated = await tx.dispute.update({
        where: { id: params.id },
        data: {
          status: data.status,
          resolution: resolvedResolution,
          resolvedAt: ["resolved", "cancelled"].includes(data.status) ? now : null,
        },
        select: { id: true, status: true, resolution: true },
      });

      if (data.status === "resolved" && resolvedResolution === "release") {
        await markOrderReleaseApproved(tx, {
          orderId: existing.order.id,
          actorId: req.user!.id,
          source: "dispute_resolution",
        });
      }

      if (data.status === "resolved" && resolvedResolution === "partial_refund") {
        const requestedRelease = new Prisma.Decimal(data.releaseAmountNet ?? 0);
        const releaseResult = await markOrderReleaseApproved(tx, {
          orderId: existing.order.id,
          actorId: req.user!.id,
          source: "dispute_resolution",
          amountOverride: requestedRelease,
        });
        const refundedNet = releasableNet.sub(releaseResult.amountReleased);
        await backoutPending(refundedNet);

        await tx.order.update({
          where: { id: existing.order.id },
          data: {
            status: "release_approved",
            amountPaidNet: releaseResult.order.amountReleasedNet,
            refundRequestedAt: now,
            refundCompletedAt: now,
          },
        });
      }

      if (data.status === "resolved" && resolvedResolution === "refund") {
        await backoutPending(releasableNet);
        await tx.order.update({
          where: { id: existing.order.id },
          data: {
            status: "refunded",
            refundRequestedAt: now,
            refundCompletedAt: now,
            amountPaid: new Prisma.Decimal(0),
            amountPaidNet: new Prisma.Decimal(0),
          },
        });
      }

      if (
        data.status === "resolved" &&
        resolvedResolution === "deny" &&
        existing.order.status === "dispute_open"
      ) {
        await tx.order.update({
          where: { id: existing.order.id },
          data: { status: "delivery_submitted" },
        });
      }

      if (data.status === "resolved") {
        await tx.orderEvent.create({
          data: {
            orderId: existing.order.id,
            type: "dispute_resolved",
            payload: {
              actorId: req.user!.id,
              resolution: resolvedResolution,
              releaseAmountNet:
                resolvedResolution === "partial_refund" && data.releaseAmountNet !== undefined
                  ? data.releaseAmountNet
                  : null,
              note: data.note ?? null,
            },
          },
        });
      }

      return { ...updated, order: existing.order };
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "dispute.status.update",
      entityType: "Dispute",
      entityId: dispute.id,
      payload: { status: data.status, resolution: data.resolution ?? null, note: data.note ?? null },
    });

    if (dispute.order && data.status === "resolved") {
      const serviceTitle = dispute.order.service?.title ?? "service";
      const resolutionLabel = dispute.resolution ?? "resolved";
      await Promise.all([
        createNotification({
          userId: dispute.order.providerId,
          actorId: req.user!.id,
          type: "order_status",
          title: "Dispute resolved",
          body: `Dispute resolution for ${serviceTitle}: ${resolutionLabel}.`,
          data: { orderId: dispute.order.id, disputeId: dispute.id, serviceId: dispute.order.serviceId },
        }),
        createNotification({
          userId: dispute.order.buyerId,
          actorId: req.user!.id,
          type: "order_status",
          title: "Dispute resolved",
          body: `Your dispute for ${serviceTitle} was resolved: ${resolutionLabel}.`,
          data: { orderId: dispute.order.id, disputeId: dispute.id, serviceId: dispute.order.serviceId },
        }),
      ]);
    }

    res.json({ dispute });
  }),
);

adminRouter.get(
  "/payouts",
  authRequired,
  requirePermission("payouts.read"),
  requireAdminPageAccess("payouts"),
  requireBusinessFunctionAccess("finance"),
  asyncHandler(async (_req, res) => {
    const providers = await prisma.user.findMany({
      where: { role: "provider" },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        providerProfile: {
          select: { displayName: true, momoNumber: true, momoNetwork: true, verificationStatus: true },
        },
      },
    });

    const payoutSummary = await prisma.earningsLedger.groupBy({
      by: ["providerId"],
      _sum: { netAmount: true },
      where: { state: "disbursed" },
    });
    const pendingSummary = await prisma.earningsLedger.groupBy({
      by: ["providerId"],
      _sum: { netAmount: true },
      where: { state: { in: ["payable", "reserved"] } },
    });

    const releasedMap = new Map(
      payoutSummary.map((row) => [row.providerId, row._sum.netAmount?.toString() ?? "0"]),
    );
    const pendingMap = new Map(
      pendingSummary.map((row) => [row.providerId, row._sum.netAmount?.toString() ?? "0"]),
    );

    res.json({
      payouts: providers.map((provider) => ({
        provider,
        totals: {
          released: releasedMap.get(provider.id) ?? "0",
          pending: pendingMap.get(provider.id) ?? "0",
        },
      })),
    });
  }),
);

adminRouter.get(
  "/payout-requests",
  authRequired,
  requirePermission("payouts.read"),
  requireAdminPageAccess("payouts"),
  requireBusinessFunctionAccess("finance"),
  asyncHandler(async (_req, res) => {
    const requests = await prisma.payoutRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            status: true,
            createdAt: true,
            providerProfile: {
              select: {
                displayName: true,
                momoNumber: true,
                momoNetwork: true,
                verificationStatus: true,
              },
            },
          },
        },
      },
    });

      res.json({
        requests: requests.map((request) => ({
          id: request.id,
          amount: request.amount.toString(),
          currency: request.currency,
          status: request.status,
          destinationMomo: request.destinationMomo,
          momoNetwork: request.momoNetwork,
          reference: request.reference,
          orderId: request.orderId,
          pspTransferRef: request.pspTransferRef,
          idempotencyKey: request.idempotencyKey,
          failureReason: request.status === "failed" ? getPayoutFailureReason(request.metadata) : null,
          createdAt: request.createdAt,
          provider: request.provider,
        })),
      });
  }),
);

adminRouter.get(
  "/payout-compliance-cases",
  authRequired,
  requirePermission("payouts.read"),
  requireAdminPageAccess("payouts"),
  requireBusinessFunctionAccess("finance"),
  asyncHandler(async (req, res) => {
    const query = payoutComplianceCasesQuerySchema.parse(req.query);
    const limit = query.limit ?? 100;

    const where: Prisma.ComplianceCaseWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.type) {
      where.type = query.type;
    }

    const cases = await prisma.complianceCase.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            providerProfile: {
              select: {
                displayName: true,
                verificationStatus: true,
              },
            },
          },
        },
        payoutRequest: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            createdAt: true,
            destinationMomo: true,
            momoNetwork: true,
          },
        },
        screening: {
          select: {
            id: true,
            status: true,
            matchScore: true,
            watchlistSource: true,
            screenedAt: true,
            reviewedAt: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
        closedBy: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    res.json({
      cases: cases.map((item) => serializePayoutComplianceCase(item)),
    });
  }),
);

adminRouter.patch(
  "/payout-compliance-cases/:id",
  authRequired,
  requirePermission("payouts.update"),
  requireAdminPageAccess("payouts"),
  requireBusinessFunctionAccess("finance"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const data = updatePayoutComplianceCaseSchema.parse(req.body);

    const existing = await prisma.complianceCase.findUnique({
      where: { id: params.id },
      select: { id: true, metadata: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Compliance case not found." });
    }

    if (data.assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: data.assignedToId },
        select: { id: true, role: true },
      });
      if (!assignee || !ADMIN_ROLES.includes(assignee.role)) {
        return res.status(400).json({ error: "Assigned user must be an admin user." });
      }
    }

    const existingMetadata =
      existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const existingNotes = Array.isArray(existingMetadata.adminNotes)
      ? (existingMetadata.adminNotes as Array<Record<string, unknown>>)
      : [];
    const shouldClose = data.status === "cleared" || data.status === "closed";
    const updatedMetadata: Prisma.InputJsonValue | undefined = data.note
      ? ({
          ...existingMetadata,
          adminNotes: [
            ...existingNotes.slice(-24),
            {
              at: new Date().toISOString(),
              by: req.user!.id,
              status: data.status,
              note: data.note,
            },
          ],
        } as Prisma.InputJsonValue)
      : undefined;

    const updated = await prisma.complianceCase.update({
      where: { id: params.id },
      data: {
        status: data.status,
        assignedToId: data.assignedToId !== undefined ? data.assignedToId : undefined,
        resolvedAt: shouldClose ? new Date() : null,
        closedById: shouldClose ? req.user!.id : null,
        metadata: updatedMetadata,
      },
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            providerProfile: {
              select: {
                displayName: true,
                verificationStatus: true,
              },
            },
          },
        },
        payoutRequest: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            createdAt: true,
            destinationMomo: true,
            momoNetwork: true,
          },
        },
        screening: {
          select: {
            id: true,
            status: true,
            matchScore: true,
            watchlistSource: true,
            screenedAt: true,
            reviewedAt: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
        closedBy: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "payout.compliance_case.update",
      entityType: "ComplianceCase",
      entityId: updated.id,
      payload: {
        status: data.status,
        assignedToId: data.assignedToId ?? null,
        note: data.note ?? null,
      },
    });

    res.json({ case: serializePayoutComplianceCase(updated) });
  }),
);

adminRouter.post(
  "/payout-requests/:id/approve",
  authRequired,
  requirePermission("payouts.update"),
  requireAdminPageAccess("payouts"),
  requireBusinessFunctionAccess("finance"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

      const request = await prisma.payoutRequest.findUnique({
        where: { id: params.id },
        include: {
          provider: {
            select: {
              id: true,
              username: true,
              email: true,
              providerProfile: { select: { momoNumber: true, momoNetwork: true, displayName: true } },
            },
          },
        },
      });

    if (!request) {
      return res.status(404).json({ error: "Disbursement request not found." });
    }

    if (request.status !== "requested") {
      return res.status(400).json({ error: "Disbursement request is not pending." });
    }

    const blockingCase = await prisma.complianceCase.findFirst({
      where: {
        providerId: request.providerId,
        status: { in: [...OPEN_PAYOUT_COMPLIANCE_STATUSES] },
        OR: [{ payoutRequestId: request.id }, { type: "sanctions_match" }],
      },
      select: { id: true, status: true, title: true },
    });
    if (blockingCase) {
      return res.status(409).json({
        error: `Compliance review pending (${blockingCase.status}): ${blockingCase.title}`,
      });
    }

    const momoNumber = request.destinationMomo ?? request.provider.providerProfile?.momoNumber ?? null;
    const momoNetwork = request.momoNetwork ?? request.provider.providerProfile?.momoNetwork;

      if (!momoNumber || !momoNetwork) {
        return res.status(400).json({ error: "Provider payout details are incomplete." });
      }

      const { settings } = await getPlatformSettings();
      const payoutProvider = settings.payoutRules.provider ?? "flutterwave";
      const flutterwaveSecret =
        settings.integrations.payments.flutterwaveSecretKey ||
        env.FLUTTERWAVE_SECRET_KEY ||
        "";
      const paystackSecret =
        settings.integrations.payments.paystackSecretKey ||
        env.PAYSTACK_SECRET_KEY ||
        "";
      const providerName =
        request.provider.providerProfile?.displayName ||
        request.provider.username ||
        request.provider.email ||
        "Provider payout";

      const transferRef = request.reference ?? `scg_payout_${request.id}`;

      let payload: Prisma.JsonValue | null = null;
      let nextStatus: "processing" | "paid" | "failed" = "processing";
      let transferId: string | undefined;

      try {
        if (payoutProvider === "paystack" && !paystackSecret) {
          return res.status(400).json({ error: "Paystack is not configured." });
        }
        if (payoutProvider !== "paystack" && !flutterwaveSecret) {
          return res.status(400).json({ error: "Flutterwave is not configured." });
        }
        if (payoutProvider === "paystack") {
          const transfer = await initiatePaystackTransfer({
            amount: request.amount,
            currency: request.currency,
            momoNumber,
            momoNetwork,
            reference: transferRef,
            narration: `Service Connect payout ${request.id}`,
            name: providerName,
            secretKey: paystackSecret,
          });

          payload = { provider: "paystack", ...transfer } as Prisma.JsonValue;
          const status = String(transfer.transfer.data?.status ?? "").toLowerCase();
          const isSuccess = ["successful", "completed"].includes(status);
          const isPending = ["pending", "otp", "queued", "processing", "new", "success"].includes(
            status,
          );
          transferId =
            transfer.transfer.data?.transfer_code?.toString() ??
            transfer.transfer.data?.id?.toString();
          nextStatus = isSuccess ? "paid" : isPending ? "processing" : "failed";
        } else {
          const transfer = await initiateFlutterwaveTransfer({
            amount: request.amount,
            currency: request.currency,
            momoNumber,
            momoNetwork,
            reference: transferRef,
            narration: `Service Connect payout ${request.id}`,
            secretKey: flutterwaveSecret,
          });

          payload = { provider: "flutterwave", ...transfer } as Prisma.JsonValue;
          const status = String(transfer.data?.status ?? "").toLowerCase();
          const isSuccess = ["successful", "success", "completed"].includes(status);
          const isPending = ["pending", "new", "queued", "processing"].includes(status);
          transferId = transfer.data?.id?.toString();
          nextStatus = isSuccess ? "paid" : isPending ? "processing" : "failed";
        }
      } catch (error) {
        payload = {
          error: error instanceof Error ? error.message : "Payout transfer failed.",
          provider: payoutProvider,
        } as Prisma.JsonValue;
        nextStatus = "failed";
      }
      const payoutTrackingRef = transferId ?? transferRef;

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.providerWallet.upsert({
        where: { providerId: request.providerId },
        create: {
          providerId: request.providerId,
          availableBalance: new Prisma.Decimal(0),
          pendingBalance: new Prisma.Decimal(0),
          currency: request.currency,
        },
        update: {},
      });

      if (nextStatus === "paid") {
        const pendingAfter = wallet.pendingBalance.sub(request.amount);
        await tx.providerWallet.update({
          where: { providerId: request.providerId },
          data: {
            pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
          },
        });

        if (request.orderId) {
          await tx.earningsLedger.updateMany({
            where: { orderId: request.orderId, providerId: request.providerId },
            data: {
              state: "disbursed",
              disbursedAt: new Date(),
              pspPayoutRef: payoutTrackingRef,
            },
          });
        }
      }

      if (nextStatus === "failed") {
        const pendingAfter = wallet.pendingBalance.sub(request.amount);
        await tx.providerWallet.update({
          where: { providerId: request.providerId },
          data: {
            availableBalance: { increment: request.amount },
            pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
          },
        });

        if (request.orderId) {
          await tx.earningsLedger.updateMany({
            where: { orderId: request.orderId, providerId: request.providerId },
            data: {
              state: "payable",
              reservedAt: null,
              disbursedAt: null,
              pspPayoutRef: null,
            },
          });
        }
      }

      if (nextStatus === "paid") {
        await allocateDisbursementToOrders(tx, {
          providerId: request.providerId,
          orderId: request.orderId ?? undefined,
          amount: request.amount,
          currency: request.currency,
          reference: payoutTrackingRef,
        });
      }

      const previousMetadata =
        request.metadata && typeof request.metadata === "object"
          ? (request.metadata as Record<string, unknown>)
          : {};
      const metadata = payload
        ? ({ ...previousMetadata, transferId: payoutTrackingRef, payload } as Prisma.InputJsonValue)
        : request.metadata ?? Prisma.JsonNull;

      await tx.payoutRequest.update({
        where: { id: request.id },
        data: {
          status: nextStatus,
          reference: transferRef,
          pspTransferRef: payoutTrackingRef,
          metadata,
        },
      });
    });

    if (nextStatus === "paid") {
      await createNotification({
        userId: request.providerId,
        actorId: req.user!.id,
        type: "payout_update",
        title: "Disbursement sent",
        body: `Your disbursement of ${request.currency} ${request.amount.toFixed(2)} was sent.`,
        data: { payoutRequestId: request.id },
      });
    } else if (nextStatus === "processing") {
      await createNotification({
        userId: request.providerId,
        actorId: req.user!.id,
        type: "payout_update",
        title: "Disbursement initiated",
        body: `Your disbursement of ${request.currency} ${request.amount.toFixed(2)} is being processed.`,
        data: { payoutRequestId: request.id },
      });
    } else {
      await createNotification({
        userId: request.providerId,
        actorId: req.user!.id,
        type: "payout_update",
        title: "Disbursement failed",
        body: "Your disbursement could not be completed. Funds have been returned to your payable amount.",
        data: { payoutRequestId: request.id },
      });
    }

    res.json({ status: nextStatus });
  }),
);

adminRouter.post(
  "/payout-requests/:id/deny",
  authRequired,
  requirePermission("payouts.update"),
  requireAdminPageAccess("payouts"),
  requireBusinessFunctionAccess("finance"),
  asyncHandler(async (req, res) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);

    const request = await prisma.payoutRequest.findUnique({
      where: { id: params.id },
    });

    if (!request) {
      return res.status(404).json({ error: "Disbursement request not found." });
    }

    if (request.status !== "requested") {
      return res.status(400).json({ error: "Only pending requests can be denied." });
    }

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.providerWallet.upsert({
        where: { providerId: request.providerId },
        create: {
          providerId: request.providerId,
          availableBalance: new Prisma.Decimal(0),
          pendingBalance: new Prisma.Decimal(0),
          currency: request.currency,
        },
        update: {},
      });

      const pendingAfter = wallet.pendingBalance.sub(request.amount);
      await tx.providerWallet.update({
        where: { providerId: request.providerId },
        data: {
          availableBalance: { increment: request.amount },
          pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
        },
      });

      if (request.orderId) {
        await tx.earningsLedger.updateMany({
          where: { orderId: request.orderId, providerId: request.providerId },
          data: {
            state: "payable",
            reservedAt: null,
            disbursedAt: null,
            pspPayoutRef: null,
          },
        });
      }

      await tx.payoutRequest.update({
        where: { id: request.id },
        data: { status: "cancelled" },
      });
    });

    await createNotification({
      userId: request.providerId,
      actorId: req.user!.id,
      type: "payout_update",
      title: "Disbursement request denied",
      body: "Your disbursement request was denied. Funds have been returned to your payable amount.",
      data: { payoutRequestId: request.id },
    });

    res.json({ status: "cancelled" });
  }),
);

adminRouter.get(
  "/analytics",
  authRequired,
  requirePermission("analytics.read"),
  requireAdminPageAccess("analytics"),
  requireBusinessFunctionAccess("accounting"),
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    const query = analyticsQuerySchema.parse(req.query);
    const months = query.months ?? 6;
    const [
      users,
      activeUsers,
      suspendedUsers,
      orders,
      gross,
      net,
      posts,
      reviews,
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { status: "active" } }),
      prisma.user.count({ where: { status: "suspended" } }),
      prisma.order.count(),
      prisma.order.aggregate({ _sum: { amountPaid: true } }),
      prisma.order.aggregate({ _sum: { amountPaidNet: true, platformFee: true, taxAmount: true } }),
      prisma.communityPost.count(),
      prisma.review.count(),
    ]);

    const trend = await buildAdminTrend(
      months,
      settings.localization.locale,
      settings.localization.timezone,
    );

    res.json({
      totals: {
        users,
        activeUsers,
        suspendedUsers,
        orders,
        posts,
        reviews,
      },
      revenue: {
        gross: gross._sum.amountPaid?.toString() ?? "0",
        netProvider: net._sum.amountPaidNet?.toString() ?? "0",
        platformFee: net._sum.platformFee?.toString() ?? "0",
        tax: net._sum.taxAmount?.toString() ?? "0",
      },
      localization: settings.localization,
      trend: {
        months,
        series: trend,
      },
    });
  }),
);

adminRouter.get(
  "/home-content",
  authRequired,
  requirePermission("settings.read"),
  requireAdminPageAccess("home"),
  asyncHandler(async (_req, res) => {
    const content = await prisma.homeContent.findUnique({
      where: { key: HOME_CONTENT_KEY },
    });

    if (!content) {
      return res.json(defaultHomeContent);
    }

    res.json({
      hero: content.hero,
      categories: content.categories,
      howItWorks: content.howItWorks,
      updatedAt: content.updatedAt,
    });
  }),
);

adminRouter.get(
  "/pages",
  authRequired,
  requirePermission("settings.read"),
  requireAdminPageAccess("pages"),
  asyncHandler(async (_req, res) => {
    const pages = await prisma.staticPage.findMany({
      where: { slug: { in: PAGE_KEYS } },
    });
    const pageMap = new Map(pages.map((page) => [page.slug, page]));

    const resolvePosts = async (items: BlogPost[]) =>
      Promise.all(
        items.map(async (post) => ({
          ...post,
          imageSignedUrl: await signS3Key(post.imageUrl),
        })),
      );

    const resolveStaff = async (items: StaffProfile[]) =>
      Promise.all(
        items.map(async (member) => ({
          ...member,
          photoSignedUrl: await signS3Key(member.photoUrl),
        })),
      );

    const resolveAboutHeroImage = async (value?: string | null) => {
      if (!value) {
        return { heroImageUrl: null, heroImageSignedUrl: null };
      }
      if (value.startsWith("http") || value.startsWith("/")) {
        return { heroImageUrl: value, heroImageSignedUrl: null };
      }
      return {
        heroImageUrl: value,
        heroImageSignedUrl: await signS3Key(value),
      };
    };

    const payloadEntries = await Promise.all(
      PAGE_KEYS.map(async (slug) => {
        const existing = pageMap.get(slug);
        const fallback = DEFAULT_PAGES[slug];
        const content = (existing?.content ?? {}) as Partial<StaticPageContent> & {
          media?: Array<{ url?: string; caption?: string | null }>;
        };
        const legacyMedia = Array.isArray(content.media) ? content.media : [];
        const legacyPosts: BlogPost[] =
          legacyMedia.length > 0
            ? legacyMedia.map((item) => {
                const caption = item.caption ?? "";
                const [titleLine, ...rest] = caption
                  .split("\n")
                  .map((part) => part.trim())
                  .filter(Boolean);
                return {
                  title: titleLine || "SERVFIX Update",
                  summary: rest.length > 0 ? rest.join(" ") : null,
                  body: "",
                  imageUrl: item.url ?? null,
                  videoUrl: null,
                  publishedAt: new Date().toISOString().slice(0, 10),
                };
              })
            : [];
        const posts = Array.isArray(content.posts)
          ? content.posts
          : legacyPosts.length > 0
            ? legacyPosts
            : fallback.posts ?? [];
        const staff = Array.isArray(content.staff) ? content.staff : fallback.staff ?? [];
        const aboutConfigSource =
          content.aboutConfig && typeof content.aboutConfig === "object"
            ? (content.aboutConfig as AboutPageConfig)
            : fallback.aboutConfig;
        const aboutConfig = aboutConfigSource
          ? {
              ...aboutConfigSource,
              ...(await resolveAboutHeroImage(aboutConfigSource.heroImageUrl ?? null)),
            }
          : undefined;
        const resourcesConfig =
          content.resourcesConfig && typeof content.resourcesConfig === "object"
            ? (content.resourcesConfig as ProviderResourcesContent)
            : fallback.resourcesConfig;

        return [
          slug,
          {
            slug,
            title: existing?.title ?? fallback.title,
            body: existing?.body ?? fallback.body,
            posts: await resolvePosts(posts),
            staff: await resolveStaff(staff),
            aboutConfig,
            resourcesConfig,
            updatedAt: existing?.updatedAt ?? null,
          },
        ] as const;
      }),
    );

    const payload = Object.fromEntries(payloadEntries) as Record<
      StaticPageKey,
      {
        slug: StaticPageKey;
        title: string;
        body: string;
        posts: Array<BlogPost & { imageSignedUrl?: string | null }>;
        staff: Array<StaffProfile & { photoSignedUrl?: string | null }>;
        aboutConfig?: AboutPageConfig & { heroImageSignedUrl?: string | null };
        resourcesConfig?: ProviderResourcesContent;
        updatedAt: Date | null;
      }
    >;

    res.json({ pages: payload });
  }),
);

adminRouter.put(
  "/pages",
  authRequired,
  requirePermission("settings.content.update"),
  requireAdminPageAccess("pages"),
  asyncHandler(async (req, res) => {
    const payload = pagesSchema.parse(req.body);

    const normalizePosts = (items: BlogPost[]) =>
      items
        .map((post) => ({
          title: post.title.trim(),
          summary: post.summary?.trim() || null,
          body: post.body.trim(),
          imageUrl: normalizeS3Key(post.imageUrl?.trim() ?? ""),
          videoUrl: post.videoUrl?.trim() || null,
          publishedAt: post.publishedAt.trim(),
        }))
        .filter((post) => post.title)
        .map((post) => ({
          ...post,
          imageUrl: post.imageUrl || null,
        }));

    const normalizeStaff = (items: StaffProfile[]) =>
      items
        .map((member) => ({
          name: member.name.trim(),
          role: member.role.trim(),
          bio: member.bio?.trim() || null,
          photoUrl: normalizeS3Key(member.photoUrl?.trim() ?? ""),
        }))
        .filter((member) => member.name && member.role)
        .map((member) => ({
          ...member,
          photoUrl: member.photoUrl || null,
        }));

    const normalizeProviderResourcesContent = (
      config: ProviderResourcesContent | undefined,
    ): ProviderResourcesContent => {
      const fallback = DEFAULT_PAGES.providerResources.resourcesConfig;
      const source = config ?? fallback;

      if (!source) {
        return {
          sections: [],
          checklistItems: [],
          advancedResources: [],
        };
      }

      const sections: ProviderResourceSection[] = source.sections
        .map((section) => ({
          id: section.id.trim(),
          title: section.title.trim(),
          description: section.description.trim(),
          blocks: section.blocks
            .map((block) => ({
              heading: block.heading.trim(),
              items: block.items.map((item) => item.trim()).filter(Boolean),
            }))
            .filter((block) => block.heading && block.items.length > 0),
        }))
        .filter((section) => section.id && section.title && section.blocks.length > 0);

      const checklistItems: ProviderLaunchChecklistItem[] = source.checklistItems
        .map((item) => ({
          key: item.key,
          label: item.label.trim(),
          editable: item.editable,
        }))
        .filter((item) => item.label);

      const advancedResources = source.advancedResources
        .map((item) => item.trim())
        .filter(Boolean);

      return {
        sections,
        checklistItems,
        advancedResources,
      };
    };

    const normalizeLines = (items: string[], maxItems: number) =>
      items
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxItems);

    const normalizeAboutConfig = (config: AboutPageConfig | undefined): AboutPageConfig => {
      const fallback = DEFAULT_PAGES.about.aboutConfig;

      if (!fallback) {
        throw new Error("Missing default about config.");
      }

      const source = config ?? fallback;

      return {
        introLabel: source.introLabel.trim(),
        heroImageUrl: normalizeS3Key(source.heroImageUrl?.trim() ?? "") || null,
        missionTitle: source.missionTitle.trim(),
        missionBody: source.missionBody.trim(),
        missionBullets: normalizeLines(source.missionBullets, 12),
        whatWeDoTitle: source.whatWeDoTitle.trim(),
        whatWeDoLeft: normalizeLines(source.whatWeDoLeft, 20),
        whatWeDoRight: normalizeLines(source.whatWeDoRight, 20),
        visionTitle: source.visionTitle.trim(),
        visionLeft: source.visionLeft.trim(),
        visionRight: normalizeLines(source.visionRight, 12),
        headingFont: source.headingFont,
        bodyFont: source.bodyFont,
      };
    };

    const aboutContent = {
      staff: normalizeStaff(payload.about.staff ?? []),
      aboutConfig: normalizeAboutConfig(payload.about.aboutConfig),
    };

    const blogContent = {
      posts: normalizePosts(payload.blog.posts ?? []),
    };

    const academyContent = {
      posts: normalizePosts(payload.academy.posts ?? []),
    };

    const providerResourcesContent = {
      resourcesConfig: normalizeProviderResourcesContent(payload.providerResources.resourcesConfig),
    };

    const resolvePageContent = (slug: StaticPageKey) => {
      if (slug === "about") {
        return aboutContent;
      }
      if (slug === "blog") {
        return blogContent;
      }
      if (slug === "academy") {
        return academyContent;
      }
      return providerResourcesContent;
    };

    await prisma.$transaction(
      PAGE_KEYS.map((slug) =>
        prisma.staticPage.upsert({
          where: { slug },
          update: {
            title: payload[slug].title,
            body: payload[slug].body,
            content: resolvePageContent(slug),
          },
          create: {
            slug,
            title: payload[slug].title,
            body: payload[slug].body,
            content: resolvePageContent(slug),
          },
        }),
      ),
    );

    res.json({ status: "ok" });
  }),
);

adminRouter.put(
  "/home-content",
  authRequired,
  requirePermission("settings.content.update"),
  requireAdminPageAccess("home"),
  asyncHandler(async (req, res) => {
    const payload = homeContentSchema.parse(req.body);

    await prisma.homeContent.upsert({
      where: { key: HOME_CONTENT_KEY },
      update: {
        hero: payload.hero,
        categories: payload.categories,
        howItWorks: payload.howItWorks,
      },
      create: {
        key: HOME_CONTENT_KEY,
        hero: payload.hero,
        categories: payload.categories,
        howItWorks: payload.howItWorks,
      },
    });

    res.json({ status: "ok" });
  }),
);

adminRouter.get(
  "/settings",
  authRequired,
  requirePermission("settings.read"),
  requireAdminPageAccess("settings"),
  asyncHandler(async (_req, res) => {
    const { record, settings } = await getPlatformSettings();

    res.json({
      platformFeeBps: settings.platformFeeBps,
      taxBps: settings.taxBps,
      mode: "managed",
      businessFunctions: settings.businessFunctions,
      payoutRules: settings.payoutRules,
      disputePolicy: settings.disputePolicy,
      orderRules: settings.orderRules,
      boostCatalog: settings.boostCatalog,
      providerVerification: settings.providerVerification,
      reviewModeration: settings.reviewModeration,
      communityModeration: settings.communityModeration,
      notificationTemplates: settings.notificationTemplates,
      featureFlags: settings.featureFlags,
      securityControls: settings.securityControls,
      adminAccess: settings.adminAccess,
      integrations: settings.integrations,
      localization: settings.localization,
      updatedAt: record.updatedAt,
    });
  }),
);

adminRouter.put(
  "/settings",
  authRequired,
  requirePermission("settings.config.update"),
  requireAdminPageAccess("settings"),
  asyncHandler(async (req, res) => {
    const { record } = await updatePlatformSettings(req.body);

    res.json({ status: "ok", updatedAt: record.updatedAt });
  }),
);
