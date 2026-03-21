import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  createPaymentCheckout,
  createThread,
  fetchPublicSettings,
  fetchService,
  fetchServiceReviews,
  fetchServices,
  sendConversationMessage,
} from "../lib/api";
import { API_BASE_URL } from "../config/env";
import { useAuth } from "../providers/AuthProvider";
import { formatCurrency, toNumber } from "../lib/format";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { CheckoutMethod, CheckoutProvider, Review, Service } from "../types";

const WISHLIST_KEY = "servfix-wishlist";

type Props = {
  serviceId: string;
  onOpenSignIn: () => void;
  onOpenOrders: () => void;
  onOpenProviderProfile?: (userId: string) => void;
  onOpenService?: (serviceId: string) => void;
  onReport?: (targetType: "service", targetId: string, targetLabel: string) => void;
  onOpenMessages?: (threadId: string, threadTitle?: string) => void;
};

type ProviderOption = {
  key: CheckoutProvider;
  label: string;
  helper: string;
};

const PROVIDER_OPTIONS: ProviderOption[] = [
  { key: "flutterwave", label: "Flutterwave", helper: "Card + Mobile Money" },
  { key: "paystack", label: "Paystack", helper: "Card + Mobile Money" },
  { key: "stripe", label: "Stripe", helper: "Card only" },
  { key: "hubtel", label: "Hubtel", helper: "Mobile Money (GHS)" },
  { key: "expresspay", label: "ExpressPay", helper: "Checkout redirect (GHS)" },
];


const isProviderCurrencySupported = (
  provider: CheckoutProvider,
  currency: "GHS" | "USD" | "EUR",
) => {
  if (provider === "hubtel" || provider === "expresspay") return currency === "GHS";
  return true;
};

const isValidImageUrl = (url?: string | null) =>
  !!url && (url.startsWith("http://") || url.startsWith("https://"));

