import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchUserPosts, ApiCommunityPost } from "@/lib/api";

type UserPostsPage = {
  posts: ApiCommunityPost[];
  nextCursor?: string | null;
};

export function useUserPosts(userId: string, limit = 10) {
  return useInfiniteQuery<UserPostsPage, Error>({
    queryKey: ["user-posts", userId, limit],
    queryFn: ({ pageParam }) =>
      fetchUserPosts(userId, {
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
}
