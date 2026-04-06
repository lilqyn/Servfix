import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";

type FAQItem = { q: string; a: string };
type FAQCategory = { id: string; title: string; icon: string; questions: FAQItem[] };

const faqData: FAQCategory[] = [
  {
    id: "general",
    title: "General",
    icon: "information-circle-outline",
    questions: [
      { q: "What is SERVFIX?", a: "SERVFIX is Ghana's trusted service marketplace. We connect buyers with verified service providers \u2014 plumbers, electricians, hairstylists, tailors, cleaners, caterers, and more. You can browse providers, compare ratings and prices, book services, and pay securely through the app." },
      { q: "Is SERVFIX free to use?", a: "Yes, downloading and browsing SERVFIX is completely free for buyers. There are no subscription fees or hidden charges. Providers can list their services for free as well. A 10% platform commission is deducted from the provider's earnings on each completed order." },
      { q: "Where is SERVFIX available?", a: "SERVFIX is currently available across Ghana, including Accra, Kumasi, Tamale, and other major cities. We are expanding to more locations regularly." },
    ],
  },
  {
    id: "booking",
    title: "Booking & Orders",
    icon: "calendar-outline",
    questions: [
      { q: "How do I book a service?", a: "Search for the service you need or browse categories. Review provider profiles, ratings, and pricing. Select the service tier that fits your needs, add it to your cart, and proceed to checkout. You can pay with Mobile Money, debit/credit card, or bank transfer." },
      { q: "Can I chat with a provider before booking?", a: "Yes. You can send a message to any provider through the app before booking. Discuss scope, pricing, timeline, and any questions you have. Your phone number is never shared." },
      { q: "How do I cancel an order?", a: "You can cancel an order before the provider starts work. Go to your Orders page, select the order, and tap Cancel. If you already paid, a full refund will be issued to your original payment method." },
      { q: "How long do I have to review a delivery?", a: "Your review window depends on the order amount: 24 hours for orders under GHS 500, 48 hours for orders between GHS 500 and GHS 2,000, and 72 hours for orders over GHS 2,000. If you don't respond, funds are automatically released to the provider." },
    ],
  },
  {
    id: "payments",
    title: "Payments & Escrow",
    icon: "wallet-outline",
    questions: [
      { q: "How do I pay for a service?", a: "SERVFIX accepts Mobile Money (MTN, Vodafone, AirtelTigo), debit/credit cards, and bank transfers. All payments are processed securely through our licensed payment partners." },
      { q: "Is my payment safe?", a: "Yes. Your payment is held in escrow \u2014 meaning it's stored securely by a licensed payment partner, not given directly to the provider. You only release payment when you confirm the job is done to your satisfaction." },
      { q: "When does the provider get paid?", a: "The provider receives payment after you approve the completed work. If you don't respond within the review window (24\u201372 hours depending on order amount), funds are automatically released." },
      { q: "Can I get a refund?", a: "Yes. If you cancel before the service starts, you receive a full refund. If the service was unsatisfactory, you can open a dispute and our team will review both sides. Refunds are processed back to your original payment method." },
      { q: "What is the platform fee?", a: "SERVFIX charges a 10% commission on each completed transaction. This fee is deducted from the provider's earnings, not charged to you as a buyer." },
    ],
  },
  {
    id: "providers",
    title: "For Providers",
    icon: "briefcase-outline",
    questions: [
      { q: "How do I become a provider?", a: "Download the app, sign up, and select \"Provider\" during registration. Complete your profile with a photo, description of your services, work samples, and pricing. Once verified, you'll start appearing in search results." },
      { q: "How do I get paid?", a: "When a buyer approves your completed work, the earnings (minus the 10% platform fee) are credited to your SERVFIX wallet. You can then request a payout to your Mobile Money account (MTN, Vodafone, or AirtelTigo) at any time." },
      { q: "What are the payout limits?", a: "Daily payout limits are GHS 1,000 for unverified providers and GHS 5,000 for verified providers. The maximum single payout is GHS 10,000. Complete your KYC verification to access higher limits." },
      { q: "How do I get more bookings?", a: "Three tips: (1) Upload quality work photos \u2014 profiles with photos get 3x more views. (2) Reply to messages quickly. (3) Ask satisfied customers to leave reviews." },
    ],
  },
  {
    id: "disputes",
    title: "Disputes & Safety",
    icon: "shield-checkmark-outline",
    questions: [
      { q: "How do I open a dispute?", a: "If you're unsatisfied with a completed service, go to the order and tap \"Report Issue\" before the review deadline. Describe the problem and upload any evidence. Our support team will review both sides." },
      { q: "What happens during a dispute?", a: "When a dispute is opened, the payment is frozen. Our support team investigates by reviewing evidence from both sides. Outcomes include: full refund, full release to provider, partial refund, or denial." },
      { q: "Is my personal information safe?", a: "Yes. Your phone number is never shared with providers or buyers. All communication happens through in-app messaging and voice calls. Payment details are handled by licensed payment partners." },
    ],
  },
  {
    id: "account",
    title: "Account & Settings",
    icon: "person-outline",
    questions: [
      { q: "Does SERVFIX have dark mode?", a: "Yes. Go to Settings and select your preferred theme: Light, Dark, or System (matches your phone's setting)." },
      { q: "How do I contact support?", a: "Open the app and go to Support. Create a new ticket describing your issue. Choose a category and our team will respond as soon as possible." },
      { q: "How do I delete my account?", a: "Contact our support team through the app to request account deletion. Any pending orders or wallet balance must be resolved before your account can be deleted." },
    ],
  },
];

