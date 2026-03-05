import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { ADMIN_ROLES } from "../utils/permissions.js";
import { env } from "../config.js";
import { getPlatformSettings } from "../utils/platform-settings.js";
import { createNotification } from "../utils/notifications.js";
import {
  createHubtelPaylink,
  normalizeHubtelPhone,
  resolveHubtelConfig,
} from "../utils/hubtel.js";
import {
  buildExpresspayCustomer,
  createExpresspayCheckout,
  normalizeExpresspayPhone,
  resolveExpresspayConfig,
} from "../utils/expresspay.js";
import { getProviderCurrencyError } from "../utils/payment-provider-support.js";

export const businessRouter = Router();

const isAdminRole = (role?: string | null) =>
  Boolean(role && ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]));

const createAccountSchema = z.object({
  name: z.string().min(2).max(120),
  industry: z.string().max(120).optional(),
  size: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
});

const updateAccountSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    industry: z.string().max(120).nullable().optional(),
    size: z.string().max(60).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one field must be provided.",
  });

const addMemberSchema = z.object({
  identifier: z.string().min(2),
  role: z.enum(["owner", "admin", "member"]).optional(),
});

const updateMemberSchema = z.object({
  role: z.enum(["owner", "admin", "member"]).optional(),
  status: z.enum(["active", "invited", "removed"]).optional(),
});

const createJobSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  category: z.string().min(2).max(120),
  budget: z.coerce.number().nonnegative().optional(),
  currency: z.enum(["GHS", "USD", "EUR"]).optional(),
});

const updateJobSchema = z.object({
  status: z.enum(["open", "assigned", "closed", "cancelled"]).optional(),
  assignedProviderId: z.string().uuid().optional(),
});

const listJobsQuerySchema = z.object({
  status: z.enum(["open", "assigned", "closed", "cancelled"]).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const cancelJobSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const createOrderSchema = z.object({
  serviceId: z.string().uuid(),
  tierId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).optional(),
});

const createInvoiceSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  status: z.enum(["draft", "issued"]).optional(),
});

const voidInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

const businessAnalyticsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional(),
});

const checkoutInvoiceSchema = z.object({
  provider: z.enum(["flutterwave", "stripe", "paystack", "hubtel", "expresspay"]),
  method: z.enum(["card", "mobile_money"]).optional(),
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 64);

const ensureUniqueSlug = async (name: string, excludeAccountId?: string) => {
  const base = slugify(name) || `business-${Date.now()}`;
  let candidate = base;
  let counter = 1;

  while (true) {
    const existing = await prisma.businessAccount.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeAccountId) {
      return candidate;
    }
    counter += 1;
    if (counter > 20) {
      const random = Math.random().toString(36).slice(2, 6);
      candidate = `${base}-${random}`;
    } else {
      candidate = `${base}-${counter}`;
    }
  }
};

const ensureAccountAccess = async (accountId: string, user: { id: string; role: string }) => {
  if (isAdminRole(user.role)) {
    return { membership: null, canManage: true };
  }

  const membership = await prisma.businessMember.findFirst({
    where: { accountId, userId: user.id, status: "active" },
    select: { id: true, role: true, status: true },
  });

  if (!membership) {
    return null;
  }

  return {
    membership,
    canManage: membership.role === "owner" || membership.role === "admin",
  };
};

const resolveUserByIdentifier = async (identifier: string) => {
  return prisma.user.findFirst({
    where: {
      OR: [
        { id: identifier },
        { email: identifier },
        { phone: identifier },
        { username: identifier },
      ],
    },
    select: { id: true, role: true, email: true, phone: true, username: true },
  });
};

const publicUserSelect = {
  id: true,
  email: true,
  phone: true,
  username: true,
  role: true,
  providerProfile: {
    select: {
      displayName: true,
      location: true,
      ratingAvg: true,
      ratingCount: true,
      verificationStatus: true,
    },
  },
};

const appUrl = env.APP_URL.replace(/\/+$/, "");

const toMinorUnits = (amount: Prisma.Decimal) => {
  const fixed = amount.toFixed(2);
  const [whole, fraction = ""] = fixed.split(".");
  const normalized = `${whole}${(fraction + "00").slice(0, 2)}`;
  return Number(normalized);
};

const toJsonInput = (value: Prisma.JsonValue) =>
  value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

const isActiveOwnerMembership = (role: string, status: string) =>
  role === "owner" && status === "active";

const canTransitionMembership = async (params: {
  accountId: string;
  currentRole: string;
  currentStatus: string;
  nextRole: string;
  nextStatus: string;
}) => {
  if (!isActiveOwnerMembership(params.currentRole, params.currentStatus)) {
    return true;
  }

  if (isActiveOwnerMembership(params.nextRole, params.nextStatus)) {
    return true;
  }

  const ownerCount = await prisma.businessMember.count({
    where: { accountId: params.accountId, role: "owner", status: "active" },
  });

  return ownerCount > 1;
};

