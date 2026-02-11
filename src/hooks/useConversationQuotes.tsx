import { useQuery } from "@tanstack/react-query";
import { fetchThreadQuotes } from "@/lib/api";
import type { ApiQuote } from "@/lib/api";

export function useConversationQuotes(threadId?: string | null) {
  return useQuery<ApiQuote[], Error>({
    queryKey: ["thread-quotes", threadId],
    queryFn: async () => {
      if (!threadId) {
        return [];
      }
      return fetchThreadQuotes(threadId);
    },
    enabled: Boolean(threadId),
    staleTime: 15_000,
  });
}
