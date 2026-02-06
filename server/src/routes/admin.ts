import { Router } from "express";
import { z } from "zod";
import { Prisma, SupportDepartment, SupportTicketPriority, UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { ADMIN_ROLES } from "../utils/permissions.js";
import { env } from "../config.js";
import { createNotification } from "../utils/notifications.js";
import { createSupportTicketEvent, formatTicketNumber } from "../utils/tickets.js";
import { defaultHomeContent, HOME_CONTENT_KEY } from "../utils/home-content.js";
import {
  getPlatformSettings,
  updatePlatformSettings,
  type AdminPageKey,
  type BusinessFunctionKey,
} from "../utils/platform-settings.js";

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
      "paid_to_escrow",
      "accepted",
      "in_progress",
      "delivered",
      "approved",
      "released",
      "cancelled",
      "expired",
      "disputed",
      "refund_pending",
      "refunded",
      "chargeback",
    ])
    .optional(),
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

const updateProviderVerificationSchema = z.object({
  status: z.enum(["unverified", "pending", "verified", "rejected"]),
});

const updateServiceStatusSchema = z.object({
  status: z.enum(["draft", "published", "suspended"]),
});

const updateOrderStatusSchema = z.object({
  status: z.enum([
    "created",
    "paid_to_escrow",
    "accepted",
    "in_progress",
    "delivered",
    "approved",
    "released",
    "cancelled",
    "expired",
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

const initiateFlutterwaveTransfer = async (params: {
  amount: Prisma.Decimal;
  currency: string;
  momoNumber: string;
  momoNetwork: string;
  reference: string;
  narration: string;
}) => {
  if (!env.FLUTTERWAVE_SECRET_KEY) {
    throw new Error("Flutterwave is not configured.");
  }

  const bankCode = payoutNetworkMap[params.momoNetwork];
  if (!bankCode) {
    throw new Error("Unsupported mobile money network.");
  }

  const response = await fetch("https://api.flutterwave.com/v3/transfers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
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
        amountNetProvider: true,
        currency: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const timestampUpdates: Prisma.OrderUpdateInput = {};
    const now = new Date();
    if (data.status === "accepted") timestampUpdates.acceptedAt = now;
    if (data.status === "delivered") timestampUpdates.deliveredAt = now;
    if (data.status === "approved") timestampUpdates.approvedAt = now;
    if (data.status === "released") timestampUpdates.releasedAt = now;
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

      if (data.status === "released" && order.status !== "released") {
        const wallet = await tx.providerWallet.upsert({
          where: { providerId: order.providerId },
          create: {
            providerId: order.providerId,
            availableBalance: new Prisma.Decimal(0),
            pendingBalance: new Prisma.Decimal(0),
            currency: order.currency,
          },
          update: {},
        });

        const amount = order.amountNetProvider;
        const pendingAfter = wallet.pendingBalance.sub(amount);
        await tx.providerWallet.update({
          where: { providerId: order.providerId },
          data: {
            availableBalance: { increment: amount },
            pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
          },
        });
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
    if (data.assignedUserId !== undefined) updates.assignedUserId = data.assignedUserId;

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
      select: { id: true, status: true },
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
        order: { select: { id: true, status: true } },
        openedBy: { select: { id: true, email: true, username: true } },
      },
    });

    const hasNext = disputes.length > limit;
    const trimmed = hasNext ? disputes.slice(0, limit) : disputes;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    res.json({ disputes: trimmed, nextCursor });
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

    const dispute = await prisma.dispute.update({
      where: { id: params.id },
      data: {
        status: data.status,
        resolution: resolvedResolution,
        resolvedAt: ["resolved", "cancelled"].includes(data.status) ? new Date() : null,
      },
      select: { id: true, status: true, resolution: true },
    });

    await logAdminAction({
      actorId: req.user!.id,
      action: "dispute.status.update",
      entityType: "Dispute",
      entityId: dispute.id,
      payload: { status: data.status, resolution: data.resolution ?? null, note: data.note ?? null },
    });

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

    const released = await prisma.order.groupBy({
      by: ["providerId"],
      where: { status: "released" },
      _sum: { amountNetProvider: true },
    });

    const pending = await prisma.order.groupBy({
      by: ["providerId"],
      where: {
        status: { in: ["approved", "delivered", "accepted", "in_progress", "paid_to_escrow", "created"] },
      },
      _sum: { amountNetProvider: true },
    });

    const releasedMap = new Map(
      released.map((row) => [row.providerId, row._sum.amountNetProvider?.toString() ?? "0"]),
    );
    const pendingMap = new Map(
      pending.map((row) => [row.providerId, row._sum.amountNetProvider?.toString() ?? "0"]),
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
        createdAt: request.createdAt,
        provider: request.provider,
      })),
    });
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
            providerProfile: { select: { momoNumber: true, momoNetwork: true } },
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ error: "Payout request not found." });
    }

    if (request.status !== "requested") {
      return res.status(400).json({ error: "Payout request is not pending." });
    }

    const momoNumber = request.destinationMomo ?? request.provider.providerProfile?.momoNumber ?? null;
    const momoNetwork = request.momoNetwork ?? request.provider.providerProfile?.momoNetwork;

    if (!momoNumber || !momoNetwork) {
      return res.status(400).json({ error: "Provider payout details are incomplete." });
    }

    const transferRef = `scg_payout_${request.id}`;

    let payload: Prisma.JsonValue | null = null;
    let nextStatus: "processing" | "paid" | "failed" = "processing";
    let transferId: string | undefined;

    try {
      const transfer = await initiateFlutterwaveTransfer({
        amount: request.amount,
        currency: request.currency,
        momoNumber,
        momoNetwork,
        reference: transferRef,
        narration: `Service Connect payout ${request.id}`,
      });

      payload = transfer as Prisma.JsonValue;
      const status = String(transfer.data?.status ?? "").toLowerCase();
      const isSuccess = ["successful", "success", "completed"].includes(status);
      const isPending = ["pending", "new", "queued", "processing"].includes(status);
      transferId = transfer.data?.id?.toString();
      nextStatus = isSuccess ? "paid" : isPending ? "processing" : "failed";
    } catch (error) {
      payload = {
        error: error instanceof Error ? error.message : "Flutterwave transfer failed.",
      } as Prisma.JsonValue;
      nextStatus = "failed";
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

      if (nextStatus === "paid") {
        const pendingAfter = wallet.pendingBalance.sub(request.amount);
        await tx.providerWallet.update({
          where: { providerId: request.providerId },
          data: {
            pendingBalance: pendingAfter.gte(0) ? pendingAfter : new Prisma.Decimal(0),
          },
        });
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
      }

      const metadata = payload
        ? ({ transferId, payload } as Prisma.InputJsonValue)
        : request.metadata ?? Prisma.JsonNull;

      await tx.payoutRequest.update({
        where: { id: request.id },
        data: {
          status: nextStatus,
          reference: transferRef,
          metadata,
        },
      });
    });

    if (nextStatus === "paid") {
      await createNotification({
        userId: request.providerId,
        actorId: req.user!.id,
        type: "payout_update",
        title: "Payout sent",
        body: `Your payout of ${request.currency} ${request.amount.toFixed(2)} was sent.`,
        data: { payoutRequestId: request.id },
      });
    } else if (nextStatus === "processing") {
      await createNotification({
        userId: request.providerId,
        actorId: req.user!.id,
        type: "payout_update",
        title: "Payout initiated",
        body: `Your payout of ${request.currency} ${request.amount.toFixed(2)} is being processed.`,
        data: { payoutRequestId: request.id },
      });
    } else {
      await createNotification({
        userId: request.providerId,
        actorId: req.user!.id,
        type: "payout_update",
        title: "Payout failed",
        body: "Your payout could not be completed. Funds have been returned to your balance.",
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
      return res.status(404).json({ error: "Payout request not found." });
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

      await tx.payoutRequest.update({
        where: { id: request.id },
        data: { status: "cancelled" },
      });
    });

    await createNotification({
      userId: request.providerId,
      actorId: req.user!.id,
      type: "payout_update",
      title: "Payout request denied",
      body: "Your payout request was denied. Funds have been returned to your balance.",
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
      prisma.order.aggregate({ _sum: { amountGross: true } }),
      prisma.order.aggregate({ _sum: { amountNetProvider: true, platformFee: true, taxAmount: true } }),
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
        gross: gross._sum.amountGross?.toString() ?? "0",
        netProvider: net._sum.amountNetProvider?.toString() ?? "0",
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

adminRouter.put(
  "/home-content",
  authRequired,
  requirePermission("settings.update"),
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
  requirePermission("settings.update"),
  requireAdminPageAccess("settings"),
  asyncHandler(async (req, res) => {
    const { record } = await updatePlatformSettings(req.body);

    res.json({ status: "ok", updatedAt: record.updatedAt });
  }),
);
