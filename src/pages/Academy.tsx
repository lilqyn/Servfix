import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { fetchStaticPage } from "@/lib/api";

const Academy = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["page", "academy"],
    queryFn: () => fetchStaticPage("academy"),
  });
  const posts = useMemo(() => data?.posts ?? [], [data?.posts]);
  const intro = data?.body ?? "";
  const hasPosts = posts.length > 0;
  const sortedPosts = useMemo(() => {
    const copy = [...posts];
    return copy.sort((a, b) => {
      const aTime = Date.parse(a.publishedAt || "");
      const bTime = Date.parse(b.publishedAt || "");
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return bTime - aTime;
    });
  }, [posts]);

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const activePost = sortedPosts[activeIndex] ?? null;
  const activeVideoUrl = activePost?.videoUrl?.trim() ?? "";
  const relatedPosts = sortedPosts.filter((_, index) => index !== activeIndex);
  const latestKey = sortedPosts[0]
    ? `${sortedPosts[0].title}-${sortedPosts[0].publishedAt}`
    : "";

  useEffect(() => {
    if (sortedPosts.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(0);
  }, [latestKey, sortedPosts.length]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto w-full max-w-[1480px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="max-w-4xl space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Learning library
          </p>
          <h1 className="text-3xl font-display font-bold text-foreground">
            {data?.title ?? "SERVFIX Academy"}
          </h1>
          {!hasPosts ? (
            isLoading ? (
              <p className="text-sm text-muted-foreground">Loading content...</p>
            ) : isError ? (
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Unable to load this page."}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {intro ||
                  "Step-by-step guides, tutorials, and best practices for working and growing on SERVFIX."}
              </p>
            )
          ) : null}
        </div>

        <section className="space-y-4">
          {activePost ? (
            <div className="grid gap-4 lg:grid-cols-[4fr_1.5fr] items-start">
              <Card className="border-border/60 shadow-sm">
                <div className="aspect-[21/9] w-full overflow-hidden rounded-t-lg bg-muted">
                  {activePost.imageSignedUrl || activePost.imageUrl ? (
                    <img
                      src={activePost.imageSignedUrl ?? activePost.imageUrl ?? ""}
                      alt={activePost.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                      No media
                    </div>
                  )}
                </div>
                <CardContent className="space-y-3 p-5">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {activePost.publishedAt}
                    </p>
                    <h2 className="text-2xl font-semibold text-foreground">
                      {activePost.title}
                    </h2>
                    {activePost.summary ? (
                      <p className="text-sm text-muted-foreground">{activePost.summary}</p>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {activePost.body || "No additional material content is available yet."}
                  </p>
                  {activeVideoUrl ? (
                    <div>
                      <a
                        href={activeVideoUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        Watch on YouTube
                      </a>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">More materials</p>
                </div>
                <div className="space-y-3">
                  {relatedPosts.length === 0 ? (
                    <Card className="border-dashed border-border/60">
                      <CardContent className="p-3 text-sm text-muted-foreground">
                        No additional materials yet.
                      </CardContent>
                    </Card>
                  ) : (
                    relatedPosts.map((post, index) => {
                      const preview = post.imageSignedUrl ?? post.imageUrl ?? "";
                      return (
                        <Card
                          key={`${post.title}-${index}`}
                          className="border-border/60 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <button
                            type="button"
                            onClick={() => setActiveIndex(sortedPosts.indexOf(post))}
                            className="w-full text-left"
                          >
                            <div className="aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-muted">
                              {preview ? (
                                <img
                                  src={preview}
                                  alt={post.title}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                                  No media
                                </div>
                              )}
                            </div>
                            <CardContent className="space-y-2 p-3">
                              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                {post.publishedAt}
                              </p>
                              <p className="text-sm font-semibold text-foreground">
                                {post.title}
                              </p>
                              {post.summary ? (
                                <p className="text-xs text-muted-foreground">{post.summary}</p>
                              ) : null}
                              <span className="text-xs font-semibold text-primary">
                                {post.videoUrl ? "Includes video" : "Read material"}
                              </span>
                            </CardContent>
                          </button>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            !isLoading && !isError && (
              <Card className="border-dashed border-border/60">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No academy materials yet. Add content in the admin pages panel.
                </CardContent>
              </Card>
            )
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Academy;
