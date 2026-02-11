import { useQuery } from "@tanstack/react-query";
import { fetchOrderProgressReports } from "@/lib/api";
import type { OrderProgressReport } from "@/lib/api";

export function useOrderProgressReports(orderId?: string | null) {
  return useQuery<OrderProgressReport[], Error>({
    queryKey: ["order-progress-reports", orderId],
    queryFn: async () => {
      if (!orderId) {
        return [];
      }
      return fetchOrderProgressReports(orderId);
    },
    enabled: Boolean(orderId),
    staleTime: 15_000,
  });
}
