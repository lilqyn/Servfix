import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCommunityFeed } from "@/hooks/useCommunityFeed";
import CommunityFeedList from "@/components/community/CommunityFeedList";
import { usePublicSettings } from "@/hooks/usePublicSettings";

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
          emptyMessage="No community posts yet. Be the first to share!"
          showExploreButton
          onExplore={() => navigate("/community")}
          className="max-w-2xl mx-auto"
        />
      </div>
    </section>
  );
};

export default SocialFeed;
