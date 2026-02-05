import { Router } from "express";
import { Prisma, MomoNetwork } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, optionalAuth, requireRole } from "../middleware/auth.js";
import { normalizeS3Key, signS3Key } from "../utils/s3.js";
import { getPlatformSettings } from "../utils/platform-settings.js";
import { createNotification } from "../utils/notifications.js";

export const usersRouter = Router();

const userIdSchema = z.object({
  id: z.string().trim().min(1),
});

const reviewIdSchema = z.object({
  id: z.string().uuid(),
});

const updateMeSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  username: z.string().trim().max(20).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(500).optional(),
  location: z.string().trim().max(120).optional(),
  categories: z.array(z.string().trim().min(1)).max(8).optional(),
  momoNumber: z.string().trim().min(7).max(20).optional(),
  momoNetwork: z.enum(["mtn", "vodafone", "airteltigo"]).optional(),
  avatarKey: z.string().trim().optional(),
  bannerKey: z.string().trim().optional(),
});

const postsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const galleryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

const providerReviewQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const providerReviewAnalyticsSchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional(),
});

const reviewReplySchema = z.object({
  reply: z.string().trim().min(2).max(1000),
});

const publicUserSelect = {
  id: true,
  email: true,
  phone: true,
  username: true,
  role: true,
  createdAt: true,
  avatarKey: true,
  bannerKey: true,
  providerProfile: {
    select: {
      displayName: true,
      bio: true,
      location: true,
      categories: true,
      verificationStatus: true,
      ratingAvg: true,
      ratingCount: true,
    },
  },
};

const resolveMediaUrl = async (key?: string | null) => {
  if (!key) {
    return null;
  }
  if (key.startsWith("http")) {
    return key;
  }
  const signed = await signS3Key(key);
  return signed ?? null;
};

const withMedia = async <T extends { avatarKey?: string | null; bannerKey?: string | null }>(
  user: T,
) => {
  const avatarUrl = await resolveMediaUrl(user.avatarKey);
  const bannerUrl = await resolveMediaUrl(user.bannerKey);
  const { avatarKey: _avatarKey, bannerKey: _bannerKey, ...rest } = user;
  return { ...rest, avatarUrl, bannerUrl };
};

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop";

const resolveAvatarUrl = async (key?: string | null) => {
  const signed = await resolveMediaUrl(key);
  return signed ?? DEFAULT_AVATAR;
};

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

const buildProviderReviewSummary = async (providerId: string) => {
  const [aggregate, breakdown] = await Promise.all([
    prisma.review.aggregate({
      where: { providerId },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { providerId },
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

const buildProviderReviewTrend = async (providerId: string, months: number) => {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const reviews = await prisma.review.findMany({
    where: {
      providerId,
      createdAt: { gte: startMonth },
    },
    select: { rating: true, createdAt: true },
  });

  const buckets = new Map<
    string,
    { key: string; label: string; count: number; sum: number }
  >();

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-US", { month: "short" });
    buckets.set(key, { key, label, count: 0, sum: 0 });
  }

  reviews.forEach((review) => {
    const date = review.createdAt;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    if (!bucket) {
      return;
    }
    bucket.count += 1;
    bucket.sum += review.rating;
  });

  return Array.from(buckets.values()).map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    averageRating: bucket.count > 0 ? Math.round((bucket.sum / bucket.count) * 10) / 10 : 0,
    count: bucket.count,
  }));
};

const buildTopReviewedServices = async (providerId: string) => {
  const grouped = await prisma.review.groupBy({
    by: ["serviceId"],
    where: { providerId },
    _count: { serviceId: true },
    _avg: { rating: true },
    orderBy: { _count: { serviceId: "desc" } },
    take: 5,
  });

  const serviceIds = grouped.map((row) => row.serviceId);
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, title: true },
  });
  const serviceMap = new Map(services.map((service) => [service.id, service.title]));

  return grouped.map((row) => ({
    id: row.serviceId,
    title: serviceMap.get(row.serviceId) ?? "Service",
    reviewCount: row._count.serviceId ?? 0,
    averageRating: row._avg.rating ? Math.round(Number(row._avg.rating) * 10) / 10 : 0,
  }));
};

type PostMediaItem = { url: string; [key: string]: unknown };

