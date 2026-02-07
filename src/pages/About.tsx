import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { fetchStaticPage } from "@/lib/api";

const About = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["page", "about"],
    queryFn: () => fetchStaticPage("about"),
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div className="max-w-3xl space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground">
            {data?.title ?? "About"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Learn more about SERVFIX and how we support service providers in Ghana.
          </p>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-6">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading content...</p>
            ) : isError ? (
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Unable to load this page."}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {data?.body}
              </p>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default About;
