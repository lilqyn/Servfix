import { Router } from "express";
import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { normalizeS3Key, signS3Key } from "../utils/s3.js";
import { createNotification } from "../utils/notifications.js";
import { getPlatformSettings } from "../utils/platform-settings.js";

export const servicesRouter = Router();

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop";

const resolveMediaUrl = async (key?: string | null) => {
  if (!key) {
    return DEFAULT_AVATAR;
  }
  if (key.startsWith("http")) {
    return key;
  }
  const signed = await signS3Key(key);
  return signed ?? DEFAULT_AVATAR;
};

const querySchema = z.object({
  status: z.enum(["draft", "published", "suspended"]).optional(),
  category: z.string().optional(),
  providerId: z.string().uuid().optional(),
});

const imagesSchema = z.array(z.string().min(1)).max(5).optional();

const locationSchema = z
  .object({
    city: z.string().min(1).optional(),
    areas: z.array(z.string()).optional(),
    isRemote: z.boolean().optional(),
  })
  .optional();

const availabilitySchema = z
  .object({
    days: z.array(z.string()).optional(),
    startTime: z.string().min(1).optional(),
    endTime: z.string().min(1).optional(),
    advanceBooking: z.coerce.number().int().min(0).optional(),
    maxBookingsPerDay: z.coerce.number().int().min(0).optional(),
  })
  .optional();

const reviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(20).max(2000),
  images: z.array(z.string().min(1)).max(6).optional(),
});

const formatReviewDate = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const formatReviewerName = (author: {
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  role: string;
  providerProfile?: { displayName?: string | null } | null;
}) => {
  if (author.providerProfile?.displayName) {
    return author.providerProfile.displayName;
  }
  if (author.username) {
    return `@${author.username}`;
  }
  if (author.email) {
    return author.email;
  }
  if (author.phone) {
    return author.phone;
  }
  return author.role === "provider" ? "Provider" : "Buyer";
};

const containsBlockedKeyword = (value: string, keywords: string[]) => {
  if (!value || keywords.length === 0) return false;
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => keyword && normalized.includes(keyword));
};

const buildReviewSummary = async (serviceId: string, excludeIds: string[] = []) => {
  const where = excludeIds.length > 0 ? { serviceId, id: { notIn: excludeIds } } : { serviceId };
  const [aggregate, breakdown] = await Promise.all([
    prisma.review.aggregate({
      where,
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where,
      _count: { rating: true },
    }),
  ]);

  const ratingBreakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  breakdown.forEach((row) => {
    ratingBreakdown[row.rating] = row._count.rating;
  });

  const avg = aggregate._avg.rating ? Number(aggregate._avg.rating) : 0;
  const averageRating = Math.round(avg * 10) / 10;

  return {
    averageRating,
    totalReviews: aggregate._count.rating ?? 0,
    ratingBreakdown,
  };
};

