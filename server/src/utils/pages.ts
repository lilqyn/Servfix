export type StaticPageKey = "about" | "blog" | "academy" | "providerResources";

export type BlogPost = {
  title: string;
  summary?: string | null;
  body: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  publishedAt: string;
};

export type StaffProfile = {
  name: string;
  role: string;
  bio?: string | null;
  photoUrl?: string | null;
};

export type AboutFontOption =
  | "space_grotesk"
  | "plus_jakarta_sans"
  | "georgia_serif"
  | "times_serif"
  | "system_sans"
  | "mono";

export type AboutPageConfig = {
  introLabel: string;
  heroImageUrl?: string | null;
  missionTitle: string;
  missionBody: string;
  missionBullets: string[];
  whatWeDoTitle: string;
  whatWeDoLeft: string[];
  whatWeDoRight: string[];
  visionTitle: string;
  visionLeft: string;
  visionRight: string[];
  headingFont: AboutFontOption;
  bodyFont: AboutFontOption;
};

export type ProviderLaunchChecklistKey =
  | "profile_completed"
  | "profile_photo_uploaded"
  | "service_photos_uploaded"
  | "pricing_calculated"
  | "service_description_optimized"
  | "payment_policy_understood"
  | "cancellation_rules_reviewed"
  | "tax_record_process_started";

export type ProviderResourceBlock = {
  heading: string;
  items: string[];
};

export type ProviderResourceSection = {
  id: string;
  title: string;
  description: string;
  blocks: ProviderResourceBlock[];
};

export type ProviderLaunchChecklistItem = {
  key: ProviderLaunchChecklistKey;
  label: string;
  editable: boolean;
};

export type ProviderResourcesContent = {
  sections: ProviderResourceSection[];
  checklistItems: ProviderLaunchChecklistItem[];
  advancedResources: string[];
};

export type StaticPageContent = {
  title: string;
  body: string;
  aboutConfig?: AboutPageConfig;
  posts?: BlogPost[];
  staff?: StaffProfile[];
  resourcesConfig?: ProviderResourcesContent;
};

export const PAGE_KEYS: StaticPageKey[] = ["about", "blog", "academy", "providerResources"];

export const DEFAULT_PROVIDER_RESOURCES_CONTENT: ProviderResourcesContent = {
  sections: [
    {
      id: "onboarding",
      title: "Provider Onboarding Guide",
      description: "Set up your account so buyers can trust and book you quickly.",
      blocks: [
        {
          heading: "Step 1: Complete your profile",
          items: [
            "Add your real name or business name.",
            "Upload a clear profile photo.",
            "Add a valid phone number.",
            "Set your service location and categories.",
            "Write a clear description of your expertise.",
            "Optional: add portfolio links, certifications, and work samples.",
          ],
        },
        {
          heading: "Step 2: Set smart pricing",
          items: [
            "Avoid unrealistic low prices that hurt trust.",
            "Avoid inflated pricing without a clear scope.",
            "Use market benchmarks and transparent pricing notes.",
          ],
        },
        {
          heading: "Step 3: Understand payments",
          items: [
            "Buyer pays through SERVFIX.",
            "Payment is held securely in escrow.",
            "You complete the job and report progress.",
            "Buyer confirms or dispute flow applies.",
            "Funds are released based on order state and platform rules.",
          ],
        },
      ],
    },
    {
      id: "handbook",
      title: "Provider Handbook",
      description: "Core rules that keep your account healthy and visible.",
      blocks: [
        {
          heading: "Professional conduct",
          items: [
            "Deliver services exactly as described.",
            "Communicate clearly and politely in-app.",
            "Respect timelines and updates.",
            "Do not request off-platform payments.",
          ],
        },
        {
          heading: "Order flow rules",
          items: [
            "Typical order stages: Accepted -> In Progress -> Delivered -> Approved -> Released.",
            "Only mark as delivered after real completion.",
            "Use progress reports for staged work.",
          ],
        },
        {
          heading: "Cancellation discipline",
          items: [
            "Avoid last-minute cancellations.",
            "Do not ghost customers.",
            "Repeated cancellations damage trust and performance.",
          ],
        },
      ],
    },
    {
      id: "pricing-guide",
      title: "Pricing Guide (Ghana)",
      description: "Price your services for sustainability, not just short-term wins.",
      blocks: [
        {
          heading: "How to calculate",
          items: [
            "Base cost = materials + labor + transport.",
            "Add profit margin (usually 20-40%).",
            "Account for platform fee and applicable tax.",
            "Publish a clear scope and what is included.",
          ],
        },
        {
          heading: "Example (plumbing repair)",
          items: [
            "Materials: GHS 80",
            "Labor: GHS 100",
            "Transport: GHS 20",
            "Base total: GHS 200",
            "Suggested listing range: GHS 220-250 depending on market and urgency.",
          ],
        },
      ],
    },
    {
      id: "disputes",
      title: "Dispute Prevention Guide",
      description: "Most disputes are preventable with clearer scope and communication.",
      blocks: [
        {
          heading: "Common causes",
          items: [
            "Unclear scope before starting work.",
            "Poor response speed or communication gaps.",
            "Late delivery against promised timeline.",
            "Final quality mismatch vs listed service.",
          ],
        },
        {
          heading: "Prevention checklist",
          items: [
            "Confirm requirements before work starts.",
            "Use in-app messaging only.",
            "Share progress updates with realistic timelines.",
            "Document changes in scope as they happen.",
          ],
        },
      ],
    },
    {
      id: "growth",
      title: "Provider Growth Playbook",
      description: "Improve trust, conversion, and repeat bookings.",
      blocks: [
        {
          heading: "Current visibility signals in-app",
          items: [
            "Review strength (rating and review count).",
            "Verification and profile quality.",
            "Boost and plan weight placement where enabled.",
            "Buyer search filters and selected sorting mode.",
          ],
        },
        {
          heading: "Performance KPIs to improve",
          items: [
            "High completion rate and on-time delivery.",
            "Low cancellation rate.",
            "Fast response times.",
            "Consistent service quality and review requests.",
          ],
        },
        {
          heading: "Order growth actions",
          items: [
            "Upload quality service photos.",
            "Write detailed service descriptions.",
            "Keep pricing competitive and transparent.",
            "Reply quickly to new inquiries.",
          ],
        },
      ],
    },
    {
      id: "tax",
      title: "Tax & Compliance (Ghana)",
      description: "General guidance only. This is not legal or tax advice.",
      blocks: [
        {
          heading: "What to prepare",
          items: [
            "TIN (Tax Identification Number).",
            "VAT registration if your turnover requires it.",
            "Accurate invoicing and income records.",
          ],
        },
        {
          heading: "Operations discipline",
          items: [
            "Track earnings and business expenses monthly.",
            "Keep receipts for materials, transport, and tools.",
            "Remember digital payments create auditable transaction records.",
          ],
        },
      ],
    },
  ],
  checklistItems: [
    { key: "profile_completed", label: "Profile completed", editable: false },
    { key: "profile_photo_uploaded", label: "Profile photo uploaded", editable: false },
    { key: "service_photos_uploaded", label: "3 service photos uploaded", editable: false },
    { key: "pricing_calculated", label: "Pricing calculated correctly", editable: false },
    { key: "service_description_optimized", label: "Service description optimized", editable: false },
    { key: "payment_policy_understood", label: "Payment policy understood", editable: true },
    { key: "cancellation_rules_reviewed", label: "Cancellation rules reviewed", editable: true },
    { key: "tax_record_process_started", label: "Tax record process started", editable: true },
  ],
  advancedResources: [
    "Video tutorials and monthly provider webinars",
    "Earnings calculator and pricing estimator tools",
    "Service demand analytics and provider scorecards",
  ],
};

