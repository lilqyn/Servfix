import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { optionalAuth } from "../middleware/auth.js";
import {
  DEFAULT_PAGES,
  PAGE_KEYS,
  type StaticPageContent,
  type StaticPageKey,
  type StaticPageSection,
  type BlogPost,
  type StaffProfile,
  type AboutPageConfig,
  type ProviderResourcesContent,
} from "../utils/pages.js";
import { signS3Key } from "../utils/s3.js";

export const pagesRouter = Router();

const pageKeySchema = z.enum(PAGE_KEYS as [StaticPageKey, ...StaticPageKey[]]);

pagesRouter.use(optionalAuth);

pagesRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const slug = pageKeySchema.parse(req.params.slug);
    if (slug === "providerResources") {
      if (!req.user) {
        return res.status(401).json({ error: "Authorization required" });
      }
      if (req.user.role !== "provider") {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

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
              videoUrl: null,
              publishedAt: new Date().toISOString().slice(0, 10),
            };
          })
        : [];
    const posts = (Array.isArray(content.posts) && content.posts.length > 0)
      ? content.posts
      : legacyPosts.length > 0
        ? legacyPosts
        : fallback.posts ?? [];
    const staff = Array.isArray(content.staff) ? content.staff : fallback.staff ?? [];
    const resourcesConfig =
      content.resourcesConfig && typeof content.resourcesConfig === "object"
        ? (content.resourcesConfig as ProviderResourcesContent)
        : fallback.resourcesConfig;

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

    const intro = typeof content.intro === "string" ? content.intro : fallback.intro ?? null;
    const sections: StaticPageSection[] = Array.isArray(content.sections)
      ? (content.sections as StaticPageSection[])
      : fallback.sections ?? [];

    if (!page) {
      return res.json({
        slug,
        title: fallback.title,
        body: fallback.body,
        intro: fallback.intro ?? null,
        sections: fallback.sections ?? [],
        posts: await resolvePosts(fallback.posts ?? []),
        staff: await resolveStaff(fallback.staff ?? []),
        aboutConfig,
        resourcesConfig,
        updatedAt: null,
      });
    }

    res.json({
      slug,
      title: page.title,
      body: page.body,
      intro,
      sections,
      posts: await resolvePosts(posts),
      staff: await resolveStaff(staff),
      aboutConfig,
      resourcesConfig,
      updatedAt: page.updatedAt,
    });
  }),
);
