import type { Request } from "express";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, optionalAuth } from "../middleware/auth.js";
import { normalizeS3Key, signS3Key } from "../utils/s3.js";
import { createNotification } from "../utils/notifications.js";
import { getPlatformSettings, type PlatformSettings } from "../utils/platform-settings.js";

export const communityRouter = Router();

type CommunityRequest = Request & { platformSettings?: PlatformSettings };

const getClientSettings = async (req: CommunityRequest) => {
  if (req.platformSettings) return req.platformSettings;
  const { settings } = await getPlatformSettings();
  req.platformSettings = settings;
  return settings;
};

const containsBlockedKeyword = (value: string, keywords: string[]) => {
  if (!value || keywords.length === 0) return false;
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => keyword && normalized.includes(keyword));
};

communityRouter.use(
  asyncHandler(async (req, res, next) => {
    const settings = await getClientSettings(req as CommunityRequest);
    if (!settings.featureFlags.community) {
      return res.status(403).json({ error: "Community is currently disabled." });
    }
    return next();
  }),
);

const feedQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  scope: z.enum(["all", "following"]).optional(),
});

const postIdSchema = z.object({
  id: z.string().uuid(),
});

const userIdSchema = z.object({
  userId: z.string().uuid(),
});

const mediaItemSchema = z.union([
  z.string().min(1),
  z.object({
    url: z.string().min(1),
    type: z.enum(["image", "video"]).optional(),
  }),
]);

const createPostSchema = z
  .object({
    content: z.string().trim().max(2000).optional(),
    media: z.array(mediaItemSchema).max(6).optional(),
  })
  .refine((data) => {
    const hasContent = Boolean(data.content && data.content.trim().length > 0);
    const hasMedia = Boolean(data.media && data.media.length > 0);
    return hasContent || hasMedia;
  }, "Post content or media is required");

const updatePostSchema = z.object({
  content: z.string().trim().max(2000).optional(),
  media: z.array(mediaItemSchema).max(6).optional(),
});

const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});

const commentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

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

type MediaInput = string | { url: string; type?: "image" | "video" };

const normalizePostMedia = (media: MediaInput[] = []) =>
  media
    .map((item) => {
      if (typeof item === "string") {
        return { url: item, type: "image" as const };
      }
      return { url: item.url, type: item.type ?? "image" };
    })
    .map((item) => ({
      url: normalizeS3Key(item.url.trim()),
      type: item.type,
    }))
    .filter((item) => item.url.length > 0);

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

communityRouter.get(
  "/feed",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const query = feedQuerySchema.parse(req.query);
    const limit = query.limit ?? 10;
    const viewerId = req.user?.id ?? null;
    const scope = query.scope ?? "all";

    if (scope === "following" && !viewerId) {
      return res.json({ posts: [], nextCursor: null });
    }

    const where: Prisma.CommunityPostWhereInput | undefined =
      scope === "following" && viewerId
        ? {
            author: {
              followers: {
                some: {
                  followerId: viewerId,
                },
              },
            },
          }
        : undefined;

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
      include.author = {
        select: {
          id: true,
          email: true,
          phone: true,
          username: true,
          role: true,
          avatarKey: true,
          providerProfile: true,
          followers: {
            where: { followerId: viewerId },
            select: { id: true },
          },
        },
      };
    }

    const posts = await prisma.communityPost.findMany({
      take: limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      where,
      include,
    });

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
      const author = post.author as typeof post.author & {
        providerProfile?: unknown;
        followers?: Array<{ id: string }>;
      };
      const authorFollowers = author.followers;
      const liked = Boolean((post as { likes?: Array<{ id: string }> }).likes?.length);
      const saved = Boolean((post as { saves?: Array<{ id: string }> }).saves?.length);
      const following = Boolean(authorFollowers?.length);

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
              following,
            }
          : null,
      };
    });

    res.json({ posts: response, nextCursor });
  }),
);

