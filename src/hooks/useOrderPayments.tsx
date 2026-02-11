import { useQuery } from "@tanstack/react-query";
import { fetchOrderPayments } from "@/lib/api";
import type { ApiOrderPayment } from "@/lib/api";

export function useOrderPayments(orderId?: string | null) {
  return useQuery<ApiOrderPayment[], Error>({
    queryKey: ["order-payments", orderId],
    queryFn: async () => {
      if (!orderId) {
        return [];
      }
      return fetchOrderPayments(orderId);
    },
    enabled: Boolean(orderId),
    staleTime: 15_000,
  });
}