function AccordionItem({ item, expanded, onToggle }: { item: FAQItem; expanded: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <View style={styles.accordionItem}>
      <Pressable onPress={onToggle} style={styles.accordionTrigger}>
        <Text style={[styles.question, expanded && { color: palette.accent }]}>{item.q}</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={expanded ? palette.accent : palette.slate}
        />
      </Pressable>
      {expanded && <Text style={styles.answer}>{item.a}</Text>}
    </View>
  );
}

interface FAQScreenProps {
  onBack: () => void;
  onNavigateSupport?: () => void;
}

export default function FAQScreen({ onBack, onNavigateSupport }: FAQScreenProps) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
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

  type FlatItem =
    | { type: "header"; cat: FAQCategory }
    | { type: "faq"; cat: FAQCategory; item: FAQItem; idx: number };

  const flatItems: FlatItem[] = [];
  for (const cat of filteredData) {
    flatItems.push({ type: "header", cat });
    cat.questions.forEach((item, idx) => flatItems.push({ type: "faq", cat, item, idx }));
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={palette.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>FAQ</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={palette.slate} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search questions..."
          placeholderTextColor={palette.slate}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={palette.slate} />
          </Pressable>
        )}
      </View>

      {/* Category chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ id: "all", title: "All", icon: "", questions: [] }, ...faqData]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item: cat }) => (
          <Pressable
            onPress={() => setActiveCategory(cat.id)}
            style={[
              styles.chip,
              activeCategory === cat.id && { backgroundColor: palette.accent },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                activeCategory === cat.id && { color: "#fff" },
              ]}
            >
              {cat.title}
            </Text>
          </Pressable>
        )}
      />

      {/* FAQ List */}
      <FlatList
        data={flatItems}
        keyExtractor={(item, i) =>
          item.type === "header" ? `h-${item.cat.id}` : `q-${item.cat.id}-${item.idx}`
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search" size={48} color={palette.line} />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptySubtitle}>Try a different search term</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.cta}>
            <Text style={styles.ctaTitle}>Still have questions?</Text>
            <Text style={styles.ctaSubtitle}>Our support team is here to help.</Text>
            {onNavigateSupport && (
              <Pressable style={styles.ctaButton} onPress={onNavigateSupport}>
                <Text style={styles.ctaButtonText}>Contact Support</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={styles.sectionHeader}>
                <Ionicons name={item.cat.icon as any} size={20} color={palette.accent} />
                <Text style={styles.sectionTitle}>{item.cat.title}</Text>
              </View>
            );
          }
          const key = `${item.cat.id}-${item.idx}`;
          return (
            <AccordionItem
              item={item.item}
              expanded={expandedKey === key}
              onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
            />
          );
        }}
      />
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  container: { flex: 1, backgroundColor: palette.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: palette.card,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: palette.ink },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    backgroundColor: palette.inputBg,
    borderWidth: 1,
    borderColor: palette.line,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: palette.ink, paddingVertical: 0 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: palette.mist,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: palette.slate },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: palette.ink },
  accordionItem: {
    backgroundColor: palette.card,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
  },
  accordionTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    gap: 12,
  },
  question: { flex: 1, fontSize: 14, fontWeight: "600", color: palette.ink, lineHeight: 20 },
  answer: {
    fontSize: 14,
    color: palette.slate,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 0,
  },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: palette.ink, marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: palette.slate, marginTop: 4 },
  cta: {
    marginTop: 24,
    padding: 24,
    backgroundColor: palette.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
  },
  ctaTitle: { fontSize: 16, fontWeight: "700", color: palette.ink },
  ctaSubtitle: { fontSize: 14, color: palette.slate, marginTop: 4 },
  ctaButton: {
    marginTop: 14,
    backgroundColor: palette.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  ctaButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
}));
