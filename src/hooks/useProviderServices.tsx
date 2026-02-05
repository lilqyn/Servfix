import { useQuery } from "@tanstack/react-query";
import { fetchMyServices } from "@/lib/api";
import type { ApiService } from "@/lib/api";

export function useProviderServices() {
  return useQuery<ApiService[], Error>({
    queryKey: ["services", "mine"],
    queryFn: () => fetchMyServices(),
    staleTime: 30_000,
  });
}
