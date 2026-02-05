import { useQuery } from "@tanstack/react-query";
import { fetchServices } from "@/lib/api";
import { mapServiceToSummary, ServiceSummary } from "@/lib/services";

export function useServices() {
  return useQuery<ServiceSummary[], Error>({
    queryKey: ["services"],
    queryFn: async () => {
      const services = await fetchServices();
      return services.map(mapServiceToSummary);
    },
    staleTime: 30_000,
  });
}
