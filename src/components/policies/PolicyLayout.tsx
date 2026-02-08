import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

type PolicyLayoutProps = {
  title: string;
  updatedAt: string;
  summary: string;
  documentUrl: string;
  downloadLabel?: string;
};

const PolicyLayout = ({
  title,
  updatedAt,
  summary,
  documentUrl,
  downloadLabel = "Download PDF",
}: PolicyLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="min-h-[calc(100vh-5rem)]">
        <div className="container mx-auto px-4 py-8 space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">Last updated {updatedAt}</p>
          <p className="text-base text-muted-foreground">{summary}</p>
        </div>

        <div className="border-t border-border/60">
          <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              View the full policy below or download a copy.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href={documentUrl} target="_blank" rel="noreferrer">
                {downloadLabel}
              </a>
            </Button>
          </div>
          <div className="w-full">
            <iframe
              title={`${title} document`}
              src={documentUrl}
              className="w-full h-[calc(100vh-16rem)] min-h-[70vh]"
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PolicyLayout;
