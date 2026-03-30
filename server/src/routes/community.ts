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

// Extract @usernames from text content
const extractMentions = (text: string): string[] => {
  const matches = text.match(/@([a-zA-Z0-9_]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
};

// Resolve usernames to user IDs, excluding a given user
const resolveMentionedUsers = async (usernames: string[], excludeId?: string) => {
  if (usernames.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      username: { in: usernames, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, username: true },
  });
  return users;
};

const notifyMentionedUsers = async (
  users: Array<{ id: string; username: string | null }>,
  actorId: string,
  context: { type: "post" | "comment"; postId: string; snippet: string },
) => {
  if (users.length === 0) return;
  await Promise.all(
    users.map((u) =>
      createNotification({
        userId: u.id,
        actorId,
        type: "mention",
        title: context.type === "post" ? "You were mentioned in a post" : "You were mentioned in a comment",
        body: context.snippet.slice(0, 160),
        data: { postId: context.postId },
      }),
    ),
  );
};

const getClientSettings = async (req: CommunityRequest) => {
  if (req.platformSettings) return req.platformSettings;
  const { settings } = await getPlatformSettings();
  req.platformSettings = settings;
  return settings;
};

const guestIdSchema = z.string().uuid();

const getGuestId = (req: Request) => {
  const header = req.headers["x-guest-id"];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") {
    return null;
  }
  const parsed = guestIdSchema.safeParse(value.trim());
  return parsed.success ? parsed.data : null;
};

const getRequestIdentity = (req: Request) => {
  if (req.user?.id) {
    return { userId: req.user.id, guestId: null };
  }
  const guestId = getGuestId(req);
  return guestId ? { userId: null, guestId } : null;
};

const buildGuestAuthor = (guestId: string) => {
  const suffix = guestId.slice(0, 6);
  return {
    id: `guest-${guestId}`,
    role: "buyer",
    email: null,
    phone: null,
    username: `guest-${suffix}`,
    avatarUrl: null,
    providerProfile: null,
  };
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

const mediaLayoutSchema = z.enum(["grid", "carousel"]);

const createPostSchema = z
  .object({
    content: z.string().trim().max(2000).optional(),
    media: z.array(mediaItemSchema).max(6).optional(),
    mediaLayout: mediaLayoutSchema.optional(),
  })
  .refine((data) => {
    const hasContent = Boolean(data.content && data.content.trim().length > 0);
    const hasMedia = Boolean(data.media && data.media.length > 0);
    return hasContent || hasMedia;
  }, "Post content or media is required");

const updatePostSchema = z.object({
  content: z.string().trim().max(2000).optional(),
  media: z.array(mediaItemSchema).max(6).optional(),
  mediaLayout: mediaLayoutSchema.optional(),
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
    const identity = getRequestIdentity(req);
    const viewerId = identity?.userId ?? null;
    const viewerGuestId = identity?.guestId ?? null;
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

    if (viewerId || viewerGuestId) {
      const likeWhere = viewerId ? { userId: viewerId } : { guestId: viewerGuestId };
      const saveWhere = viewerId ? { userId: viewerId } : { guestId: viewerGuestId };
      include.likes = {
        where: likeWhere,
        select: { id: true },
      };
      include.saves = {
        where: saveWhere,
        select: { id: true },
      };
    }
    if (viewerId) {
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
        mediaLayout: post.mediaLayout,
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
        viewer: viewerId || viewerGuestId
          ? {
              liked,
              saved,
              following: viewerId ? following : false,
            }
          : null,
      };
    });

    // When scope=following and first page, include recent services from followed providers
    let followedServices: unknown[] = [];
    if (scope === "following" && viewerId && !query.cursor) {
      const rawServices = await prisma.service.findMany({
        where: {
          status: "published",
          provider: {
            followers: { some: { followerId: viewerId } },
          },
        },
        take: 6,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          category: true,
          createdAt: true,
          tiers: { take: 1, orderBy: { price: "asc" }, select: { price: true, currency: true } },
          media: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
          provider: {
            select: {
              id: true,
              username: true,
              avatarKey: true,
              providerProfile: { select: { displayName: true } },
            },
          },
        },
      });
      followedServices = await Promise.all(
        rawServices.map(async (s) => ({
          id: s.id,
          title: s.title,
          category: s.category,
          price: s.tiers[0]?.price?.toString() ?? null,
          currency: s.tiers[0]?.currency ?? "GHS",
          imageUrl: s.media[0]?.url ? await resolveMediaUrl(s.media[0].url) : null,
          provider: {
            id: s.provider.id,
            username: s.provider.username,
            displayName: s.provider.providerProfile?.displayName ?? null,
            avatarUrl: await resolveMediaUrl(s.provider.avatarKey),
          },
          createdAt: s.createdAt,
        })),
      );
    }

    // In "all" (For You) scope, boost posts from followed providers to the top
    const sortedResponse =
      scope === "all" && viewerId
        ? [
            ...response.filter((p) => p.viewer?.following),
            ...response.filter((p) => !p.viewer?.following),
          ]
        : response;

    res.json({ posts: sortedResponse, nextCursor, followedServices });
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
        mediaLayout: data.mediaLayout ?? "grid",
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
      where: { followingId: req.user!.id, notifyPosts: true },
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

    // Handle @mentions in post content
    const mentionUsernames = extractMentions(post.content ?? "");
    const mentionedUsers = await resolveMentionedUsers(mentionUsernames, req.user!.id);
    await notifyMentionedUsers(mentionedUsers, req.user!.id, {
      type: "post",
      postId: post.id,
      snippet: post.content ?? "",
    });

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
        ...(data.mediaLayout !== undefined ? { mediaLayout: data.mediaLayout } : {}),
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
  optionalAuth,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);
    const identity = getRequestIdentity(req);

    if (!identity) {
      return res.status(401).json({ error: "Authorization required" });
    }

    let existing: { id: string } | null = null;

    if (identity.userId) {
      existing = await prisma.communityPostLike.findUnique({
        where: {
          postId_userId: {
            postId: params.id,
            userId: identity.userId,
          },
        },
        select: { id: true },
      });
    } else {
      existing = await prisma.communityPostLike.findFirst({
        where: {
          postId: params.id,
          guestId: identity.guestId!,
        },
        select: { id: true },
      });
    }

    if (!existing) {
      await prisma.communityPostLike.create({
        data: identity.userId
          ? {
              postId: params.id,
              userId: identity.userId,
            }
          : {
              postId: params.id,
              guestId: identity.guestId!,
            },
      });

      const post = await prisma.communityPost.findUnique({
        where: { id: params.id },
        select: { authorId: true },
      });

      if (post && identity.userId && post.authorId !== identity.userId) {
        await createNotification({
          userId: post.authorId,
          actorId: identity.userId,
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
  optionalAuth,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);
    const identity = getRequestIdentity(req);

    if (!identity) {
      return res.status(401).json({ error: "Authorization required" });
    }
    const likeWhere: Prisma.CommunityPostLikeWhereInput = {
      postId: params.id,
      ...(identity.userId ? { userId: identity.userId } : { guestId: identity.guestId! }),
    };

    await prisma.communityPostLike.deleteMany({ where: likeWhere });

    res.status(204).send();
  }),
);

