import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { fetchAdminPages, updateAdminPages, type AdminPagesPayload } from "@/lib/api";
import { DEFAULT_PAGES } from "@/lib/pageDefaults";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/permissions";

const AdminPages = () => {
  const { user } = useAuth();
  const canUpdate = hasPermission(user?.role ?? null, "settings.update");
  const [draft, setDraft] = useState<AdminPagesPayload>(DEFAULT_PAGES);
  const [isSaving, setIsSaving] = useState(false);

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
        },
        blog: {
          title: data.pages.blog.title,
          body: data.pages.blog.body,
        },
      });
    }
  }, [data]);

  const updatePage = (key: keyof AdminPagesPayload, updates: Partial<AdminPagesPayload["about"]>) => {
    setDraft((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...updates },
    }));
  };

  const handleSave = async () => {
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }
    try {
      setIsSaving(true);
      await updateAdminPages(draft);
      toast({ title: "Pages updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update pages.";
      toast({ title: message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (data?.pages) {
      setDraft({
        about: {
          title: data.pages.about.title,
          body: data.pages.about.body,
        },
        blog: {
          title: data.pages.blog.title,
          body: data.pages.blog.body,
        },
      });
    } else {
      setDraft(DEFAULT_PAGES);
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
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!canUpdate || isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">About</h3>
            <p className="text-sm text-muted-foreground">
              Content displayed on the About page.
            </p>
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
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Blog</h3>
            <p className="text-sm text-muted-foreground">
              Content displayed on the Blog page.
            </p>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPages;
