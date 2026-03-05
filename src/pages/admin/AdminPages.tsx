import { type ChangeEvent, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import {
  type AboutFontOption,
  type AboutPageConfig,
  fetchAdminPages,
  updateAdminPages,
  uploadPageImage,
  type AdminPagesPayload,
  type BlogPostView,
  type ProviderLaunchChecklistKey,
  type ProviderResourcesContent,
  type StaffProfileView,
} from "@/lib/api";
import { DEFAULT_PAGES } from "@/lib/pageDefaults";
import { useAuth } from "@/contexts/useAuth";
import { hasPermission } from "@/lib/permissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { defaultProviderResourcesContent } from "@/data/providerResources";

const MAX_BLOG_POSTS = 12;
const MAX_ACADEMY_POSTS = 20;
const MAX_STAFF = 12;
const PROVIDER_CHECKLIST_KEY_OPTIONS: Array<{
  value: ProviderLaunchChecklistKey;
  label: string;
}> = [
  { value: "profile_completed", label: "Profile completed" },
  { value: "profile_photo_uploaded", label: "Profile photo uploaded" },
  { value: "service_photos_uploaded", label: "3 service photos uploaded" },
  { value: "pricing_calculated", label: "Pricing calculated correctly" },
  { value: "service_description_optimized", label: "Service description optimized" },
  { value: "payment_policy_understood", label: "Payment policy understood" },
  { value: "cancellation_rules_reviewed", label: "Cancellation rules reviewed" },
  { value: "tax_record_process_started", label: "Tax record process started" },
];

const ABOUT_FONT_OPTIONS: Array<{ value: AboutFontOption; label: string }> = [
  { value: "space_grotesk", label: "Space Grotesk" },
  { value: "plus_jakarta_sans", label: "Plus Jakarta Sans" },
  { value: "georgia_serif", label: "Georgia Serif" },
  { value: "times_serif", label: "Times New Roman" },
  { value: "system_sans", label: "System Sans" },
  { value: "mono", label: "Monospace" },
];

type DraftPages = {
  about: Omit<AdminPagesPayload["about"], "staff" | "aboutConfig"> & {
    staff: StaffProfileView[];
    aboutConfig: AboutPageConfig;
  };
  blog: Omit<AdminPagesPayload["blog"], "posts"> & { posts: BlogPostView[] };
  academy: Omit<AdminPagesPayload["academy"], "posts"> & { posts: BlogPostView[] };
  providerResources: AdminPagesPayload["providerResources"];
};

const cloneAboutConfig = (value?: AboutPageConfig): AboutPageConfig => {
  const fallback = DEFAULT_PAGES.about.aboutConfig;
  const source = value ?? fallback;
  if (!source) {
    return {
      introLabel: "About Me",
      heroImageUrl: "/hero-ghana-marketplace.png",
      heroImageSignedUrl: null,
      missionTitle: "Our Mission",
      missionBody:
        "To empower every Ghanaian by making the hiring of skilled professionals safe, secure, and trustworthy.",
      missionBullets: ["To offer transparent access to professionals across Ghana."],
      whatWeDoTitle: "What We Do",
      whatWeDoLeft: [
        "Trusted, seamless, and reliable services.",
        "Veteran professionals providing quality service.",
      ],
      whatWeDoRight: ["Transparent payments."],
      visionTitle: "Our SERVFIX",
      visionLeft:
        "To be Ghana's premier digital bridge, open and mindful of community participation and payment security.",
      visionRight: ["To be secure with service experience, fair opportunities and exposure."],
      headingFont: "space_grotesk",
      bodyFont: "plus_jakarta_sans",
    };
  }

  return {
    introLabel: source.introLabel ?? "",
    heroImageUrl: source.heroImageUrl ?? "",
    heroImageSignedUrl: source.heroImageSignedUrl ?? null,
    missionTitle: source.missionTitle ?? "",
    missionBody: source.missionBody ?? "",
    missionBullets: Array.isArray(source.missionBullets) ? [...source.missionBullets] : [],
    whatWeDoTitle: source.whatWeDoTitle ?? "",
    whatWeDoLeft: Array.isArray(source.whatWeDoLeft) ? [...source.whatWeDoLeft] : [],
    whatWeDoRight: Array.isArray(source.whatWeDoRight) ? [...source.whatWeDoRight] : [],
    visionTitle: source.visionTitle ?? "",
    visionLeft: source.visionLeft ?? "",
    visionRight: Array.isArray(source.visionRight) ? [...source.visionRight] : [],
    headingFont: source.headingFont ?? "space_grotesk",
    bodyFont: source.bodyFont ?? "plus_jakarta_sans",
  };
};

const cloneProviderResourcesConfig = (
  value?: ProviderResourcesContent,
): ProviderResourcesContent => {
  const source = value ?? defaultProviderResourcesContent;
  return {
    sections: Array.isArray(source.sections)
      ? source.sections.map((section) => ({
          id: section.id ?? "",
          title: section.title ?? "",
          description: section.description ?? "",
          blocks: Array.isArray(section.blocks)
            ? section.blocks.map((block) => ({
                heading: block.heading ?? "",
                items: Array.isArray(block.items) ? block.items.map((item) => item ?? "") : [],
              }))
            : [],
        }))
      : [],
    checklistItems: Array.isArray(source.checklistItems)
      ? source.checklistItems.map((item) => ({
          key: item.key,
          label: item.label ?? "",
          editable: Boolean(item.editable),
        }))
      : [],
    advancedResources: Array.isArray(source.advancedResources)
      ? source.advancedResources.map((item) => item ?? "")
      : [],
  };
};

const AdminPages = () => {
  const { user } = useAuth();
  const canUpdate = hasPermission(user?.role ?? null, "settings.content.update");
  const [draft, setDraft] = useState<DraftPages>({
    about: {
      title: DEFAULT_PAGES.about.title,
      body: DEFAULT_PAGES.about.body,
      staff: DEFAULT_PAGES.about.staff ?? [],
      aboutConfig: cloneAboutConfig(DEFAULT_PAGES.about.aboutConfig),
    },
    blog: {
      title: DEFAULT_PAGES.blog.title,
      body: DEFAULT_PAGES.blog.body,
      posts: DEFAULT_PAGES.blog.posts ?? [],
    },
    academy: {
      title: DEFAULT_PAGES.academy.title,
      body: DEFAULT_PAGES.academy.body,
      posts: DEFAULT_PAGES.academy.posts ?? [],
    },
    providerResources: {
      title: DEFAULT_PAGES.providerResources.title,
      body: DEFAULT_PAGES.providerResources.body,
      resourcesConfig: cloneProviderResourcesConfig(
        DEFAULT_PAGES.providerResources.resourcesConfig,
      ),
    },
  });
  const [isSavingAbout, setIsSavingAbout] = useState(false);
  const [isSavingBlog, setIsSavingBlog] = useState(false);
  const [isSavingAcademy, setIsSavingAcademy] = useState(false);
  const [isSavingProviderResources, setIsSavingProviderResources] = useState(false);
  const [isAboutHeroUploading, setIsAboutHeroUploading] = useState(false);
  const [staffUploadIndex, setStaffUploadIndex] = useState<number | null>(null);
  const [postUploadIndex, setPostUploadIndex] = useState<number | null>(null);
  const [academyUploadIndex, setAcademyUploadIndex] = useState<number | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-pages"],
    queryFn: fetchAdminPages,
  });

  useEffect(() => {
    if (data?.pages) {
      setDraft({
        about: {
          title: data.pages.about.title,
          body: data.pages.about.body,
          staff: data.pages.about.staff ?? [],
          aboutConfig: cloneAboutConfig(data.pages.about.aboutConfig),
        },
        blog: {
          title: data.pages.blog.title,
          body: data.pages.blog.body,
          posts: data.pages.blog.posts ?? [],
        },
        academy: {
          title: data.pages.academy.title,
          body: data.pages.academy.body,
          posts: data.pages.academy.posts ?? [],
        },
        providerResources: {
          title: data.pages.providerResources.title,
          body: data.pages.providerResources.body,
          resourcesConfig: cloneProviderResourcesConfig(
            data.pages.providerResources.resourcesConfig ??
              DEFAULT_PAGES.providerResources.resourcesConfig,
          ),
        },
      });
    }
  }, [data]);

  const updatePage = <K extends keyof DraftPages>(key: K, updates: Partial<DraftPages[K]>) => {
    setDraft((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...updates },
    }));
  };

  const updateAboutConfig = (updates: Partial<AboutPageConfig>) => {
    updatePage("about", {
      aboutConfig: {
        ...draft.about.aboutConfig,
        ...updates,
      },
    });
  };

  const updateAboutConfigLines = (
    key:
      | "missionBullets"
      | "whatWeDoLeft"
      | "whatWeDoRight"
      | "visionRight",
    value: string,
  ) => {
    updateAboutConfig({
      [key]: value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    });
  };

  const updateProviderResourcesConfig = (
    updater: (config: ProviderResourcesContent) => ProviderResourcesContent,
  ) => {
    const next = updater(
      cloneProviderResourcesConfig(
        draft.providerResources.resourcesConfig ??
          DEFAULT_PAGES.providerResources.resourcesConfig,
      ),
    );
    updatePage("providerResources", { resourcesConfig: next });
  };

  const addProviderSection = () => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      sections: [
        ...config.sections,
        {
          id: `section-${config.sections.length + 1}`,
          title: "",
          description: "",
          blocks: [{ heading: "", items: [""] }],
        },
      ],
    }));
  };

  const updateProviderSection = (
    sectionIndex: number,
    updates: Partial<ProviderResourcesContent["sections"][number]>,
  ) => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      sections: config.sections.map((section, index) =>
        index === sectionIndex ? { ...section, ...updates } : section,
      ),
    }));
  };

  const removeProviderSection = (sectionIndex: number) => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      sections: config.sections.filter((_, index) => index !== sectionIndex),
    }));
  };

  const addProviderBlock = (sectionIndex: number) => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      sections: config.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              blocks: [...section.blocks, { heading: "", items: [""] }],
            }
          : section,
      ),
    }));
  };

  const updateProviderBlock = (
    sectionIndex: number,
    blockIndex: number,
    updates: Partial<ProviderResourcesContent["sections"][number]["blocks"][number]>,
  ) => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      sections: config.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              blocks: section.blocks.map((block, idx) =>
                idx === blockIndex ? { ...block, ...updates } : block,
              ),
            }
          : section,
      ),
    }));
  };

  const removeProviderBlock = (sectionIndex: number, blockIndex: number) => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      sections: config.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              blocks: section.blocks.filter((_, idx) => idx !== blockIndex),
            }
          : section,
      ),
    }));
  };

  const addProviderChecklistItem = () => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      checklistItems: [
        ...config.checklistItems,
        {
          key: "payment_policy_understood",
          label: "",
          editable: true,
        },
      ],
    }));
  };

  const updateProviderChecklistItem = (
    itemIndex: number,
    updates: Partial<ProviderResourcesContent["checklistItems"][number]>,
  ) => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      checklistItems: config.checklistItems.map((item, index) =>
        index === itemIndex ? { ...item, ...updates } : item,
      ),
    }));
  };

  const removeProviderChecklistItem = (itemIndex: number) => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      checklistItems: config.checklistItems.filter((_, index) => index !== itemIndex),
    }));
  };

  const addAdvancedResource = () => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      advancedResources: [...config.advancedResources, ""],
    }));
  };

  const updateAdvancedResource = (itemIndex: number, value: string) => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      advancedResources: config.advancedResources.map((item, index) =>
        index === itemIndex ? value : item,
      ),
    }));
  };

  const removeAdvancedResource = (itemIndex: number) => {
    updateProviderResourcesConfig((config) => ({
      ...config,
      advancedResources: config.advancedResources.filter((_, index) => index !== itemIndex),
    }));
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part.trim()[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  const addStaffMember = () => {
    if (draft.about.staff.length >= MAX_STAFF) {
      toast({ title: `You can add up to ${MAX_STAFF} staff profiles.` });
      return;
    }
    updatePage("about", {
      staff: [
        ...draft.about.staff,
        {
          name: "",
          role: "",
          bio: "",
          photoUrl: "",
        },
      ],
    });
  };

  const updateStaffMember = (index: number, updates: Partial<StaffProfileView>) => {
    updatePage("about", {
      staff: draft.about.staff.map((member, idx) =>
        idx === index ? { ...member, ...updates } : member,
      ),
    });
  };

  const removeStaffMember = (index: number) => {
    updatePage("about", {
      staff: draft.about.staff.filter((_, idx) => idx !== index),
    });
  };

  const handleStaffPhotoUpload = async (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }

    try {
      setStaffUploadIndex(index);
      const upload = await uploadPageImage(file);
      updateStaffMember(index, {
        photoUrl: upload.key,
        photoSignedUrl: upload.signedUrl ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to upload staff photo.";
      toast({ title: message });
    } finally {
      setStaffUploadIndex(null);
      event.target.value = "";
    }
  };

  const handleAboutHeroImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }

    try {
      setIsAboutHeroUploading(true);
      const upload = await uploadPageImage(file);
      updateAboutConfig({
        heroImageUrl: upload.key,
        heroImageSignedUrl: upload.signedUrl ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to upload about hero image.";
      toast({ title: message });
    } finally {
      setIsAboutHeroUploading(false);
      event.target.value = "";
    }
  };

  const addBlogPost = () => {
    if (draft.blog.posts.length >= MAX_BLOG_POSTS) {
      toast({ title: `You can add up to ${MAX_BLOG_POSTS} posts.` });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    updatePage("blog", {
      posts: [
        ...draft.blog.posts,
        {
          title: "",
          summary: "",
          body: "",
          imageUrl: "",
          videoUrl: "",
          publishedAt: today,
        },
      ],
    });
  };

  const updateBlogPost = (index: number, updates: Partial<BlogPostView>) => {
    updatePage("blog", {
      posts: draft.blog.posts.map((post, idx) =>
        idx === index ? { ...post, ...updates } : post,
      ),
    });
  };

  const removeBlogPost = (index: number) => {
    updatePage("blog", {
      posts: draft.blog.posts.filter((_, idx) => idx !== index),
    });
  };

  const handleBlogPostImageUpload = async (
    index: number,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }

    try {
      setPostUploadIndex(index);
      const upload = await uploadPageImage(file);
      updateBlogPost(index, {
        imageUrl: upload.key,
        imageSignedUrl: upload.signedUrl ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to upload post image.";
      toast({ title: message });
    } finally {
      setPostUploadIndex(null);
      event.target.value = "";
    }
  };

  const addAcademyPost = () => {
    if (draft.academy.posts.length >= MAX_ACADEMY_POSTS) {
      toast({ title: `You can add up to ${MAX_ACADEMY_POSTS} academy materials.` });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    updatePage("academy", {
      posts: [
        ...draft.academy.posts,
        {
          title: "",
          summary: "",
          body: "",
          imageUrl: "",
          videoUrl: "",
          publishedAt: today,
        },
      ],
    });
  };

  const updateAcademyPost = (index: number, updates: Partial<BlogPostView>) => {
    updatePage("academy", {
      posts: draft.academy.posts.map((post, idx) =>
        idx === index ? { ...post, ...updates } : post,
      ),
    });
  };

  const removeAcademyPost = (index: number) => {
    updatePage("academy", {
      posts: draft.academy.posts.filter((_, idx) => idx !== index),
    });
  };

  const handleAcademyPostImageUpload = async (
    index: number,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }

    try {
      setAcademyUploadIndex(index);
      const upload = await uploadPageImage(file);
      updateAcademyPost(index, {
        imageUrl: upload.key,
        imageSignedUrl: upload.signedUrl ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to upload academy image.";
      toast({ title: message });
    } finally {
      setAcademyUploadIndex(null);
      event.target.value = "";
    }
  };

  const buildStaffPayload = (items: StaffProfileView[]) =>
    items
      .map((member) => ({
        name: member.name?.trim() ?? "",
        role: member.role?.trim() ?? "",
        bio: member.bio?.trim() || undefined,
        photoUrl: member.photoUrl?.trim() || undefined,
      }))
      .filter((member) => member.name && member.role);

  const buildPostPayload = (items: BlogPostView[]) =>
    items
      .map((post) => ({
        title: post.title?.trim() ?? "",
        summary: post.summary?.trim() || undefined,
        body: post.body?.trim() ?? "",
        imageUrl: post.imageUrl?.trim() || undefined,
        videoUrl: post.videoUrl?.trim() || undefined,
        publishedAt: post.publishedAt?.trim() || new Date().toISOString().slice(0, 10),
      }))
      .filter((post) => post.title);

  const buildAboutConfigPayload = (config: AboutPageConfig): AboutPageConfig => {
    const fallback = cloneAboutConfig(DEFAULT_PAGES.about.aboutConfig);
    const trimLines = (items: string[]) =>
      items.map((item) => item.trim()).filter(Boolean);

    const missionBullets = trimLines(config.missionBullets);
    const whatWeDoLeft = trimLines(config.whatWeDoLeft);
    const whatWeDoRight = trimLines(config.whatWeDoRight);
    const visionRight = trimLines(config.visionRight);

    return {
      introLabel: config.introLabel.trim() || fallback.introLabel,
      heroImageUrl: config.heroImageUrl?.trim() || undefined,
      missionTitle: config.missionTitle.trim() || fallback.missionTitle,
      missionBody: config.missionBody.trim() || fallback.missionBody,
      missionBullets: missionBullets.length > 0 ? missionBullets : fallback.missionBullets,
      whatWeDoTitle: config.whatWeDoTitle.trim() || fallback.whatWeDoTitle,
      whatWeDoLeft: whatWeDoLeft.length > 0 ? whatWeDoLeft : fallback.whatWeDoLeft,
      whatWeDoRight: whatWeDoRight.length > 0 ? whatWeDoRight : fallback.whatWeDoRight,
      visionTitle: config.visionTitle.trim() || fallback.visionTitle,
      visionLeft: config.visionLeft.trim() || fallback.visionLeft,
      visionRight: visionRight.length > 0 ? visionRight : fallback.visionRight,
      headingFont: config.headingFont ?? fallback.headingFont,
      bodyFont: config.bodyFont ?? fallback.bodyFont,
    };
  };

  const getSavedAboutDraft = (): DraftPages["about"] => {
    if (data?.pages?.about) {
      return {
        title: data.pages.about.title,
        body: data.pages.about.body,
        staff: (data.pages.about.staff ?? []).map((member) => ({
          name: member.name,
          role: member.role,
          bio: member.bio ?? "",
          photoUrl: member.photoUrl ?? "",
        })),
        aboutConfig: cloneAboutConfig(data.pages.about.aboutConfig),
      };
    }
    return draft.about;
  };

  const getSavedBlogDraft = (): DraftPages["blog"] => {
    if (data?.pages?.blog) {
      return {
        title: data.pages.blog.title,
        body: data.pages.blog.body,
        posts: (data.pages.blog.posts ?? []).map((post) => ({
          title: post.title,
          summary: post.summary ?? "",
          body: post.body,
          imageUrl: post.imageUrl ?? "",
          videoUrl: post.videoUrl ?? "",
          imageSignedUrl: post.imageSignedUrl ?? null,
          publishedAt: post.publishedAt ?? "",
        })),
      };
    }
    return draft.blog;
  };

  const getSavedAcademyDraft = (): DraftPages["academy"] => {
    if (data?.pages?.academy) {
      return {
        title: data.pages.academy.title,
        body: data.pages.academy.body,
        posts: (data.pages.academy.posts ?? []).map((post) => ({
          title: post.title,
          summary: post.summary ?? "",
          body: post.body,
          imageUrl: post.imageUrl ?? "",
          videoUrl: post.videoUrl ?? "",
          imageSignedUrl: post.imageSignedUrl ?? null,
          publishedAt: post.publishedAt ?? "",
        })),
      };
    }
    return draft.academy;
  };

  const getSavedProviderResourcesDraft = (): DraftPages["providerResources"] => {
    if (data?.pages?.providerResources) {
      return {
        title: data.pages.providerResources.title,
        body: data.pages.providerResources.body,
        resourcesConfig: cloneProviderResourcesConfig(
          data.pages.providerResources.resourcesConfig ??
            DEFAULT_PAGES.providerResources.resourcesConfig,
        ),
      };
    }
    return {
      ...draft.providerResources,
      resourcesConfig: cloneProviderResourcesConfig(
        draft.providerResources.resourcesConfig ??
          DEFAULT_PAGES.providerResources.resourcesConfig,
      ),
    };
  };

  const handleSaveAbout = async () => {
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }
    const payload: AdminPagesPayload = {
      about: {
        title: draft.about.title,
        body: draft.about.body,
        staff: buildStaffPayload(draft.about.staff),
        aboutConfig: buildAboutConfigPayload(draft.about.aboutConfig),
      },
      blog: {
        title: getSavedBlogDraft().title,
        body: getSavedBlogDraft().body,
        posts: buildPostPayload(getSavedBlogDraft().posts),
      },
      academy: {
        title: getSavedAcademyDraft().title,
        body: getSavedAcademyDraft().body,
        posts: buildPostPayload(getSavedAcademyDraft().posts),
      },
      providerResources: {
        title: getSavedProviderResourcesDraft().title,
        body: getSavedProviderResourcesDraft().body,
        resourcesConfig: getSavedProviderResourcesDraft().resourcesConfig,
      },
    };

    try {
      setIsSavingAbout(true);
      await updateAdminPages(payload);
      toast({ title: "About page updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update pages.";
      toast({ title: message });
    } finally {
      setIsSavingAbout(false);
    }
  };

  const handleSaveBlog = async () => {
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }
    const payload: AdminPagesPayload = {
      about: {
        title: getSavedAboutDraft().title,
        body: getSavedAboutDraft().body,
        staff: buildStaffPayload(getSavedAboutDraft().staff),
        aboutConfig: buildAboutConfigPayload(getSavedAboutDraft().aboutConfig),
      },
      blog: {
        title: draft.blog.title,
        body: draft.blog.body,
        posts: buildPostPayload(draft.blog.posts),
      },
      academy: {
        title: getSavedAcademyDraft().title,
        body: getSavedAcademyDraft().body,
        posts: buildPostPayload(getSavedAcademyDraft().posts),
      },
      providerResources: {
        title: getSavedProviderResourcesDraft().title,
        body: getSavedProviderResourcesDraft().body,
        resourcesConfig: getSavedProviderResourcesDraft().resourcesConfig,
      },
    };

    try {
      setIsSavingBlog(true);
      await updateAdminPages(payload);
      toast({ title: "Blog page updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update pages.";
      toast({ title: message });
    } finally {
      setIsSavingBlog(false);
    }
  };

  const handleSaveAcademy = async () => {
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }
    const payload: AdminPagesPayload = {
      about: {
        title: getSavedAboutDraft().title,
        body: getSavedAboutDraft().body,
        staff: buildStaffPayload(getSavedAboutDraft().staff),
        aboutConfig: buildAboutConfigPayload(getSavedAboutDraft().aboutConfig),
      },
      blog: {
        title: getSavedBlogDraft().title,
        body: getSavedBlogDraft().body,
        posts: buildPostPayload(getSavedBlogDraft().posts),
      },
      academy: {
        title: draft.academy.title,
        body: draft.academy.body,
        posts: buildPostPayload(draft.academy.posts),
      },
      providerResources: {
        title: getSavedProviderResourcesDraft().title,
        body: getSavedProviderResourcesDraft().body,
        resourcesConfig: getSavedProviderResourcesDraft().resourcesConfig,
      },
    };

    try {
      setIsSavingAcademy(true);
      await updateAdminPages(payload);
      toast({ title: "Academy page updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update pages.";
      toast({ title: message });
    } finally {
      setIsSavingAcademy(false);
    }
  };

  const handleSaveProviderResources = async () => {
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }
    const resourcesConfig = cloneProviderResourcesConfig(
      draft.providerResources.resourcesConfig ??
        DEFAULT_PAGES.providerResources.resourcesConfig,
    );

    const payload: AdminPagesPayload = {
      about: {
        title: getSavedAboutDraft().title,
        body: getSavedAboutDraft().body,
        staff: buildStaffPayload(getSavedAboutDraft().staff),
        aboutConfig: buildAboutConfigPayload(getSavedAboutDraft().aboutConfig),
      },
      blog: {
        title: getSavedBlogDraft().title,
        body: getSavedBlogDraft().body,
        posts: buildPostPayload(getSavedBlogDraft().posts),
      },
      academy: {
        title: getSavedAcademyDraft().title,
        body: getSavedAcademyDraft().body,
        posts: buildPostPayload(getSavedAcademyDraft().posts),
      },
      providerResources: {
        title: draft.providerResources.title,
        body: draft.providerResources.body,
        resourcesConfig,
      },
    };

    try {
      setIsSavingProviderResources(true);
      await updateAdminPages(payload);
      updatePage("providerResources", { resourcesConfig });
      toast({ title: "Provider resources page updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update pages.";
      toast({ title: message });
    } finally {
      setIsSavingProviderResources(false);
    }
  };

  const handleReset = () => {
    if (data?.pages) {
      setDraft({
        about: {
          title: data.pages.about.title,
          body: data.pages.about.body,
          staff: data.pages.about.staff ?? [],
          aboutConfig: cloneAboutConfig(data.pages.about.aboutConfig),
        },
        blog: {
          title: data.pages.blog.title,
          body: data.pages.blog.body,
          posts: data.pages.blog.posts ?? [],
        },
        academy: {
          title: data.pages.academy.title,
          body: data.pages.academy.body,
          posts: data.pages.academy.posts ?? [],
        },
        providerResources: {
          title: data.pages.providerResources.title,
          body: data.pages.providerResources.body,
          resourcesConfig: cloneProviderResourcesConfig(
            data.pages.providerResources.resourcesConfig ??
              DEFAULT_PAGES.providerResources.resourcesConfig,
          ),
        },
      });
    } else {
      setDraft({
        about: {
          title: DEFAULT_PAGES.about.title,
          body: DEFAULT_PAGES.about.body,
          staff: DEFAULT_PAGES.about.staff ?? [],
          aboutConfig: cloneAboutConfig(DEFAULT_PAGES.about.aboutConfig),
        },
        blog: {
          title: DEFAULT_PAGES.blog.title,
          body: DEFAULT_PAGES.blog.body,
          posts: DEFAULT_PAGES.blog.posts ?? [],
        },
        academy: {
          title: DEFAULT_PAGES.academy.title,
          body: DEFAULT_PAGES.academy.body,
          posts: DEFAULT_PAGES.academy.posts ?? [],
        },
        providerResources: {
          title: DEFAULT_PAGES.providerResources.title,
          body: DEFAULT_PAGES.providerResources.body,
          resourcesConfig: cloneProviderResourcesConfig(
            DEFAULT_PAGES.providerResources.resourcesConfig,
          ),
        },
      });
    }
  };

  const providerResourcesConfig = cloneProviderResourcesConfig(
    draft.providerResources.resourcesConfig ??
      DEFAULT_PAGES.providerResources.resourcesConfig,
  );
  const aboutConfig = cloneAboutConfig(draft.about.aboutConfig);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading pages...</div>;
  }

  if (isError) {
    return (
      <div className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Unable to load pages."}{" "}
        <button className="text-primary underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Pages</h2>
          <p className="text-sm text-muted-foreground">
            Update About, Blog, Academy, and Provider Resources content.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset All
          </Button>
        </div>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">About</h3>
              <p className="text-sm text-muted-foreground">
                Content displayed on the About page.
              </p>
            </div>
            <Button
              onClick={handleSaveAbout}
              disabled={!canUpdate || isSavingAbout}
              size="sm"
            >
              {isSavingAbout ? "Saving..." : "Save About"}
            </Button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={draft.about.title}
              onChange={(e) => updatePage("about", { title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Body</label>
            <Textarea
              value={draft.about.body}
              onChange={(e) => updatePage("about", { body: e.target.value })}
              rows={6}
            />
          </div>
          <div className="rounded-md border border-border/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Layout content and fonts</h4>
                <p className="text-xs text-muted-foreground">
                  Edit mission sections and choose heading/body fonts for the About page.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Intro label</label>
                <Input
                  value={aboutConfig.introLabel}
                  onChange={(e) => updateAboutConfig({ introLabel: e.target.value })}
                  disabled={!canUpdate}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Hero image URL or key</label>
                <Input
                  value={aboutConfig.heroImageUrl ?? ""}
                  onChange={(e) =>
                    updateAboutConfig({
                      heroImageUrl: e.target.value,
                      heroImageSignedUrl: null,
                    })
                  }
                  disabled={!canUpdate}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Heading font</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={aboutConfig.headingFont}
                  onChange={(e) =>
                    updateAboutConfig({ headingFont: e.target.value as AboutFontOption })
                  }
                  disabled={!canUpdate}
                >
                  {ABOUT_FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Body font</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={aboutConfig.bodyFont}
                  onChange={(e) =>
                    updateAboutConfig({ bodyFont: e.target.value as AboutFontOption })
                  }
                  disabled={!canUpdate}
                >
                  {ABOUT_FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleAboutHeroImageUpload}
                  disabled={!canUpdate || isAboutHeroUploading}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateAboutConfig({ heroImageUrl: "", heroImageSignedUrl: null })}
                    disabled={!canUpdate || (!aboutConfig.heroImageUrl && !aboutConfig.heroImageSignedUrl)}
                  >
                    Remove hero image
                  </Button>
                  {isAboutHeroUploading ? (
                    <span className="text-xs text-muted-foreground">Uploading...</span>
                  ) : null}
                </div>
              </div>
              <div className="h-24 overflow-hidden rounded-md border border-border/60 bg-muted">
                {aboutConfig.heroImageSignedUrl || aboutConfig.heroImageUrl ? (
                  <img
                    src={aboutConfig.heroImageSignedUrl ?? aboutConfig.heroImageUrl ?? ""}
                    alt="About hero preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    No hero image selected
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Mission title</label>
                <Input
                  value={aboutConfig.missionTitle}
                  onChange={(e) => updateAboutConfig({ missionTitle: e.target.value })}
                  disabled={!canUpdate}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">What we do title</label>
                <Input
                  value={aboutConfig.whatWeDoTitle}
                  onChange={(e) => updateAboutConfig({ whatWeDoTitle: e.target.value })}
                  disabled={!canUpdate}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Mission paragraph</label>
              <Textarea
                rows={3}
                value={aboutConfig.missionBody}
                onChange={(e) => updateAboutConfig({ missionBody: e.target.value })}
                disabled={!canUpdate}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Mission bullets (one per line)</label>
                <Textarea
                  rows={5}
                  value={aboutConfig.missionBullets.join("\n")}
                  onChange={(e) => updateAboutConfigLines("missionBullets", e.target.value)}
                  disabled={!canUpdate}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  What we do (left column, one per line)
                </label>
                <Textarea
                  rows={5}
                  value={aboutConfig.whatWeDoLeft.join("\n")}
                  onChange={(e) => updateAboutConfigLines("whatWeDoLeft", e.target.value)}
                  disabled={!canUpdate}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                What we do (right column, one per line)
              </label>
              <Textarea
                rows={4}
                value={aboutConfig.whatWeDoRight.join("\n")}
                onChange={(e) => updateAboutConfigLines("whatWeDoRight", e.target.value)}
                disabled={!canUpdate}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Vision title</label>
                <Input
                  value={aboutConfig.visionTitle}
                  onChange={(e) => updateAboutConfig({ visionTitle: e.target.value })}
                  disabled={!canUpdate}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Vision left paragraph</label>
                <Textarea
                  rows={3}
                  value={aboutConfig.visionLeft}
                  onChange={(e) => updateAboutConfig({ visionLeft: e.target.value })}
                  disabled={!canUpdate}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Vision right items (one per line)</label>
              <Textarea
                rows={4}
                value={aboutConfig.visionRight.join("\n")}
                onChange={(e) => updateAboutConfigLines("visionRight", e.target.value)}
                disabled={!canUpdate}
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium">Staff profiles</label>
                <p className="text-xs text-muted-foreground">
                  Add team members displayed on the About page.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addStaffMember}
                disabled={!canUpdate || draft.about.staff.length >= MAX_STAFF}
              >
                Add staff
              </Button>
            </div>
            {draft.about.staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff profiles added yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {draft.about.staff.map((member, index) => {
                  const photo = member.photoSignedUrl ?? member.photoUrl ?? "";
                  return (
                    <div
                      key={`staff-${index}`}
                      className="rounded-md border border-border/60 p-4 space-y-3"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          {photo ? <AvatarImage src={photo} alt={member.name || "Staff"} /> : null}
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {getInitials(member.name || "S")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder="Name"
                            value={member.name ?? ""}
                            onChange={(e) => updateStaffMember(index, { name: e.target.value })}
                            disabled={!canUpdate}
                          />
                          <Input
                            placeholder="Role/Title"
                            value={member.role ?? ""}
                            onChange={(e) => updateStaffMember(index, { role: e.target.value })}
                            disabled={!canUpdate}
                          />
                        </div>
                      </div>
                      <Textarea
                        placeholder="Short bio"
                        value={member.bio ?? ""}
                        onChange={(e) => updateStaffMember(index, { bio: e.target.value })}
                        rows={3}
                        disabled={!canUpdate}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleStaffPhotoUpload(index, event)}
                          disabled={!canUpdate || staffUploadIndex === index}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateStaffMember(index, { photoUrl: "", photoSignedUrl: null })}
                          disabled={!canUpdate || (!member.photoUrl && !member.photoSignedUrl)}
                        >
                          Remove photo
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStaffMember(index)}
                          disabled={!canUpdate}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Academy</h3>
              <p className="text-sm text-muted-foreground">
                Educational materials displayed on the Academy page.
              </p>
            </div>
            <Button
              onClick={handleSaveAcademy}
              disabled={!canUpdate || isSavingAcademy}
              size="sm"
            >
              {isSavingAcademy ? "Saving..." : "Save Academy"}
            </Button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={draft.academy.title}
              onChange={(e) => updatePage("academy", { title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Body</label>
            <Textarea
              value={draft.academy.body}
              onChange={(e) => updatePage("academy", { body: e.target.value })}
              rows={6}
            />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium">Learning materials</label>
                <p className="text-xs text-muted-foreground">
                  Add guides, lessons, and tutorials with image, summary, full content, and optional YouTube links.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addAcademyPost}
                  disabled={!canUpdate || draft.academy.posts.length >= MAX_ACADEMY_POSTS}
                >
                  Add material
                </Button>
                <span className="text-xs text-muted-foreground">
                  {draft.academy.posts.length}/{MAX_ACADEMY_POSTS}
                </span>
              </div>
            </div>
            {draft.academy.posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No academy materials added yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {draft.academy.posts.map((post, index) => {
                  const preview = post.imageSignedUrl ?? post.imageUrl ?? "";
                  return (
                    <div
                      key={`academy-post-${index}`}
                      className="rounded-md border border-border/60 p-4 space-y-3"
                    >
                      <div className="aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
                        {preview ? (
                          <img
                            src={preview}
                            alt={post.title || "Academy material"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                            No preview
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Title</label>
                        <Input
                          placeholder="Material title"
                          value={post.title ?? ""}
                          onChange={(e) => updateAcademyPost(index, { title: e.target.value })}
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Publish date</label>
                        <Input
                          type="date"
                          value={post.publishedAt ?? ""}
                          onChange={(e) => updateAcademyPost(index, { publishedAt: e.target.value })}
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">YouTube link</label>
                        <Input
                          type="url"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={post.videoUrl ?? ""}
                          onChange={(e) => updateAcademyPost(index, { videoUrl: e.target.value })}
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Summary</label>
                        <Textarea
                          placeholder="Short summary shown on the card"
                          value={post.summary ?? ""}
                          onChange={(e) => updateAcademyPost(index, { summary: e.target.value })}
                          rows={2}
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Material body</label>
                        <Textarea
                          placeholder="Full material content (shown when opened)"
                          value={post.body ?? ""}
                          onChange={(e) => updateAcademyPost(index, { body: e.target.value })}
                          rows={4}
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleAcademyPostImageUpload(index, event)}
                          disabled={!canUpdate || academyUploadIndex === index}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateAcademyPost(index, { imageUrl: "", imageSignedUrl: null })
                          }
                          disabled={!canUpdate || (!post.imageUrl && !post.imageSignedUrl)}
                        >
                          Remove image
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAcademyPost(index)}
                          disabled={!canUpdate}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Provider Resources</h3>
              <p className="text-sm text-muted-foreground">
                Intro copy plus structured sections/checklist shown on dashboard and website.
              </p>
            </div>
            <Button
              onClick={handleSaveProviderResources}
              disabled={!canUpdate || isSavingProviderResources}
              size="sm"
            >
              {isSavingProviderResources ? "Saving..." : "Save Provider Resources"}
            </Button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={draft.providerResources.title}
              onChange={(e) =>
                updatePage("providerResources", { title: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Body</label>
            <Textarea
              value={draft.providerResources.body}
              onChange={(e) =>
                updatePage("providerResources", { body: e.target.value })
              }
              rows={5}
            />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium">Guide sections</label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updatePage("providerResources", {
                      resourcesConfig: cloneProviderResourcesConfig(
                        DEFAULT_PAGES.providerResources.resourcesConfig,
                      ),
                    })
                  }
                >
                  Reset template
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addProviderSection}>
                  Add section
                </Button>
              </div>
            </div>
            {providerResourcesConfig.sections.length === 0 ? (
              <p className="text-xs text-muted-foreground">No sections added yet.</p>
            ) : (
              <div className="space-y-3">
                {providerResourcesConfig.sections.map((section, sectionIndex) => (
                  <div
                    key={`${section.id}-${sectionIndex}`}
                    className="rounded-md border border-border/60 p-4 space-y-3"
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Section ID</label>
                        <Input
                          value={section.id}
                          onChange={(e) =>
                            updateProviderSection(sectionIndex, { id: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs text-muted-foreground">Title</label>
                        <Input
                          value={section.title}
                          onChange={(e) =>
                            updateProviderSection(sectionIndex, { title: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1 md:col-span-3">
                        <label className="text-xs text-muted-foreground">Description</label>
                        <Textarea
                          value={section.description}
                          onChange={(e) =>
                            updateProviderSection(sectionIndex, { description: e.target.value })
                          }
                          rows={2}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs text-muted-foreground">Blocks</label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addProviderBlock(sectionIndex)}
                        >
                          Add block
                        </Button>
                      </div>
                      {section.blocks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No blocks added yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {section.blocks.map((block, blockIndex) => (
                            <div
                              key={`${section.id}-block-${blockIndex}`}
                              className="rounded-md border border-border/60 p-3 space-y-2"
                            >
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Heading</label>
                                <Input
                                  value={block.heading}
                                  onChange={(e) =>
                                    updateProviderBlock(sectionIndex, blockIndex, {
                                      heading: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">
                                  Items (one per line)
                                </label>
                                <Textarea
                                  value={block.items.join("\n")}
                                  onChange={(e) =>
                                    updateProviderBlock(sectionIndex, blockIndex, {
                                      items: e.target.value
                                        .split("\n")
                                        .map((item) => item.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  rows={4}
                                />
                              </div>
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeProviderBlock(sectionIndex, blockIndex)}
                                >
                                  Remove block
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeProviderSection(sectionIndex)}
                      >
                        Remove section
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium">Launch checklist</label>
              <Button type="button" variant="outline" size="sm" onClick={addProviderChecklistItem}>
                Add checklist item
              </Button>
            </div>
            {providerResourcesConfig.checklistItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">No checklist items added yet.</p>
            ) : (
              <div className="space-y-2">
                {providerResourcesConfig.checklistItems.map((item, itemIndex) => (
                  <div
                    key={`${item.key}-${itemIndex}`}
                    className="rounded-md border border-border/60 p-3 grid gap-3 md:grid-cols-[1.3fr_2fr_auto_auto] md:items-center"
                  >
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={item.key}
                      onChange={(e) =>
                        updateProviderChecklistItem(itemIndex, {
                          key: e.target.value as ProviderLaunchChecklistKey,
                        })
                      }
                    >
                      {PROVIDER_CHECKLIST_KEY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={item.label}
                      onChange={(e) =>
                        updateProviderChecklistItem(itemIndex, { label: e.target.value })
                      }
                      placeholder="Checklist label"
                    />
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={item.editable}
                        onChange={(e) =>
                          updateProviderChecklistItem(itemIndex, { editable: e.target.checked })
                        }
                      />
                      Manual
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeProviderChecklistItem(itemIndex)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium">Advanced resources</label>
              <Button type="button" variant="outline" size="sm" onClick={addAdvancedResource}>
                Add resource
              </Button>
            </div>
            {providerResourcesConfig.advancedResources.length === 0 ? (
              <p className="text-xs text-muted-foreground">No advanced resources added yet.</p>
            ) : (
              <div className="space-y-2">
                {providerResourcesConfig.advancedResources.map((item, itemIndex) => (
                  <div
                    key={`advanced-resource-${itemIndex}`}
                    className="rounded-md border border-border/60 p-3 flex flex-wrap items-center gap-2"
                  >
                    <Input
                      className="flex-1 min-w-[240px]"
                      value={item}
                      onChange={(e) => updateAdvancedResource(itemIndex, e.target.value)}
                      placeholder="Advanced resource item"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAdvancedResource(itemIndex)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              This editor controls section titles, bullets, checklist labels, and advanced resources on dashboard and website.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Blog</h3>
              <p className="text-sm text-muted-foreground">
                Content displayed on the Blog page.
              </p>
            </div>
            <Button
              onClick={handleSaveBlog}
              disabled={!canUpdate || isSavingBlog}
              size="sm"
            >
              {isSavingBlog ? "Saving..." : "Save Blog"}
            </Button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={draft.blog.title}
              onChange={(e) => updatePage("blog", { title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Body</label>
            <Textarea
              value={draft.blog.body}
              onChange={(e) => updatePage("blog", { body: e.target.value })}
              rows={6}
            />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium">Blog posts</label>
                <p className="text-xs text-muted-foreground">
                  Add multiple posts with an image, summary, and full body.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addBlogPost}
                  disabled={!canUpdate || draft.blog.posts.length >= MAX_BLOG_POSTS}
                >
                  Add post
                </Button>
                <span className="text-xs text-muted-foreground">
                  {draft.blog.posts.length}/{MAX_BLOG_POSTS}
                </span>
              </div>
            </div>
            {draft.blog.posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posts added yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {draft.blog.posts.map((post, index) => {
                  const preview = post.imageSignedUrl ?? post.imageUrl ?? "";
                  return (
                    <div
                      key={`post-${index}`}
                      className="rounded-md border border-border/60 p-4 space-y-3"
                    >
                      <div className="aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
                        {preview ? (
                          <img
                            src={preview}
                            alt={post.title || "Blog post"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                            No preview
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Title</label>
                        <Input
                          placeholder="Post title"
                          value={post.title ?? ""}
                          onChange={(e) => updateBlogPost(index, { title: e.target.value })}
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Publish date</label>
                        <Input
                          type="date"
                          value={post.publishedAt ?? ""}
                          onChange={(e) => updateBlogPost(index, { publishedAt: e.target.value })}
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Summary</label>
                        <Textarea
                          placeholder="Short summary shown on the card"
                          value={post.summary ?? ""}
                          onChange={(e) => updateBlogPost(index, { summary: e.target.value })}
                          rows={2}
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Post body</label>
                        <Textarea
                          placeholder="Full post content (shown when Read more is clicked)"
                          value={post.body ?? ""}
                          onChange={(e) => updateBlogPost(index, { body: e.target.value })}
                          rows={4}
                          disabled={!canUpdate}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleBlogPostImageUpload(index, event)}
                          disabled={!canUpdate || postUploadIndex === index}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateBlogPost(index, { imageUrl: "", imageSignedUrl: null })
                          }
                          disabled={!canUpdate || (!post.imageUrl && !post.imageSignedUrl)}
                        >
                          Remove image
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBlogPost(index)}
                          disabled={!canUpdate}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPages;