const serializeBusinessJob = (job: {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: Prisma.Decimal | null;
  currency: string;
  status: string;
  assignedProviderId: string | null;
  orderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: job.id,
  title: job.title,
  description: job.description,
  category: job.category,
  budget: job.budget?.toString() ?? null,
  currency: job.currency,
  status: job.status,
  assignedProviderId: job.assignedProviderId ?? null,
  orderId: job.orderId ?? null,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

businessRouter.post(
  "/accounts",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const data = createAccountSchema.parse(req.body);
    const slug = await ensureUniqueSlug(data.name);

    const account = await prisma.businessAccount.create({
      data: {
        name: data.name,
        slug,
        industry: data.industry ?? null,
        size: data.size ?? null,
        notes: data.notes ?? null,
        members: {
          create: {
            userId: req.user!.id,
            role: "owner",
            status: "active",
          },
        },
      },
      include: {
        _count: { select: { members: true, jobs: true } },
        members: {
          where: { userId: req.user!.id },
          select: { role: true, status: true },
        },
      },
    });

    res.status(201).json({
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        status: account.status,
        industry: account.industry,
        size: account.size,
        notes: account.notes,
        memberCount: account._count.members,
        jobCount: account._count.jobs,
        membership: account.members[0] ?? null,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
    });
  }),
);

businessRouter.get(
  "/accounts/mine",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const memberships = await prisma.businessMember.findMany({
      where: { userId: req.user!.id, status: "active" },
      include: {
        account: {
          include: { _count: { select: { members: true, jobs: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      accounts: memberships.map((membership) => ({
        id: membership.account.id,
        name: membership.account.name,
        slug: membership.account.slug,
        status: membership.account.status,
        industry: membership.account.industry,
        size: membership.account.size,
        notes: membership.account.notes,
        memberCount: membership.account._count.members,
        jobCount: membership.account._count.jobs,
        membership: { role: membership.role, status: membership.status },
        createdAt: membership.account.createdAt,
        updatedAt: membership.account.updatedAt,
      })),
    });
  }),
);

businessRouter.get(
  "/accounts",
  authRequired,
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (_req, res) => {
    const accounts = await prisma.businessAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true, jobs: true } } },
    });

    res.json({
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        slug: account.slug,
        status: account.status,
        industry: account.industry,
        size: account.size,
        notes: account.notes,
        memberCount: account._count.members,
        jobCount: account._count.jobs,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
    });
  }),
);

businessRouter.get(
  "/accounts/:id",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    const account = await prisma.businessAccount.findUnique({
      where: { id: accountId },
      include: {
        _count: { select: { members: true, jobs: true } },
        members: {
          include: {
            user: {
              select: { id: true, email: true, phone: true, username: true, role: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!account) {
      return res.status(404).json({ error: "Business account not found." });
    }

    res.json({
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        status: account.status,
        industry: account.industry,
        size: account.size,
        notes: account.notes,
        memberCount: account._count.members,
        jobCount: account._count.jobs,
        membership: access.membership,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        members: account.members.map((member) => ({
          id: member.id,
          role: member.role,
          status: member.status,
          user: member.user,
        })),
        jobs: account.jobs.map(serializeBusinessJob),
      },
    });
  }),
);

businessRouter.patch(
  "/accounts/:id",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const data = updateAccountSchema.parse(req.body);
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can update business accounts." });
    }

    const account = await prisma.businessAccount.findUnique({
      where: { id: accountId },
      select: { id: true, name: true },
    });

    if (!account) {
      return res.status(404).json({ error: "Business account not found." });
    }

    const slug = data.name && data.name !== account.name
      ? await ensureUniqueSlug(data.name, accountId)
      : undefined;

    const updated = await prisma.businessAccount.update({
      where: { id: accountId },
      data: {
        name: data.name,
        slug,
        industry: data.industry === undefined ? undefined : data.industry,
        size: data.size === undefined ? undefined : data.size,
        notes: data.notes === undefined ? undefined : data.notes,
      },
      include: {
        _count: { select: { members: true, jobs: true } },
        members: {
          where: { userId: req.user!.id },
          select: { role: true, status: true },
        },
      },
    });

    res.json({
      account: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        status: updated.status,
        industry: updated.industry,
        size: updated.size,
        notes: updated.notes,
        memberCount: updated._count.members,
        jobCount: updated._count.jobs,
        membership: updated.members[0] ?? null,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  }),
);

businessRouter.delete(
  "/accounts/:id",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can deactivate business accounts." });
    }

    const account = await prisma.businessAccount.findUnique({
      where: { id: accountId },
      select: { id: true, status: true },
    });

    if (!account) {
      return res.status(404).json({ error: "Business account not found." });
    }

    const updated = account.status === "suspended"
      ? account
      : await prisma.businessAccount.update({
          where: { id: accountId },
          data: { status: "suspended" },
          select: { id: true, status: true, updatedAt: true },
        });

    return res.json({
      status: "ok",
      account: {
        id: updated.id,
        status: updated.status,
      },
    });
  }),
);