const updateProviderRating = async (providerId: string) => {
  const aggregate = await prisma.review.aggregate({
    where: { providerId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const avg = aggregate._avg.rating ? Number(aggregate._avg.rating) : 0;
  const ratingAvg = Math.round(avg * 10) / 10;

  await prisma.providerProfile.updateMany({
    where: { userId: providerId },
    data: {
      ratingAvg: new Prisma.Decimal(ratingAvg),
      ratingCount: aggregate._count.rating ?? 0,
    },
  });
};

type ServiceMediaItem = { url: string; [key: string]: unknown };
type ServiceProvider = { avatarKey?: string | null; [key: string]: unknown };
type ServiceWithMedia = {
  media?: ServiceMediaItem[];
  coverMedia?: ServiceMediaItem | null;
  provider?: ServiceProvider | null;
} & Record<string, unknown>;

const attachSignedMedia = async (service: ServiceWithMedia) => {
  const media = await Promise.all(
    (service.media ?? []).map(async (item: { url: string }) => {
      const key = normalizeS3Key(item.url);
      const signedUrl = await signS3Key(key);
      return {
        ...item,
        url: key,
        signedUrl: signedUrl ?? item.url,
      };
    }),
  );

  const coverMedia = service.coverMedia
    ? {
        ...service.coverMedia,
        url: normalizeS3Key(service.coverMedia.url),
        signedUrl:
          (await signS3Key(normalizeS3Key(service.coverMedia.url))) ??
          service.coverMedia.url,
      }
    : service.coverMedia ?? null;

  let provider = service.provider ?? null;
  if (provider) {
    const { avatarKey, ...rest } = provider;
    provider = {
      ...rest,
      avatarUrl: await resolveMediaUrl(avatarKey),
    };
  }

  return {
    ...service,
    media,
    coverMedia,
    provider,
  };
};

servicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    const where = {
      status: query.status ?? "published",
      category: query.category,
      providerId: query.providerId,
    };

    const services = await prisma.service.findMany({
      where,
      include: {
        tiers: true,
        media: true,
        coverMedia: true,
        provider: {
          select: {
            id: true,
            avatarKey: true,
            username: true,
            providerProfile: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const signed = await Promise.all(services.map((service) => attachSignedMedia(service)));

    res.json({ services: signed });
  }),
);

servicesRouter.get(
  "/mine",
  authRequired,
  requireRole("provider", "admin"),
  asyncHandler(async (req, res) => {
    const query = querySchema.pick({ status: true, category: true }).parse(req.query);
    const where: Prisma.ServiceWhereInput = {
      status: query.status,
      category: query.category,
    };

    if (req.user!.role === "provider") {
      where.providerId = req.user!.id;
    }

    const services = await prisma.service.findMany({
      where,
      include: {
        tiers: true,
        media: true,
        coverMedia: true,
        provider: {
          select: {
            id: true,
            avatarKey: true,
            providerProfile: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const signed = await Promise.all(services.map((service) => attachSignedMedia(service)));

    res.json({ services: signed });
  }),
);

servicesRouter.get(
  "/:id/reviews",
  asyncHandler(async (req, res) => {
    const query = reviewQuerySchema.parse(req.query);
    const limit = query.limit ?? 50;
    const { settings } = await getPlatformSettings();

    if (!settings.featureFlags.reviews) {
      return res.status(403).json({ error: "Reviews are currently disabled." });
    }

    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const reviews = await prisma.review.findMany({
      where: { serviceId: service.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            role: true,
            avatarKey: true,
            providerProfile: true,
          },
        },
      },
    });

    let hiddenIds: string[] = [];
    if (settings.reviewModeration.autoHideReportCount > 0 && reviews.length > 0) {
      const reportCounts = await prisma.report.groupBy({
        by: ["targetId"],
        where: {
          targetType: "review",
          status: "open",
          targetId: { in: reviews.map((review) => review.id) },
        },
        _count: { _all: true },
      });
      hiddenIds = reportCounts
        .filter((row) => row._count._all >= settings.reviewModeration.autoHideReportCount)
        .map((row) => row.targetId);
    }

    const hiddenSet = hiddenIds.length ? new Set(hiddenIds) : null;
    const visibleReviews = hiddenSet
      ? reviews.filter((review) => !hiddenSet.has(review.id))
      : reviews;

    const summary = await buildReviewSummary(service.id, hiddenIds);

    const formatted = await Promise.all(
      visibleReviews.map(async (review) => ({
        id: review.id,
        author: formatReviewerName(review.author),
        avatar: await resolveMediaUrl(review.author.avatarKey),
        rating: review.rating,
        date: formatReviewDate(review.createdAt),
        comment: review.comment,
        images: review.images ?? [],
        helpful: review.helpfulCount,
      })),
    );

    res.json({
      reviews: formatted,
      summary,
    });
  }),
);

servicesRouter.post(
  "/:id/reviews",
  authRequired,
  requireRole("buyer", "admin"),
  asyncHandler(async (req, res) => {
    const data = reviewSchema.parse(req.body);
    const userId = req.user!.id;
    const { settings } = await getPlatformSettings();

    if (!settings.featureFlags.reviews) {
      return res.status(403).json({ error: "Reviews are currently disabled." });
    }

    if (containsBlockedKeyword(data.comment.trim(), settings.reviewModeration.bannedKeywords)) {
      return res.status(400).json({ error: "Review contains blocked keywords." });
    }

    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      select: { id: true, providerId: true },
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (service.providerId === userId) {
      return res.status(403).json({ error: "You cannot review your own service" });
    }

    if (req.user!.role === "buyer") {
      const allowedStatuses: OrderStatus[] = ["delivered", "approved", "released"];
      const order = await prisma.order.findFirst({
        where: {
          buyerId: userId,
          serviceId: service.id,
          status: { in: allowedStatuses },
        },
        select: { id: true },
      });

      if (!order) {
        return res.status(403).json({ error: "You can only review services you've completed" });
      }
    }

    const existingReview = await prisma.review.findUnique({
      where: {
        serviceId_authorId: {
          serviceId: service.id,
          authorId: userId,
        },
      },
      select: { id: true },
    });

    const review = await prisma.review.upsert({
      where: {
        serviceId_authorId: {
          serviceId: service.id,
          authorId: userId,
        },
      },
      create: {
        serviceId: service.id,
        providerId: service.providerId,
        authorId: userId,
        rating: data.rating,
        comment: data.comment.trim(),
        images: data.images ?? [],
      },
      update: {
        rating: data.rating,
        comment: data.comment.trim(),
        images: data.images ?? [],
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            role: true,
            avatarKey: true,
            providerProfile: true,
          },
        },
      },
    });

    await updateProviderRating(service.providerId);
    const summary = await buildReviewSummary(service.id);

    await createNotification({
      userId: service.providerId,
      actorId: userId,
      type: "review_received",
      title: existingReview ? "Review updated" : "New review received",
      body: data.comment.trim().slice(0, 160),
      data: { serviceId: service.id, reviewId: review.id },
    });

    res.status(201).json({
      review: {
        id: review.id,
        author: formatReviewerName(review.author),
        avatar: await resolveMediaUrl(review.author.avatarKey),
        rating: review.rating,
        date: formatReviewDate(review.createdAt),
        comment: review.comment,
        images: review.images ?? [],
        helpful: review.helpfulCount,
      },
      summary,
    });
  }),
);

servicesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        tiers: true,
        media: true,
        coverMedia: true,
        provider: {
          select: {
            id: true,
            avatarKey: true,
            username: true,
            providerProfile: true,
          },
        },
      },
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const signed = await attachSignedMedia(service);

    res.json({ service: signed });
  }),
);

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  category: z.string().min(2),
  tags: z.array(z.string()).default([]),
  status: z.enum(["draft", "published", "suspended"]).optional(),
  images: imagesSchema,
  location: locationSchema,
  availability: availabilitySchema,
  tiers: z
    .array(
      z.object({
        name: z.enum(["basic", "standard", "premium"]),
        price: z.coerce.number().positive(),
        currency: z.enum(["GHS", "USD", "EUR"]).optional(),
        deliveryDays: z.coerce.number().int().positive(),
        revisionCount: z.coerce.number().int().min(0).optional(),
        pricingType: z.enum(["flat", "per_unit"]).optional(),
        unitLabel: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

servicesRouter.post(
  "/",
  authRequired,
  requireRole("provider", "admin"),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const images = (data.images ?? [])
      .map((image) => normalizeS3Key(image.trim()))
      .filter(Boolean);

    const mediaCreate =
      images.length > 0
        ? images.map((url, index) => ({
            url,
            type: "image",
            sortOrder: index,
          }))
        : undefined;

    const service = await prisma.service.create({
      data: {
        providerId: req.user!.id,
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags,
        status: data.status ?? "draft",
        locationCity: data.location?.city ?? null,
        locationAreas: data.location?.areas ?? [],
        isRemote: data.location?.isRemote ?? false,
        availabilityDays: data.availability?.days ?? [],
        availabilityStartTime: data.availability?.startTime ?? null,
        availabilityEndTime: data.availability?.endTime ?? null,
        advanceBookingDays: data.availability?.advanceBooking ?? null,
        maxBookingsPerDay: data.availability?.maxBookingsPerDay ?? null,
        tiers: {
          create: data.tiers.map((tier) => ({
            name: tier.name,
            price: new Prisma.Decimal(tier.price),
            currency: tier.currency ?? "GHS",
            deliveryDays: tier.deliveryDays,
            revisionCount: tier.revisionCount ?? 0,
            pricingType: tier.pricingType ?? "flat",
            unitLabel: tier.unitLabel ?? null,
          })),
        },
        media: mediaCreate ? { create: mediaCreate } : undefined,
      },
      include: {
        tiers: true,
        media: true,
        coverMedia: true,
        provider: {
          select: {
            id: true,
            avatarKey: true,
            providerProfile: true,
          },
        },
      },
    });

    let created = service;
    if (service.media.length > 0) {
      created = await prisma.service.update({
        where: { id: service.id },
        data: { coverMediaId: service.media[0].id },
        include: {
          tiers: true,
          media: true,
          coverMedia: true,
          provider: {
            select: {
              id: true,
              avatarKey: true,
              providerProfile: true,
            },
          },
        },
      });
    }

    const signed = await attachSignedMedia(created);

    res.status(201).json({ service: signed });
  }),
);

servicesRouter.put(
  "/:id",
  authRequired,
  requireRole("provider", "admin"),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const images = data.images
      ? data.images.map((image) => normalizeS3Key(image.trim())).filter(Boolean)
      : undefined;

    const existing = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: { tiers: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Service not found" });
    }

    if (req.user!.role === "provider" && existing.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const incomingTierNames = new Set(data.tiers.map((tier) => tier.name));
    const existingTiers = await prisma.serviceTier.findMany({
      where: { serviceId: existing.id },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    const removableTiers = existingTiers.filter((tier) => !incomingTierNames.has(tier.name));
    const blockedTiers = removableTiers.filter((tier) => tier._count.orders > 0);

    if (blockedTiers.length > 0) {
      return res.status(409).json({
        error: "Cannot remove tiers with existing orders",
        meta: { tiers: blockedTiers.map((tier) => tier.name) },
      });
    }

    if (removableTiers.length > 0) {
      await prisma.serviceTier.deleteMany({
        where: {
          serviceId: existing.id,
          name: { in: removableTiers.map((tier) => tier.name) },
        },
      });
    }

    const mediaUpdate =
      images !== undefined
        ? {
            deleteMany: {},
            create: images.map((url, index) => ({
              url,
              type: "image",
              sortOrder: index,
            })),
          }
        : undefined;

    const updated = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags,
        status: data.status ?? existing.status,
        locationCity: data.location?.city ?? existing.locationCity,
        locationAreas: data.location?.areas ?? existing.locationAreas,
        isRemote: data.location?.isRemote ?? existing.isRemote,
        availabilityDays: data.availability?.days ?? existing.availabilityDays,
        availabilityStartTime: data.availability?.startTime ?? existing.availabilityStartTime,
        availabilityEndTime: data.availability?.endTime ?? existing.availabilityEndTime,
        advanceBookingDays: data.availability?.advanceBooking ?? existing.advanceBookingDays,
        maxBookingsPerDay: data.availability?.maxBookingsPerDay ?? existing.maxBookingsPerDay,
        coverMediaId: images !== undefined ? null : undefined,
        tiers: {
          upsert: data.tiers.map((tier) => ({
            where: {
              serviceId_name: {
                serviceId: existing.id,
                name: tier.name,
              },
            },
            create: {
              name: tier.name,
              price: new Prisma.Decimal(tier.price),
              currency: tier.currency ?? "GHS",
              deliveryDays: tier.deliveryDays,
              revisionCount: tier.revisionCount ?? 0,
              pricingType: tier.pricingType ?? "flat",
              unitLabel: tier.unitLabel ?? null,
            },
            update: {
              price: new Prisma.Decimal(tier.price),
              currency: tier.currency ?? "GHS",
              deliveryDays: tier.deliveryDays,
              revisionCount: tier.revisionCount ?? 0,
              pricingType: tier.pricingType ?? "flat",
              unitLabel: tier.unitLabel ?? null,
            },
          })),
        },
        media: mediaUpdate,
      },
      include: {
        tiers: true,
        media: true,
        coverMedia: true,
        provider: {
          select: {
            id: true,
            avatarKey: true,
            providerProfile: true,
          },
        },
      },
    });

    let service = updated;

    if (images !== undefined && updated.media.length > 0) {
      const cover = await prisma.serviceMedia.findFirst({
        where: { serviceId: updated.id },
        orderBy: { sortOrder: "asc" },
      });

      if (cover) {
        service = await prisma.service.update({
          where: { id: updated.id },
          data: { coverMediaId: cover.id },
          include: {
            tiers: true,
            media: true,
            coverMedia: true,
            provider: {
              select: {
                id: true,
                avatarKey: true,
                providerProfile: true,
              },
            },
          },
        });
      }
    }

    const signed = await attachSignedMedia(service);

    res.json({ service: signed });
  }),
);
