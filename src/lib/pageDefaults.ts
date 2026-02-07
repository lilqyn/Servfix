import type { AdminPagesPayload } from "@/lib/api";

export const DEFAULT_PAGES: AdminPagesPayload = {
  about: {
    title: "About SERVFIX",
    body:
      "SERVFIX helps Ghanaians find trusted service providers and book with confidence. " +
      "We verify providers, protect payments with escrow, and support both buyers and providers through every step.",
  },
  blog: {
    title: "SERVFIX Blog",
    body:
      "News, tips, and updates from the SERVFIX team will appear here. " +
      "Check back soon for new posts.",
  },
};