businessRouter.post(
  "/accounts/:id/members",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const data = addMemberSchema.parse(req.body);
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can add members." });
    }

    const user = await resolveUserByIdentifier(data.identifier);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (user.role === "provider") {
      return res.status(400).json({ error: "Providers cannot join business accounts." });
    }

    const member = await prisma.businessMember.upsert({
      where: {
        accountId_userId: {
          accountId,
          userId: user.id,
        },
      },
      update: {
        role: data.role ?? "member",
        status: "active",
      },
      create: {
        accountId,
        userId: user.id,
        role: data.role ?? "member",
        status: "active",
      },
      include: {
        user: {
          select: { id: true, email: true, phone: true, username: true, role: true },
        },
      },
    });

    res.status(201).json({
      member: {
        id: member.id,
        role: member.role,
        status: member.status,
        user: member.user,
      },
    });
  }),
);

businessRouter.patch(
  "/accounts/:id/members/:memberId",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const memberId = req.params.memberId;
    const data = updateMemberSchema.parse(req.body);
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can update members." });
    }

    const member = await prisma.businessMember.findUnique({
      where: { id: memberId },
      select: { id: true, accountId: true, userId: true, role: true, status: true },
    });

    if (!member || member.accountId !== accountId) {
      return res.status(404).json({ error: "Member not found." });
    }

    const nextRole = data.role ?? member.role;
    const nextStatus = data.status ?? member.status;
    const canTransition = await canTransitionMembership({
      accountId,
      currentRole: member.role,
      currentStatus: member.status,
      nextRole,
      nextStatus,
    });

    if (!canTransition) {
      return res
        .status(400)
        .json({ error: "This account must always have at least one active owner." });
    }

    const updated = await prisma.businessMember.update({
      where: { id: memberId },
      data: {
        role: nextRole,
        status: nextStatus,
      },
      include: {
        user: {
          select: { id: true, email: true, phone: true, username: true, role: true },
        },
      },
    });

    res.json({
      member: {
        id: updated.id,
        role: updated.role,
        status: updated.status,
        user: updated.user,
      },
    });
  }),
);

businessRouter.delete(
  "/accounts/:id/members/:memberId",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const memberId = req.params.memberId;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can remove members." });
    }

    const member = await prisma.businessMember.findUnique({
      where: { id: memberId },
      select: { id: true, accountId: true, role: true, status: true },
    });

    if (!member || member.accountId !== accountId) {
      return res.status(404).json({ error: "Member not found." });
    }

    const canTransition = await canTransitionMembership({
      accountId,
      currentRole: member.role,
      currentStatus: member.status,
      nextRole: member.role,
      nextStatus: "removed",
    });

    if (!canTransition) {
      return res
        .status(400)
        .json({ error: "This account must always have at least one active owner." });
    }

    await prisma.businessMember.update({
      where: { id: memberId },
      data: { status: "removed" },
    });

    res.json({ status: "ok" });
  }),
);

businessRouter.post(
  "/accounts/:id/jobs",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    const data = createJobSchema.parse(req.body);
    const job = await prisma.businessJob.create({
      data: {
        accountId,
        title: data.title,
        description: data.description,
        category: data.category,
        budget:
          data.budget !== undefined && data.budget !== null
            ? new Prisma.Decimal(data.budget)
            : undefined,
        currency: data.currency ?? "GHS",
        requestedById: req.user!.id,
      },
    });

    res.status(201).json({ job: serializeBusinessJob(job) });
  }),
);

businessRouter.get(
  "/accounts/:id/jobs",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    const query = listJobsQuerySchema.parse(req.query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.BusinessJobWhereInput = {
      accountId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category
        ? {
            category: {
              contains: query.category,
              mode: "insensitive",
            },
          }
        : {}),
    };

    const [jobs, total] = await prisma.$transaction([
      prisma.businessJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.businessJob.count({ where }),
    ]);

    res.json({
      jobs: jobs.map(serializeBusinessJob),
      filters: {
        status: query.status ?? null,
        category: query.category ?? null,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasPrev: page > 1,
        hasNext: skip + jobs.length < total,
      },
    });
  }),
);

