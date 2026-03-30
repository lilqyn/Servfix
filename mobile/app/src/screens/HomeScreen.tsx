import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchHomeContent, fetchServices } from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";

import type { AuthUser, Service } from "../types";

type Props = {
  user: AuthUser | null;
  onBrowse: () => void;
  onBrowseCategory: (category: string) => void;
  onOpenService: (serviceId: string) => void;
  onOpenSignIn: () => void;
  onOpenProviderProfile?: (userId: string) => void;
};

const DEFAULT_CATEGORIES = [
  { label: "Cleaning", emoji: "🧹" },
  { label: "Plumbing", emoji: "🔧" },
  { label: "Electrical", emoji: "⚡" },
  { label: "Painting", emoji: "🎨" },
  { label: "Carpentry", emoji: "🪚" },
  { label: "Gardening", emoji: "🌿" },
  { label: "AC & Cooling", emoji: "❄️" },
  { label: "IT & Tech", emoji: "💻" },
];

const HOW_IT_WORKS_STEPS: {
  number: number;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}[] = [
  {
    number: 1,
    icon: "search-outline",
    title: "Browse",
    description: "Explore verified service providers by category or location",
  },
  {
    number: 2,
    icon: "calendar-outline",
    title: "Book",
    description: "Choose a package, pick a date, and place your order",
  },
  {
    number: 3,
    icon: "shield-checkmark-outline",
    title: "Pay safely",
    description: "Your payment is held in escrow until the job is done",
  },
];

type UniqueProvider = {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number | null;
};

function extractUniqueProviders(services: Service[]): UniqueProvider[] {
  const seen = new Set<string>();
  const providers: UniqueProvider[] = [];
  for (const svc of services) {
    if (seen.has(svc.provider.id)) continue;
    seen.add(svc.provider.id);
    const pp = svc.provider.providerProfile;
    const rawRating = pp?.ratingAvg;
    const rating = rawRating != null ? Number(rawRating) : null;
    providers.push({
      id: svc.provider.id,
      name: pp?.displayName || svc.provider.username || "Provider",
      avatarUrl: svc.provider.avatarUrl ?? null,
      rating: rating && !Number.isNaN(rating) ? rating : null,
    });
  }
  return providers;
}

