import type { AdminPagesPayload } from "@/lib/api";
import { defaultProviderResourcesContent } from "@/data/providerResources";

export const DEFAULT_PAGES: AdminPagesPayload = {
  about: {
    title: "About SERVFIX",
    body:
      "SERVFIX helps Ghanaians find trusted service providers and book with confidence. " +
      "We verify providers, protect your payments, and support both buyers and providers through every step.",
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
    resourcesConfig: defaultProviderResourcesContent,
  },
};