businessRouter.get(
  "/accounts/:id/jobs/:jobId",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const jobId = req.params.jobId;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    const job = await prisma.businessJob.findUnique({
      where: { id: jobId },
      include: {
        requestedBy: { select: publicUserSelect },
        assignedProvider: { select: publicUserSelect },
        order: {
          select: {
            id: true,
            status: true,
            amountGross: true,
            currency: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!job || job.accountId !== accountId) {
      return res.status(404).json({ error: "Job not found." });
    }

    return res.json({
      job: {
        ...serializeBusinessJob(job),
        requestedBy: job.requestedBy,
        assignedProvider: job.assignedProvider,
        order: job.order
          ? {
              id: job.order.id,
              status: job.order.status,
              amountGross: job.order.amountGross.toString(),
              currency: job.order.currency,
              createdAt: job.order.createdAt,
              updatedAt: job.order.updatedAt,
            }
          : null,
      },
    });
  }),
);

businessRouter.post(
  "/accounts/:id/jobs/:jobId/cancel",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const jobId = req.params.jobId;
    const data = cancelJobSchema.parse(req.body);
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can cancel jobs." });
    }

    const job = await prisma.businessJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        accountId: true,
        title: true,
        status: true,
        orderId: true,
        requestedById: true,
        assignedProviderId: true,
      },
    });

    if (!job || job.accountId !== accountId) {
      return res.status(404).json({ error: "Job not found." });
    }

    if (job.status === "closed") {
      return res.status(400).json({ error: "Closed jobs cannot be cancelled." });
    }
    if (job.status === "cancelled") {
      return res.status(400).json({ error: "Job is already cancelled." });
    }
    if (job.orderId) {
      return res.status(409).json({
        error: "This job already has an order linked and cannot be cancelled here.",
      });
    }

    const updated = await prisma.businessJob.update({
      where: { id: jobId },
      data: { status: "cancelled" },
    });

    const recipientIds = [...new Set([job.requestedById, job.assignedProviderId])]
      .filter((value): value is string => Boolean(value))
      .filter((value) => value !== req.user!.id);

    if (recipientIds.length > 0) {
      await Promise.all(
        recipientIds.map((userId) =>
          createNotification({
            userId,
            actorId: req.user!.id,
            type: "order_status",
            title: "Business job cancelled",
            body: `${job.title} was cancelled. Reason: ${data.reason}`,
            data: {
              accountId,
              jobId: job.id,
              reason: data.reason,
              status: "cancelled",
            },
          }),
        ),
      );
    }

    return res.json({
      job: serializeBusinessJob(updated),
      cancellation: {
        reason: data.reason,
        cancelledById: req.user!.id,
        cancelledAt: updated.updatedAt,
      },
    });
  }),
);

businessRouter.patch(
  "/accounts/:id/jobs/:jobId",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const jobId = req.params.jobId;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }
    const data = updateJobSchema.parse(req.body);

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can update jobs." });
    }

    const job = await prisma.businessJob.findUnique({
      where: { id: jobId },
      select: { id: true, accountId: true },
    });

    if (!job || job.accountId !== accountId) {
      return res.status(404).json({ error: "Job not found." });
    }

    const updated = await prisma.businessJob.update({
      where: { id: jobId },
      data: {
        status: data.status,
        assignedProviderId: data.assignedProviderId,
      },
    });

    res.json({ job: serializeBusinessJob(updated) });
  }),
);

businessRouter.post(
  "/accounts/:id/jobs/:jobId/order",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const jobId = req.params.jobId;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can create orders." });
    }

    const data = createOrderSchema.parse(req.body);
    const { settings } = await getPlatformSettings();

    const job = await prisma.businessJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        accountId: true,
        status: true,
        orderId: true,
        assignedProviderId: true,
        requestedById: true,
      },
    });

    if (!job || job.accountId !== accountId) {
      return res.status(404).json({ error: "Job not found." });
    }
    if (job.status === "cancelled" || job.status === "closed") {
      return res.status(400).json({ error: "Job is not active." });
    }
    if (job.orderId) {
      return res.status(409).json({ error: "This job already has an order linked." });
    }

    const tier = await prisma.serviceTier.findUnique({
      where: { id: data.tierId },
      include: { service: true },
    });

    if (!tier || tier.serviceId !== data.serviceId) {
      return res.status(400).json({ error: "Invalid service tier." });
    }

    if (tier.service.status !== "published") {
      return res.status(400).json({ error: "Service is not available for ordering." });
    }

    if (job.assignedProviderId && job.assignedProviderId !== tier.service.providerId) {
      return res.status(400).json({ error: "Job is assigned to a different provider." });
    }

    const quantity = data.quantity ?? 1;
    const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const isPerUnit = tier.pricingType === "per_unit";
    const gross = isPerUnit ? tier.price.mul(normalizedQuantity) : tier.price;
    const fee = gross.mul(settings.platformFeeBps).div(10000);
    const tax = fee.mul(settings.taxBps).div(10000);
    const net = gross.sub(fee).sub(tax);

    const buyerId = job.requestedById ?? req.user!.id;

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          buyerId,
          providerId: tier.service.providerId,
          serviceId: data.serviceId,
          tierId: data.tierId,
          quantity: isPerUnit ? normalizedQuantity : 1,
          amountGross: gross,
          platformFee: fee,
          taxAmount: tax,
          amountNetProvider: net,
          currency: tier.currency,
          businessAccountId: accountId,
          events: { create: { type: "created" } },
        },
        include: {
          service: true,
          tier: true,
          buyer: { select: publicUserSelect },
          provider: { select: publicUserSelect },
        },
      });

      await tx.businessJob.update({
        where: { id: job.id },
        data: {
          status: "assigned",
          assignedProviderId: tier.service.providerId,
          orderId: created.id,
        },
      });

      return created;
    });

    const serviceTitle = order.service?.title ?? "service";
    await Promise.all([
      createNotification({
        userId: order.providerId,
        actorId: buyerId,
        type: "order_created",
        title: "New business order received",
        body: `New order for ${serviceTitle}.`,
        data: { orderId: order.id, serviceId: order.serviceId },
      }),
      createNotification({
        userId: buyerId,
        actorId: order.providerId,
        type: "order_created",
        title: "Business order created",
        body: `Your order for ${serviceTitle} was created.`,
        data: { orderId: order.id, serviceId: order.serviceId },
      }),
    ]);

    res.status(201).json({ order });
  }),
);

