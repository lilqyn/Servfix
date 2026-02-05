import { useQuery } from "@tanstack/react-query";
import { fetchHomeContent, type HomeContentPayload } from "@/lib/api";
import { defaultHomeContent } from "@/lib/homeDefaults";

export function useHomeContent() {
  return useQuery<HomeContentPayload, Error>({
    queryKey: ["home-content"],
    queryFn: fetchHomeContent,
    initialData: defaultHomeContent,
    staleTime: 300_000,
  });
}