communityRouter.post(
  "/posts",
  authRequired,
  asyncHandler(async (req, res) => {
    const data = createPostSchema.parse(req.body);
    const settings = await getClientSettings(req as CommunityRequest);
    const moderation = settings.communityModeration;

    const content = data.content?.trim() ?? "";
    if (content && containsBlockedKeyword(content, moderation.bannedKeywords)) {
      return res.status(400).json({ error: "Post content contains blocked keywords." });
    }

    if (moderation.postLimitPerDay > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await prisma.communityPost.count({
        where: { authorId: req.user!.id, createdAt: { gte: since } },
      });
      if (recentCount >= moderation.postLimitPerDay) {
        return res.status(429).json({ error: "Daily post limit reached." });
      }
    }
    const media = normalizePostMedia(data.media ?? []);

    const post = await prisma.communityPost.create({
      data: {
        authorId: req.user!.id,
        content: data.content?.trim() ?? "",
        media:
          media.length > 0
            ? {
                create: media.map((item, index) => ({
                  url: item.url,
                  type: item.type,
                  sortOrder: index,
                })),
              }
            : undefined,
      },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
        author: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            role: true,
            providerProfile: true,
          },
        },
      },
    });

    const followers = await prisma.userFollow.findMany({
      where: { followingId: req.user!.id },
      select: { followerId: true },
    });

    if (followers.length > 0) {
      const snippet = (post.content ?? "").trim().slice(0, 160);
      await Promise.all(
        followers
          .filter((follow) => follow.followerId !== req.user!.id)
          .map((follow) =>
            createNotification({
              userId: follow.followerId,
              actorId: req.user!.id,
              type: "community_new_post",
              title: "New community post",
              body: snippet || "New post shared.",
              data: { postId: post.id },
            }),
          ),
      );
    }

    const signed = await attachSignedPostMedia(post);

    res.status(201).json({ post: signed });
  }),
);

communityRouter.put(
  "/posts/:id",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);
    const data = updatePostSchema.parse(req.body);
    const settings = await getClientSettings(req as CommunityRequest);
    const moderation = settings.communityModeration;

    const existing = await prisma.communityPost.findUnique({
      where: { id: params.id },
      include: { media: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (existing.authorId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const normalizedMedia =
      data.media !== undefined ? normalizePostMedia(data.media) : undefined;

    const nextContent =
      data.content !== undefined ? data.content.trim() : existing.content;
    const nextMedia =
      normalizedMedia !== undefined
        ? normalizedMedia
        : existing.media.map((item) => ({
            url: normalizeS3Key(item.url),
            type: item.type as "image" | "video",
          }));

    if (!nextContent && nextMedia.length === 0) {
      return res.status(400).json({ error: "Post content or media is required" });
    }

    if (nextContent && containsBlockedKeyword(nextContent, moderation.bannedKeywords)) {
      return res.status(400).json({ error: "Post content contains blocked keywords." });
    }

    const updated = await prisma.communityPost.update({
      where: { id: params.id },
      data: {
        ...(data.content !== undefined ? { content: data.content.trim() } : {}),
        media:
          normalizedMedia !== undefined
            ? {
                deleteMany: {},
                create: normalizedMedia.map((item, index) => ({
                  url: item.url,
                  type: item.type,
                  sortOrder: index,
                })),
              }
            : undefined,
      },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
        author: {
          select: {
            id: true,
            email: true,
            phone: true,
            username: true,
            role: true,
            providerProfile: true,
          },
        },
      },
    });

    const signed = await attachSignedPostMedia(updated);

    res.json({ post: signed });
  }),
);

communityRouter.delete(
  "/posts/:id",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);

    const existing = await prisma.communityPost.findUnique({
      where: { id: params.id },
      select: { id: true, authorId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (existing.authorId !== req.user!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.communityPost.delete({ where: { id: params.id } });

    res.status(204).send();
  }),
);

communityRouter.post(
  "/posts/:id/like",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);

    const existing = await prisma.communityPostLike.findUnique({
      where: {
        postId_userId: {
          postId: params.id,
          userId: req.user!.id,
        },
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.communityPostLike.create({
        data: {
          postId: params.id,
          userId: req.user!.id,
        },
      });

      const post = await prisma.communityPost.findUnique({
        where: { id: params.id },
        select: { authorId: true },
      });

      if (post && post.authorId !== req.user!.id) {
        await createNotification({
          userId: post.authorId,
          actorId: req.user!.id,
          type: "community_post_liked",
          title: "New like",
          body: "Someone liked your post.",
          data: { postId: params.id },
        });
      }
    }

    res.status(204).send();
  }),
);