businessRouter.get(
  "/accounts/:id/analytics",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const query = businessAnalyticsQuerySchema.parse(req.query);
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    const now = new Date();
    const periodStart = query.months
      ? new Date(now.getFullYear(), now.getMonth() - query.months, now.getDate())
      : null;
    const periodFilter = periodStart ? { gte: periodStart, lte: now } : undefined;

    const [jobStatusRows, orderSpendRows, invoiceRows] = await Promise.all([
      prisma.businessJob.groupBy({
        by: ["status"],
        where: { accountId },
        _count: { _all: true },
      }),
      prisma.order.groupBy({
        by: ["currency"],
        where: {
          businessAccountId: accountId,
          ...(periodFilter ? { createdAt: periodFilter } : {}),
        },
        _sum: { amountGross: true },
        _count: { _all: true },
      }),
      prisma.businessInvoice.groupBy({
        by: ["status", "currency"],
        where: {
          accountId,
          ...(periodFilter ? { createdAt: periodFilter } : {}),
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
    ]);

    const jobCounts: Record<"open" | "assigned" | "closed" | "cancelled", number> = {
      open: 0,
      assigned: 0,
      closed: 0,
      cancelled: 0,
    };
    for (const row of jobStatusRows) {
      jobCounts[row.status] = row._count._all;
    }

    const addCurrencyAmount = (
      target: Map<string, Prisma.Decimal>,
      currency: string,
      amount: Prisma.Decimal,
    ) => {
      const current = target.get(currency) ?? new Prisma.Decimal(0);
      target.set(currency, current.add(amount));
    };
    const toCurrencyTotals = (target: Map<string, Prisma.Decimal>) =>
      [...target.entries()].map(([currency, total]) => ({
        currency,
        total: total.toString(),
      }));

    const invoiceCounts: Record<"draft" | "issued" | "paid" | "void", number> = {
      draft: 0,
      issued: 0,
      paid: 0,
      void: 0,
    };
    const paidInvoiceTotals = new Map<string, Prisma.Decimal>();
    const unpaidInvoiceTotals = new Map<string, Prisma.Decimal>();

    for (const row of invoiceRows) {
      invoiceCounts[row.status] += row._count._all;
      const amount = row._sum.total ?? new Prisma.Decimal(0);

      if (row.status === "paid") {
        addCurrencyAmount(paidInvoiceTotals, row.currency, amount);
      }
      if (row.status === "draft" || row.status === "issued") {
        addCurrencyAmount(unpaidInvoiceTotals, row.currency, amount);
      }
    }

    const totalOrders = orderSpendRows.reduce((sum, row) => sum + row._count._all, 0);
    const totalInvoices =
      invoiceCounts.draft + invoiceCounts.issued + invoiceCounts.paid + invoiceCounts.void;

    return res.json({
      analytics: {
        period: {
          months: query.months ?? null,
          from: periodStart,
          to: now,
        },
        jobs: {
          total: jobCounts.open + jobCounts.assigned + jobCounts.closed + jobCounts.cancelled,
          open: jobCounts.open,
          assigned: jobCounts.assigned,
          closed: jobCounts.closed,
          cancelled: jobCounts.cancelled,
        },
        spending: {
          orderCount: totalOrders,
          totalsByCurrency: orderSpendRows.map((row) => ({
            currency: row.currency,
            total: (row._sum.amountGross ?? new Prisma.Decimal(0)).toString(),
            orderCount: row._count._all,
          })),
        },
        invoices: {
          counts: {
            total: totalInvoices,
            draft: invoiceCounts.draft,
            issued: invoiceCounts.issued,
            paid: invoiceCounts.paid,
            void: invoiceCounts.void,
            unpaid: invoiceCounts.draft + invoiceCounts.issued,
          },
          paidTotalsByCurrency: toCurrencyTotals(paidInvoiceTotals),
          unpaidTotalsByCurrency: toCurrencyTotals(unpaidInvoiceTotals),
        },
      },
    });
  }),
);

const serializeInvoice = (invoice: {
  id: string;
  accountId: string;
  periodStart: Date;
  periodEnd: Date;
  total: Prisma.Decimal;
  currency: string;
  status: string;
  issuedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { orders: number };
}) => ({
  id: invoice.id,
  accountId: invoice.accountId,
  periodStart: invoice.periodStart,
  periodEnd: invoice.periodEnd,
  total: invoice.total.toString(),
  currency: invoice.currency,
  status: invoice.status,
  issuedAt: invoice.issuedAt,
  paidAt: invoice.paidAt,
  orderCount: invoice._count?.orders ?? 0,
  createdAt: invoice.createdAt,
  updatedAt: invoice.updatedAt,
});

businessRouter.get(
  "/accounts/:id/invoices",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    const invoices = await prisma.businessInvoice.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { orders: true } } },
    });

    res.json({ invoices: invoices.map(serializeInvoice) });
  }),
);