const attachSignedPostMedia = async <TPost extends { media?: PostMediaItem[] }>(post: TPost) => {
  const media = await Promise.all(
    (post.media ?? []).map(async (item: { url: string }) => {
      const key = normalizeS3Key(item.url);
      const signedUrl = await signS3Key(key);
      return {
        ...item,
        url: key,
        signedUrl: signedUrl ?? item.url,
      };
    }),
  );

  return {
    ...post,
    media,
  };
};

usersRouter.patch(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    const data = updateMeSchema.parse(req.body);

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        role: true,
        providerProfile: { select: { userId: true } },
      },
    });

    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const userUpdates: Prisma.UserUpdateInput = {};
    if (data.email !== undefined) {
      userUpdates.email = data.email.trim();
    }
    if (data.phone !== undefined) {
      userUpdates.phone = data.phone.trim();
    }
    if (data.username !== undefined) {
      const rawUsername = data.username.trim();
      if (rawUsername.length === 0) {
        userUpdates.username = null;
      } else {
        const normalized = rawUsername.toLowerCase();
        const isValid = /^[a-z0-9_]{3,20}$/.test(normalized);
        if (!isValid) {
          return res.status(400).json({
            error: "Username must be 3-20 characters and use only letters, numbers, or underscores.",
          });
        }
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            normalized,
          );
        if (isUuid) {
          return res.status(400).json({ error: "Username cannot be a UUID." });
        }
        const existing = await prisma.user.findUnique({
          where: { username: normalized },
          select: { id: true },
        });
        if (existing && existing.id !== currentUser.id) {
          return res.status(409).json({ error: "Username already taken" });
        }
        userUpdates.username = normalized;
      }
    }
    if (data.avatarKey !== undefined) {
      const avatarKey = data.avatarKey.trim();
      userUpdates.avatarKey = avatarKey.length > 0 ? avatarKey : null;
    }
    if (data.bannerKey !== undefined) {
      const bannerKey = data.bannerKey.trim();
      userUpdates.bannerKey = bannerKey.length > 0 ? bannerKey : null;
    }

    const providerUpdates: Prisma.ProviderProfileUpdateInput = {};
    if (data.displayName !== undefined) {
      providerUpdates.displayName = data.displayName.trim();
    }
    if (data.bio !== undefined) {
      const bio = data.bio.trim();
      providerUpdates.bio = bio.length > 0 ? bio : null;
    }
    if (data.location !== undefined) {
      const location = data.location.trim();
      providerUpdates.location = location.length > 0 ? location : null;
    }
    if (data.categories !== undefined) {
      providerUpdates.categories = data.categories;
    }
    if (data.momoNumber !== undefined) {
      const momoNumber = data.momoNumber.trim();
      providerUpdates.momoNumber = momoNumber.length > 0 ? momoNumber : null;
    }
    if (data.momoNetwork !== undefined) {
      providerUpdates.momoNetwork = data.momoNetwork ?? null;
    }

    const hasProviderUpdates = Object.keys(providerUpdates).length > 0;
    if (
      hasProviderUpdates &&
      (currentUser.role === "provider" || currentUser.role === "admin")
    ) {
      if (currentUser.providerProfile) {
        userUpdates.providerProfile = { update: providerUpdates };
      } else {
        userUpdates.providerProfile = {
          create: {
            displayName:
              (providerUpdates.displayName as string | undefined) ?? "Provider",
            bio: (providerUpdates.bio as string | null | undefined) ?? null,
            location:
              (providerUpdates.location as string | null | undefined) ?? null,
            categories:
              (providerUpdates.categories as string[] | undefined) ?? [],
            momoNumber:
              (providerUpdates.momoNumber as string | null | undefined) ?? null,
            momoNetwork:
              (providerUpdates.momoNetwork as MomoNetwork | null | undefined) ?? null,
          },
        };
      }
    }

    if (Object.keys(userUpdates).length === 0) {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: publicUserSelect,
      });
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }
      return res.json({ user: await withMedia(user) });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: userUpdates,
      select: publicUserSelect,
    });

    res.json({ user: await withMedia(user) });
  }),
);

