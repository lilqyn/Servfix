import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { createPaymentCheckout, fetchPublicSettings } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { formatCurrency } from "../lib/format";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { CheckoutMethod, CheckoutProvider } from "../types";

// ─── Cart item type ──────────────────────────────────────────────────────────

export type CartItem = {
  id: string;
  serviceId: string;
  title: string;
  category: string;
  image?: string;
  packageName: string;
  tierId: string;
  price: number;
  currency: string;
  pricingType?: "flat" | "per_unit";
  unitLabel?: string;
  quantity: number;
  eventDate?: string;
  notes?: string;
};

// ─── AsyncStorage helpers ────────────────────────────────────────────────────

const CART_KEY = "servfix-cart";

export async function getCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

export async function addToCart(item: CartItem): Promise<CartItem[]> {
  const cart = await getCart();
  const existingIndex = cart.findIndex((c) => c.id === item.id);
  if (existingIndex >= 0) {
    cart[existingIndex] = { ...cart[existingIndex], ...item };
  } else {
    cart.push(item);
  }
  await AsyncStorage.setItem(CART_KEY, JSON.stringify(cart));
  return cart;
}

export async function removeFromCart(id: string): Promise<CartItem[]> {
  const cart = await getCart();
  const next = cart.filter((c) => c.id !== id);
  await AsyncStorage.setItem(CART_KEY, JSON.stringify(next));
  return next;
}

export async function clearCart(): Promise<void> {
  await AsyncStorage.removeItem(CART_KEY);
}

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
  onOpenBrowse: () => void;
  onBack: () => void;
  onOpenSignIn: () => void;
};

// ─── Constants ───────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: "Cart",
  2: "Details",
  3: "Payment",
};

const PROVIDER_LABELS: Record<CheckoutProvider, string> = {
  flutterwave: "Flutterwave",
  paystack: "Paystack",
  stripe: "Stripe",
  hubtel: "Hubtel",
  expresspay: "ExpressPay",
};

const PROVIDER_ICONS: Record<CheckoutProvider, string> = {
  flutterwave: "flash-outline",
  paystack: "layers-outline",
  stripe: "card-outline",
  hubtel: "phone-portrait-outline",
  expresspay: "rocket-outline",
};

const METHOD_OPTIONS: { key: CheckoutMethod; label: string; icon: string }[] = [
  { key: "mobile_money", label: "Mobile Money", icon: "phone-portrait-outline" },
  { key: "card", label: "Card", icon: "card-outline" },
];

const providerSupportsMethodChoice = (provider: CheckoutProvider) =>
  provider === "flutterwave" || provider === "paystack";

// ─── Helpers ─────────────────────────────────────────────────────────────────


// ─── Component ───────────────────────────────────────────────────────────────