businessRouter.post(
  "/accounts/:id/invoices",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const accountId = req.params.id;
    const access = await ensureAccountAccess(accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this business account." });
    }

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can issue invoices." });
    }

    const data = createInvoiceSchema.parse(req.body);
    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);

    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return res.status(400).json({ error: "Invalid invoice period." });
    }

    if (periodEnd <= periodStart) {
      return res.status(400).json({ error: "Invoice end date must be after start date." });
    }

    const orders = await prisma.order.findMany({
      where: {
        businessAccountId: accountId,
        businessInvoiceId: null,
        status: "created",
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: { id: true, amountGross: true, currency: true },
    });

    if (orders.length === 0) {
      return res.status(400).json({ error: "No billable orders found for this period." });
    }

    const currency = orders[0].currency;
    if (orders.some((order) => order.currency !== currency)) {
      return res.status(400).json({ error: "Mixed currencies are not supported in one invoice." });
    }

    const total = orders.reduce(
      (sum, order) => sum.add(order.amountGross),
      new Prisma.Decimal(0),
    );

    const status = data.status ?? "issued";
    const now = new Date();

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.businessInvoice.create({
        data: {
          accountId,
          periodStart,
          periodEnd,
          total,
          currency,
          status,
          issuedAt: status === "issued" ? now : null,
          metadata: { orderIds: orders.map((order) => order.id) },
        },
      });

      await tx.order.updateMany({
        where: { id: { in: orders.map((order) => order.id) } },
        data: { businessInvoiceId: created.id },
      });

      return created;
    });

    res.status(201).json({ invoice: serializeInvoice(invoice) });
  }),
);

businessRouter.get(
  "/invoices/:invoiceId",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const invoiceId = req.params.invoiceId;

    const invoice = await prisma.businessInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        _count: { select: { orders: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            amountGross: true,
            currency: true,
            buyerId: true,
            providerId: true,
            serviceId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found." });
    }

    const access = await ensureAccountAccess(invoice.accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this invoice." });
    }

    return res.json({
      invoice: {
        ...serializeInvoice(invoice),
        orders: invoice.orders.map((order) => ({
          id: order.id,
          status: order.status,
          amountGross: order.amountGross.toString(),
          currency: order.currency,
          buyerId: order.buyerId,
          providerId: order.providerId,
          serviceId: order.serviceId,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        })),
      },
    });
  }),
);

businessRouter.post(
  "/invoices/:invoiceId/void",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const invoiceId = req.params.invoiceId;
    const data = voidInvoiceSchema.parse(req.body ?? {});

    const invoice = await prisma.businessInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        _count: { select: { orders: true } },
        orders: { select: { id: true } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found." });
    }

    const access = await ensureAccountAccess(invoice.accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this invoice." });
    }

    if (!access.canManage) {
      return res.status(403).json({ error: "Only account admins can void invoices." });
    }

    if (invoice.status === "paid") {
      return res.status(400).json({ error: "Paid invoices cannot be voided." });
    }

    if (invoice.status === "void") {
      return res.json({
        invoice: serializeInvoice(invoice),
        releasedOrderCount: 0,
        reason: data.reason ?? null,
      });
    }

    const releasedOrderCount = invoice.orders.length;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { businessInvoiceId: invoice.id },
        data: { businessInvoiceId: null },
      });

      return tx.businessInvoice.update({
        where: { id: invoice.id },
        data: { status: "void" },
        include: { _count: { select: { orders: true } } },
      });
    });

    return res.json({
      invoice: serializeInvoice(updated),
      releasedOrderCount,
      reason: data.reason ?? null,
    });
  }),
);

