import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/useAuth";
import { useProviderServices } from "@/hooks/useProviderServices";
import { fetchStaticPage } from "@/lib/api";
import {
  defaultProviderResourcesContent,
  providerAdvancedResources,
  providerLaunchChecklistItems,
  providerResourceSections,
  type ProviderLaunchChecklistKey,
} from "@/data/providerResources";

const MANUAL_CHECKLIST_STORAGE_KEY = "servfix-provider-launch-checklist";

type ManualChecklistState = Partial<Record<ProviderLaunchChecklistKey, boolean>>;

const loadManualChecklistState = (): ManualChecklistState => {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = localStorage.getItem(MANUAL_CHECKLIST_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as ManualChecklistState;
  } catch {
    return {};
  }
};

const ProviderResourcesCenter = () => {
  const { user } = useAuth();
  const { data: services = [] } = useProviderServices();
  const {
    data: pageData,
    isLoading: isLoadingPageData,
    isError: isPageDataError,
  } = useQuery({
    queryKey: ["page", "providerResources"],
    queryFn: () => fetchStaticPage("providerResources"),
  });
  const [manualChecklist, setManualChecklist] = useState<ManualChecklistState>(() =>
    loadManualChecklistState(),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(MANUAL_CHECKLIST_STORAGE_KEY, JSON.stringify(manualChecklist));
  }, [manualChecklist]);

  const providerProfile = user?.providerProfile as
    | {
        displayName?: string | null;
        location?: string | null;
        categories?: string[] | null;
      }
    | null
    | undefined;

  const autoChecklist = useMemo(() => {
    const displayName = providerProfile?.displayName?.trim() ?? "";
    const hasPhone = Boolean(user?.phone?.trim());
    const location = providerProfile?.location?.trim() ?? user?.location?.trim() ?? "";
    const categories = providerProfile?.categories ?? [];
    const hasProfileCompleted = Boolean(displayName && hasPhone && location && categories.length > 0);
    const hasProfilePhoto = Boolean(user?.avatarUrl);

    const photoKeys = new Set<string>();
    services.forEach((service) => {
      if (service.coverMedia?.url) {
        photoKeys.add(service.coverMedia.url);
      }
      service.media.forEach((media) => {
        const isImage = media.type?.toLowerCase().includes("image") ?? true;
        if (isImage) {
          photoKeys.add(media.url);
        }
      });
    });

    const hasServicePhotos = photoKeys.size >= 3;
    const hasPricing = services.some((service) =>
      service.tiers.some((tier) => {
        const price = Number(tier.price);
        return Number.isFinite(price) && price > 0;
      }),
    );
    const hasOptimizedDescription = services.some(
      (service) => service.description.trim().length >= 120,
    );

    return {
      profile_completed: hasProfileCompleted,
      profile_photo_uploaded: hasProfilePhoto,
      service_photos_uploaded: hasServicePhotos,
      pricing_calculated: hasPricing,
      service_description_optimized: hasOptimizedDescription,
    };
  }, [providerProfile, services, user]);

  const checklist = useMemo(
    () =>
      (pageData?.resourcesConfig?.checklistItems?.length
        ? pageData.resourcesConfig.checklistItems
        : providerLaunchChecklistItems
      ).map((item) => ({
        ...item,
        checked: item.editable ? Boolean(manualChecklist[item.key]) : Boolean(autoChecklist[item.key]),
      })),
    [autoChecklist, manualChecklist, pageData?.resourcesConfig?.checklistItems],
  );

  const completedCount = checklist.filter((item) => item.checked).length;
  const completionPercent =
    checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;
  const pageTitle = pageData?.title?.trim() || "Provider Resources";
  const pageBody = pageData?.body?.trim() || "";
  const sectionData =
    pageData?.resourcesConfig?.sections?.length
      ? pageData.resourcesConfig.sections
      : providerResourceSections;
  const advancedResources =
    pageData?.resourcesConfig?.advancedResources?.length
      ? pageData.resourcesConfig.advancedResources
      : defaultProviderResourcesContent.advancedResources.length > 0
        ? defaultProviderResourcesContent.advancedResources
        : providerAdvancedResources;

  const toggleChecklist = (key: ProviderLaunchChecklistKey, editable: boolean) => {
    if (!editable) {
      return;
    }
    setManualChecklist((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const downloadChecklist = () => {
    const dateLabel = new Date().toISOString().slice(0, 10);
    const lines = [
      "SERVFIX Provider Launch Checklist",
      `Date: ${dateLabel}`,
      "",
      ...checklist.map((item) => `- [${item.checked ? "x" : " "}] ${item.label}`),
      "",
      `Completion: ${completedCount}/${checklist.length} (${completionPercent}%)`,
    ];
    const content = `${lines.join("\n")}\n`;
    const fileName = `servfix-provider-launch-checklist-${dateLabel}.txt`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const scrollToSection = (id: string) => {
    document.getElementById(`provider-resource-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-xl">{pageTitle}</CardTitle>
              {isLoadingPageData ? (
                <CardDescription>Loading resource content...</CardDescription>
              ) : isPageDataError ? (
                <CardDescription>
                  Using fallback resource content. Admin can update this page in the Pages panel.
                </CardDescription>
              ) : (
                <CardDescription>
                  {pageBody ||
                    "Onboarding, operations, pricing, dispute prevention, growth, and compliance."}
                </CardDescription>
              )}
            </div>
            <Badge variant="secondary">{completedCount}/{checklist.length} complete</Badge>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadChecklist}>
              Download checklist
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/support">Contact support</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/terms">Platform policies</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/provider-addendum">Provider addendum</Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sectionData.map((section) => (
              <Button
                key={section.id}
                variant="ghost"
                size="sm"
                onClick={() => scrollToSection(section.id)}
              >
                {section.title}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60" id="provider-resource-checklist">
        <CardHeader>
          <CardTitle className="text-lg">SERVFIX Provider Launch Checklist</CardTitle>
          <CardDescription>
            Auto-checked items are read-only. Confirm policy and compliance items manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {checklist.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
            >
              <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                <Checkbox
                  checked={item.checked}
                  disabled={!item.editable}
                  onCheckedChange={() => toggleChecklist(item.key, item.editable)}
                />
                <span>{item.label}</span>
              </label>
              {!item.editable && (
                <Badge variant="outline" className="text-[11px]">
                  Auto
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {sectionData.map((section) => (
        <Card key={section.id} id={`provider-resource-${section.id}`} className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {section.blocks.map((block) => (
              <div key={block.heading} className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{block.heading}</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg">Advanced Resources (Phase 2)</CardTitle>
          <CardDescription>
            Next upgrades you can enable when ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {advancedResources.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProviderResourcesCenter;