usersRouter.get(
  "/me/reviews",
  authRequired,
  requireRole("provider", "admin"),
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    if (!settings.featureFlags.reviews) {
      return res.status(403).json({ error: "Reviews are currently disabled." });
    }

    const query = providerReviewQuerySchema.parse(req.query);
    const limit = query.limit ?? 20;

    const where: Prisma.ReviewWhereInput = {
      providerId: req.user!.id,
    };
    if (query.rating) {
      where.rating = query.rating;
    }

    const reviews = await prisma.review.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        service: { select: { id: true, title: true } },
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

    const hasNext = reviews.length > limit;
    const trimmed = hasNext ? reviews.slice(0, limit) : reviews;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;

    const summary = await buildProviderReviewSummary(req.user!.id);

    const formatted = await Promise.all(
      trimmed.map(async (review) => ({
        id: review.id,
        author: formatReviewerName(review.author),
        avatar: await resolveAvatarUrl(review.author.avatarKey),
        rating: review.rating,
        date: formatReviewDate(review.createdAt),
        comment: review.comment,
        images: review.images ?? [],
        helpful: review.helpfulCount,
        providerReply: review.providerReply,
        providerReplyAt: review.providerReplyAt,
        providerReplyUpdatedAt: review.providerReplyUpdatedAt,
        service: review.service,
      })),
    );

    res.json({ reviews: formatted, summary, nextCursor });
  }),
);

usersRouter.get(
  "/me/reviews/analytics",
  authRequired,
  requireRole("provider", "admin"),
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    if (!settings.featureFlags.reviews) {
      return res.status(403).json({ error: "Reviews are currently disabled." });
    }

    const query = providerReviewAnalyticsSchema.parse(req.query);
    const months = query.months ?? 6;

    const [summary, trend] = await Promise.all([
      buildProviderReviewSummary(req.user!.id),
      buildProviderReviewTrend(req.user!.id, months),
    ]);

    const topServices = await buildTopReviewedServices(req.user!.id);

    const promoters = summary.ratingBreakdown[5] ?? 0;
    const passives = summary.ratingBreakdown[4] ?? 0;
    const detractors =
      (summary.ratingBreakdown[3] ?? 0) +
      (summary.ratingBreakdown[2] ?? 0) +
      (summary.ratingBreakdown[1] ?? 0);
    const total = summary.totalReviews;
    const score = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

    res.json({
      nps: {
        promoters,
        passives,
        detractors,
        total,
        score,
      },
      trend: {
        months: trend,
        totalReviews: summary.totalReviews,
        averageRating: summary.averageRating,
        ratingBreakdown: summary.ratingBreakdown,
      },
      topServices,
    });
  }),
);

usersRouter.patch(
  "/me/reviews/:id/reply",
  authRequired,
  requireRole("provider"),
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    if (!settings.featureFlags.reviews) {
      return res.status(403).json({ error: "Reviews are currently disabled." });
    }

    const params = reviewIdSchema.parse(req.params);
    const data = reviewReplySchema.parse(req.body);

    const review = await prisma.review.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        providerId: true,
        authorId: true,
        providerReplyAt: true,
        service: { select: { id: true, title: true } },
      },
    });

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    if (review.providerId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const now = new Date();
    await prisma.review.update({
      where: { id: review.id },
      data: {
        providerReply: data.reply,
        providerReplyAt: review.providerReplyAt ?? now,
        providerReplyUpdatedAt: now,
      },
    });

    if (!review.providerReplyAt) {
      const serviceTitle = review.service?.title ?? "your service";
      await createNotification({
        userId: review.authorId,
        actorId: req.user!.id,
        type: "review_reply",
        title: "Provider replied to your review",
        body: `New reply on ${serviceTitle}.`,
        data: { reviewId: review.id, serviceId: review.service?.id ?? null },
      });
    }

    res.json({ success: true });
  }),
);

usersRouter.get(
  "/:id/profile",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const params = userIdSchema.parse(req.params);
    const viewerId = req.user?.id ?? null;
    const identifier = params.id.trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: identifier }, { username: identifier.toLowerCase() }],
      },
      select: publicUserSelect,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userWithMedia = await withMedia(user);
    const userId = user.id;
    const { settings } = await getPlatformSettings();
    const communityEnabled = settings.featureFlags.community;

    const [followersCount, followingCount, postsCount, servicesCount, viewerFollow] =
      await Promise.all([
        prisma.userFollow.count({ where: { followingId: userId } }),
        prisma.userFollow.count({ where: { followerId: userId } }),
        communityEnabled
          ? prisma.communityPost.count({ where: { authorId: userId } })
          : Promise.resolve(0),
        user.role === "provider"
          ? prisma.service.count({
              where: { providerId: userId, status: "published" },
            })
          : Promise.resolve(0),
        viewerId
          ? prisma.userFollow.findUnique({
              where: {
                followerId_followingId: {
                  followerId: viewerId,
                  followingId: userId,
                },
              },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);

    res.json({
      user: userWithMedia,
      stats: {
        followers: followersCount,
        following: followingCount,
        posts: postsCount,
        services: servicesCount,
      },
      viewer: viewerId
        ? {
            following: Boolean(viewerFollow),
            isSelf: viewerId === userId,
          }
        : null,
    });
  }),
);

