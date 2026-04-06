import { useState } from "react";
import { Search } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type FAQCategory = {
  id: string;
  title: string;
  icon: string;
  questions: { q: string; a: string }[];
};

const faqData: FAQCategory[] = [
  {
    id: "general",
    title: "General",
    icon: "info",
    questions: [
      {
        q: "What is SERVFIX?",
        a: "SERVFIX is Ghana's trusted service marketplace. We connect buyers with verified service providers — plumbers, electricians, hairstylists, tailors, cleaners, caterers, and more. You can browse providers, compare ratings and prices, book services, and pay securely through the app.",
      },
      {
        q: "Is SERVFIX free to use?",
        a: "Yes, downloading and browsing SERVFIX is completely free for buyers. There are no subscription fees or hidden charges. Providers can list their services for free as well. A 10% platform commission is deducted from the provider's earnings on each completed order.",
      },
      {
        q: "Where is SERVFIX available?",
        a: "SERVFIX is currently available across Ghana, including Accra, Kumasi, Tamale, and other major cities. We are expanding to more locations regularly.",
      },
      {
        q: "How do I download the app?",
        a: "SERVFIX is available on Google Play. Search for \"SERVFIX\" or visit our website at servfixgh.com for a direct link. A web version is also available at www.servfixgh.com.",
      },
      {
        q: "Can I use SERVFIX on my computer?",
        a: "Yes. SERVFIX has a full web app at www.servfixgh.com that works on any browser. You can browse, book, and manage orders from your desktop or laptop.",
      },
    ],
  },
  {
    id: "booking",
    title: "Booking & Orders",
    icon: "calendar",
    questions: [
      {
        q: "How do I book a service?",
        a: "Search for the service you need or browse categories. Review provider profiles, ratings, and pricing. Select the service tier that fits your needs, add it to your cart, and proceed to checkout. You can pay with Mobile Money, debit/credit card, or bank transfer.",
      },
      {
        q: "Can I chat with a provider before booking?",
        a: "Yes. You can send a message to any provider through the app before booking. Discuss scope, pricing, timeline, and any questions you have. Your phone number is never shared.",
      },
      {
        q: "How do I cancel an order?",
        a: "You can cancel an order before the provider starts work. Go to your Orders page, select the order, and tap Cancel. If you already paid, a full refund will be issued to your original payment method.",
      },
      {
        q: "What happens after I book?",
        a: "After payment, the provider is notified and can accept or decline the order. Once accepted, they will begin work. When finished, the provider submits delivery. You then review the work and approve to release payment.",
      },
      {
        q: "How long do I have to review a delivery?",
        a: "Your review window depends on the order amount: 24 hours for orders under GHS 500, 48 hours for orders between GHS 500 and GHS 2,000, and 72 hours for orders over GHS 2,000. If you don't respond within this window, funds are automatically released to the provider.",
      },
      {
        q: "What if the provider doesn't accept my order?",
        a: "If a provider doesn't accept your order within a reasonable time, you can cancel and receive a full refund. You can then book a different provider.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments & Escrow",
    icon: "wallet",
    questions: [
      {
        q: "How do I pay for a service?",
        a: "SERVFIX accepts Mobile Money (MTN, Vodafone, AirtelTigo), debit/credit cards, and bank transfers. All payments are processed securely through our licensed payment partners.",
      },
      {
        q: "Is my payment safe?",
        a: "Yes. Your payment is held in escrow — meaning it's stored securely by a licensed payment partner, not given directly to the provider. You only release payment when you confirm the job is done to your satisfaction.",
      },
      {
        q: "When does the provider get paid?",
        a: "The provider receives payment after you approve the completed work. If you don't respond within the review window (24-72 hours depending on order amount), funds are automatically released.",
      },
      {
        q: "Can I get a refund?",
        a: "Yes. If you cancel before the service starts, you receive a full refund. If the service was unsatisfactory, you can open a dispute and our team will review both sides. Refunds are processed back to your original payment method.",
      },
      {
        q: "What is the platform fee?",
        a: "SERVFIX charges a 10% commission on each completed transaction. This fee is deducted from the provider's earnings, not charged to you as a buyer. The price you see is the price you pay.",
      },
      {
        q: "Are there any hidden fees?",
        a: "No. The price shown on the service listing is what you pay. There are no booking fees, service charges, or hidden costs from SERVFIX. Your payment provider (Mobile Money or card issuer) may charge their standard transaction fees.",
      },
    ],
  },
  {
    id: "providers",
    title: "For Service Providers",
    icon: "briefcase",
    questions: [
      {
        q: "How do I become a service provider on SERVFIX?",
        a: "Download the app, sign up, and select \"Provider\" during registration. Complete your profile with a photo, description of your services, work samples, and pricing. Once your profile is verified, you'll start appearing in search results.",
      },
      {
        q: "Is it free to list my services?",
        a: "Yes. Signing up and listing services on SERVFIX is completely free. There are no subscription fees or setup costs. SERVFIX takes a 10% commission only when you complete a paid order.",
      },
      {
        q: "How do I get paid?",
        a: "When a buyer approves your completed work, the earnings (minus the 10% platform fee) are credited to your SERVFIX wallet. You can then request a payout to your Mobile Money account (MTN, Vodafone, or AirtelTigo) at any time.",
      },
      {
        q: "What are the payout limits?",
        a: "Daily payout limits are GHS 1,000 for unverified providers and GHS 5,000 for verified providers. The maximum single payout is GHS 10,000. Complete your KYC verification to access higher limits.",
      },
      {
        q: "Do I need to be verified to receive payouts?",
        a: "Yes. KYC (Know Your Customer) verification is required before you can request any payouts. This protects both you and your customers. Verification is quick and free.",
      },
      {
        q: "How do I get more bookings?",
        a: "Three proven tips: (1) Upload high-quality work photos — profiles with photos get 3x more views. (2) Respond to messages quickly — buyers choose the provider who replies first. (3) Ask satisfied customers to leave a review — good reviews build trust and attract more clients.",
      },
      {
        q: "What are Boosts?",
        a: "Boosts increase your visibility on SERVFIX. You can get featured on the home page, appear at the top of search results, or lead your service category. More visibility means more bookings.",
      },
    ],
  },
  {
    id: "disputes",
    title: "Disputes & Safety",
    icon: "shield",
    questions: [
      {
        q: "How do I open a dispute?",
        a: "If you're unsatisfied with a completed service, go to the order and tap \"Report Issue\" before the review deadline. Describe the problem and upload any evidence (photos, messages). Our support team will review both sides.",
      },
      {
        q: "What happens during a dispute?",
        a: "When a dispute is opened, the payment is frozen. Our support team investigates by reviewing evidence from both sides. Possible outcomes include: full refund to buyer, full release to provider, partial refund, or denial of the dispute.",
      },
      {
        q: "How long does dispute resolution take?",
        a: "Most disputes are resolved within 3-5 business days. Complex cases may take longer. You'll be notified of updates throughout the process.",
      },
      {
        q: "How are providers verified?",
        a: "All providers go through our verification process before they can receive payouts. This includes identity verification and KYC checks. Verified providers display a badge on their profile.",
      },
      {
        q: "Is my personal information safe?",
        a: "Yes. Your phone number is never shared with providers or buyers. All communication happens through in-app messaging and voice calls. Your payment details are handled by our licensed payment partners, not stored on our servers.",
      },
    ],
  },
  {
    id: "account",
    title: "Account & Settings",
    icon: "user",
    questions: [
      {
        q: "How do I change my password?",
        a: "Go to Settings in your account menu and select \"Change Password\". Enter your current password and your new password. If you've forgotten your password, use the \"Forgot Password\" link on the sign-in page.",
      },
      {
        q: "Can I switch from buyer to provider?",
        a: "Your account role is set during registration. If you'd like to offer services as a provider, contact support and we can help update your account.",
      },
      {
        q: "Does SERVFIX have dark mode?",
        a: "Yes. Go to Settings and select your preferred theme: Light, Dark, or System (matches your phone's setting).",
      },
      {
        q: "How do I delete my account?",
        a: "Contact our support team through the app to request account deletion. Please note that any pending orders or wallet balance must be resolved before your account can be deleted.",
      },
      {
        q: "How do I contact support?",
        a: "Open the app and go to Support. Create a new ticket describing your issue. Choose a category (General, Payment, Order Issue, Account, Technical, or Feedback) and our team will respond as soon as possible.",
      },
    ],
  },
];

const FAQ = () => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredData = faqData
    .map((cat) => ({
      ...cat,
      questions: cat.questions.filter(
        (item) =>
          item.q.toLowerCase().includes(search.toLowerCase()) ||
          item.a.toLowerCase().includes(search.toLowerCase()),
      ),
    }))
    .filter(
      (cat) =>
        cat.questions.length > 0 &&
        (activeCategory === "all" || cat.id === activeCategory),
    );

  const totalQuestions = faqData.reduce(
    (sum, cat) => sum + cat.questions.length,
    0,
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-[1080px] px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Help Center
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently Asked Questions
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Find answers to common questions about booking services, payments,
            disputes, and more.
          </p>
        </div>

        {/* Search */}
        <div className="relative mx-auto mb-8 max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${totalQuestions} questions...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Filter */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setActiveCategory("all")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All
          </button>
          {faqData.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat.title}
            </button>
          ))}
        </div>

        {/* FAQ Sections */}
        {filteredData.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <p className="text-lg font-medium">No results found</p>
            <p className="mt-1 text-sm">
              Try a different search term or{" "}
              <a href="/#/support" className="text-primary hover:underline">
                contact support
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredData.map((cat) => (
              <section key={cat.id}>
                <h2 className="mb-3 text-lg font-semibold">{cat.title}</h2>
                <div className="rounded-lg border border-border/60 bg-card shadow-sm">
                  <Accordion type="multiple">
                    {cat.questions.map((item, idx) => (
                      <AccordionItem
                        key={idx}
                        value={`${cat.id}-${idx}`}
                        className="px-5"
                      >
                        <AccordionTrigger className="text-left text-[15px]">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground leading-relaxed">
                          {item.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </section>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="mt-14 rounded-lg border border-border/60 bg-card p-8 text-center shadow-sm">
          <h3 className="text-lg font-semibold">Still have questions?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Our support team is here to help.
          </p>
          <a
            href="/#/support"
            className="mt-4 inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Contact Support
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FAQ;