businessRouter.post(
  "/invoices/:invoiceId/checkout",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const invoiceId = req.params.invoiceId;
    const data = checkoutInvoiceSchema.parse(req.body);
    const { settings } = await getPlatformSettings();

    const enabledProviders = settings.integrations.payments.enabledProviders;
    if (!enabledProviders.includes(data.provider)) {
      return res.status(400).json({ error: "Payment provider is currently disabled." });
    }

    const flutterwaveSecret =
      settings.integrations.payments.flutterwaveSecretKey || env.FLUTTERWAVE_SECRET_KEY;
    const paystackSecret =
      settings.integrations.payments.paystackSecretKey || env.PAYSTACK_SECRET_KEY;
    const stripeSecret =
      settings.integrations.payments.stripeSecretKey || env.STRIPE_SECRET_KEY;
    const hubtelConfig = resolveHubtelConfig(settings);
    const expresspayConfig = resolveExpresspayConfig(settings);

    if (data.provider === "flutterwave" && !flutterwaveSecret) {
      return res.status(400).json({ error: "Flutterwave is not configured." });
    }
    if (data.provider === "paystack" && !paystackSecret) {
      return res.status(400).json({ error: "Paystack is not configured." });
    }
    if (data.provider === "stripe" && !stripeSecret) {
      return res.status(400).json({ error: "Stripe is not configured." });
    }
    if (data.provider === "hubtel" && !hubtelConfig) {
      return res.status(400).json({ error: "Hubtel is not configured." });
    }
    if (data.provider === "expresspay" && !expresspayConfig) {
      return res.status(400).json({ error: "ExpressPay is not configured." });
    }

    const hubtelPhone =
      data.provider === "hubtel" ? normalizeHubtelPhone(req.user!.phone) : null;
    if (data.provider === "hubtel" && !hubtelPhone) {
      return res.status(400).json({
        error: "Hubtel requires a valid phone number in E.164 format.",
      });
    }
    const expresspayPhone =
      data.provider === "expresspay" ? normalizeExpresspayPhone(req.user!.phone) : null;
    if (data.provider === "expresspay" && !expresspayPhone) {
      return res.status(400).json({
        error: "ExpressPay requires a valid phone number.",
      });
    }

    const invoice = await prisma.businessInvoice.findUnique({
      where: { id: invoiceId },
      include: { account: true, orders: { select: { id: true } } },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found." });
    }

    const access = await ensureAccountAccess(invoice.accountId, req.user!);
    if (!access) {
      return res.status(403).json({ error: "You do not have access to this invoice." });
    }

    if (invoice.status === "paid" || invoice.status === "void") {
      return res.status(400).json({ error: "Invoice is not payable." });
    }
    const providerCurrencyError = getProviderCurrencyError(data.provider, invoice.currency);
    if (providerCurrencyError) {
      return res.status(400).json({ error: providerCurrencyError });
    }

    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        provider: data.provider,
        status: "created",
        amount: invoice.total,
        currency: invoice.currency,
        metadata: {
          purpose: "invoice",
          invoiceId: invoice.id,
          accountId: invoice.accountId,
          payerId: req.user!.id,
          orderIds: invoice.orders.map((order) => order.id),
        },
      },
    });

    try {
      if (data.provider === "flutterwave") {
        const txRef = `scg_invoice_${paymentIntent.id}`;
        const paymentOptions = data.method === "card" ? "card" : "mobilemoneyghana";

        const response = await fetch("https://api.flutterwave.com/v3/payments", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${flutterwaveSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tx_ref: txRef,
            amount: paymentIntent.amount.toFixed(2),
            currency: paymentIntent.currency,
            redirect_url: `${appUrl}/payment/verify?provider=flutterwave&purpose=invoice`,
            payment_options: paymentOptions,
            customer: {
              email: req.user!.email ?? `${req.user!.id}@servfix.local`,
              phonenumber: req.user!.phone ?? undefined,
            },
            meta: {
              paymentIntentId: paymentIntent.id,
              purpose: "invoice",
            },
            customizations: {
              title: "SERVFIX",
              description: `Business invoice ${invoice.id}`,
            },
          }),
        });

        const payload = (await response.json()) as {
          status?: string;
          message?: string;
          data?: { link?: string };
        };

        if (!response.ok || payload.status !== "success" || !payload.data?.link) {
          await prisma.paymentIntent.update({
            where: { id: paymentIntent.id },
            data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
          });
          return res.status(400).json({
            error: payload.message ?? "Unable to initialize Flutterwave payment.",
          });
        }

        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "pending",
            providerRef: txRef,
            metadata: {
              purpose: "invoice",
              invoiceId: invoice.id,
              accountId: invoice.accountId,
              payerId: req.user!.id,
              flutterwave: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data.link,
          paymentIntentId: paymentIntent.id,
          provider: "flutterwave",
        });
      }

      if (data.provider === "paystack") {
        const reference = `scg_invoice_${paymentIntent.id}`;
        const channels =
          data.method === "mobile_money"
            ? ["mobile_money"]
            : data.method === "card"
              ? ["card"]
              : undefined;

        const payloadBody: Record<string, unknown> = {
          email: req.user!.email ?? `${req.user!.id}@servfix.local`,
          amount: toMinorUnits(paymentIntent.amount),
          currency: paymentIntent.currency,
          reference,
          callback_url: `${appUrl}/payment/verify?provider=paystack&purpose=invoice`,
          metadata: {
            paymentIntentId: paymentIntent.id,
            purpose: "invoice",
            invoiceId: invoice.id,
            accountId: invoice.accountId,
            payerId: req.user!.id,
          },
        };

        if (channels) {
          payloadBody.channels = channels;
        }

        const response = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payloadBody),
        });

        const payload = (await response.json()) as {
          status?: boolean;
          message?: string;
          data?: { authorization_url?: string; reference?: string };
        };

        if (!response.ok || !payload.status || !payload.data?.authorization_url) {
          await prisma.paymentIntent.update({
            where: { id: paymentIntent.id },
            data: { status: "failed", metadata: toJsonInput(payload as Prisma.JsonValue) },
          });
          return res.status(400).json({
            error: payload.message ?? "Unable to initialize Paystack payment.",
          });
        }

        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "pending",
            providerRef: payload.data.reference ?? reference,
            metadata: {
              purpose: "invoice",
              invoiceId: invoice.id,
              accountId: invoice.accountId,
              payerId: req.user!.id,
              paystack: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data.authorization_url,
          paymentIntentId: paymentIntent.id,
          provider: "paystack",
        });
      }

      if (data.provider === "expresspay") {
        const redirectUrl = `${appUrl}/payment/verify?provider=expresspay&purpose=invoice`;
        const postUrl = `${appUrl}/api/webhooks/expresspay`;
        const customer = buildExpresspayCustomer(req.user!);

        const payload = await createExpresspayCheckout(expresspayConfig!, {
          amount: paymentIntent.amount.toFixed(2),
          currency: paymentIntent.currency,
          orderId: paymentIntent.id,
          redirectUrl,
          postUrl,
          customer: {
            ...customer,
            phonenumber: expresspayPhone!,
          },
          orderDesc: `Business invoice ${invoice.id}`,
        });

        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "pending",
            providerRef: payload.token,
            metadata: {
              purpose: "invoice",
              invoiceId: invoice.id,
              accountId: invoice.accountId,
              payerId: req.user!.id,
              expresspay: payload as unknown as Prisma.InputJsonValue,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.checkoutUrl,
          paymentIntentId: paymentIntent.id,
          provider: "expresspay",
        });
      }

      if (data.provider === "hubtel") {
        const callbackUrl = `${appUrl}/api/webhooks/hubtel`;
        const returnUrl = `${appUrl}/payment/verify?provider=hubtel&purpose=invoice&reference=${paymentIntent.id}`;
        const cancellationUrl = `${appUrl}/business?payment=cancelled`;

        const payload = await createHubtelPaylink(hubtelConfig!, {
          mobileNumber: hubtelPhone!,
          amount: Number(paymentIntent.amount.toFixed(2)),
          title: "SERVFIX",
          description: `Business invoice ${invoice.id}`,
          clientReference: paymentIntent.id,
          callbackUrl,
          returnUrl,
          cancellationUrl,
        });

        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            status: "pending",
            providerRef:
              payload.data?.paylinkId ??
              payload.data?.transactionId ??
              paymentIntent.id,
            metadata: {
              purpose: "invoice",
              invoiceId: invoice.id,
              accountId: invoice.accountId,
              payerId: req.user!.id,
              hubtel: payload,
            },
          },
        });

        return res.json({
          checkoutUrl: payload.data?.paylinkUrl,
          paymentIntentId: paymentIntent.id,
          provider: "hubtel",
        });
      }

      const amountMinor = toMinorUnits(paymentIntent.amount);
      const stripeBody = new URLSearchParams();
      stripeBody.append("mode", "payment");
      stripeBody.append(
        "success_url",
        `${appUrl}/payment/verify?provider=stripe&purpose=invoice&session_id={CHECKOUT_SESSION_ID}`,
      );
      stripeBody.append("cancel_url", `${appUrl}/business?payment=cancelled`);
      stripeBody.append("line_items[0][price_data][currency]", paymentIntent.currency.toLowerCase());
      stripeBody.append("line_items[0][price_data][product_data][name]", "SERVFIX Business Invoice");
      stripeBody.append("line_items[0][price_data][unit_amount]", String(amountMinor));
      stripeBody.append("line_items[0][quantity]", "1");
      stripeBody.append("metadata[paymentIntentId]", paymentIntent.id);
      stripeBody.append("metadata[purpose]", "invoice");
      stripeBody.append("client_reference_id", paymentIntent.id);
      if (req.user!.email) {
        stripeBody.append("customer_email", req.user!.email);
      }

      const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: stripeBody.toString(),
      });

      const stripePayload = (await stripeResponse.json()) as {
        id?: string;
        url?: string;
        error?: { message?: string };
      };

      if (!stripeResponse.ok || !stripePayload.id || !stripePayload.url) {
        await prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: { status: "failed", metadata: toJsonInput(stripePayload as Prisma.JsonValue) },
        });
        return res
          .status(400)
          .json({ error: stripePayload.error?.message ?? "Unable to initialize Stripe payment." });
      }

      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: {
          status: "pending",
          providerRef: stripePayload.id,
          metadata: {
            purpose: "invoice",
            invoiceId: invoice.id,
            accountId: invoice.accountId,
            payerId: req.user!.id,
            stripe: stripePayload,
          },
        },
      });

      return res.json({
        checkoutUrl: stripePayload.url,
        paymentIntentId: paymentIntent.id,
        provider: "stripe",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to initialize payment.";
      await prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: "failed", metadata: { error: message } },
      });
      return res.status(400).json({ error: message });
    }
  }),
);
