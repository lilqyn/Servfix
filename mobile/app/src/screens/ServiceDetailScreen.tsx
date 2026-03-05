import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  createOrder,
  createPaymentCheckout,
  fetchPublicSettings,
  fetchService,
} from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { palette } from "../theme";
import type { CheckoutMethod, CheckoutProvider, Service } from "../types";

type Props = {
  serviceId: string;
  onOpenSignIn: () => void;
  onOpenOrders: () => void;
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

const toNumber = (value: string | number | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatCurrency = (amount: string | number, currency: "GHS" | "USD" | "EUR") => {
  const numeric = toNumber(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(numeric);
};

const isProviderCurrencySupported = (
  provider: CheckoutProvider,
  currency: "GHS" | "USD" | "EUR",
) => {
  if (provider === "hubtel" || provider === "expresspay") {
    return currency === "GHS";
  }
  return true;
};

export function ServiceDetailScreen({ serviceId, onOpenSignIn, onOpenOrders }: Props) {
  const { user } = useAuth();
  const [service, setService] = useState<Service | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [enabledProviders, setEnabledProviders] = useState<CheckoutProvider[]>(["flutterwave"]);
  const [paymentProvider, setPaymentProvider] = useState<CheckoutProvider>("flutterwave");
  const [paymentMethod, setPaymentMethod] = useState<CheckoutMethod>("mobile_money");
  const [isLoadingPaymentConfig, setIsLoadingPaymentConfig] = useState(true);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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
      setCreatedOrderId(null);
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

  useEffect(() => {
    void loadService();
  }, [loadService]);

  useEffect(() => {
    void loadPaymentSettings();
  }, []);

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
    () =>
      enabledProviders.filter((provider) =>
        isProviderCurrencySupported(provider, checkoutCurrency),
      ),
    [enabledProviders, checkoutCurrency],
  );

  const availableProviderOptions = useMemo(
    () => PROVIDER_OPTIONS.filter((option) => supportedProviders.includes(option.key)),
    [supportedProviders],
  );

  useEffect(() => {
    if (!selectedTier || selectedTier.pricingType !== "per_unit") {
      setQuantity(1);
    }
  }, [selectedTier]);

  useEffect(() => {
    if (availableProviderOptions.length === 0) {
      return;
    }
    if (!availableProviderOptions.some((option) => option.key === paymentProvider)) {
      setPaymentProvider(availableProviderOptions[0].key);
    }
  }, [availableProviderOptions, paymentProvider]);

  useEffect(() => {
    if (paymentProvider === "stripe") {
      setPaymentMethod("card");
      return;
    }
    if (paymentProvider === "hubtel") {
      setPaymentMethod("mobile_money");
    }
  }, [paymentProvider]);

  const submitOrder = async () => {
    if (!service || !selectedTier) {
      return;
    }

    if (!user) {
      onOpenSignIn();
      return;
    }

    if (isQuoteOnly) {
      setOrderError("This package requires a quote. Please request this on the web app.");
      return;
    }

    setIsCreatingOrder(true);
    setOrderError(null);
    setCreatedOrderId(null);

    try {
      const order = await createOrder({
        serviceId: service.id,
        tierId: selectedTier.id,
        quantity: isPerUnit ? normalizedQuantity : undefined,
      });
      setCreatedOrderId(order.id);
      setOrderError(null);
    } catch (nextError) {
      setOrderError(nextError instanceof Error ? nextError.message : "Unable to create order.");
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const startCheckout = async () => {
    if (!service || !selectedTier) {
      return;
    }

    if (!user) {
      onOpenSignIn();
      return;
    }

    if (isQuoteOnly) {
      setCheckoutError("This package requires a quote. Please request this on the web app.");
      return;
    }

    if (availableProviderOptions.length === 0) {
      setCheckoutError(`No payment provider is enabled for ${checkoutCurrency}.`);
      return;
    }

    setIsStartingCheckout(true);
    setCheckoutError(null);

    try {
      const method =
        paymentProvider === "stripe"
          ? "card"
          : paymentProvider === "hubtel"
            ? "mobile_money"
            : paymentProvider === "expresspay"
              ? undefined
              : paymentMethod;

      const checkout = await createPaymentCheckout({
        provider: paymentProvider,
        method,
        returnTo: "mobile",
        items: [
          {
            serviceId: service.id,
            tierId: selectedTier.id,
            quantity: isPerUnit ? normalizedQuantity : 1,
          },
        ],
      });

      const canOpen = await Linking.canOpenURL(checkout.checkoutUrl);
      if (!canOpen) {
        throw new Error("Unable to open checkout URL on this device.");
      }
      await Linking.openURL(checkout.checkoutUrl);
    } catch (nextError) {
      setCheckoutError(nextError instanceof Error ? nextError.message : "Unable to start checkout.");
    } finally {
      setIsStartingCheckout(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.stateText}>Loading service...</Text>
      </View>
    );
  }

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

  const providerName =
    service.provider.providerProfile?.displayName || service.provider.username || "Provider";
  const showMethodSelector = paymentProvider === "flutterwave" || paymentProvider === "paystack";
  const checkoutDisabled =
    isStartingCheckout ||
    isLoadingPaymentConfig ||
    (Boolean(user) && (isQuoteOnly || availableProviderOptions.length === 0));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryPillText}>{service.category}</Text>
        </View>
        <Text style={styles.title}>{service.title}</Text>
        <Text style={styles.subtitle}>
          {service.isRemote ? "Remote" : service.locationCity || "On-site"} by {providerName}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About this service</Text>
        <Text style={styles.sectionBody}>{service.description}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Packages</Text>
        {service.tiers.map((tier) => (
          <Pressable
            key={tier.id}
            onPress={() => {
              setSelectedTierId(tier.id);
              setOrderError(null);
              setCreatedOrderId(null);
              setCheckoutError(null);
            }}
            style={[styles.tierCard, selectedTier?.id === tier.id && styles.tierCardSelected]}
          >
            <View style={styles.tierHeader}>
              <Text style={styles.tierName}>{tier.name}</Text>
              <Text style={styles.tierPrice}>{formatCurrency(tier.price, tier.currency)}</Text>
            </View>
            <Text style={styles.tierMeta}>
              {tier.deliveryDays} day delivery - {tier.revisionCount} revisions
            </Text>
            <Text style={styles.tierMeta}>
              {tier.pricingType === "per_unit" ? `Per ${tier.unitLabel || "unit"}` : "Fixed package"}
              {tier.pricingModel && tier.pricingModel !== "fixed" ? " - quote required" : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order request</Text>
        {selectedTier ? (
          <>
            <Text style={styles.sectionBody}>
              Selected: {selectedTier.name} ({formatCurrency(selectedTier.price, selectedTier.currency)})
            </Text>

            {isPerUnit ? (
              <View style={styles.quantityRow}>
                <Text style={styles.metaLabel}>Quantity ({unitLabel})</Text>
                <View style={styles.stepper}>
                  <Pressable
                    disabled={isCreatingOrder || quantity <= 1}
                    onPress={() => setQuantity((value) => Math.max(1, value - 1))}
                    style={[styles.stepperButton, (isCreatingOrder || quantity <= 1) && styles.buttonDisabled]}
                  >
                    <Text style={styles.stepperButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.quantityValue}>{quantity}</Text>
                  <Pressable
                    disabled={isCreatingOrder || quantity >= 99}
                    onPress={() => setQuantity((value) => Math.min(99, value + 1))}
                    style={[styles.stepperButton, (isCreatingOrder || quantity >= 99) && styles.buttonDisabled]}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.totalRow}>
              <Text style={styles.metaLabel}>Estimated total</Text>
              <Text style={styles.totalValue}>{formatCurrency(estimatedTotal, selectedTier.currency)}</Text>
            </View>

            {orderError ? <Text style={styles.errorText}>{orderError}</Text> : null}

            {createdOrderId ? (
              <View style={styles.successCard}>
                <Text style={styles.successTitle}>Order request created</Text>
                <Text style={styles.successBody}>Order ID: {createdOrderId}</Text>
                <Pressable onPress={onOpenOrders} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>View orders</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                disabled={isCreatingOrder}
                onPress={() => void submitOrder()}
                style={[styles.primaryButton, isCreatingOrder && styles.buttonDisabled]}
              >
                {isCreatingOrder ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {user
                      ? isQuoteOnly
                        ? "Quote required (web)"
                        : "Create order request"
                      : "Sign in to order"}
                  </Text>
                )}
              </Pressable>
            )}

            <View style={styles.checkoutDivider} />

            <Text style={styles.subsectionTitle}>Secure checkout handoff</Text>
            <Text style={styles.sectionBody}>
              Continue to payment provider checkout. This creates payment-pending order(s) in escrow.
            </Text>

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

            {showMethodSelector ? (
              <View style={styles.methodRow}>
                <Pressable
                  onPress={() => setPaymentMethod("mobile_money")}
                  style={[
                    styles.methodChip,
                    paymentMethod === "mobile_money" && styles.methodChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.methodChipText,
                      paymentMethod === "mobile_money" && styles.methodChipTextActive,
                    ]}
                  >
                    Mobile money
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPaymentMethod("card")}
                  style={[styles.methodChip, paymentMethod === "card" && styles.methodChipActive]}
                >
                  <Text
                    style={[
                      styles.methodChipText,
                      paymentMethod === "card" && styles.methodChipTextActive,
                    ]}
                  >
                    Card
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {paymentProvider === "stripe" ? (
              <Text style={styles.inlineNote}>Stripe supports card checkout only.</Text>
            ) : null}
            {paymentProvider === "hubtel" ? (
              <Text style={styles.inlineNote}>
                Hubtel uses mobile money and requires a valid phone number on your account.
              </Text>
            ) : null}
            {paymentProvider === "expresspay" ? (
              <Text style={styles.inlineNote}>
                ExpressPay method is selected on the provider checkout page.
              </Text>
            ) : null}
            {checkoutCurrency !== "GHS" && (enabledProviders.includes("hubtel") || enabledProviders.includes("expresspay")) ? (
              <Text style={styles.inlineNote}>Hubtel and ExpressPay are available for GHS only.</Text>
            ) : null}

            {checkoutError ? <Text style={styles.errorText}>{checkoutError}</Text> : null}

            <Pressable
              disabled={checkoutDisabled}
              onPress={() => void startCheckout()}
              style={[styles.secondaryButton, checkoutDisabled && styles.buttonDisabled]}
            >
              {isStartingCheckout ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.secondaryButtonText}>
                  {user
                    ? isQuoteOnly
                      ? "Quote required (web)"
                      : "Continue to secure checkout"
                    : "Sign in to continue"}
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <Text style={styles.sectionBody}>No package is available for booking.</Text>
        )}
      </View>

      {service.tags.length > 0 ? (
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
      ) : null}

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Booking flow</Text>
        <Text style={styles.noticeBody}>
          Mobile now supports both order request creation and direct checkout handoff to existing
          payment providers.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 20,
    paddingBottom: 80,
  },
  stateWrap: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 20,
  },
  stateText: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  errorTitle: {
    color: palette.danger,
    fontSize: 18,
    fontWeight: "700",
  },
  retryButton: {
    backgroundColor: palette.ink,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  hero: {
    backgroundColor: palette.ink,
    borderRadius: 26,
    gap: 10,
    padding: 22,
  },
  categoryPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  categoryPillText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 32,
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  subsectionTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionBody: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 22,
  },
  tierCard: {
    backgroundColor: palette.mist,
    borderColor: "transparent",
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  tierCardSelected: {
    borderColor: palette.accent,
    backgroundColor: "#ecfeff",
  },
  tierHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tierName: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  tierPrice: {
    color: palette.gold,
    fontSize: 14,
    fontWeight: "700",
  },
  tierMeta: {
    color: palette.slate,
    fontSize: 13,
  },
  quantityRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaLabel: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  stepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  stepperButton: {
    alignItems: "center",
    backgroundColor: palette.ink,
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  stepperButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },
  quantityValue: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "700",
    minWidth: 18,
    textAlign: "center",
  },
  totalRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalValue: {
    color: palette.accent,
    fontSize: 18,
    fontWeight: "800",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: palette.ink,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  checkoutDivider: {
    backgroundColor: palette.line,
    height: 1,
    marginVertical: 2,
  },
  providerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  providerChip: {
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    minWidth: "47%",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  providerChipActive: {
    backgroundColor: "#ecfeff",
    borderColor: palette.accent,
  },
  providerChipTitle: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  providerChipTitleActive: {
    color: palette.accent,
  },
  providerChipHint: {
    color: palette.slate,
    fontSize: 11,
  },
  providerChipHintActive: {
    color: palette.accent,
  },
  methodRow: {
    flexDirection: "row",
    gap: 8,
  },
  methodChip: {
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  methodChipActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  methodChipText: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
  },
  methodChipTextActive: {
    color: "#ffffff",
  },
  loadingInline: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  inlineText: {
    color: palette.slate,
    fontSize: 13,
  },
  inlineNote: {
    color: palette.slate,
    fontSize: 12,
    lineHeight: 18,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  successCard: {
    backgroundColor: palette.accentSoft,
    borderRadius: 14,
    gap: 8,
    padding: 14,
  },
  successTitle: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: "700",
  },
  successBody: {
    color: "#115e59",
    fontSize: 13,
    lineHeight: 18,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    backgroundColor: palette.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: palette.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  noticeCard: {
    backgroundColor: palette.accentSoft,
    borderRadius: 20,
    gap: 6,
    padding: 18,
  },
  noticeTitle: {
    color: palette.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  noticeBody: {
    color: "#115e59",
    fontSize: 14,
    lineHeight: 20,
  },
});
