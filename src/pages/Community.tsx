import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useCommunityFeed } from "@/hooks/useCommunityFeed";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import CommunityPostComposer from "@/components/community/CommunityPostComposer";
import CommunityFeedList from "@/components/community/CommunityFeedList";

const Community = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [feedScope, setFeedScope] = useState<"all" | "following">("all");
  const { data: publicSettings, isLoading: settingsLoading } = usePublicSettings();
  const communityEnabled = publicSettings?.featureFlags.community ?? false;
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useCommunityFeed(10, feedScope, communityEnabled);

  const posts = useMemo(
    () => data?.pages.flatMap((page) => page.posts) ?? [],
    [data],
  );
  const emptyMessage =
    feedScope === "following"
      ? "No posts from people you follow yet."
      : "No community posts yet. Be the first to share!";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        {settingsLoading ? (
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-8 text-center text-muted-foreground">
            Loading community settings...
          </div>
        ) : !communityEnabled ? (
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-8 text-center">
            <h1 className="text-2xl font-display font-bold text-foreground mb-2">
              Community is currently disabled
            </h1>
            <p className="text-sm text-muted-foreground">
              Please check back later.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="text-center max-w-3xl mx-auto">
                <h1 className="text-3xl font-display font-bold text-foreground">
                  Community Feed
                </h1>
                <p className="text-sm text-muted-foreground mt-2">
                  Share updates, ask questions, and connect with the SERVFIX community.
                </p>
              </div>
              <div className="flex justify-center">
                <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-2 py-1 shadow-sm">
                  <Button
                    variant={feedScope === "all" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setFeedScope("all")}
                  >
                    For you
                  </Button>
                  <Button
                    variant={feedScope === "following" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      if (!isAuthenticated) {
                        toast("Please sign in to see posts from people you follow.");
                        navigate("/sign-in?next=/community");
                        return;
                      }
                      setFeedScope("following");
                    }}
                  >
                    Following
                  </Button>
                </div>
              </div>
            </div>

            <CommunityPostComposer onPostCreated={refetch} className="max-w-2xl mx-auto" />

            <CommunityFeedList
              posts={posts}
              isLoading={isLoading}
              isError={isError}
              error={error}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
              onRetry={() => refetch()}
              onRefresh={refetch}
              emptyMessage={emptyMessage}
              className="max-w-2xl mx-auto"
            />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Community;
