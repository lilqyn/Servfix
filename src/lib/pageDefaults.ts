import type { AdminPagesPayload } from "@/lib/api";
import { defaultProviderResourcesContent } from "@/data/providerResources";

export const DEFAULT_PAGES: AdminPagesPayload = {
  about: {
    title: "About SERVFIX",
    body:
      "SERVFIX helps Ghanaians find trusted service providers and book with confidence. " +
      "We verify providers, protect payments with escrow, and support both buyers and providers through every step.",
    staff: [],
  },
  blog: {
    title: "SERVFIX Blog",
    body:
      "News, tips, and updates from the SERVFIX team will appear here. " +
      "Check back soon for new posts.",
    posts: [],
  },
  providerResources: {
    title: "Provider Resources",
    body:
      "Use this resource center to onboard faster, price services correctly, prevent disputes, " +
      "and grow sustainably on SERVFIX.",
    resourcesConfig: defaultProviderResourcesContent,
  },
};