communityRouter.post(
  "/posts/:id/save",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);
    const identity = getRequestIdentity(req);

    if (!identity) {
      return res.status(401).json({ error: "Authorization required" });
    }

    if (identity.userId) {
      await prisma.communityPostSave.upsert({
        where: {
          postId_userId: {
            postId: params.id,
            userId: identity.userId,
          },
        },
        update: {},
        create: {
          postId: params.id,
          userId: identity.userId,
        },
      });
    } else {
      const existingSave = await prisma.communityPostSave.findFirst({
        where: {
          postId: params.id,
          guestId: identity.guestId!,
        },
        select: { id: true },
      });

      if (!existingSave) {
        await prisma.communityPostSave.create({
          data: {
            postId: params.id,
            guestId: identity.guestId!,
          },
        });
      }
    }

    res.status(204).send();
  }),
);

communityRouter.delete(
  "/posts/:id/save",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);
    const identity = getRequestIdentity(req);

    if (!identity) {
      return res.status(401).json({ error: "Authorization required" });
    }
    const saveWhere: Prisma.CommunityPostSaveWhereInput = {
      postId: params.id,
      ...(identity.userId ? { userId: identity.userId } : { guestId: identity.guestId! }),
    };

    await prisma.communityPostSave.deleteMany({ where: saveWhere });

    res.status(204).send();
  }),
);

