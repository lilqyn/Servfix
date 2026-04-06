export type StaticPageKey = "about" | "blog" | "academy" | "providerResources" | "privacy" | "terms" | "cookies";

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

export type StaticPageSection = {
  heading: string;
  body?: string | null;
  items?: string[];
};

export type StaticPageContent = {
  title: string;
  body: string;
  intro?: string | null;
  sections?: StaticPageSection[];
  aboutConfig?: AboutPageConfig;
  posts?: BlogPost[];
  staff?: StaffProfile[];
  resourcesConfig?: ProviderResourcesContent;
};

export const PAGE_KEYS: StaticPageKey[] = ["about", "blog", "academy", "providerResources", "privacy", "terms", "cookies"];

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
            "Payment is held securely until the job is done.",
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
    posts: [
      {
        title: "Getting Started on SERVFIX",
        summary: "Learn what SERVFIX is, how it works, and how buyers and providers use the app to connect, book, and pay securely.",
        body: "Learn what SERVFIX is, how it works, and how buyers and providers use the app to connect, book, and pay securely.",
        imageUrl: null,
        videoUrl: "https://youtu.be/3_cQUml-KAc",
        publishedAt: "2026-03-21",
      },
      {
        title: "How to Book a Service",
        summary: "A step-by-step walkthrough for buyers — from browsing services to paying securely and leaving a review.",
        body: "A step-by-step walkthrough for buyers — from browsing services to paying securely and leaving a review.",
        imageUrl: null,
        videoUrl: "https://youtu.be/iMFnzIuSM7k",
        publishedAt: "2026-03-21",
      },
      {
        title: "Setting Up Your Provider Profile",
        summary: "Build a profile that attracts customers. Learn how to add photos, write descriptions, and price your services right.",
        body: "Build a profile that attracts customers. Learn how to add photos, write descriptions, and price your services right.",
        imageUrl: null,
        videoUrl: "https://youtu.be/xK16_51RGfk",
        publishedAt: "2026-03-21",
      },
      {
        title: "Understanding Payments & Protection",
        summary: "How SERVFIX protects your money with secure payment holds, wallet withdrawals, and transparent transaction tracking.",
        body: "How SERVFIX protects your money with secure payment holds, wallet withdrawals, and transparent transaction tracking.",
        imageUrl: null,
        videoUrl: "https://youtu.be/UUcOlzhVs_o",
        publishedAt: "2026-03-21",
      },
      {
        title: "How to Handle Disputes",
        summary: "What to do when something goes wrong — how to file a dispute, what happens next, and how to prevent issues.",
        body: "What to do when something goes wrong — how to file a dispute, what happens next, and how to prevent issues.",
        imageUrl: null,
        videoUrl: "https://youtu.be/ioblrJDbuPk",
        publishedAt: "2026-03-21",
      },
      {
        title: "Growing Your Business on SERVFIX",
        summary: "Proven tips to earn more reviews, respond faster, use boosts, and turn your SERVFIX profile into a thriving business.",
        body: "Proven tips to earn more reviews, respond faster, use boosts, and turn your SERVFIX profile into a thriving business.",
        imageUrl: null,
        videoUrl: "https://youtu.be/RSu7lbQ4XR8",
        publishedAt: "2026-03-21",
      },
    ],
  },
  providerResources: {
    title: "Provider Resources",
    body:
      "Use this resource center to onboard faster, price services correctly, prevent disputes, " +
      "and grow sustainably on SERVFIX.",
    resourcesConfig: DEFAULT_PROVIDER_RESOURCES_CONTENT,
  },
  privacy: {
    title: "Servfix Privacy Policy",
    body: "",
    intro:
      "This Privacy Policy explains how OPTEDO COMPANY LIMITED (\u201cServfix\u201d, \u201cwe\u201d, \u201cus\u201d, \u201cour\u201d) " +
      "collects, uses, stores, and shares personal data when you use the Servfix mobile application, " +
      "website, and related services (the \u201cPlatform\u201d). By using Servfix, you acknowledge the practices " +
      "described in this Privacy Policy.",
    sections: [
      {
        heading: "1. Data Controller",
        body: "OPTEDO COMPANY LIMITED is the data controller for personal data processed on Servfix.",
      },
      {
        heading: "2. Personal Data We Collect",
        body: "We may collect and process the following categories of data:",
        items: [
          "Account data: name, phone number, email address, and login credentials.",
          "Profile data: profile photo, address/location, and service preferences.",
          "Verification data: government-issued ID and business registration details (where required for KYC/compliance).",
          "Transaction data: bookings, order history, payout records, platform fees, and payment status metadata.",
          "Communication data: in-app messages, dispute submissions, and support requests.",
          "Technical/usage data: device/browser information, IP address, log events, and app analytics.",
          "Evidence data: photos or files you upload for disputes, verification, or support.",
        ],
      },
      {
        heading: "3. How We Use Personal Data",
        body: "We use personal data to:",
        items: [
          "Create and manage user accounts.",
          "Enable bookings, order fulfillment, and payouts.",
          "Verify identity and prevent fraud or abuse.",
          "Process and resolve disputes and complaints.",
          "Provide customer support and communicate service updates.",
          "Maintain platform security, reliability, and performance.",
          "Comply with legal, tax, and regulatory obligations.",
        ],
      },
      {
        heading: "4. Legal Basis for Processing",
        body:
          "Depending on the purpose, we process personal data based on one or more of the following: " +
          "performance of a contract, legal obligation, your consent, and our legitimate interests in " +
          "operating a safe and effective marketplace.",
      },
      {
        heading: "5. Payments and Financial Data",
        body:
          "Payments on Servfix are processed by licensed third-party Payment Service Providers (PSPs). " +
          "Servfix does not store full card details and does not operate as a payment institution or electronic money issuer.",
      },
      {
        heading: "6. Data Sharing",
        body: "We may share data only when necessary with:",
        items: [
          "Payment processors and financial service partners.",
          "Cloud hosting, storage, analytics, and security providers.",
          "Professional advisers, auditors, or insurers.",
          "Regulators, law enforcement, or courts where legally required.",
        ],
      },
      {
        heading: "7. International Transfers",
        body:
          "Where data is transferred across borders, we apply appropriate safeguards to protect personal data consistent with applicable law.",
      },
      {
        heading: "8. Data Retention",
        body:
          "We retain personal data only for as long as necessary for account administration, transaction records, " +
          "dispute handling, legal compliance, and fraud prevention. We may retain limited records where required by law.",
      },
      {
        heading: "9. Security",
        body:
          "We use reasonable technical and organizational safeguards, including access controls, monitoring, " +
          "and secure infrastructure practices, to protect personal data.",
      },
      {
        heading: "10. Your Rights",
        body: "Subject to applicable law, you may request:",
        items: [
          "Access to your personal data.",
          "Correction of inaccurate or incomplete data.",
          "Deletion of data where lawful and applicable.",
          "Restriction of or objection to certain processing.",
          "Withdrawal of consent where processing is consent-based.",
        ],
      },
      {
        heading: "11. Children\u2019s Privacy",
        body: "Servfix is intended for users aged 18 and above. We do not knowingly collect personal data from minors.",
      },
      {
        heading: "12. Third-Party Services",
        body:
          "The Platform may integrate with third-party services. Their privacy practices are governed by their own policies, " +
          "and we are not responsible for external policies.",
      },
      {
        heading: "13. Changes to this Policy",
        body: "We may update this Privacy Policy from time to time. Continued use of the Platform after updates constitutes acceptance of the revised policy.",
      },
      {
        heading: "14. Contact Information",
        body: "Servfix (Operated by OPTEDO COMPANY LIMITED)\nEmail: support@servfixgh.com",
      },
    ],
  },
  terms: {
    title: "Servfix Terms and Conditions",
    body: "",
    intro:
      "Welcome to Servfix, a service marketplace operated by OPTEDO COMPANY LIMITED, a company incorporated " +
      "under the laws of Ghana. These Terms and Conditions (\u201cTerms\u201d) govern your access to and use of the " +
      "Servfix mobile application, website, and related services (collectively, the \u201cPlatform\u201d). By accessing " +
      "or using Servfix, you agree to be legally bound by these Terms.",
    sections: [
      {
        heading: "1. Introduction",
        body:
          "Servfix provides a digital marketplace that connects customers (\u201cUsers\u201d) with independent service providers " +
          "(\u201cProviders\u201d) for home, repair, maintenance, and related services. Servfix acts solely as a technology " +
          "intermediary and does not directly provide services.",
      },
      {
        heading: "2. Eligibility",
        items: [
          "You must be at least 18 years old to use Servfix.",
          "To access certain features, you must register an account and provide accurate, complete, and current information.",
          "You are responsible for maintaining the confidentiality of your login credentials.",
        ],
      },
      {
        heading: "3. Nature of the Platform",
        body: "Servfix is a marketplace facilitator.",
        items: [
          "We do not employ service providers.",
          "We do not supervise or control the execution of services.",
          "Providers operate as independent contractors.",
          "There is no employer-employee relationship between Servfix and Providers.",
        ],
      },
      {
        heading: "4. Bookings and Payments",
        items: [
          "Users may request services through the Platform. Providers may accept or decline service requests at their discretion.",
          "All payments are processed through licensed third-party Payment Service Providers (PSPs).",
          "Servfix does not hold customer funds, does not operate as a PSP, and does not issue electronic money.",
          "Payments are held by the PSP until service confirmation.",
          "Funds are released to Providers after service completion and customer confirmation (or expiry of confirmation window).",
          "Servfix charges a commission on completed transactions, automatically deducted before Provider payout.",
        ],
      },
      {
        heading: "5. Cancellations and Refunds",
        body: "Users may raise disputes within the defined dispute window (24 to 72 hours after service completion). Refunds may be issued if:",
        items: [
          "Provider failed to show up.",
          "Service was materially incomplete.",
          "Provider violated Servfix\u2019s code of conduct.",
        ],
      },
      {
        heading: "6. User Conduct",
        body: "You agree not to:",
        items: [
          "Violate any laws or regulations.",
          "Engage in fraud or misrepresentation.",
          "Harass or threaten Providers or Users.",
          "Circumvent the Platform to avoid payment.",
        ],
      },
      {
        heading: "7. Provider Obligations",
        body: "Providers agree to:",
        items: [
          "Complete services professionally.",
          "Maintain required licenses (if applicable).",
          "Provide accurate profile information.",
          "Avoid fraudulent or unsafe conduct.",
        ],
      },
      {
        heading: "8. KYC and Identity Verification",
        body: "To promote trust and safety:",
        items: [
          "Providers must submit valid government-issued identification.",
          "Names on profiles must match submitted identification (unless registered as a business).",
          "Servfix reserves the right to suspend accounts with inconsistent identity details.",
          "Registered businesses must upload business registration documents.",
        ],
      },
      {
        heading: "9. Indemnity",
        body:
          "By using Servfix, Users and Providers agree to indemnify and hold harmless OPTEDO COMPANY LIMITED, " +
          "its directors, employees, and affiliates from any claims, losses, damages, liabilities, legal fees, " +
          "or expenses arising from:",
        items: [
          "Service-related disputes.",
          "Negligence or misconduct.",
          "Injury or property damage.",
          "Fraudulent actions.",
        ],
      },
      {
        heading: "10. Limitation of Liability",
        body: "Servfix shall not be liable for:",
        items: [
          "Poor-quality services.",
          "Personal injury.",
          "Property damage.",
          "Theft or misconduct by Providers or Users.",
          "Force majeure events.",
        ],
      },
      {
        heading: "11. Safety Disclaimer",
        body:
          "Users acknowledge risks associated with allowing Providers onto their premises. " +
          "Providers acknowledge risks associated with performing services at User locations. In emergencies, contact local authorities.",
      },
      {
        heading: "12. Dispute Resolution",
        items: [
          "Complaints must be submitted within the stated dispute window via the app or support email.",
          "Servfix may mediate disputes but does not guarantee resolution.",
          "Repeated verified misconduct may result in account suspension, permanent banning, or reporting to law enforcement.",
        ],
      },
      {
        heading: "13. Intellectual Property",
        body:
          "All Servfix branding, software, and content are the property of OPTEDO COMPANY LIMITED. " +
          "You are granted a limited, non-exclusive license to use the Platform for personal, non-commercial purposes.",
      },
      {
        heading: "14. Privacy",
        body:
          "Our handling of personal data is governed by the Servfix Privacy Policy and applicable Ghana data protection laws. " +
          "By using Servfix, you consent to our data practices.",
      },
      {
        heading: "15. Promotions and Rewards",
        body: "Servfix may offer:",
        items: [
          "Referral bonuses.",
          "Discount campaigns.",
          "Wallet credits.",
          "Loyalty incentives.",
        ],
      },
      {
        heading: "16. Termination",
        body:
          "Servfix may suspend or terminate accounts for violation of these Terms, fraudulent activity, " +
          "abusive behavior, or to comply with legal requirements.",
      },
      {
        heading: "17. Governing Law",
        body:
          "These Terms are governed by the laws of the Republic of Ghana. Any disputes shall first be resolved " +
          "through mediation before legal proceedings.",
      },
      {
        heading: "18. Modifications",
        body: "Servfix may update these Terms at any time. Continued use of the Platform constitutes acceptance of the revised Terms.",
      },
      {
        heading: "19. Contact Information",
        body: "Servfix (Operated by OPTEDO COMPANY LIMITED)\nEmail: support@servfixgh.com",
      },
    ],
  },
  cookies: {
    title: "Servfix Cookie Policy",
    body: "",
    intro:
      "This Cookie Policy explains how OPTEDO COMPANY LIMITED (\u201cServfix\u201d, \u201cwe\u201d, \u201cus\u201d, \u201cour\u201d) uses " +
      "cookies and similar technologies on the Servfix Platform. By continuing to use the Platform, you agree " +
      "to the use of cookies as described in this policy, subject to your browser settings.",
    sections: [
      {
        heading: "1. What Are Cookies?",
        body:
          "Cookies are small text files stored on your device when you visit a website or use a web-enabled app. " +
          "They help the Platform recognize your device and remember key preferences or session information.",
      },
      {
        heading: "2. Cookies We Use",
        body: "We use the following categories of cookies:",
        items: [
          "Strictly necessary cookies: required for authentication, security, session continuity, and core functionality.",
          "Performance and analytics cookies: used to understand usage trends, diagnose technical issues, and improve Platform reliability.",
          "Preference cookies: used to remember choices such as language or interface preferences, where enabled.",
        ],
      },
      {
        heading: "3. Why We Use Cookies",
        body: "We use cookies and similar technologies to:",
        items: [
          "Keep you signed in and protect your account.",
          "Prevent abuse, fraud, and unauthorized access attempts.",
          "Measure and improve platform speed, stability, and performance.",
          "Remember your settings and improve user experience.",
        ],
      },
      {
        heading: "4. Third-Party Cookies",
        body:
          "Some cookies may be set by third-party service providers we use for analytics, security, or infrastructure support. " +
          "These providers process data according to their own policies. When payment flows are handled by licensed PSPs, " +
          "their pages or components may also use cookies subject to their own policies.",
      },
      {
        heading: "5. Managing Cookies",
        body:
          "You can manage or disable cookies using your browser settings. If you disable strictly necessary cookies, " +
          "parts of the Platform may not function properly. You can also clear existing cookies from your browser at any time.",
      },
      {
        heading: "6. Policy Updates",
        body: "We may update this Cookie Policy from time to time. Continued use of the Platform after updates constitutes acceptance of the revised policy.",
      },
      {
        heading: "7. Contact Information",
        body: "Servfix (Operated by OPTEDO COMPANY LIMITED)\nEmail: support@servfixgh.com",
      },
    ],
  },
};
