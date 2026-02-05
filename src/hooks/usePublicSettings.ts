import { useQuery } from "@tanstack/react-query";
import { fetchPublicSettings, type PublicSettings } from "@/lib/api";

export function usePublicSettings() {
  return useQuery<PublicSettings, Error>({
    queryKey: ["public-settings"],
    queryFn: fetchPublicSettings,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
