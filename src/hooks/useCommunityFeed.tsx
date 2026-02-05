import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchCommunityFeed, ApiCommunityPost } from "@/lib/api";

type CommunityFeedPage = {
  posts: ApiCommunityPost[];
  nextCursor?: string | null;
};

export function useCommunityFeed(
  limit = 10,
  scope: "all" | "following" = "all",
  enabled = true,
) {
  return useInfiniteQuery<CommunityFeedPage, Error>({
    queryKey: ["community-feed", limit, scope],
    queryFn: ({ pageParam }) =>
      fetchCommunityFeed({
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit,
        scope,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
    enabled,
  });
}
