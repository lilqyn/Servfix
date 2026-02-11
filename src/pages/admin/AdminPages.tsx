import { type ChangeEvent, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import {
  fetchAdminPages,
  updateAdminPages,
  uploadPageImage,
  type AdminPagesPayload,
  type BlogPostView,
  type StaffProfileView,
} from "@/lib/api";
import { DEFAULT_PAGES } from "@/lib/pageDefaults";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/permissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const MAX_BLOG_POSTS = 12;
const MAX_STAFF = 12;

type DraftPages = {
  about: Omit<AdminPagesPayload["about"], "staff"> & { staff: StaffProfileView[] };
  blog: Omit<AdminPagesPayload["blog"], "posts"> & { posts: BlogPostView[] };
};

const AdminPages = () => {
  const { user } = useAuth();
  const canUpdate = hasPermission(user?.role ?? null, "settings.update");
  const [draft, setDraft] = useState<DraftPages>({
    about: {
      title: DEFAULT_PAGES.about.title,
      body: DEFAULT_PAGES.about.body,
      staff: DEFAULT_PAGES.about.staff ?? [],
    },
    blog: {
      title: DEFAULT_PAGES.blog.title,
      body: DEFAULT_PAGES.blog.body,
      posts: DEFAULT_PAGES.blog.posts ?? [],
    },
  });
  const [isSavingAbout, setIsSavingAbout] = useState(false);
  const [isSavingBlog, setIsSavingBlog] = useState(false);
  const [staffUploadIndex, setStaffUploadIndex] = useState<number | null>(null);
  const [postUploadIndex, setPostUploadIndex] = useState<number | null>(null);

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
        },
        blog: {
          title: data.pages.blog.title,
          body: data.pages.blog.body,
          posts: data.pages.blog.posts ?? [],
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
        publishedAt: post.publishedAt?.trim() || new Date().toISOString().slice(0, 10),
      }))
      .filter((post) => post.title);

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
          imageSignedUrl: post.imageSignedUrl ?? null,
          publishedAt: post.publishedAt ?? "",
        })),
      };
    }
    return draft.blog;
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
      },
      blog: {
        title: getSavedBlogDraft().title,
        body: getSavedBlogDraft().body,
        posts: buildPostPayload(getSavedBlogDraft().posts),
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
      },
      blog: {
        title: draft.blog.title,
        body: draft.blog.body,
        posts: buildPostPayload(draft.blog.posts),
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

  const handleReset = () => {
    if (data?.pages) {
      setDraft({
        about: {
          title: data.pages.about.title,
          body: data.pages.about.body,
          staff: data.pages.about.staff ?? [],
        },
        blog: {
          title: data.pages.blog.title,
          body: data.pages.blog.body,
          posts: data.pages.blog.posts ?? [],
        },
      });
    } else {
      setDraft({
        about: {
          title: DEFAULT_PAGES.about.title,
          body: DEFAULT_PAGES.about.body,
          staff: DEFAULT_PAGES.about.staff ?? [],
        },
        blog: {
          title: DEFAULT_PAGES.blog.title,
          body: DEFAULT_PAGES.blog.body,
          posts: DEFAULT_PAGES.blog.posts ?? [],
        },
      });
    }
  };

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
            Update the About and Blog pages shown in the header.
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
