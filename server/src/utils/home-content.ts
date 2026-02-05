export type HomeContentPayload = {
  hero: {
    badge: string;
    headline: {
      prefix: string;
      highlight: string;
      suffix: string;
    };
    subheadline: string;
    primaryCta: {
      label: string;
      href: string;
    };
    secondaryCta: {
      label: string;
      href: string;
    };
    trustIndicators: Array<{
      icon: string;
      title: string;
      subtitle: string;
    }>;
    floatingCards: {
      onlineTitle: string;
      onlineSubtitle: string;
      escrowTitle: string;
      escrowSubtitle: string;
      escrowIcon?: string;
    };
  };
  categories: {
    badge: string;
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaHref: string;
    items: Array<{
      name: string;
      description: string;
      icon: string;
      color: string;
      keywords: string[];
    }>;
  };
  howItWorks: {
    badge: string;
    title: string;
    subtitle: string;
    steps: Array<{
      number: string;
      title: string;
      description: string;
      icon: string;
      color: string;
    }>;
  };
};

export const HOME_CONTENT_KEY = "home";

export const defaultHomeContent: HomeContentPayload = {
  hero: {
    badge: "Trusted by 10,000+ Ghanaians",
    headline: {
      prefix: "Connect with",
      highlight: "Trusted Service",
      suffix: "Providers in Ghana",
    },
    subheadline:
      "From caterers to carpenters, find skilled professionals for any job. Secure payments, verified providers, and a community that cares.",
    primaryCta: {
      label: "Find Services",
      href: "/browse",
    },
    secondaryCta: {
      label: "Watch How It Works",
      href: "#how-it-works",
    },
    trustIndicators: [
      {
        icon: "Shield",
        title: "Secure Escrow",
        subtitle: "Pay when satisfied",
      },
      {
        icon: "Star",
        title: "4.9/5 Rating",
        subtitle: "From 5000+ reviews",
      },
      {
        icon: "Users",
        title: "2000+ Providers",
        subtitle: "Across Ghana",
      },
    ],
    floatingCards: {
      onlineTitle: "500+ Online",
      onlineSubtitle: "Right now",
      escrowTitle: "GHS 2,450",
      escrowSubtitle: "Paid securely",
      escrowIcon: "Shield",
    },
  },
  categories: {
    badge: "Browse Services",
    title: "Find the Right Service for Your Needs",
    subtitle:
      "From home repairs to event planning, discover verified professionals ready to serve you across Ghana",
    ctaLabel: "View All Categories",
    ctaHref: "/browse",
    items: [
      {
        name: "Catering",
        icon: "UtensilsCrossed",
        color: "from-orange-400 to-red-500",
        description: "Food & Events",
        keywords: ["catering", "food", "cater"],
      },
      {
        name: "Carpentry",
        icon: "Hammer",
        color: "from-amber-500 to-orange-600",
        description: "Wood & Furniture",
        keywords: ["carpentry", "wood", "carpenter"],
      },
      {
        name: "Fashion",
        icon: "Shirt",
        color: "from-pink-400 to-rose-500",
        description: "Clothing & Design",
        keywords: ["fashion", "beauty", "styling"],
      },
      {
        name: "Music Band",
        icon: "Music",
        color: "from-purple-400 to-indigo-500",
        description: "Live Entertainment",
        keywords: ["music", "band", "entertainment"],
      },
      {
        name: "MC & Events",
        icon: "Mic2",
        color: "from-cyan-400 to-blue-500",
        description: "Hosting & Events",
        keywords: ["event", "mc", "planning", "host"],
      },
      {
        name: "Decorators",
        icon: "Paintbrush",
        color: "from-emerald-400 to-teal-500",
        description: "Event Decoration",
        keywords: ["decor", "decoration", "styling"],
      },
      {
        name: "Electricians",
        icon: "Zap",
        color: "from-yellow-400 to-amber-500",
        description: "Electrical Work",
        keywords: ["electric", "electrical"],
      },
      {
        name: "Plumbers",
        icon: "Wrench",
        color: "from-blue-400 to-cyan-500",
        description: "Plumbing Services",
        keywords: ["plumb", "plumbing"],
      },
      {
        name: "Builders",
        icon: "Construction",
        color: "from-slate-400 to-gray-600",
        description: "Construction",
        keywords: ["build", "construction", "venue"],
      },
      {
        name: "Cleaning",
        icon: "Sparkles",
        color: "from-sky-400 to-blue-500",
        description: "Home Cleaning",
        keywords: ["clean", "cleaning"],
      },
      {
        name: "Photography",
        icon: "Camera",
        color: "from-violet-400 to-purple-500",
        description: "Photo & Video",
        keywords: ["photo", "video", "photography"],
      },
      {
        name: "Logistics",
        icon: "Truck",
        color: "from-green-400 to-emerald-500",
        description: "Moving & Delivery",
        keywords: ["logistics", "delivery", "rental", "equipment"],
      },
    ],
  },
  howItWorks: {
    badge: "Simple Process",
    title: "How SERVFIX Works",
    subtitle:
      "Getting quality services has never been easier. Our platform ensures safety, transparency, and satisfaction.",
    steps: [
      {
        icon: "Search",
        title: "Find Services",
        description:
          "Browse through verified service providers or post what you need. Filter by location, price, and ratings.",
        color: "bg-primary/10 text-primary",
        number: "01",
      },
      {
        icon: "UserCheck",
        title: "Connect & Book",
        description:
          "Chat with providers through our secure platform. Discuss your needs, get quotes, and book services.",
        color: "bg-secondary/10 text-secondary",
        number: "02",
      },
      {
        icon: "Shield",
        title: "Secure Payment",
        description:
          "Pay through our escrow system. Your money is held safely until the service is completed to your satisfaction.",
        color: "bg-accent/10 text-accent",
        number: "03",
      },
      {
        icon: "Star",
        title: "Rate & Review",
        description:
          "After completion, rate your experience. Help the community find reliable service providers.",
        color: "bg-kente-blue/10 text-kente-blue",
        number: "04",
      },
    ],
  },
};
