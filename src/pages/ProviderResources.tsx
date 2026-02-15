import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchStaticPage } from "@/lib/api";
import {
  defaultProviderResourcesContent,
  providerAdvancedResources,
  providerLaunchChecklistItems,
  providerResourceSections,
} from "@/data/providerResources";

const ProviderResources = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["page", "providerResources"],
    queryFn: () => fetchStaticPage("providerResources"),
  });

  const pageTitle = data?.title ?? "Provider Resources";
  const pageBody =
    data?.body ??
    "Use this resource center to onboard faster, price services correctly, prevent disputes, and grow sustainably on SERVFIX.";
  const checklistItems =
    data?.resourcesConfig?.checklistItems?.length
      ? data.resourcesConfig.checklistItems
      : providerLaunchChecklistItems;
  const sections =
    data?.resourcesConfig?.sections?.length
      ? data.resourcesConfig.sections
      : providerResourceSections;
  const advancedResources =
    data?.resourcesConfig?.advancedResources?.length
      ? data.resourcesConfig.advancedResources
      : defaultProviderResourcesContent.advancedResources.length > 0
        ? defaultProviderResourcesContent.advancedResources
        : providerAdvancedResources;

  const downloadChecklist = () => {
    const dateLabel = new Date().toISOString().slice(0, 10);
    const lines = [
      "SERVFIX Provider Launch Checklist",
      `Date: ${dateLabel}`,
      "",
      ...checklistItems.map((item) => `- [ ] ${item.label}`),
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto space-y-6 px-4 py-10">
        <Card className="border-border/60">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="secondary">SERVFIX Providers</Badge>
                <CardTitle className="text-3xl font-display">{pageTitle}</CardTitle>
              </div>
              <Button variant="outline" onClick={downloadChecklist}>
                Download Checklist
              </Button>
            </div>
            {isLoading ? (
              <CardDescription>Loading resource content...</CardDescription>
            ) : isError ? (
              <CardDescription>
                {error instanceof Error ? error.message : "Unable to load page content."}
              </CardDescription>
            ) : (
              <CardDescription className="max-w-4xl whitespace-pre-wrap">{pageBody}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/sign-up">Become a Provider</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard/resources">Open Dashboard Resources</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/provider-addendum">Provider Addendum</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">SERVFIX Provider Launch Checklist</CardTitle>
            <CardDescription>
              Complete these items before publishing and scaling your services.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklistItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
              >
                <span className="text-sm text-foreground">{item.label}</span>
                <Badge variant="outline" className="text-[11px]">
                  {item.editable ? "Manual" : "Auto in dashboard"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {sections.map((section) => (
          <Card key={section.id} className="border-border/60">
            <CardHeader>
              <CardTitle className="text-xl">{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {section.blocks.map((block) => (
                <section key={block.heading} className="space-y-2">
                  <h2 className="text-sm font-semibold text-foreground">{block.heading}</h2>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Advanced Resources (Phase 2)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {advancedResources.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default ProviderResources;