export function CartScreen({ onOpenBrowse, onBack, onOpenSignIn }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment state
  const [enabledProviders, setEnabledProviders] = useState<CheckoutProvider[]>(["flutterwave"]);
  const [selectedProvider, setSelectedProvider] = useState<CheckoutProvider>("flutterwave");
  const [selectedMethod, setSelectedMethod] = useState<CheckoutMethod>("mobile_money");

  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Load cart + payment settings
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const items = await getCart();
        if (!isMounted.current) return;
        setCart(items);

        const settings = await fetchPublicSettings();
        if (!isMounted.current) return;
        setEnabledProviders(settings.payments.enabledProviders);
        setSelectedProvider(settings.payments.defaultProvider);
      } catch {
        // keep defaults
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    };
    void load();
  }, []);

  const persistCart = useCallback(async (items: CartItem[]) => {
    setCart(items);
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  }, []);

  const handleRemoveItem = useCallback(
    async (id: string) => {
      const next = cart.filter((c) => c.id !== id);
      await persistCart(next);
    },
    [cart, persistCart],
  );

  const handleUpdateItemField = useCallback(
    (id: string, field: "eventDate" | "notes", value: string) => {
      setCart((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
      );
    },
    [],
  );

  const saveDetailsToStorage = useCallback(async () => {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const currency = cart.length > 0 ? cart[0].currency : "GHS";

  const canProceedStep1 = cart.length > 0;
  const canProceedStep2 = true; // details are optional
  const canProceedStep3 = !!user;

  const goNext = useCallback(async () => {
    if (step === 1 && canProceedStep1) {
      setStep(2);
    } else if (step === 2) {
      await saveDetailsToStorage();
      setStep(3);
    }
  }, [step, canProceedStep1, saveDetailsToStorage]);

  const goBack = useCallback(() => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else onBack();
  }, [step, onBack]);

  const handleCompleteOrder = useCallback(async () => {
    if (!user) {
      onOpenSignIn();
      return;
    }

    if (cart.length === 0) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await saveDetailsToStorage();

      const method: CheckoutMethod | undefined = providerSupportsMethodChoice(selectedProvider)
        ? selectedMethod
        : selectedProvider === "stripe"
          ? "card"
          : selectedProvider === "hubtel"
            ? "mobile_money"
            : undefined;

      const checkout = await createPaymentCheckout({
        provider: selectedProvider,
        method,
        returnTo: "mobile",
        items: cart.map((item) => ({
          serviceId: item.serviceId,
          tierId: item.tierId,
          quantity: item.quantity,
        })),
      });

      const canOpen = await Linking.canOpenURL(checkout.checkoutUrl);
      if (!canOpen) {
        throw new Error("Unable to open checkout URL on this device.");
      }

      await Linking.openURL(checkout.checkoutUrl);
      await clearCart();
      if (isMounted.current) {
        setCart([]);
        setStep(1);
      }
    } catch (e) {
      if (isMounted.current) {
        setError(e instanceof Error ? e.message : "Could not complete checkout.");
      }
    } finally {
      if (isMounted.current) setIsSubmitting(false);
    }
  }, [user, cart, selectedProvider, selectedMethod, onOpenSignIn, saveDetailsToStorage]);

  // ─── Loading state ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.centeredPage}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Loading cart...</Text>
      </View>
    );
  }

  // ─── Empty state ─────────────────────────────────────────────────────────

  if (cart.length === 0 && step === 1) {
    return (
      <View style={styles.centeredPage}>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cart-outline" size={56} color={palette.line} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyBody}>
            Browse services and add packages to your cart to get started.
          </Text>
          <Pressable onPress={onOpenBrowse} style={styles.primaryButton}>
            <Ionicons name="search-outline" size={16} color="#ffffff" />
            <Text style={styles.primaryButtonText}>Browse services</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Order summary sidebar (shown on all steps) ─────────────────────────

  const renderOrderSummary = () => (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Order summary</Text>

      {cart.map((item) => (
        <View key={item.id} style={styles.summaryRow}>
          <View style={styles.summaryRowLeft}>
            <Text numberOfLines={1} style={styles.summaryItemTitle}>
              {item.title}
            </Text>
            <Text style={styles.summaryItemSub}>
              {item.packageName} x{item.quantity}
            </Text>
          </View>
          <Text style={styles.summaryItemPrice}>
            {formatCurrency(item.price * item.quantity, item.currency)}
          </Text>
        </View>
      ))}

      <View style={styles.summaryDivider} />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Subtotal</Text>
        <Text style={styles.summaryValue}>{formatCurrency(subtotal, currency)}</Text>
      </View>

      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, styles.summaryTotalLabel]}>Total</Text>
        <Text style={[styles.summaryValue, styles.summaryTotalValue]}>
          {formatCurrency(subtotal, currency)}
        </Text>
      </View>

      <View style={styles.escrowNotice}>
        <Ionicons name="shield-checkmark-outline" size={16} color={palette.accent} />
        <Text style={styles.escrowText}>
          Funds held in escrow until work is completed and approved.
        </Text>
      </View>
    </View>
  );

  // ─── Step indicator ──────────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <View style={styles.stepIndicatorRow}>
      {([1, 2, 3] as Step[]).map((s, index) => {
        const isActive = s === step;
        const isCompleted = s < step;
        return (
          <View key={s} style={styles.stepItem}>
            {index > 0 && (
              <View
                style={[
                  styles.stepConnector,
                  (isActive || isCompleted) && styles.stepConnectorActive,
                ]}
              />
            )}
            <View
              style={[
                styles.stepCircle,
                isActive && styles.stepCircleActive,
                isCompleted && styles.stepCircleCompleted,
              ]}
            >
              {isCompleted ? (
                <Ionicons name="checkmark" size={14} color="#ffffff" />
              ) : (
                <Text
                  style={[
                    styles.stepCircleText,
                    (isActive || isCompleted) && styles.stepCircleTextActive,
                  ]}
                >
                  {s}
                </Text>
              )}
            </View>
            <Text
              style={[
                styles.stepLabel,
                isActive && styles.stepLabelActive,
                isCompleted && styles.stepLabelCompleted,
              ]}
            >
              {STEP_LABELS[s]}
            </Text>
          </View>
        );
      })}
    </View>
  );

  // ─── Step 1: Cart items ──────────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Your cart</Text>
      <Text style={styles.stepSubtitle}>
        {cart.length} {cart.length === 1 ? "item" : "items"} in your cart
      </Text>

      {cart.map((item) => (
        <View key={item.id} style={styles.cartItemCard}>
          <View style={styles.cartItemTop}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.cartItemImage} />
            ) : (
              <View style={[styles.cartItemImage, styles.cartItemImagePlaceholder]}>
                <Ionicons name="image-outline" size={24} color={palette.line} />
              </View>
            )}
            <View style={styles.cartItemInfo}>
              <Text numberOfLines={2} style={styles.cartItemTitle}>
                {item.title}
              </Text>
              <Text style={styles.cartItemPackage}>{item.packageName}</Text>
              <Text style={styles.cartItemCategory}>{item.category}</Text>
            </View>
            <Pressable
              onPress={() => void handleRemoveItem(item.id)}
              style={styles.removeButton}
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={18} color={palette.danger} />
            </Pressable>
          </View>

          <View style={styles.cartItemBottom}>
            <View style={styles.cartItemQtyRow}>
              <Text style={styles.cartItemQtyLabel}>Qty: {item.quantity}</Text>
              {item.pricingType === "per_unit" && item.unitLabel ? (
                <Text style={styles.cartItemUnitLabel}>per {item.unitLabel}</Text>
              ) : null}
            </View>
            <Text style={styles.cartItemPrice}>
              {formatCurrency(item.price * item.quantity, item.currency)}
            </Text>
          </View>
        </View>
      ))}

      <View style={styles.subtotalRow}>
        <Text style={styles.subtotalLabel}>Subtotal</Text>
        <Text style={styles.subtotalValue}>{formatCurrency(subtotal, currency)}</Text>
      </View>
    </View>
  );

  // ─── Step 2: Details ─────────────────────────────────────────────────────

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Service details</Text>
      <Text style={styles.stepSubtitle}>
        Add event dates and special instructions for each service (optional).
      </Text>

      {cart.map((item) => (
        <View key={item.id} style={styles.detailCard}>
          <View style={styles.detailCardHeader}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.detailThumb} />
            ) : (
              <View style={[styles.detailThumb, styles.cartItemImagePlaceholder]}>
                <Ionicons name="image-outline" size={16} color={palette.line} />
              </View>
            )}
            <View style={styles.detailCardHeaderText}>
              <Text numberOfLines={1} style={styles.detailCardTitle}>
                {item.title}
              </Text>
              <Text style={styles.detailCardSub}>{item.packageName}</Text>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Event date</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 2026-04-15"
              placeholderTextColor={palette.slate}
              value={item.eventDate ?? ""}
              onChangeText={(v) => handleUpdateItemField(item.id, "eventDate", v)}
              keyboardType={Platform.OS === "ios" ? "default" : "default"}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Special instructions</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Any special requirements or notes for the provider..."
              placeholderTextColor={palette.slate}
              value={item.notes ?? ""}
              onChangeText={(v) => handleUpdateItemField(item.id, "notes", v)}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>
      ))}
    </View>
  );

  // ─── Step 3: Payment ─────────────────────────────────────────────────────

  const renderStep3 = () => {
    const showMethodSelector = providerSupportsMethodChoice(selectedProvider);

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Payment</Text>
        <Text style={styles.stepSubtitle}>
          Choose your preferred payment provider and method.
        </Text>

        {!user && (
          <View style={styles.signInPrompt}>
            <Ionicons name="log-in-outline" size={20} color={palette.gold} />
            <Text style={styles.signInPromptText}>
              You need to sign in to complete your order.
            </Text>
            <Pressable onPress={onOpenSignIn} style={styles.signInPromptButton}>
              <Text style={styles.signInPromptButtonText}>Sign in</Text>
            </Pressable>
          </View>
        )}

        {/* Payment provider selection */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Payment provider</Text>
          <View style={styles.chipRow}>
            {enabledProviders.map((provider) => {
              const isActive = provider === selectedProvider;
              return (
                <Pressable
                  key={provider}
                  onPress={() => setSelectedProvider(provider)}
                  style={[styles.providerChip, isActive && styles.providerChipActive]}
                >
                  <Ionicons
                    name={PROVIDER_ICONS[provider] as any}
                    size={18}
                    color={isActive ? palette.accentDeep : palette.slate}
                  />
                  <Text
                    style={[
                      styles.providerChipText,
                      isActive && styles.providerChipTextActive,
                    ]}
                  >
                    {PROVIDER_LABELS[provider]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Payment method selector */}
        {showMethodSelector && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Payment method</Text>
            <View style={styles.chipRow}>
              {METHOD_OPTIONS.map((opt) => {
                const isActive = opt.key === selectedMethod;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setSelectedMethod(opt.key)}
                    style={[styles.methodChip, isActive && styles.methodChipActive]}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={18}
                      color={isActive ? palette.accentDeep : palette.slate}
                    />
                    <Text
                      style={[
                        styles.methodChipText,
                        isActive && styles.methodChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Escrow protection notice */}
        <View style={styles.escrowCard}>
          <View style={styles.escrowCardHeader}>
            <Ionicons name="shield-checkmark" size={22} color={palette.accent} />
            <Text style={styles.escrowCardTitle}>Escrow protection</Text>
          </View>
          <Text style={styles.escrowCardBody}>
            Your payment is held securely in escrow. Funds are only released to the provider
            after you approve the completed work. If there is a dispute, our team will review
            and mediate.
          </Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Checkout failed</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Pressable onPress={() => setError(null)} style={styles.dismissButton}>
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
    <View style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={palette.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={styles.headerRight}>
          <Ionicons name="cart" size={20} color={palette.accent} />
          {cart.length > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cart.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Step indicator */}
      {renderStepIndicator()}

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

        {/* Order summary */}
        {renderOrderSummary()}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bottomBar}>
        {step < 3 ? (
          <Pressable
            onPress={() => void goNext()}
            disabled={step === 1 && !canProceedStep1}
            style={[
              styles.continueButton,
              step === 1 && !canProceedStep1 && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.continueButtonText}>
              {step === 1 ? "Continue to details" : "Continue to payment"}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void handleCompleteOrder()}
            disabled={isSubmitting || !canProceedStep3}
            style={[
              styles.completeButton,
              (isSubmitting || !canProceedStep3) && styles.buttonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="lock-closed-outline" size={18} color="#ffffff" />
                <Text style={styles.completeButtonText}>Complete order</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles((palette) => ({
  page: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  centeredPage: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  loadingText: {
    color: palette.slate,
    fontSize: 14,
    marginTop: 12,
  },

  // Header
  header: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  backButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.mist,
  },
  headerTitle: {
    color: palette.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 12,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  cartBadge: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderRadius: 999,
    justifyContent: "center",
    marginLeft: -6,
    marginTop: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },

  // Step indicator
  stepIndicatorRow: {
    alignItems: "center",
    backgroundColor: palette.card,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 0,
  },
  stepItem: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  stepConnector: {
    backgroundColor: palette.line,
    height: 2,
    flex: 1,
    marginRight: 6,
  },
  stepConnectorActive: {
    backgroundColor: palette.accent,
  },
  stepCircle: {
    alignItems: "center",
    backgroundColor: palette.mist,
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stepCircleActive: {
    backgroundColor: palette.accent,
  },
  stepCircleCompleted: {
    backgroundColor: palette.accent,
  },
  stepCircleText: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
  },
  stepCircleTextActive: {
    color: "#ffffff",
  },
  stepLabel: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "600",
  },
  stepLabelActive: {
    color: palette.accentDeep,
    fontWeight: "700",
  },
  stepLabelCompleted: {
    color: palette.accent,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
    gap: 16,
  },

  // Step content
  stepContent: {
    gap: 14,
  },
  stepTitle: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  stepSubtitle: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },

  // Empty state
  emptyCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 44,
    width: "100%",
  },
  emptyIconWrap: {
    alignItems: "center",
    backgroundColor: palette.mist,
    borderRadius: 999,
    height: 96,
    justifyContent: "center",
    marginBottom: 4,
    width: 96,
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyBody: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  // Cart item card (Step 1)
  cartItemCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cartItemTop: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  cartItemImage: {
    borderRadius: 12,
    height: 64,
    width: 64,
  },
  cartItemImagePlaceholder: {
    alignItems: "center",
    backgroundColor: palette.mist,
    justifyContent: "center",
  },
  cartItemInfo: {
    flex: 1,
    gap: 3,
  },
  cartItemTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  cartItemPackage: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  cartItemCategory: {
    color: palette.slate,
    fontSize: 12,
  },
  removeButton: {
    alignItems: "center",
    backgroundColor: palette.dangerSoft,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  cartItemBottom: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cartItemQtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cartItemQtyLabel: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "600",
  },
  cartItemUnitLabel: {
    color: palette.slate,
    fontSize: 12,
  },
  cartItemPrice: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  subtotalRow: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  subtotalLabel: {
    color: palette.slate,
    fontSize: 14,
    fontWeight: "600",
  },
  subtotalValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
  },

  // Detail card (Step 2)
  detailCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  detailCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  detailThumb: {
    borderRadius: 10,
    height: 40,
    width: 40,
  },
  detailCardHeaderText: {
    flex: 1,
    gap: 2,
  },
  detailCardTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  detailCardSub: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "600",
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  textInput: {
    backgroundColor: palette.mist,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },

  // Payment section (Step 3)
  sectionCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  sectionLabel: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  providerChip: {
    alignItems: "center",
    backgroundColor: palette.mist,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  providerChipActive: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  providerChipText: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "600",
  },
  providerChipTextActive: {
    color: palette.accentDeep,
    fontWeight: "700",
  },
  methodChip: {
    alignItems: "center",
    backgroundColor: palette.mist,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  methodChipActive: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  methodChipText: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "600",
  },
  methodChipTextActive: {
    color: palette.accentDeep,
    fontWeight: "700",
  },

  // Sign in prompt
  signInPrompt: {
    alignItems: "center",
    backgroundColor: palette.goldSoft,
    borderColor: "#fed7aa",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 14,
  },
  signInPromptText: {
    color: palette.gold,
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  signInPromptButton: {
    backgroundColor: palette.gold,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  signInPromptButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },

  // Escrow card
  escrowCard: {
    backgroundColor: palette.accentSoft,
    borderColor: "#bbf7d0",
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  escrowCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  escrowCardTitle: {
    color: palette.accentDeep,
    fontSize: 15,
    fontWeight: "700",
  },
  escrowCardBody: {
    color: palette.accentDeep,
    fontSize: 13,
    lineHeight: 19,
  },

  // Order summary card
  summaryCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  summaryTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryRowLeft: {
    flex: 1,
    gap: 2,
    marginRight: 12,
  },
  summaryItemTitle: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  summaryItemSub: {
    color: palette.slate,
    fontSize: 11,
  },
  summaryItemPrice: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  summaryDivider: {
    backgroundColor: palette.line,
    height: 1,
    marginVertical: 4,
  },
  summaryLabel: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "600",
  },
  summaryValue: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  summaryTotalLabel: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  summaryTotalValue: {
    color: palette.accentDeep,
    fontSize: 18,
    fontWeight: "800",
  },
  escrowNotice: {
    alignItems: "center",
    backgroundColor: palette.accentSoft,
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    padding: 10,
  },
  escrowText: {
    color: palette.accentDeep,
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
  },

  // Error card
  errorCard: {
    backgroundColor: palette.dangerSoft,
    borderColor: palette.dangerLine,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  errorTitle: {
    color: palette.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  errorBody: {
    color: palette.dangerInk,
    fontSize: 13,
    lineHeight: 18,
  },
  dismissButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dismissButtonText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: "700",
  },

  // Bottom bar
  bottomBar: {
    backgroundColor: palette.card,
    borderTopColor: palette.line,
    borderTopWidth: 1,
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  continueButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 14,
  },
  continueButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  completeButton: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 14,
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
}));