communityRouter.post(
  "/posts/:id/share",
  authRequired,
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
        if (!comment.author) {
          return {
            ...comment,
            author: buildGuestAuthor(comment.guestId ?? "guest"),
          };
        }
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
  optionalAuth,
  asyncHandler(async (req, res) => {
    const params = postIdSchema.parse(req.params);
    const data = createCommentSchema.parse(req.body);
    const identity = getRequestIdentity(req);
    const settings = await getClientSettings(req as CommunityRequest);
    const moderation = settings.communityModeration;

    if (!identity) {
      return res.status(401).json({ error: "Authorization required" });
    }

    if (containsBlockedKeyword(data.content.trim(), moderation.bannedKeywords)) {
      return res.status(400).json({ error: "Comment contains blocked keywords." });
    }

    if (!identity.userId) {
      const guestCount = await prisma.communityPostComment.count({
        where: { postId: params.id, guestId: identity.guestId! },
      });
      if (guestCount >= 2) {
        return res
          .status(403)
          .json({ error: "Please register to comment more on this post." });
      }
    }

    if (moderation.commentLimitPerDay > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await prisma.communityPostComment.count({
        where: identity.userId
          ? { authorId: identity.userId, createdAt: { gte: since } }
          : { guestId: identity.guestId!, createdAt: { gte: since } },
      });
      if (recentCount >= moderation.commentLimitPerDay) {
        return res.status(429).json({ error: "Daily comment limit reached." });
      }
    }

    const comment = await prisma.communityPostComment.create({
      data: {
        postId: params.id,
        ...(identity.userId
          ? { authorId: identity.userId }
          : { guestId: identity.guestId! }),
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

    const authorPayload = comment.author
      ? (() => {
          const { avatarKey: _avatarKey, ...author } = comment.author;
          return { author, avatarKey: comment.author.avatarKey };
        })()
      : null;
    const avatarUrl = authorPayload
      ? await resolveMediaUrl(authorPayload.avatarKey)
      : null;
    const { post: _post, ...commentRest } = comment;
    if (comment.post.authorId && identity.userId && comment.post.authorId !== identity.userId) {
      await createNotification({
        userId: comment.post.authorId,
        actorId: identity.userId,
        type: "community_post_commented",
        title: "New comment",
        body: data.content.trim().slice(0, 160),
        data: { postId: params.id, commentId: comment.id },
      });
    }

    // Handle @mentions in comment
    if (identity.userId) {
      const mentionUsernames = extractMentions(data.content);
      const mentionedUsers = await resolveMentionedUsers(mentionUsernames, identity.userId);
      // Exclude the post author (already notified above)
      const filtered = mentionedUsers.filter((u) => u.id !== comment.post.authorId);
      await notifyMentionedUsers(filtered, identity.userId, {
        type: "comment",
        postId: params.id,
        snippet: data.content.trim(),
      });
    }
    res.status(201).json({
      comment: {
        ...commentRest,
        author: authorPayload
          ? {
              ...authorPayload.author,
              avatarUrl,
            }
          : buildGuestAuthor(identity.guestId ?? "guest"),
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

// Toggle notification preferences for a followed provider
communityRouter.patch(
  "/follow/:userId/notifications",
  authRequired,
  asyncHandler(async (req, res) => {
    const params = userIdSchema.parse(req.params);
    const data = z.object({
      notifyPosts: z.boolean().optional(),
      notifyServices: z.boolean().optional(),
    }).parse(req.body);

    const follow = await prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user!.id,
          followingId: params.userId,
        },
      },
    });

    if (!follow) {
      return res.status(404).json({ error: "You are not following this user" });
    }

    const updated = await prisma.userFollow.update({
      where: { id: follow.id },
      data: {
        ...(data.notifyPosts !== undefined ? { notifyPosts: data.notifyPosts } : {}),
        ...(data.notifyServices !== undefined ? { notifyServices: data.notifyServices } : {}),
      },
    });

    res.json({ notifyPosts: updated.notifyPosts, notifyServices: updated.notifyServices });
  }),
);

// Suggested providers to follow
communityRouter.get(
  "/suggested-providers",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const identity = (req as any).user;
    const userId = identity?.id ?? null;
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    // Get IDs the user already follows
    const followedIds = userId
      ? (await prisma.userFollow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        })).map((f) => f.followingId)
      : [];

    const excludeIds = userId ? [...followedIds, userId] : [];

    // Find providers followed by people the user follows ("mutual" signal)
    let mutualMap = new Map<string, number>();
    if (userId && followedIds.length > 0) {
      const mutuals = await prisma.userFollow.groupBy({
        by: ["followingId"],
        where: {
          followerId: { in: followedIds },
          followingId: { notIn: excludeIds },
          following: { role: "provider", providerProfile: { isNot: null } },
        },
        _count: { followerId: true },
        orderBy: { _count: { followerId: "desc" } },
        take: limit,
      });
      mutualMap = new Map(mutuals.map((m) => [m.followingId, m._count.followerId]));
    }

    // Get top-rated providers excluding already followed
    const providers = await prisma.user.findMany({
      where: {
        role: "provider",
        providerProfile: { isNot: null },
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      take: limit * 2,
      orderBy: { providerProfile: { ratingAvg: "desc" } },
      include: {
        providerProfile: {
          select: {
            displayName: true,
            ratingAvg: true,
            ratingCount: true,
            categories: true,
            verificationStatus: true,
          },
        },
        _count: { select: { followers: true } },
      },
    });

    const result = await Promise.all(
      providers.map(async (p) => ({
        id: p.id,
        username: p.username,
        avatarUrl: await resolveMediaUrl(p.avatarKey),
        displayName: p.providerProfile?.displayName ?? null,
        ratingAvg: p.providerProfile?.ratingAvg?.toString() ?? null,
        ratingCount: p.providerProfile?.ratingCount ?? 0,
        categories: p.providerProfile?.categories ?? [],
        verified: p.providerProfile?.verificationStatus === "verified",
        followerCount: p._count.followers,
        mutualFollowers: mutualMap.get(p.id) ?? 0,
      })),
    );

    // Sort: mutual followers first, then by rating
    result.sort((a, b) => b.mutualFollowers - a.mutualFollowers || (parseFloat(b.ratingAvg ?? "0") - parseFloat(a.ratingAvg ?? "0")));

    res.json({ providers: result.slice(0, limit) });
  }),
);

// Provider broadcast to all followers
communityRouter.post(
  "/broadcast",
  authRequired,
  asyncHandler(async (req, res) => {
    if (!["provider", "admin", "super_admin"].includes(req.user!.role)) {
      return res.status(403).json({ error: "Only providers can send broadcasts" });
    }

    const data = z.object({
      title: z.string().trim().min(1).max(100),
      body: z.string().trim().min(1).max(500),
    }).parse(req.body);

    const followers = await prisma.userFollow.findMany({
      where: { followingId: req.user!.id },
      select: { followerId: true },
    });

    const broadcast = await prisma.providerBroadcast.create({
      data: {
        providerId: req.user!.id,
        title: data.title,
        body: data.body,
        sentCount: followers.length,
      },
    });

    if (followers.length > 0) {
      await Promise.all(
        followers.map((f) =>
          createNotification({
            userId: f.followerId,
            actorId: req.user!.id,
            type: "provider_broadcast",
            title: data.title,
            body: data.body,
            data: { followerId: req.user!.id, broadcastId: broadcast.id },
          }),
        ),
      );
    }

    res.status(201).json({ broadcast: { id: broadcast.id, sentCount: followers.length } });
  }),
);

// Provider broadcasts history
communityRouter.get(
  "/broadcasts",
  authRequired,
  asyncHandler(async (req, res) => {
    const broadcasts = await prisma.providerBroadcast.findMany({
      where: { providerId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ broadcasts });
  }),
);

// Create promotion
communityRouter.post(
  "/promotions",
  authRequired,
  asyncHandler(async (req, res) => {
    if (!["provider", "admin", "super_admin"].includes(req.user!.role)) {
      return res.status(403).json({ error: "Only providers can create promotions" });
    }

    const data = z.object({
      serviceId: z.string().uuid().optional(),
      title: z.string().trim().min(1).max(100),
      description: z.string().trim().max(500).optional(),
      discountPct: z.number().int().min(1).max(100).optional(),
      discountAmt: z.number().min(0).optional(),
      currency: z.string().default("GHS"),
      endsAt: z.string().datetime().optional(),
    }).parse(req.body);

    // Verify service belongs to provider
    if (data.serviceId) {
      const service = await prisma.service.findUnique({
        where: { id: data.serviceId },
        select: { providerId: true },
      });
      if (!service || service.providerId !== req.user!.id) {
        return res.status(403).json({ error: "Service not found or not yours" });
      }
    }

    const promotion = await prisma.promotion.create({
      data: {
        providerId: req.user!.id,
        serviceId: data.serviceId ?? null,
        title: data.title,
        description: data.description ?? null,
        discountPct: data.discountPct ?? null,
        discountAmt: data.discountAmt != null ? new Prisma.Decimal(data.discountAmt) : null,
        currency: data.currency,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
      },
    });

    // Notify followers
    const followers = await prisma.userFollow.findMany({
      where: { followingId: req.user!.id },
      select: { followerId: true },
    });

    if (followers.length > 0) {
      const discountText = data.discountPct
        ? `${data.discountPct}% off`
        : data.discountAmt
          ? `${data.currency} ${data.discountAmt} off`
          : "";
      const snippet = discountText ? `${data.title} — ${discountText}` : data.title;

      await Promise.all(
        followers.map((f) =>
          createNotification({
            userId: f.followerId,
            actorId: req.user!.id,
            type: "provider_promotion",
            title: "New promotion",
            body: snippet,
            data: { followerId: req.user!.id, serviceId: data.serviceId ?? null, promotionId: promotion.id },
          }),
        ),
      );
    }

    res.status(201).json({ promotion });
  }),
);

// List provider promotions
communityRouter.get(
  "/promotions",
  authRequired,
  asyncHandler(async (req, res) => {
    const promotions = await prisma.promotion.findMany({
      where: { providerId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        service: { select: { id: true, title: true } },
      },
    });
    res.json({ promotions });
  }),
);
