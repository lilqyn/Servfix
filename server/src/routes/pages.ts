import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  DEFAULT_PAGES,
  PAGE_KEYS,
  type StaticPageContent,
  type StaticPageKey,
  type BlogPost,
  type StaffProfile,
} from "../utils/pages.js";
import { signS3Key } from "../utils/s3.js";

export const pagesRouter = Router();

const pageKeySchema = z.enum(PAGE_KEYS as [StaticPageKey, ...StaticPageKey[]]);

pagesRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const slug = pageKeySchema.parse(req.params.slug);
    const page = await prisma.staticPage.findUnique({ where: { slug } });
    const fallback = DEFAULT_PAGES[slug];
    const content = (page?.content ?? {}) as Partial<StaticPageContent> & {
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

    if (!page) {
      return res.json({
        slug,
        title: fallback.title,
        body: fallback.body,
        posts: await resolvePosts(fallback.posts ?? []),
        staff: await resolveStaff(fallback.staff ?? []),
        updatedAt: null,
      });
    }

    res.json({
      slug,
      title: page.title,
      body: page.body,
      posts: await resolvePosts(posts),
      staff: await resolveStaff(staff),
      updatedAt: page.updatedAt,
    });
  }),
);