export function ServiceDetailScreen({
  serviceId,
  onOpenSignIn,
  onOpenOrders,
  onOpenProviderProfile,
  onOpenService,
  onReport,
  onOpenMessages,
}: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const [service, setService] = useState<Service | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [enabledProviders, setEnabledProviders] = useState<CheckoutProvider[]>(["flutterwave"]);
  const [paymentProvider, setPaymentProvider] = useState<CheckoutProvider>("flutterwave");
  const [paymentMethod, setPaymentMethod] = useState<CheckoutMethod>("mobile_money");
  const [isLoadingPaymentConfig, setIsLoadingPaymentConfig] = useState(true);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [relatedServices, setRelatedServices] = useState<Service[]>([]);

  // Inquiry form state
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquiryDate, setInquiryDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [inquiryQtyType, setInquiryQtyType] = useState<"guests" | "items">("guests");
  const [inquiryQty, setInquiryQty] = useState("");
  const [inquiryLocation, setInquiryLocation] = useState("");
  const [inquiryLocationCoords, setInquiryLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const locationSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inquiryMessage, setInquiryMessage] = useState("");
  const [inquirySending, setInquirySending] = useState(false);
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [inquirySent, setInquirySent] = useState(false);

  const loadService = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextService = await fetchService(serviceId);
      setService(nextService);
      setSelectedTierId((current) =>
        current && nextService.tiers.some((tier) => tier.id === current)
          ? current
          : nextService.tiers[0]?.id ?? null,
      );
      setError(null);
      setOrderError(null);
      setCheckoutError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load service.");
    } finally {
      setIsLoading(false);
    }
  }, [serviceId]);

  const loadPaymentSettings = async () => {
    setIsLoadingPaymentConfig(true);
    try {
      const settings = await fetchPublicSettings();
      const configuredProviders = settings.payments.enabledProviders;
      const safeProviders: CheckoutProvider[] =
        configuredProviders.length > 0 ? configuredProviders : ["flutterwave"];
      const defaultProvider = safeProviders.includes(settings.payments.defaultProvider)
        ? settings.payments.defaultProvider
        : safeProviders[0];
      setEnabledProviders(safeProviders);
      setPaymentProvider(defaultProvider);
      setCheckoutError(null);
    } catch {
      setEnabledProviders(["flutterwave"]);
      setPaymentProvider("flutterwave");
      setCheckoutError("Unable to load payment settings. Using Flutterwave fallback.");
    } finally {
      setIsLoadingPaymentConfig(false);
    }
  };

  useEffect(() => { void loadService(); }, [loadService]);
  useEffect(() => { void loadPaymentSettings(); }, []);
  useEffect(() => {
    setReviewsLoading(true);
    fetchServiceReviews(serviceId)
      .then(setReviews)
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [serviceId]);

  // ── Wishlist ────────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(WISHLIST_KEY)
      .then((raw) => {
        const ids: string[] = raw ? JSON.parse(raw) : [];
        setIsSaved(ids.includes(serviceId));
      })
      .catch(() => {});
  }, [serviceId]);

  const toggleWishlist = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(WISHLIST_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      let next: string[];
      if (ids.includes(serviceId)) {
        next = ids.filter((id) => id !== serviceId);
        setIsSaved(false);
      } else {
        next = [...ids, serviceId];
        setIsSaved(true);
      }
      await AsyncStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
    } catch {
      // silently fail
    }
  }, [serviceId]);

  // ── Share ───────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!service) return;
    try {
      await Share.share({
        message: `Check out "${service.title}" on Servfix: ${API_BASE_URL}/services/${service.id}`,
      });
    } catch {
      // user cancelled or error
    }
  }, [service]);

  // ── Related services ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!service) return;
    fetchServices()
      .then((all) => {
        const related = all
          .filter(
            (s) =>
              s.id !== service.id &&
              s.category.toLowerCase() === service.category.toLowerCase(),
          )
          .slice(0, 6);
        setRelatedServices(related);
      })
      .catch(() => {});
  }, [service]);

  const selectedTier = useMemo(
    () => service?.tiers.find((tier) => tier.id === selectedTierId) ?? service?.tiers[0] ?? null,
    [service, selectedTierId],
  );

  const selectedTierPricingModel = selectedTier?.pricingModel ?? "fixed";
  const isQuoteOnly = selectedTierPricingModel !== "fixed";
  const isPerUnit = selectedTier?.pricingType === "per_unit";
  const unitLabel = selectedTier?.unitLabel?.trim() || "unit";
  const normalizedQuantity = isPerUnit ? quantity : 1;
  const estimatedTotal = selectedTier ? toNumber(selectedTier.price) * normalizedQuantity : 0;
  const checkoutCurrency = selectedTier?.currency ?? "GHS";

  const supportedProviders = useMemo(
    () => enabledProviders.filter((p) => isProviderCurrencySupported(p, checkoutCurrency)),
    [enabledProviders, checkoutCurrency],
  );
  const availableProviderOptions = useMemo(
    () => PROVIDER_OPTIONS.filter((o) => supportedProviders.includes(o.key)),
    [supportedProviders],
  );

  useEffect(() => {
    if (!selectedTier || selectedTier.pricingType !== "per_unit") setQuantity(1);
  }, [selectedTier]);

  useEffect(() => {
    if (availableProviderOptions.length === 0) return;
    if (!availableProviderOptions.some((o) => o.key === paymentProvider))
      setPaymentProvider(availableProviderOptions[0].key);
  }, [availableProviderOptions, paymentProvider]);

  useEffect(() => {
    if (paymentProvider === "stripe") { setPaymentMethod("card"); return; }
    if (paymentProvider === "hubtel") setPaymentMethod("mobile_money");
  }, [paymentProvider]);

  // Rating breakdown
  const ratingBreakdown = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 star
    for (const r of reviews) {
      if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1]++;
    }
    return counts;
  }, [reviews]);

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return null;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const startCheckout = async () => {
    if (!service || !selectedTier) return;
    if (!user) { onOpenSignIn(); return; }
    if (availableProviderOptions.length === 0) { setCheckoutError(`No payment provider is enabled for ${checkoutCurrency}.`); return; }
    setIsStartingCheckout(true);
    setCheckoutError(null);
    try {
      const method =
        paymentProvider === "stripe" ? "card"
          : paymentProvider === "hubtel" ? "mobile_money"
            : paymentProvider === "expresspay" ? undefined
              : paymentMethod;
      const checkout = await createPaymentCheckout({
        provider: paymentProvider, method, returnTo: "mobile",
        items: [{ serviceId: service.id, tierId: selectedTier.id, quantity: isPerUnit ? normalizedQuantity : 1 }],
      });
      const canOpen = await Linking.canOpenURL(checkout.checkoutUrl);
      if (!canOpen) throw new Error("Unable to open checkout URL on this device.");
      await Linking.openURL(checkout.checkoutUrl);
    } catch (nextError) {
      setCheckoutError(nextError instanceof Error ? nextError.message : "Unable to start checkout.");
    } finally {
      setIsStartingCheckout(false);
    }
  };

  // ── Inquiry submit ──────────────────────────────────────────────────────────
  const handleSendInquiry = async () => {
    if (!service || !user) { onOpenSignIn(); return; }
    if (!inquiryMessage.trim() || inquiryMessage.trim().length < 20) {
      setInquiryError("Please describe your requirements (at least 20 characters).");
      return;
    }
    setInquirySending(true);
    setInquiryError(null);
    try {
      const thread = await createThread({ providerId: service.provider.id, serviceId: service.id });
      const parts = [`Service: ${service.title}`];
      if (inquiryDate) parts.push(`Event Date: ${inquiryDate.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}`);
      if (inquiryQty) parts.push(`${inquiryQtyType === "guests" ? "Guests" : "Items"}: ${inquiryQty}`);
      if (inquiryLocation) parts.push(`Location: ${inquiryLocation}`);
      parts.push(`\nRequirements:\n${inquiryMessage.trim()}`);
      await sendConversationMessage(thread.id, parts.join("\n"));
      setInquirySent(true);
      if (onOpenMessages) {
        setTimeout(() => onOpenMessages(thread.id, providerName), 800);
      }
    } catch (e) {
      setInquiryError(e instanceof Error ? e.message : "Failed to send inquiry.");
    } finally {
      setInquirySending(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.stateText}>Loading service...</Text>
      </View>
    );
  }

  // Error state
  if (!service || error) {
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.errorTitle}>Service unavailable</Text>
        <Text style={styles.stateText}>{error || "This service could not be loaded."}</Text>
        <Pressable onPress={() => void loadService()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const provider = service.provider;
  const providerName = provider.providerProfile?.displayName || provider.username || "Provider";
  const providerVerified = provider.providerProfile?.verificationStatus === "verified";
  const providerRating = provider.providerProfile?.ratingAvg;
  const providerRatingDisplay = providerRating != null
    ? (typeof providerRating === "string" ? parseFloat(providerRating) : providerRating).toFixed(1)
    : null;
  const providerRatingCount = provider.providerProfile?.ratingCount ?? 0;
  const providerLocation = provider.providerProfile?.location;

  const showMethodSelector = paymentProvider === "flutterwave" || paymentProvider === "paystack";
  const checkoutDisabled =
    isStartingCheckout || isLoadingPaymentConfig ||
    (Boolean(user) && availableProviderOptions.length === 0);

  const galleryImages = service.media.filter(
    (m) => isValidImageUrl(m.signedUrl) || isValidImageUrl(m.url),
  );
  const mainImage = galleryImages[mainImageIndex] ?? galleryImages[0];
  const imageWidth = width - 40;

  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 3);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Gallery */}
      {galleryImages.length > 0 ? (
        <View style={styles.gallerySection}>
          {/* Main image */}
          <View style={[styles.mainImageWrap, { height: imageWidth * 0.62 }]}>
            {isValidImageUrl(mainImage?.signedUrl ?? mainImage?.url) ? (
              <Image
                source={{ uri: (mainImage?.signedUrl ?? mainImage?.url)! }}
                style={styles.mainImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="image-outline" size={48} color="#d1d5db" />
              </View>
            )}
            {/* Image counter */}
            <View style={styles.imageCounter}>
              <Ionicons name="images-outline" size={12} color="#ffffff" />
              <Text style={styles.imageCounterText}>
                {mainImageIndex + 1}/{galleryImages.length}
              </Text>
            </View>
            {/* Nav arrows */}
            {galleryImages.length > 1 && mainImageIndex > 0 && (
              <Pressable
                style={[styles.galleryArrow, styles.galleryArrowLeft]}
                onPress={() => setMainImageIndex((i) => i - 1)}
              >
                <Ionicons name="chevron-back" size={20} color="#ffffff" />
              </Pressable>
            )}
            {galleryImages.length > 1 && mainImageIndex < galleryImages.length - 1 && (
              <Pressable
                style={[styles.galleryArrow, styles.galleryArrowRight]}
                onPress={() => setMainImageIndex((i) => i + 1)}
              >
                <Ionicons name="chevron-forward" size={20} color="#ffffff" />
              </Pressable>
            )}
          </View>
          {/* Thumbnails */}
          {galleryImages.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.thumbRow}>
                {galleryImages.map((m, idx) => {
                  const thumbUrl = m.signedUrl ?? m.url;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setMainImageIndex(idx)}
                      style={[styles.thumb, idx === mainImageIndex && styles.thumbActive]}
                    >
                      {isValidImageUrl(thumbUrl) ? (
                        <Image source={{ uri: thumbUrl! }} style={styles.thumbImage} resizeMode="cover" />
                      ) : (
                        <View style={[styles.thumbImage, { backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center" }]}>
                          <Ionicons name="image-outline" size={14} color="#9ca3af" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      ) : null}

      {/* Title + Category */}
      <View style={styles.titleSection}>
        <View style={styles.titleTopRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{service.category}</Text>
            </View>
            {service.isRemote && (
              <View style={styles.remoteBadge}>
                <Ionicons name="globe-outline" size={12} color={palette.accent} />
                <Text style={styles.remoteBadgeText}>Remote</Text>
              </View>
            )}
          </View>
          <View style={styles.actionBtns}>
            <Pressable onPress={() => void toggleWishlist()} style={styles.actionBtn}>
              <Ionicons
                name={isSaved ? "heart" : "heart-outline"}
                size={22}
                color={isSaved ? palette.danger : palette.slate}
              />
            </Pressable>
            <Pressable onPress={() => void handleShare()} style={styles.actionBtn}>
              <Ionicons name="share-outline" size={22} color={palette.slate} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.title}>{service.title}</Text>
        <View style={styles.titleMetaRow}>
          {service.locationCity && (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color={palette.slate} />
              <Text style={styles.metaItemText}>{service.locationCity}</Text>
            </View>
          )}
          {providerRatingDisplay && (
            <View style={styles.metaItem}>
              <Ionicons name="star" size={14} color="#f59e0b" />
              <Text style={styles.metaItemTextBold}>{providerRatingDisplay}</Text>
              <Text style={styles.metaItemText}>({providerRatingCount})</Text>
            </View>
          )}
        </View>
      </View>

      {/* Provider card */}
      <Pressable
        onPress={onOpenProviderProfile ? () => onOpenProviderProfile(provider.id) : undefined}
        style={styles.providerCard}
      >
        <View style={styles.providerLeft}>
          {provider.avatarUrl ? (
            <Image source={{ uri: provider.avatarUrl }} style={styles.providerAvatar} />
          ) : (
            <View style={[styles.providerAvatar, styles.providerAvatarPlaceholder]}>
              <Ionicons name="person" size={22} color="#9ca3af" />
            </View>
          )}
          <View style={styles.providerInfo}>
            <View style={styles.providerNameRow}>
              <Text style={styles.providerName}>{providerName}</Text>
              {providerVerified && (
                <Ionicons name="checkmark-circle" size={16} color="#1d4ed8" />
              )}
            </View>
            {providerLocation && (
              <View style={styles.providerMeta}>
                <Ionicons name="location-outline" size={12} color={palette.slate} />
                <Text style={styles.providerMetaText}>{providerLocation}</Text>
              </View>
            )}
            <View style={styles.providerStats}>
              {providerRatingDisplay && (
                <View style={styles.providerStat}>
                  <Ionicons name="star" size={12} color="#f59e0b" />
                  <Text style={styles.providerStatText}>{providerRatingDisplay} ({providerRatingCount})</Text>
                </View>
              )}
              <View style={styles.providerStat}>
                <Ionicons name="briefcase-outline" size={12} color={palette.slate} />
                <Text style={styles.providerStatText}>{Math.max(0, providerRatingCount)} jobs</Text>
              </View>
            </View>
          </View>
        </View>
        {onOpenProviderProfile && (
          <View style={styles.viewProfileBtn}>
            <Text style={styles.viewProfileText}>View</Text>
            <Ionicons name="chevron-forward" size={14} color={palette.accentDeep} />
          </View>
        )}
      </Pressable>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About this service</Text>
        <Text style={styles.sectionBody}>{service.description}</Text>
      </View>

      {/* Packages (tabs) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Packages</Text>
        {/* Tab bar */}
        {service.tiers.length > 1 && (
          <View style={styles.tierTabBar}>
            {service.tiers.map((tier) => {
              const isActive = selectedTier?.id === tier.id;
              return (
                <Pressable
                  key={tier.id}
                  onPress={() => {
                    setSelectedTierId(tier.id);
                    setOrderError(null);
                    setCheckoutError(null);
                  }}
                  style={[styles.tierTab, isActive && styles.tierTabActive]}
                >
                  <Text style={[styles.tierTabText, isActive && styles.tierTabTextActive]}>
                    {tier.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Selected tier detail */}
        {selectedTier && (
          <View style={styles.tierDetail}>
            <View style={styles.tierPriceRow}>
              <Text style={styles.tierPriceMain}>
                {formatCurrency(selectedTier.price, selectedTier.currency)}
              </Text>
              {selectedTier.priceMax && (
                <Text style={styles.tierPriceRange}>
                  {" "}- {formatCurrency(selectedTier.priceMax, selectedTier.currency)}
                </Text>
              )}
              {selectedTier.pricingType === "per_unit" && (
                <Text style={styles.tierUnit}>/ {unitLabel}</Text>
              )}
            </View>
            {selectedTier.pricingModel && selectedTier.pricingModel !== "fixed" && (
              <View style={styles.tierModelBadge}>
                <Text style={styles.tierModelText}>
                  {selectedTier.pricingModel === "negotiable" ? "Negotiable" : "Market Price"}
                </Text>
              </View>
            )}
            {selectedTier.priceNote && (
              <Text style={styles.tierNote}>{selectedTier.priceNote}</Text>
            )}
            <View style={styles.tierFeatures}>
              <View style={styles.tierFeature}>
                <Ionicons name="time-outline" size={15} color={palette.accent} />
                <Text style={styles.tierFeatureText}>{selectedTier.deliveryDays} day delivery</Text>
              </View>
              <View style={styles.tierFeature}>
                <Ionicons name="refresh-outline" size={15} color={palette.accent} />
                <Text style={styles.tierFeatureText}>{selectedTier.revisionCount} revisions</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Order / Checkout */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order</Text>
        {selectedTier ? (
          <>
            {isPerUnit && (
              <View style={styles.quantityRow}>
                <Text style={styles.metaLabel}>Quantity ({unitLabel})</Text>
                <View style={styles.stepper}>
                  <Pressable
                    disabled={isStartingCheckout || quantity <= 1}
                    onPress={() => setQuantity((v) => Math.max(1, v - 1))}
                    style={[styles.stepperBtn, (isStartingCheckout || quantity <= 1) && styles.btnDisabled]}
                  >
                    <Ionicons name="remove" size={18} color="#ffffff" />
                  </Pressable>
                  <Text style={styles.quantityValue}>{quantity}</Text>
                  <Pressable
                    disabled={isStartingCheckout || quantity >= 99}
                    onPress={() => setQuantity((v) => Math.min(99, v + 1))}
                    style={[styles.stepperBtn, (isStartingCheckout || quantity >= 99) && styles.btnDisabled]}
                  >
                    <Ionicons name="add" size={18} color="#ffffff" />
                  </Pressable>
                </View>
              </View>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.metaLabel}>Estimated total</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(estimatedTotal, selectedTier.currency)}
              </Text>
            </View>

            {orderError ? <Text style={styles.errorText}>{orderError}</Text> : null}

            <Text style={styles.sectionBodySmall}>
              Pay via a trusted provider. Your payment is held in escrow until the job is done.
            </Text>

            {isQuoteOnly ? (
              <>
                <Text style={styles.inlineNote}>
                  This package requires a custom quote. Send an enquiry to discuss pricing and details.
                </Text>
                <Pressable
                  onPress={() => {
                    if (!user) { onOpenSignIn(); return; }
                    setShowInquiry(true);
                  }}
                  style={styles.primaryBtn}
                >
                  <Ionicons name="chatbubble-outline" size={16} color="#ffffff" />
                  <Text style={styles.primaryBtnText}>
                    {user ? "Request a quote" : "Sign in to request a quote"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                {isLoadingPaymentConfig ? (
                  <View style={styles.loadingInline}>
                    <ActivityIndicator color={palette.accent} />
                    <Text style={styles.inlineText}>Loading payment providers...</Text>
                  </View>
                ) : (
                  <View style={styles.providerGrid}>
                    {availableProviderOptions.map((option) => {
                      const isActive = paymentProvider === option.key;
                      return (
                        <Pressable
                          key={option.key}
                          onPress={() => setPaymentProvider(option.key)}
                          style={[styles.providerChip, isActive && styles.providerChipActive]}
                        >
                          <Text style={[styles.providerChipTitle, isActive && styles.providerChipTitleActive]}>
                            {option.label}
                          </Text>
                          <Text style={[styles.providerChipHint, isActive && styles.providerChipHintActive]}>
                            {option.helper}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {showMethodSelector && (
                  <View style={styles.methodRow}>
                    <Pressable
                      onPress={() => setPaymentMethod("mobile_money")}
                      style={[styles.methodChip, paymentMethod === "mobile_money" && styles.methodChipActive]}
                    >
                      <Text style={[styles.methodChipText, paymentMethod === "mobile_money" && styles.methodChipTextActive]}>
                        Mobile money
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPaymentMethod("card")}
                      style={[styles.methodChip, paymentMethod === "card" && styles.methodChipActive]}
                    >
                      <Text style={[styles.methodChipText, paymentMethod === "card" && styles.methodChipTextActive]}>
                        Card
                      </Text>
                    </Pressable>
                  </View>
                )}

                {paymentProvider === "stripe" && <Text style={styles.inlineNote}>Stripe supports card checkout only.</Text>}
                {paymentProvider === "hubtel" && <Text style={styles.inlineNote}>Hubtel uses mobile money and requires a valid phone number.</Text>}
                {paymentProvider === "expresspay" && <Text style={styles.inlineNote}>ExpressPay method is selected on the provider checkout page.</Text>}

                {checkoutError ? <Text style={styles.errorText}>{checkoutError}</Text> : null}

                <Pressable
                  disabled={checkoutDisabled}
                  onPress={() => void startCheckout()}
                  style={[styles.primaryBtn, checkoutDisabled && styles.btnDisabled]}
                >
                  {isStartingCheckout ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed-outline" size={16} color="#ffffff" />
                      <Text style={styles.primaryBtnText}>
                        {user ? "Continue to secure checkout" : "Sign in to continue"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </>
        ) : (
          <Text style={styles.sectionBody}>No package is available for booking.</Text>
        )}
      </View>

      {/* Trust badges */}
      <View style={styles.trustRow}>
        <View style={styles.trustBadge}>
          <Ionicons name="shield-checkmark" size={20} color={palette.accent} />
          <Text style={styles.trustLabel}>Escrow</Text>
          <Text style={styles.trustHint}>Secure</Text>
        </View>
        <View style={styles.trustBadge}>
          <Ionicons name="star" size={20} color="#f59e0b" />
          <Text style={styles.trustLabel}>{providerRatingDisplay ?? "—"}</Text>
          <Text style={styles.trustHint}>Rating</Text>
        </View>
        <View style={styles.trustBadge}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={palette.accentDeep} />
          <Text style={styles.trustLabel}>{reviews.length}</Text>
          <Text style={styles.trustHint}>Reviews</Text>
        </View>
        <View style={styles.trustBadge}>
          <Ionicons name="briefcase-outline" size={20} color={palette.ink} />
          <Text style={styles.trustLabel}>{Math.max(0, providerRatingCount)}</Text>
          <Text style={styles.trustHint}>Jobs</Text>
        </View>
      </View>

      {/* Tags */}
      {service.tags.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <View style={styles.tagWrap}>
            {service.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Reviews section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reviews</Text>

        {reviewsLoading ? (
          <ActivityIndicator color={palette.accent} size="small" />
        ) : reviews.length === 0 ? (
          <View style={styles.emptyReviews}>
            <Ionicons name="chatbubbles-outline" size={36} color="#d1d5db" />
            <Text style={styles.emptyReviewsText}>No reviews yet</Text>
            <Text style={styles.emptyReviewsSub}>Be the first to share feedback.</Text>
          </View>
        ) : (
          <>
            {/* Rating summary */}
            <View style={styles.ratingSummary}>
              <View style={styles.ratingSummaryLeft}>
                <Text style={styles.ratingBig}>{avgRating}</Text>
                <View style={styles.ratingStarsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons
                      key={s}
                      name={s <= Math.round(Number(avgRating)) ? "star" : "star-outline"}
                      size={14}
                      color="#f59e0b"
                    />
                  ))}
                </View>
                <Text style={styles.ratingCountText}>{reviews.length} reviews</Text>
              </View>
              <View style={styles.ratingBars}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = ratingBreakdown[star - 1];
                  const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                  return (
                    <View key={star} style={styles.ratingBarRow}>
                      <Text style={styles.ratingBarLabel}>{star}</Text>
                      <Ionicons name="star" size={10} color="#f59e0b" />
                      <View style={styles.ratingBarTrack}>
                        <View style={[styles.ratingBarFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.ratingBarCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Review cards */}
            {displayedReviews.map((rev) => (
              <View key={rev.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewAuthorRow}>
                    {rev.author?.avatarUrl ? (
                      <Image source={{ uri: rev.author.avatarUrl }} style={styles.reviewAvatar} />
                    ) : (
                      <View style={[styles.reviewAvatar, styles.reviewAvatarPlaceholder]}>
                        <Ionicons name="person" size={12} color="#9ca3af" />
                      </View>
                    )}
                    <Text style={styles.reviewAuthor}>{rev.author?.name ?? "Anonymous"}</Text>
                  </View>
                  <View style={styles.reviewStarsRow}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons
                        key={s}
                        name={s <= rev.rating ? "star" : "star-outline"}
                        size={12}
                        color="#f59e0b"
                      />
                    ))}
                  </View>
                </View>
                <Text style={styles.reviewBody}>{rev.comment}</Text>
                {rev.images && rev.images.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.reviewImagesRow}>
                      {rev.images.map((img, idx) => (
                        <Image key={idx} source={{ uri: img }} style={styles.reviewImage} />
                      ))}
                    </View>
                  </ScrollView>
                )}
                {rev.formattedDate && (
                  <Text style={styles.reviewDate}>{rev.formattedDate}</Text>
                )}
              </View>
            ))}

            {reviews.length > 3 && (
              <Pressable
                onPress={() => setShowAllReviews((v) => !v)}
                style={styles.showAllBtn}
              >
                <Text style={styles.showAllBtnText}>
                  {showAllReviews ? "Show less" : `Show all ${reviews.length} reviews`}
                </Text>
                <Ionicons
                  name={showAllReviews ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={palette.accentDeep}
                />
              </Pressable>
            )}
          </>
        )}
      </View>

      {/* Related services */}
      {relatedServices.length > 0 && (
        <View style={styles.relatedSection}>
          <Text style={styles.relatedTitle}>Related services</Text>
          <FlatList
            horizontal
            data={relatedServices}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.relatedList}
            renderItem={({ item }) => {
              const img =
                item.media.find(
                  (m) => isValidImageUrl(m.signedUrl) || isValidImageUrl(m.url),
                );
              const imgUrl = img?.signedUrl ?? img?.url;
              const price = item.tiers[0]
                ? formatCurrency(item.tiers[0].price, item.tiers[0].currency)
                : null;
              return (
                <Pressable
                  onPress={() => onOpenService?.(item.id)}
                  style={styles.relatedCard}
                >
                  {imgUrl ? (
                    <Image
                      source={{ uri: imgUrl }}
                      style={styles.relatedImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.relatedImage, styles.relatedImagePlaceholder]}>
                      <Ionicons name="image-outline" size={24} color="#d1d5db" />
                    </View>
                  )}
                  <View style={styles.relatedInfo}>
                    <Text style={styles.relatedItemTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {price && (
                      <Text style={styles.relatedPrice}>{price}</Text>
                    )}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      )}

      {/* Inquiry form */}
      <View style={styles.section}>
        <Pressable
          onPress={() => setShowInquiry((v) => !v)}
          style={styles.inquiryHeader}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={palette.accentDeep} />
            <Text style={styles.sectionTitle}>Send inquiry</Text>
          </View>
          <Ionicons name={showInquiry ? "chevron-up" : "chevron-down"} size={18} color={palette.slate} />
        </Pressable>
        <Text style={styles.sectionBodySmall}>
          Get a custom quote from {providerName}. They typically respond within 2 hours.
        </Text>

        {showInquiry && (
          <View style={styles.inquiryForm}>
            <Text style={styles.inquiryLabel}>Event date (optional)</Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={styles.inquiryDateButton}
            >
              <Ionicons name="calendar-outline" size={18} color={inquiryDate ? palette.accentDeep : "#94a3b8"} />
              <Text style={[styles.inquiryDateText, !inquiryDate && { color: "#94a3b8" }]}>
                {inquiryDate
                  ? inquiryDate.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })
                  : "Select a date"}
              </Text>
              {inquiryDate && (
                <Pressable onPress={() => { setInquiryDate(null); setInquiryError(null); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </Pressable>
              )}
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={inquiryDate ?? new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "calendar"}
                minimumDate={new Date()}
                onChange={(_, selectedDate) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (selectedDate) {
                    setInquiryDate(selectedDate);
                    setInquiryError(null);
                  }
                }}
              />
            )}

            <Text style={styles.inquiryLabel}>Quantity (optional)</Text>
            <View style={styles.inquiryRow}>
              <View style={styles.inquiryQtyTypeRow}>
                {(["guests", "items"] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setInquiryQtyType(t)}
                    style={[styles.inquiryQtyChip, inquiryQtyType === t && styles.inquiryQtyChipActive]}
                  >
                    <Ionicons name={t === "guests" ? "people-outline" : "cube-outline"} size={14} color={inquiryQtyType === t ? "#fff" : palette.ink} />
                    <Text style={[styles.inquiryQtyChipText, inquiryQtyType === t && styles.inquiryQtyChipTextActive]}>
                      {t === "guests" ? "Guests" : "Items"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={[styles.inquiryInput, { flex: 1 }]}
                placeholder="Qty"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={inquiryQty}
                onChangeText={(t) => { setInquiryQty(t); setInquiryError(null); }}
              />
            </View>

            <Text style={styles.inquiryLabel}>Event location (optional)</Text>
            <View style={styles.locationInputWrap}>
              <Ionicons name="location-outline" size={18} color="#94a3b8" style={{ marginLeft: 12 }} />
              <TextInput
                style={styles.locationInput}
                placeholder="Search address — e.g. Tema, Teshie, Accra"
                placeholderTextColor="#94a3b8"
                maxLength={200}
                value={inquiryLocation}
                onChangeText={(text) => {
                  setInquiryLocation(text);
                  setInquiryError(null);
                  if (locationSearchTimer.current) clearTimeout(locationSearchTimer.current);
                  if (text.trim().length < 3) { setLocationSuggestions([]); setShowSuggestions(false); return; }
                  locationSearchTimer.current = setTimeout(async () => {
                    try {
                      const res = await fetch(
                        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&countrycodes=gh&limit=5&addressdetails=1`,
                        { headers: { "User-Agent": "ServfixMobileApp/1.0" } },
                      );
                      const data = await res.json();
                      setLocationSuggestions(data);
                      setShowSuggestions(data.length > 0);
                    } catch { setLocationSuggestions([]); }
                  }, 400);
                }}
                onFocus={() => { if (locationSuggestions.length > 0) setShowSuggestions(true); }}
              />
              {inquiryLocation.length > 0 && (
                <Pressable
                  onPress={() => { setInquiryLocation(""); setInquiryLocationCoords(null); setLocationSuggestions([]); setShowSuggestions(false); }}
                  hitSlop={8}
                  style={{ marginRight: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </Pressable>
              )}
            </View>
            {showSuggestions && locationSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {locationSuggestions.map((item, idx) => (
                  <Pressable
                    key={`${item.lat}-${item.lon}-${idx}`}
                    style={[styles.suggestionRow, idx === locationSuggestions.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => {
                      const lat = parseFloat(item.lat);
                      const lng = parseFloat(item.lon);
                      setInquiryLocation(item.display_name);
                      setInquiryLocationCoords({ latitude: lat, longitude: lng });
                      setShowSuggestions(false);
                      setShowLocationMap(true);
                    }}
                  >
                    <Ionicons name="location" size={16} color={palette.accentDeep} />
                    <Text numberOfLines={2} style={styles.suggestionText}>{item.display_name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable
              onPress={() => setShowLocationMap((v) => !v)}
              style={styles.mapToggleBtn}
            >
              <Ionicons name="map-outline" size={16} color={palette.accentDeep} />
              <Text style={styles.mapToggleText}>
                {showLocationMap ? "Hide map" : "Show on map"}
              </Text>
            </Pressable>
            {showLocationMap && (
              <View style={styles.mapContainer}>
                <WebView
                  style={styles.map}
                  originWhitelist={["*"]}
                  javaScriptEnabled
                  onMessage={(event) => {
                    try {
                      const { lat, lng, address } = JSON.parse(event.nativeEvent.data);
                      setInquiryLocationCoords({ latitude: lat, longitude: lng });
                      if (address) setInquiryLocation(address);
                      else setInquiryLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                      setInquiryError(null);
                    } catch {}
                  }}
                  source={{ html: `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%}</style>
</head><body>
<div id="map"></div>
<script>
var map=L.map('map').setView([${inquiryLocationCoords?.latitude ?? 5.6037},${inquiryLocationCoords?.longitude ?? -0.187}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'OSM'}).addTo(map);
var marker=${inquiryLocationCoords ? `L.marker([${inquiryLocationCoords.latitude},${inquiryLocationCoords.longitude}]).addTo(map)` : 'null'};
map.on('click',function(e){
  if(marker)map.removeLayer(marker);
  marker=L.marker([e.latlng.lat,e.latlng.lng]).addTo(map);
  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+e.latlng.lat+'&lon='+e.latlng.lng)
    .then(function(r){return r.json()})
    .then(function(d){window.ReactNativeWebView.postMessage(JSON.stringify({lat:e.latlng.lat,lng:e.latlng.lng,address:d.display_name||''}))})
    .catch(function(){window.ReactNativeWebView.postMessage(JSON.stringify({lat:e.latlng.lat,lng:e.latlng.lng}))});
});
</script></body></html>` }}
                />
                <Text style={styles.mapHint}>Tap the map to pick a location</Text>
              </View>
            )}

            <Text style={styles.inquiryLabel}>Your requirements *</Text>
            <TextInput
              style={[styles.inquiryInput, styles.inquiryTextarea]}
              placeholder="Describe your event and requirements..."
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={500}
              value={inquiryMessage}
              onChangeText={(t) => { setInquiryMessage(t); setInquiryError(null); }}
            />
            <Text style={styles.inquiryCharCount}>{inquiryMessage.length}/500</Text>

            {inquiryError && <Text style={styles.errorText}>{inquiryError}</Text>}

            {inquirySent ? (
              <View style={styles.successCard}>
                <Ionicons name="checkmark-circle" size={22} color={palette.accent} />
                <Text style={styles.successTitle}>Inquiry sent successfully!</Text>
              </View>
            ) : (
              <Pressable
                disabled={inquirySending}
                onPress={() => void handleSendInquiry()}
                style={[styles.primaryBtn, inquirySending && styles.btnDisabled]}
              >
                {inquirySending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={16} color="#ffffff" />
                    <Text style={styles.primaryBtnText}>Send inquiry</Text>
                  </>
                )}
              </Pressable>
            )}

            <Text style={styles.inquirySafety}>
              All communication stays within SERVFIX for your safety.
            </Text>
          </View>
        )}
      </View>

      {/* Report */}
      {onReport && user && (
        <Pressable
          onPress={() => onReport("service", service.id, service.title)}
          style={styles.reportRow}
        >
          <Ionicons name="flag-outline" size={16} color={palette.danger} />
          <Text style={styles.reportText}>Report this service</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  content: { gap: 14, paddingBottom: 100 },
  stateWrap: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 20 },
  stateText: { color: palette.slate, fontSize: 14, lineHeight: 20, textAlign: "center" },
  errorTitle: { color: palette.danger, fontSize: 18, fontWeight: "700" },
  retryButton: { backgroundColor: palette.accentDeep, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  retryButtonText: { color: "#ffffff", fontWeight: "700" },

  // Gallery
  gallerySection: { gap: 10 },
  mainImageWrap: { borderRadius: 0, overflow: "hidden", position: "relative" },
  mainImage: { width: "100%", height: "100%" },
  imagePlaceholder: { width: "100%", height: "100%", backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  imageCounter: {
    position: "absolute", bottom: 10, right: 10,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  imageCounterText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  galleryArrow: {
    position: "absolute", top: "50%", marginTop: -18,
    backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 20,
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
  },
  galleryArrowLeft: { left: 10 },
  galleryArrowRight: { right: 10 },
  thumbRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20 },
  thumb: { borderRadius: 8, borderWidth: 2, borderColor: "transparent", overflow: "hidden" },
  thumbActive: { borderColor: palette.accentDeep },
  thumbImage: { width: 56, height: 42 },

  // Title section
  titleSection: { paddingHorizontal: 20, gap: 8 },
  titleTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  categoryPill: {
    backgroundColor: palette.accentSoft, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  categoryPillText: { color: palette.accentDeep, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  remoteBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#ecfdf5", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  remoteBadgeText: { color: palette.accent, fontSize: 11, fontWeight: "700" },
  title: { color: palette.ink, fontSize: 24, fontWeight: "800", lineHeight: 30 },
  titleMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaItemText: { color: palette.slate, fontSize: 13 },
  metaItemTextBold: { color: palette.ink, fontSize: 13, fontWeight: "700" },

  // Provider card
  providerCard: {
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 18,
    borderWidth: 1, flexDirection: "row", alignItems: "center",
    marginHorizontal: 20, padding: 14, gap: 12,
  },
  providerLeft: { flex: 1, flexDirection: "row", gap: 12, alignItems: "center" },
  providerAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: palette.accentSoft },
  providerAvatarPlaceholder: { backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  providerInfo: { flex: 1, gap: 3 },
  providerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  providerName: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  providerMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  providerMetaText: { color: palette.slate, fontSize: 12 },
  providerStats: { flexDirection: "row", gap: 12, marginTop: 2 },
  providerStat: { flexDirection: "row", alignItems: "center", gap: 3 },
  providerStatText: { color: palette.slate, fontSize: 11, fontWeight: "600" },
  viewProfileBtn: {
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: palette.accentSoft, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  viewProfileText: { color: palette.accentDeep, fontSize: 12, fontWeight: "700" },

  // Sections
  section: {
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 22,
    borderWidth: 1, gap: 12, padding: 18, marginHorizontal: 20,
  },
  sectionTitle: { color: palette.ink, fontSize: 17, fontWeight: "700" },
  subsectionTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  sectionBody: { color: palette.slate, fontSize: 14, lineHeight: 22 },
  sectionBodySmall: { color: palette.slate, fontSize: 13, lineHeight: 19 },

  // Tier tabs
  tierTabBar: {
    flexDirection: "row", backgroundColor: "#f1f5f9", borderRadius: 12,
    padding: 3, gap: 2,
  },
  tierTab: { flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 10 },
  tierTabActive: { backgroundColor: "#ffffff", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tierTabText: { color: palette.slate, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  tierTabTextActive: { color: palette.ink, fontWeight: "700" },
  tierDetail: { gap: 8 },
  tierPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  tierPriceMain: { color: palette.ink, fontSize: 28, fontWeight: "900" },
  tierPriceRange: { color: palette.slate, fontSize: 18, fontWeight: "700" },
  tierUnit: { color: palette.slate, fontSize: 14 },
  tierModelBadge: { alignSelf: "flex-start", backgroundColor: "#fef3c7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tierModelText: { color: "#b45309", fontSize: 11, fontWeight: "700" },
  tierNote: { color: palette.slate, fontSize: 12, fontStyle: "italic" },
  tierFeatures: { flexDirection: "row", gap: 16, marginTop: 2 },
  tierFeature: { flexDirection: "row", alignItems: "center", gap: 5 },
  tierFeatureText: { color: palette.ink, fontSize: 13, fontWeight: "600" },

  // Order section
  quantityRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { color: palette.slate, fontSize: 12, fontWeight: "700", letterSpacing: 0.2, textTransform: "uppercase" },
  stepper: { alignItems: "center", flexDirection: "row", gap: 10 },
  stepperBtn: {
    alignItems: "center", backgroundColor: palette.accentDeep, borderRadius: 999,
    height: 32, justifyContent: "center", width: 32,
  },
  quantityValue: { color: palette.ink, fontSize: 16, fontWeight: "700", minWidth: 18, textAlign: "center" },
  totalRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  totalValue: { color: palette.accent, fontSize: 20, fontWeight: "800" },
  primaryBtn: {
    alignItems: "center", backgroundColor: palette.accent, borderRadius: 14,
    flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 50, paddingHorizontal: 14,
  },
  primaryBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    alignItems: "center", backgroundColor: palette.accentDeep, borderRadius: 14,
    flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 50, paddingHorizontal: 14,
  },
  secondaryBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
  errorText: { color: palette.danger, fontSize: 13, fontWeight: "600" },
  successCard: {
    backgroundColor: palette.accentSoft, borderRadius: 14, flexDirection: "row",
    alignItems: "center", gap: 10, padding: 14,
  },
  successTitle: { color: palette.accent, fontSize: 14, fontWeight: "700" },
  successBody: { color: "#115e59", fontSize: 13 },
  viewOrdersBtn: {
    backgroundColor: palette.accentDeep, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  viewOrdersBtnText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  divider: { backgroundColor: palette.line, height: 1, marginVertical: 2 },
  loadingInline: { alignItems: "center", flexDirection: "row", gap: 8 },
  inlineText: { color: palette.slate, fontSize: 13 },
  inlineNote: { color: palette.slate, fontSize: 12, lineHeight: 18 },

  // Payment provider/method chips
  providerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  providerChip: {
    backgroundColor: "#ffffff", borderColor: palette.line, borderRadius: 12,
    borderWidth: 1, gap: 2, minWidth: "47%", paddingHorizontal: 10, paddingVertical: 10, flex: 1,
  },
  providerChipActive: { backgroundColor: "#ecfeff", borderColor: palette.accent },
  providerChipTitle: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  providerChipTitleActive: { color: palette.accent },
  providerChipHint: { color: palette.slate, fontSize: 11 },
  providerChipHintActive: { color: palette.accent },
  methodRow: { flexDirection: "row", gap: 8 },
  methodChip: {
    backgroundColor: "#ffffff", borderColor: palette.line, borderRadius: 12,
    borderWidth: 1, flex: 1, alignItems: "center", paddingVertical: 10,
  },
  methodChipActive: { backgroundColor: palette.accentDeep, borderColor: palette.accentDeep },
  methodChipText: { color: palette.slate, fontSize: 12, fontWeight: "700" },
  methodChipTextActive: { color: "#ffffff" },

  // Trust badges
  trustRow: {
    flexDirection: "row", gap: 8, marginHorizontal: 20,
  },
  trustBadge: {
    flex: 1, alignItems: "center", gap: 4,
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16,
    borderWidth: 1, paddingVertical: 14,
  },
  trustLabel: { color: palette.ink, fontSize: 15, fontWeight: "800" },
  trustHint: { color: palette.slate, fontSize: 11, fontWeight: "600" },

  // Tags
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: palette.goldSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tagText: { color: palette.gold, fontSize: 12, fontWeight: "700" },

  // Reviews
  emptyReviews: {
    alignItems: "center", gap: 6, paddingVertical: 20,
    borderWidth: 1, borderColor: palette.line, borderRadius: 14, borderStyle: "dashed",
  },
  emptyReviewsText: { color: palette.slate, fontSize: 14, fontWeight: "600" },
  emptyReviewsSub: { color: palette.slate, fontSize: 12 },
  ratingSummary: { flexDirection: "row", gap: 20, alignItems: "center" },
  ratingSummaryLeft: { alignItems: "center", gap: 4 },
  ratingBig: { color: palette.ink, fontSize: 40, fontWeight: "900" },
  ratingStarsRow: { flexDirection: "row", gap: 2 },
  ratingCountText: { color: palette.slate, fontSize: 12, fontWeight: "600" },
  ratingBars: { flex: 1, gap: 4 },
  ratingBarRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingBarLabel: { color: palette.slate, fontSize: 11, fontWeight: "700", width: 10, textAlign: "right" },
  ratingBarTrack: { flex: 1, height: 8, backgroundColor: "#f1f5f9", borderRadius: 4, overflow: "hidden" },
  ratingBarFill: { height: "100%", backgroundColor: "#f59e0b", borderRadius: 4 },
  ratingBarCount: { color: palette.slate, fontSize: 11, fontWeight: "600", width: 20 },
  reviewCard: { backgroundColor: palette.mist, borderRadius: 14, gap: 6, padding: 12 },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewAuthorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reviewAvatar: { width: 28, height: 28, borderRadius: 14 },
  reviewAvatarPlaceholder: { backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  reviewAuthor: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  reviewStarsRow: { flexDirection: "row", gap: 1 },
  reviewBody: { color: palette.slate, fontSize: 13, lineHeight: 19 },
  reviewImagesRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  reviewImage: { width: 60, height: 60, borderRadius: 8 },
  reviewDate: { color: palette.slate, fontSize: 11 },
  showAllBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: palette.line, borderRadius: 12, paddingVertical: 10,
  },
  showAllBtnText: { color: palette.accentDeep, fontSize: 13, fontWeight: "700" },

  // Action buttons (share + wishlist)
  actionBtns: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.mist, alignItems: "center", justifyContent: "center",
  },

  // Related services
  relatedSection: { gap: 12, marginHorizontal: 20 },
  relatedTitle: { color: palette.ink, fontSize: 17, fontWeight: "700" },
  relatedList: { gap: 12 },
  relatedCard: {
    width: 150, backgroundColor: palette.card, borderColor: palette.line,
    borderRadius: 14, borderWidth: 1, overflow: "hidden",
  },
  relatedImage: { width: "100%", height: 100 },
  relatedImagePlaceholder: {
    backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center",
  },
  relatedInfo: { padding: 10, gap: 4 },
  relatedItemTitle: { color: palette.ink, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  relatedPrice: { color: palette.accent, fontSize: 13, fontWeight: "800" },

  // Report
  reportRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
  },
  reportText: { color: palette.danger, fontSize: 13, fontWeight: "600" },

  // Inquiry form
  inquiryHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  inquiryForm: { gap: 10 },
  inquiryLabel: { color: palette.ink, fontSize: 13, fontWeight: "700", marginTop: 2 },
  inquiryInput: {
    backgroundColor: "#ffffff", borderColor: palette.line, borderRadius: 12,
    borderWidth: 1, color: palette.ink, fontSize: 14,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  inquiryTextarea: { minHeight: 90, textAlignVertical: "top" },
  inquiryRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  inquiryQtyTypeRow: { flexDirection: "row", gap: 6 },
  inquiryQtyChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 10,
    borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8,
  },
  inquiryQtyChipActive: { backgroundColor: palette.accentDeep, borderColor: palette.accentDeep },
  inquiryQtyChipText: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  inquiryQtyChipTextActive: { color: "#ffffff" },
  inquiryCharCount: { color: palette.slate, fontSize: 11, textAlign: "right" },
  inquirySafety: { color: palette.slate, fontSize: 11, textAlign: "center", marginTop: 4 },
  inquiryDateButton: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#ffffff", borderColor: palette.line, borderRadius: 12,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12,
  },
  inquiryDateText: { flex: 1, color: palette.ink, fontSize: 14 },
  locationInputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#ffffff", borderColor: palette.line, borderRadius: 12,
    borderWidth: 1, overflow: "hidden",
  },
  locationInput: {
    flex: 1, color: palette.ink, fontSize: 14,
    paddingHorizontal: 8, paddingVertical: 10,
  },
  suggestionsContainer: {
    backgroundColor: "#ffffff", borderColor: palette.line, borderRadius: 12,
    borderWidth: 1, overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 11,
    borderBottomColor: palette.line, borderBottomWidth: 1,
  },
  suggestionText: { flex: 1, color: palette.ink, fontSize: 13, lineHeight: 18 },
  mapToggleBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    paddingVertical: 4,
  },
  mapToggleText: { color: palette.accentDeep, fontSize: 13, fontWeight: "600" },
  mapContainer: { borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: palette.line },
  map: { width: "100%", height: 200 },
  mapHint: { color: palette.slate, fontSize: 11, textAlign: "center", paddingVertical: 6, backgroundColor: "#f8fafc" },
}));
