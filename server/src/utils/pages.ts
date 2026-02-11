export type StaticPageKey = "about" | "blog";

export type BlogPost = {
  title: string;
  summary?: string | null;
  body: string;
  imageUrl?: string | null;
  publishedAt: string;
};

export type StaffProfile = {
  name: string;
  role: string;
  bio?: string | null;
  photoUrl?: string | null;
};

export type StaticPageContent = {
  title: string;
  body: string;
  posts?: BlogPost[];
  staff?: StaffProfile[];
};

export const PAGE_KEYS: StaticPageKey[] = ["about", "blog"];

export const DEFAULT_PAGES: Record<StaticPageKey, StaticPageContent> = {
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
};