usersRouter.get(
  "/:id/posts",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { settings } = await getPlatformSettings();
    if (!settings.featureFlags.community) {
      return res.status(403).json({ error: "Community is currently disabled." });
    }
    const params = userIdSchema.parse(req.params);
    const query = postsQuerySchema.parse(req.query);
    const limit = query.limit ?? 10;
    const viewerId = req.user?.id ?? null;
    const identifier = params.id.trim();

    const userExists = await prisma.user.findFirst({
      where: {
        OR: [{ id: identifier }, { username: identifier.toLowerCase() }],
      },
      select: { id: true },
    });

    if (!userExists) {
      return res.status(404).json({ error: "User not found" });
    }
    const userId = userExists.id;

    const include: Prisma.CommunityPostInclude = {
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
      media: {
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: {
          likes: true,
          comments: true,
          saves: true,
        },
      },
    };

    if (viewerId) {
      include.likes = {
        where: { userId: viewerId },
        select: { id: true },
      };
      include.saves = {
        where: { userId: viewerId },
        select: { id: true },
      };
    }

    const posts = await prisma.communityPost.findMany({
      where: { authorId: userId },
      take: limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include,
    });

    const viewerFollow = viewerId
      ? await prisma.userFollow.findUnique({
          where: {
            followerId_followingId: {
            followerId: viewerId,
            followingId: userId,
            },
          },
          select: { id: true },
        })
      : null;
    const isFollowing = Boolean(viewerFollow);

    const hasNext = posts.length > limit;
    const trimmed = hasNext ? posts.slice(0, limit) : posts;
    const nextCursor = hasNext ? trimmed[trimmed.length - 1]?.id ?? null : null;
    const signedPosts = await Promise.all(
      trimmed.map(async (post) => {
        const signedPost = await attachSignedPostMedia(post);
        const authorAvatar = await resolveMediaUrl(post.author.avatarKey);
        return {
          ...signedPost,
          author: {
            ...post.author,
            avatarUrl: authorAvatar,
          },
        };
      }),
    );

    const response = signedPosts.map((post) => {
      const author = post.author as typeof post.author & { providerProfile?: unknown };
      const liked = Boolean((post as { likes?: Array<{ id: string }> }).likes?.length);
      const saved = Boolean((post as { saves?: Array<{ id: string }> }).saves?.length);

      return {
        id: post.id,
        content: post.content,
        shareCount: post.shareCount,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: {
          id: author.id,
          email: author.email,
          phone: author.phone,
          username: author.username,
          role: author.role,
          providerProfile: author.providerProfile ?? null,
          avatarUrl: (author as { avatarUrl?: string | null }).avatarUrl ?? null,
        },
        media: post.media,
        counts: {
          likes: post._count.likes,
          comments: post._count.comments,
          saves: post._count.saves,
        },
        viewer: viewerId
          ? {
              liked,
              saved,
              following: isFollowing,
            }
          : null,
      };
    });

    res.json({ posts: response, nextCursor });
  }),
);

usersRouter.get(
  "/:id/gallery",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const params = userIdSchema.parse(req.params);
    const query = galleryQuerySchema.parse(req.query);
    const limit = query.limit ?? 24;
    const identifier = params.id.trim();

    const userExists = await prisma.user.findFirst({
      where: {
        OR: [{ id: identifier }, { username: identifier.toLowerCase() }],
      },
      select: { id: true },
    });

    if (!userExists) {
      return res.status(404).json({ error: "User not found" });
    }
    const userId = userExists.id;

    const media = await prisma.communityPostMedia.findMany({
      where: { post: { authorId: userId } },
      take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        url: true,
        type: true,
        sortOrder: true,
        createdAt: true,
        postId: true,
      },
    });

    const signedMedia = await Promise.all(
      media.map(async (item) => {
        const key = normalizeS3Key(item.url);
        const signedUrl = await signS3Key(key);
        return {
          ...item,
          url: key,
          signedUrl: signedUrl ?? item.url,
        };
      }),
    );

    res.json({ media: signedMedia });
  }),
);
