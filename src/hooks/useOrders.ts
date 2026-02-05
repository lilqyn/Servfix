import { useQuery } from "@tanstack/react-query";
import { fetchOrders } from "@/lib/api";
import type { ApiOrder } from "@/lib/api";

export function useOrders() {
  return useQuery<ApiOrder[], Error>({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    staleTime: 15_000,
  });
}