export const DEFAULT_PAGES: Record<StaticPageKey, StaticPageContent> = {
  about: {
    title: "About SERVFIX",
    body:
      "SERVFIX helps Ghanaians find trusted service providers and book with confidence. " +
      "We verify providers, protect payments with escrow, and support both buyers and providers through every step.",
    aboutConfig: {
      introLabel: "About Me",
      heroImageUrl: "/hero-ghana-marketplace.png",
      missionTitle: "Our Mission",
      missionBody:
        "To empower every Ghanaian by making the hiring of skilled professionals safe, secure, and trustworthy.",
      missionBullets: ["To offer transparent access to professionals across Ghana."],
      whatWeDoTitle: "What We Do",
      whatWeDoLeft: [
        "Trusted, seamless, and reliable services.",
        "Veteran professionals providing quality service.",
        "Verified professionals ensuring quality access across Ghana.",
        "Qualified processes.",
        "Offer reliable access and an easy-rated skill platform.",
      ],
      whatWeDoRight: [
        "Transparent payments.",
        "User-friendly technology empowering residents in and around Ghana.",
      ],
      visionTitle: "Our SERVFIX",
      visionLeft:
        "To be Ghana's premier digital bridge, open and mindful of community participation and payment security.",
      visionRight: [
        "To be secure with service experience, fair opportunities and exposure.",
        "To be a valuable pivot, implementing experience designed for trustworthiness, accessibility, and innovation.",
      ],
      headingFont: "space_grotesk",
      bodyFont: "plus_jakarta_sans",
    },
    staff: [],
  },
  blog: {
    title: "SERVFIX Blog",
    body:
      "News, tips, and updates from the SERVFIX team will appear here. " +
      "Check back soon for new posts.",
    posts: [],
  },
  academy: {
    title: "SERVFIX Academy",
    body:
      "Practical guides, playbooks, and tutorials to help buyers and providers grow with confidence on SERVFIX.",
    posts: [],
  },
  providerResources: {
    title: "Provider Resources",
    body:
      "Use this resource center to onboard faster, price services correctly, prevent disputes, " +
      "and grow sustainably on SERVFIX.",
    resourcesConfig: DEFAULT_PROVIDER_RESOURCES_CONTENT,
  },
};
