import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  fetchAdminHomeContent,
  updateAdminHomeContent,
  type HomeContentPayload,
} from "@/lib/api";
import { defaultHomeContent } from "@/lib/homeDefaults";
import { HOME_ICON_NAMES } from "@/lib/homeIcons";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/permissions";

const AdminHomeContent = () => {
  const { user } = useAuth();
  const canUpdate = hasPermission(user?.role ?? null, "settings.update");
  const [draft, setDraft] = useState<HomeContentPayload>(defaultHomeContent);
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-home-content"],
    queryFn: fetchAdminHomeContent,
  });

  useEffect(() => {
    if (data) {
      setDraft({
        hero: data.hero,
        categories: data.categories,
        howItWorks: data.howItWorks,
      });
    }
  }, [data]);

  const handleSave = async () => {
    if (!canUpdate) {
      toast({ title: "You do not have permission to update settings." });
      return;
    }
    try {
      setIsSaving(true);
      await updateAdminHomeContent(draft);
      toast({ title: "Home content updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update home content.";
      toast({ title: message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (data) {
      setDraft({
        hero: data.hero,
        categories: data.categories,
        howItWorks: data.howItWorks,
      });
    } else {
      setDraft(defaultHomeContent);
    }
  };

  const updateHero = (updates: Partial<HomeContentPayload["hero"]>) => {
    setDraft((prev) => ({ ...prev, hero: { ...prev.hero, ...updates } }));
  };

  const updateHeadline = (updates: Partial<HomeContentPayload["hero"]["headline"]>) => {
    setDraft((prev) => ({
      ...prev,
      hero: { ...prev.hero, headline: { ...prev.hero.headline, ...updates } },
    }));
  };

  const updateCta = (
    key: "primaryCta" | "secondaryCta",
    updates: Partial<HomeContentPayload["hero"]["primaryCta"]>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      hero: { ...prev.hero, [key]: { ...prev.hero[key], ...updates } },
    }));
  };

  const updateFloating = (updates: Partial<HomeContentPayload["hero"]["floatingCards"]>) => {
    setDraft((prev) => ({
      ...prev,
      hero: { ...prev.hero, floatingCards: { ...prev.hero.floatingCards, ...updates } },
    }));
  };

  const updateTrustIndicator = (
    index: number,
    updates: Partial<HomeContentPayload["hero"]["trustIndicators"][number]>,
  ) => {
    setDraft((prev) => {
      const nextIndicators = prev.hero.trustIndicators.map((indicator, i) =>
        i === index ? { ...indicator, ...updates } : indicator,
      );
      return { ...prev, hero: { ...prev.hero, trustIndicators: nextIndicators } };
    });
  };

  const addTrustIndicator = () => {
    setDraft((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        trustIndicators: [
          ...prev.hero.trustIndicators,
          { icon: "Shield", title: "New highlight", subtitle: "Short detail" },
        ],
      },
    }));
  };

  const removeTrustIndicator = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        trustIndicators: prev.hero.trustIndicators.filter((_, i) => i !== index),
      },
    }));
  };

  const updateCategories = (updates: Partial<HomeContentPayload["categories"]>) => {
    setDraft((prev) => ({ ...prev, categories: { ...prev.categories, ...updates } }));
  };

  const updateCategoryItem = (
    index: number,
    updates: Partial<HomeContentPayload["categories"]["items"][number]>,
  ) => {
    setDraft((prev) => {
      const nextItems = prev.categories.items.map((item, i) =>
        i === index ? { ...item, ...updates } : item,
      );
      return { ...prev, categories: { ...prev.categories, items: nextItems } };
    });
  };

  const addCategoryItem = () => {
    setDraft((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        items: [
          ...prev.categories.items,
          {
            name: "New Category",
            description: "Short description",
            icon: "Sparkles",
            color: "from-slate-400 to-gray-600",
            keywords: [],
          },
        ],
      },
    }));
  };

  const removeCategoryItem = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        items: prev.categories.items.filter((_, i) => i !== index),
      },
    }));
  };

  const updateHowItWorks = (updates: Partial<HomeContentPayload["howItWorks"]>) => {
    setDraft((prev) => ({ ...prev, howItWorks: { ...prev.howItWorks, ...updates } }));
  };

  const updateHowStep = (
    index: number,
    updates: Partial<HomeContentPayload["howItWorks"]["steps"][number]>,
  ) => {
    setDraft((prev) => {
      const nextSteps = prev.howItWorks.steps.map((step, i) =>
        i === index ? { ...step, ...updates } : step,
      );
      return { ...prev, howItWorks: { ...prev.howItWorks, steps: nextSteps } };
    });
  };

  const addHowStep = () => {
    setDraft((prev) => ({
      ...prev,
      howItWorks: {
        ...prev.howItWorks,
        steps: [
          ...prev.howItWorks.steps,
          {
            number: String(prev.howItWorks.steps.length + 1).padStart(2, "0"),
            title: "New Step",
            description: "Short description",
            icon: "Star",
            color: "bg-primary/10 text-primary",
          },
        ],
      },
    }));
  };

  const removeHowStep = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      howItWorks: {
        ...prev.howItWorks,
        steps: prev.howItWorks.steps.filter((_, i) => i !== index),
      },
    }));
  };

  const parseKeywords = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading home content...</div>;
  }

  if (isError) {
    return (
      <div className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Unable to load home content."}{" "}
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
          <h2 className="text-2xl font-semibold text-foreground">Home Content</h2>
          <p className="text-sm text-muted-foreground">
            Update the hero, categories, and how-it-works sections on the homepage.
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
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold">Hero</h3>
            <p className="text-sm text-muted-foreground">
              Controls the headline, CTAs, and trust indicators.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Badge</label>
              <Input value={draft.hero.badge} onChange={(e) => updateHero({ badge: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subheadline</label>
              <Textarea
                value={draft.hero.subheadline}
                onChange={(e) => updateHero({ subheadline: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Headline Prefix</label>
              <Input
                value={draft.hero.headline.prefix}
                onChange={(e) => updateHeadline({ prefix: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Headline Highlight</label>
              <Input
                value={draft.hero.headline.highlight}
                onChange={(e) => updateHeadline({ highlight: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Headline Suffix</label>
              <Input
                value={draft.hero.headline.suffix}
                onChange={(e) => updateHeadline({ suffix: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Primary CTA Label</label>
              <Input
                value={draft.hero.primaryCta.label}
                onChange={(e) => updateCta("primaryCta", { label: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Primary CTA Link</label>
              <Input
                value={draft.hero.primaryCta.href}
                onChange={(e) => updateCta("primaryCta", { href: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Secondary CTA Label</label>
              <Input
                value={draft.hero.secondaryCta.label}
                onChange={(e) => updateCta("secondaryCta", { label: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Secondary CTA Link</label>
              <Input
                value={draft.hero.secondaryCta.href}
                onChange={(e) => updateCta("secondaryCta", { href: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Trust Indicators</p>
                <p className="text-xs text-muted-foreground">Choose an icon and short label.</p>
              </div>
              <Button variant="outline" size="sm" onClick={addTrustIndicator}>
                Add
              </Button>
            </div>
            <div className="grid gap-4">
              {draft.hero.trustIndicators.map((indicator, index) => (
                <div key={`${indicator.title}-${index}`} className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Icon</label>
                    <Select
                      value={indicator.icon}
                      onValueChange={(value) => updateTrustIndicator(index, { icon: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOME_ICON_NAMES.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Title</label>
                    <Input
                      value={indicator.title}
                      onChange={(e) => updateTrustIndicator(index, { title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Subtitle</label>
                    <Input
                      value={indicator.subtitle}
                      onChange={(e) => updateTrustIndicator(index, { subtitle: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button variant="outline" onClick={() => removeTrustIndicator(index)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Online Card Title</label>
              <Input
                value={draft.hero.floatingCards.onlineTitle}
                onChange={(e) => updateFloating({ onlineTitle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Online Card Subtitle</label>
              <Input
                value={draft.hero.floatingCards.onlineSubtitle}
                onChange={(e) => updateFloating({ onlineSubtitle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Escrow Card Title</label>
              <Input
                value={draft.hero.floatingCards.escrowTitle}
                onChange={(e) => updateFloating({ escrowTitle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Escrow Card Subtitle</label>
              <Input
                value={draft.hero.floatingCards.escrowSubtitle}
                onChange={(e) => updateFloating({ escrowSubtitle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Escrow Card Icon</label>
              <Select
                value={draft.hero.floatingCards.escrowIcon ?? "Shield"}
                onValueChange={(value) => updateFloating({ escrowIcon: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOME_ICON_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold">Categories</h3>
            <p className="text-sm text-muted-foreground">
              Update the categories grid and browse CTA.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Badge</label>
              <Input value={draft.categories.badge} onChange={(e) => updateCategories({ badge: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input value={draft.categories.title} onChange={(e) => updateCategories({ title: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Subtitle</label>
              <Textarea
                value={draft.categories.subtitle}
                onChange={(e) => updateCategories({ subtitle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CTA Label</label>
              <Input
                value={draft.categories.ctaLabel}
                onChange={(e) => updateCategories({ ctaLabel: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CTA Link</label>
              <Input
                value={draft.categories.ctaHref}
                onChange={(e) => updateCategories({ ctaHref: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Category Items</p>
                <p className="text-xs text-muted-foreground">Use comma-separated keywords for matching.</p>
              </div>
              <Button variant="outline" size="sm" onClick={addCategoryItem}>
                Add
              </Button>
            </div>
            <div className="grid gap-6">
              {draft.categories.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="rounded-xl border border-border/60 p-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Name</label>
                      <Input value={item.name} onChange={(e) => updateCategoryItem(index, { name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Description</label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateCategoryItem(index, { description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Icon</label>
                      <Select
                        value={item.icon}
                        onValueChange={(value) => updateCategoryItem(index, { icon: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOME_ICON_NAMES.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Gradient</label>
                      <Input
                        value={item.color}
                        onChange={(e) => updateCategoryItem(index, { color: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs text-muted-foreground">Keywords</label>
                      <Input
                        value={item.keywords.join(", ")}
                        onChange={(e) => updateCategoryItem(index, { keywords: parseKeywords(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => removeCategoryItem(index)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold">How It Works</h3>
            <p className="text-sm text-muted-foreground">
              Manage the step-by-step process shown on the homepage.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Badge</label>
              <Input value={draft.howItWorks.badge} onChange={(e) => updateHowItWorks({ badge: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input value={draft.howItWorks.title} onChange={(e) => updateHowItWorks({ title: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Subtitle</label>
              <Textarea
                value={draft.howItWorks.subtitle}
                onChange={(e) => updateHowItWorks({ subtitle: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Steps</p>
                <p className="text-xs text-muted-foreground">Set icon, number, and description.</p>
              </div>
              <Button variant="outline" size="sm" onClick={addHowStep}>
                Add
              </Button>
            </div>
            <div className="grid gap-6">
              {draft.howItWorks.steps.map((step, index) => (
                <div key={`${step.title}-${index}`} className="rounded-xl border border-border/60 p-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Number</label>
                      <Input value={step.number} onChange={(e) => updateHowStep(index, { number: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Title</label>
                      <Input value={step.title} onChange={(e) => updateHowStep(index, { title: e.target.value })} />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs text-muted-foreground">Description</label>
                      <Textarea
                        value={step.description}
                        onChange={(e) => updateHowStep(index, { description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Icon</label>
                      <Select
                        value={step.icon}
                        onValueChange={(value) => updateHowStep(index, { icon: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOME_ICON_NAMES.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Color Classes</label>
                      <Input value={step.color} onChange={(e) => updateHowStep(index, { color: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => removeHowStep(index)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminHomeContent;