communityRouter.delete(
  "/posts/:id/like",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);

    await prisma.communityPostLike.deleteMany({
      where: {
        postId: params.id,
        userId: req.user!.id,
      },
    });

    res.status(204).send();
  }),
);

communityRouter.post(
  "/posts/:id/save",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);

    await prisma.communityPostSave.upsert({
      where: {
        postId_userId: {
          postId: params.id,
          userId: req.user!.id,
        },
      },
      update: {},
      create: {
        postId: params.id,
        userId: req.user!.id,
      },
    });

    res.status(204).send();
  }),
);

communityRouter.delete(
  "/posts/:id/save",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);

    await prisma.communityPostSave.deleteMany({
      where: {
        postId: params.id,
        userId: req.user!.id,
      },
    });

    res.status(204).send();
  }),
);

communityRouter.post(
  "/posts/:id/share",
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);

    const post = await prisma.communityPost.update({
      where: { id: params.id },
      data: { shareCount: { increment: 1 } },
      select: { id: true, shareCount: true },
    });

    res.json({ post });
  }),
);

communityRouter.get(
  "/posts/:id/comments",
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);
    const query = commentQuerySchema.parse(req.query);
    const limit = query.limit ?? 50;

    const comments = await prisma.communityPostComment.findMany({
      where: { postId: params.id },
      take: limit,
      orderBy: { createdAt: "asc" },
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

    const formatted = await Promise.all(
      comments.map(async (comment) => {
        const avatarUrl = await resolveMediaUrl(comment.author.avatarKey);
        const { avatarKey: _avatarKey, ...author } = comment.author;
        return {
          ...comment,
          author: {
            ...author,
            avatarUrl,
          },
        };
      }),
    );

    res.json({ comments: formatted });
  }),
);

communityRouter.post(
  "/posts/:id/comments",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);
    const data = createCommentSchema.parse(req.body);
    const settings = await getClientSettings(req as CommunityRequest);
    const moderation = settings.communityModeration;

    if (containsBlockedKeyword(data.content.trim(), moderation.bannedKeywords)) {
      return res.status(400).json({ error: "Comment contains blocked keywords." });
    }

    if (moderation.commentLimitPerDay > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await prisma.communityPostComment.count({
        where: { authorId: req.user!.id, createdAt: { gte: since } },
      });
      if (recentCount >= moderation.commentLimitPerDay) {
        return res.status(429).json({ error: "Daily comment limit reached." });
      }
    }

    const comment = await prisma.communityPostComment.create({
      data: {
        postId: params.id,
        authorId: req.user!.id,
        content: data.content.trim(),
      },
      include: {
        post: {
          select: { authorId: true },
        },
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

    const avatarUrl = await resolveMediaUrl(comment.author.avatarKey);
    const { avatarKey: _avatarKey, ...author } = comment.author;
    const { post: _post, ...commentRest } = comment;
    if (comment.post.authorId !== req.user!.id) {
      await createNotification({
        userId: comment.post.authorId,
        actorId: req.user!.id,
        type: "community_post_commented",
        title: "New comment",
        body: data.content.trim().slice(0, 160),
        data: { postId: params.id, commentId: comment.id },
      });
    }
    res.status(201).json({
      comment: {
        ...commentRest,
        author: {
          ...author,
          avatarUrl,
        },
      },
    });
  }),
);

communityRouter.post(
  "/follow/:userId",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = userIdSchema.parse(req.params);

    if (params.userId === req.user!.id) {
      return res.status(400).json({ error: "You cannot follow yourself" });
    }

    const existing = await prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user!.id,
          followingId: params.userId,
        },
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.userFollow.create({
        data: {
          followerId: req.user!.id,
          followingId: params.userId,
        },
      });

      await createNotification({
        userId: params.userId,
        actorId: req.user!.id,
        type: "follow_received",
        title: "New follower",
        body: "Someone started following you.",
        data: { followerId: req.user!.id },
      });
    }

    res.status(204).send();
  }),
);

communityRouter.delete(
  "/follow/:userId",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = userIdSchema.parse(req.params);

    await prisma.userFollow.deleteMany({
      where: {
        followerId: req.user!.id,
        followingId: params.userId,
      },
    });

    res.status(204).send();
  }),
);
