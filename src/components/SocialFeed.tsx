import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCommunityFeed } from "@/hooks/useCommunityFeed";
import CommunityPostCard from "@/components/community/CommunityPostCard";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { Button } from "@/components/ui/button";

const SocialFeed = () => {
  const navigate = useNavigate();
  const { data: publicSettings } = usePublicSettings();
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
  } = useCommunityFeed(4, "all", communityEnabled);

  const posts = useMemo(
    () => data?.pages.flatMap((page) => page.posts) ?? [],
    [data],
  );

  if (!communityEnabled) {
    return null;
  }

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="inline-block px-4 py-1.5 bg-accent/10 text-accent text-sm font-semibold rounded-full mb-4">
            Community Feed
          </span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            See What's Happening
          </h2>
          <p className="text-lg text-muted-foreground">
            Connect with service providers and clients. Share your work, find inspiration, and grow your network.
          </p>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">
              Loading community feed...
            </div>
          ) : isError ? (
            <div className="text-center py-16">
              <h3 className="text-lg font-semibold mb-2">Unable to load posts</h3>
              <p className="text-muted-foreground mb-4">
                {error?.message ?? "Please try again shortly."}
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              No community posts yet. Be the first to share!
            </div>
          ) : (
            posts.map((post) => (
              <CommunityPostCard
                key={post.id}
                post={post}
                onRefresh={refetch}
                showFollow={false}
              />
            ))
          )}

          <div className="text-center pt-4">
            {hasNextPage ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading..." : "Load More Posts"}
              </Button>
            ) : (
              <Button variant="outline" size="lg" onClick={() => navigate("/community")}>
                Explore Community
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SocialFeed;
