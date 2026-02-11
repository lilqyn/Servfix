import { useQuery } from "@tanstack/react-query";
import { fetchOrderReleaseRequests } from "@/lib/api";
import type { OrderReleaseRequest } from "@/lib/api";

export function useOrderReleaseRequests(orderId?: string | null) {
  return useQuery<OrderReleaseRequest[], Error>({
    queryKey: ["order-release-requests", orderId],
    queryFn: async () => {
      if (!orderId) {
        return [];
      }
      return fetchOrderReleaseRequests(orderId);
    },
    enabled: Boolean(orderId),
    staleTime: 15_000,
  });
}
