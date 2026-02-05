import { useQuery } from "@tanstack/react-query";
import { fetchService } from "@/lib/api";
import type { ApiService } from "@/lib/api";

export function useService(id?: string) {
  return useQuery<ApiService, Error>({
    queryKey: ["service", id],
    queryFn: async () => {
      if (!id) {
        throw new Error("Service ID is required");
      }
      return fetchService(id);
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