export function HomeScreen({ user, onBrowse, onBrowseCategory, onOpenService, onOpenSignIn, onOpenProviderProfile }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const displayName =
    user?.providerProfile?.displayName || user?.username || user?.email || user?.phone || "there";

  const [featured, setFeatured] = useState<Service[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [heroTitle, setHeroTitle] = useState<string | null>(null);
  const [heroSubtitle, setHeroSubtitle] = useState<string | null>(null);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  const uniqueProviders = useMemo(() => extractUniqueProviders(featured), [featured]);

  const loadContent = useCallback(async () => {
    try {
      const [homeContent, services] = await Promise.allSettled([
        fetchHomeContent(),
        fetchServices(),
      ]);

      if (homeContent.status === "fulfilled") {
        const hc = homeContent.value;
        if (hc.heroTitle) setHeroTitle(hc.heroTitle);
        if (hc.heroSubtitle) setHeroSubtitle(hc.heroSubtitle);
        if (hc.categories && hc.categories.length > 0) setCategories(hc.categories);
        if (hc.featured && hc.featured.length > 0) {
          setFeatured(hc.featured.slice(0, 8));
        } else if (services.status === "fulfilled") {
          setFeatured(services.value.slice(0, 8));
        }
      } else if (services.status === "fulfilled") {
        setFeatured(services.value.slice(0, 8));
      }
    } catch {
      // silently ignore — home content is non-critical
    } finally {
      setFeaturedLoading(false);
    }
  }, []);

  useEffect(() => { void loadContent(); }, [loadContent]);

  return (
    <ScrollView contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}>
      <View style={styles.hero}>
        <Text style={[styles.title, isCompact && styles.titleCompact]}>
          {heroTitle ? (
            heroTitle
          ) : (
            <>
              Need a pro today?{"\n"}
              <Text style={styles.titleAccent}>Book in minutes.</Text>
            </>
          )}
        </Text>
        <Text style={styles.subtitle}>
          {heroSubtitle ||
            "Explore verified experts, compare offers, and move from search to payment in one smooth flow."}
        </Text>

        <View style={styles.heroActions}>
          <Pressable onPress={onBrowse} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Start browsing</Text>
          </Pressable>
          {!user ? (
            <Pressable onPress={onOpenSignIn} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Sign in</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Categories grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Browse by category</Text>
        <View style={styles.categoryGrid}>
          {categories.map((cat) => (
            <Pressable
              key={cat.label}
              onPress={() => onBrowseCategory(cat.label)}
              style={styles.categoryCard}
            >
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* How It Works */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.stepsContainer}>
          {HOW_IT_WORKS_STEPS.map((step) => (
            <View key={step.number} style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{step.number}</Text>
                </View>
                <View style={styles.stepIconWrap}>
                  <Ionicons name={step.icon} size={22} color={palette.accent} />
                </View>
              </View>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Featured services */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Featured services</Text>
          <Pressable onPress={onBrowse}>
            <Text style={styles.sectionLink}>See all</Text>
          </Pressable>
        </View>
        {featuredLoading ? (
          <ActivityIndicator color={palette.accent} size="small" style={styles.loader} />
        ) : featured.length === 0 ? (
          <Text style={styles.emptyText}>No services available yet.</Text>
        ) : (
          <View style={styles.featuredList}>
            {featured.map((svc) => {
              const price = svc.tiers[0]?.price;
              const currency = svc.tiers[0]?.currency ?? "GHS";
              const providerName =
                svc.provider.providerProfile?.displayName ||
                svc.provider.username ||
                "Provider";
              const thumbs = svc.media.slice(0, 3).map((m) => m.signedUrl || m.url).filter(Boolean);
              const heroUri = thumbs[0];
              const extraCount = svc.media.length > 3 ? svc.media.length - 3 : 0;
              return (
                <Pressable
                  key={svc.id}
                  onPress={() => onOpenService(svc.id)}
                  style={styles.serviceCard}
                >
                  {heroUri ? (
                    <View style={styles.serviceMediaWrap}>
                      <Image source={{ uri: heroUri }} style={styles.serviceHero} />
                      {thumbs.length > 1 && (
                        <View style={styles.serviceMediaStrip}>
                          {thumbs.slice(1).map((uri, i) => (
                            <Image key={i} source={{ uri }} style={styles.serviceStripThumb} />
                          ))}
                          {extraCount > 0 && (
                            <View style={[styles.serviceStripThumb, styles.serviceStripMore]}>
                              <Text style={styles.serviceStripMoreText}>+{extraCount}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={[styles.serviceHero, styles.serviceHeroPlaceholder]}>
                      <Ionicons name="image-outline" size={28} color={palette.slate} />
                    </View>
                  )}
                  <View style={styles.serviceCardBody}>
                    <Text numberOfLines={2} style={styles.serviceTitle}>{svc.title}</Text>
                    <View style={styles.serviceCardMeta}>
                      <Text numberOfLines={1} style={styles.serviceProvider}>{providerName}</Text>
                      {svc.locationCity ? (
                        <Text numberOfLines={1} style={styles.serviceMeta}>
                          <Ionicons name="location-outline" size={10} color={palette.slate} /> {svc.locationCity}
                        </Text>
                      ) : null}
                    </View>
                    {price != null ? (
                      <View style={styles.servicePriceBadge}>
                        <Text style={styles.servicePriceBadgeText}>
                          {currency} {Number(price).toLocaleString()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Top providers */}
      {!featuredLoading && uniqueProviders.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top providers</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.providersScroll}
          >
            {uniqueProviders.map((provider) => (
              <Pressable key={provider.id} onPress={() => onOpenProviderProfile?.(provider.id)} style={styles.providerCard}>
                {provider.avatarUrl ? (
                  <Image source={{ uri: provider.avatarUrl }} style={styles.providerAvatar} />
                ) : (
                  <View style={[styles.providerAvatar, styles.providerAvatarPlaceholder]}>
                    <Ionicons name="person" size={22} color={palette.slate} />
                  </View>
                )}
                <Text numberOfLines={1} style={styles.providerName}>{provider.name}</Text>
                {provider.rating != null ? (
                  <View style={styles.providerRatingRow}>
                    <Ionicons name="star" size={11} color="#f59e0b" />
                    <Text style={styles.providerRating}>{provider.rating.toFixed(1)}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

    </ScrollView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  content: {
    gap: 12,
    padding: 20,
    paddingBottom: 158,
  },
  contentCompact: {
    padding: 16,
    paddingBottom: 144,
  },
  hero: {
    backgroundColor: palette.ink,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: 16,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  eyebrow: {
    color: palette.accentSoft,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    color: palette.canvas,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 26,
    letterSpacing: 0.1,
  },
  titleCompact: {
    fontSize: 20,
    lineHeight: 24,
  },
  titleAccent: {
    color: palette.gold,
  },
  subtitle: {
    color: palette.slate,
    fontSize: 13,
    lineHeight: 15,
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 14,
    elevation: 2,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: palette.accentDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
  },
  primaryButtonText: {
    color: palette.canvas,
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    backgroundColor: `${palette.card}28`,
    borderColor: `${palette.card}42`,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: palette.canvas,
    fontSize: 14,
    fontWeight: "800",
  },
  statRow: {
    flexDirection: "row",
    gap: 8,
  },
  statRowCompact: {
    flexDirection: "column",
  },
  statCard: {
    borderRadius: 14,
    flex: 1,
    gap: 2,
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statCardCompact: {
    minHeight: 72,
  },
  statCardSky: {
    backgroundColor: palette.accentSoft,
  },
  statCardMint: {
    backgroundColor: palette.card,
  },
  statCardSun: {
    backgroundColor: palette.goldSoft,
  },
  statValue: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  statLabel: {
    color: palette.slate,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  section: { gap: 12 },
  sectionRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  sectionLink: { color: palette.accentDeep, fontSize: 13, fontWeight: "700" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  categoryCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: "22%",
  },
  categoryEmoji: { fontSize: 22 },
  categoryLabel: { color: palette.ink, fontSize: 10, fontWeight: "700", textAlign: "center" },
  loader: { alignSelf: "center", marginVertical: 12 },
  emptyText: { color: palette.slate, fontSize: 14 },
  featuredList: { gap: 10 },
  serviceCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  serviceMediaWrap: { position: "relative" },
  serviceHero: { height: 150, width: "100%" },
  serviceHeroPlaceholder: { alignItems: "center", backgroundColor: palette.mist, justifyContent: "center" },
  serviceMediaStrip: {
    bottom: 8,
    flexDirection: "row",
    gap: 6,
    position: "absolute",
    right: 8,
  },
  serviceStripThumb: { borderRadius: 6, height: 36, width: 36, borderWidth: 1.5, borderColor: palette.card },
  serviceStripMore: {
    alignItems: "center",
    backgroundColor: `${palette.shadow}8C`,
    justifyContent: "center",
  },
  serviceStripMoreText: { color: palette.canvas, fontSize: 11, fontWeight: "800" },
  serviceCardBody: { gap: 4, padding: 12 },
  serviceCardMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  serviceTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  serviceProvider: { color: palette.slate, fontSize: 12 },
  serviceMeta: { color: palette.slate, fontSize: 11 },
  servicePriceBadge: {
    alignSelf: "flex-start",
    backgroundColor: palette.accentSoft,
    borderRadius: 8,
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  servicePriceBadgeText: { color: palette.accentDeep, fontSize: 12, fontWeight: "800" },

  /* How It Works */
  stepsContainer: {
    gap: 10,
  },
  stepCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  stepHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  stepBadge: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  stepBadgeText: {
    color: palette.canvas,
    fontSize: 12,
    fontWeight: "800",
  },
  stepIconWrap: {
    alignItems: "center",
    backgroundColor: palette.accentSoft,
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  stepTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  stepDescription: {
    color: palette.slate,
    fontSize: 13,
    lineHeight: 19,
  },

  /* Top Providers */
  providersScroll: {
    gap: 12,
    paddingRight: 4,
  },
  providerCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: 100,
  },
  providerAvatar: {
    borderRadius: 26,
    height: 52,
    width: 52,
  },
  providerAvatarPlaceholder: {
    alignItems: "center",
    backgroundColor: palette.mist,
    justifyContent: "center",
  },
  providerName: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  providerRatingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
  },
  providerRating: {
    color: palette.slate,
    fontSize: 11,
    fontWeight: "700",
  },
}));
