import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  createOrderPaymentCheckout,
  updateOrderStatus,
  approveOrderCompletion,
  openOrderDispute,
  requestOrderRelease,
  fetchOrderPayments,
  fetchOrders,
  fetchPublicSettings,
} from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { formatCurrency, toNumber } from "../lib/format";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type {
  CheckoutMethod,
  CheckoutProvider,
  Order,
  OrderPayment,
  OrderStatus,
  PaymentReturnParams,
} from "../types";

type Props = {
  onOpenSignIn: () => void;
  onOpenPaymentStatus: (params: PaymentReturnParams) => void;
  onOpenOrder: (order: Order) => void;
  refreshToken?: string;
};

type OrderBucket = "all" | "active" | "completed" | "cancelled";

type OrderAction = "accept" | "deliver" | "approve" | "dispute" | "request_release";

type FilterChip = {
  key: OrderBucket;
  label: string;
};

const FILTERS: FilterChip[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];

const ACTIVE_STATUSES: OrderStatus[] = [
  "created",
  "payment_pending",
  "paid_to_escrow",
  "accepted",
  "in_progress",
  "delivery_submitted",
  "delivered",
  "dispute_open",
  "disputed",
];

const COMPLETED_STATUSES: OrderStatus[] = [
  "release_approved",
  "approved",
  "released",
  "disbursed",
];

const CANCELLED_STATUSES: OrderStatus[] = [
  "cancelled",
  "expired",
  "refund_pending",
  "refunded",
  "chargeback",
];

const isProviderCurrencySupported = (
  provider: CheckoutProvider,
  currency: OrderPayment["currency"],
) => {
  if (provider === "hubtel" || provider === "expresspay") {
    return currency === "GHS";
  }
  return true;
};

const getCheckoutMethod = (provider: CheckoutProvider): CheckoutMethod | undefined => {
  if (provider === "stripe") {
    return "card";
  }
  if (provider === "hubtel") {
    return "mobile_money";
  }
  if (provider === "expresspay") {
    return undefined;
  }
  return "mobile_money";
};


const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatCounterparty = (order: Order, userId: string) => {
  const counterparty = order.buyer?.id === userId ? order.provider : order.buyer;
  if (!counterparty) {
    return "Counterparty unavailable";
  }
  if (counterparty.providerProfile?.displayName) {
    return counterparty.providerProfile.displayName;
  }
  if (counterparty.username) {
    return `@${counterparty.username}`;
  }
  if (counterparty.email) {
    return counterparty.email;
  }
  if (counterparty.phone) {
    return counterparty.phone;
  }
  return "Servfix user";
};

const getBucket = (status: OrderStatus): OrderBucket => {
  if (ACTIVE_STATUSES.includes(status)) {
    return "active";
  }
  if (COMPLETED_STATUSES.includes(status)) {
    return "completed";
  }
  if (CANCELLED_STATUSES.includes(status)) {
    return "cancelled";
  }
  return "active";
};

const buildPaymentReturnParams = (order: Order): PaymentReturnParams | null => {
  const paymentIntent = order.paymentIntent;
  if (!paymentIntent || paymentIntent.provider === "other") {
    return null;
  }

  const baseParams: PaymentReturnParams = {
    provider: paymentIntent.provider,
    purpose: "orders",
    payment_intent_id: paymentIntent.id,
  };

  if (paymentIntent.provider === "paystack") {
    return {
      ...baseParams,
      reference: paymentIntent.providerRef ?? paymentIntent.id,
    };
  }

  if (paymentIntent.provider === "stripe") {
    return {
      ...baseParams,
      session_id: paymentIntent.providerRef ?? undefined,
    };
  }

  if (paymentIntent.provider === "hubtel") {
    return {
      ...baseParams,
      reference: paymentIntent.id,
    };
  }

  if (paymentIntent.provider === "expresspay") {
    return {
      ...baseParams,
      token: paymentIntent.providerRef ?? undefined,
      order_id: paymentIntent.id,
    };
  }

  return {
    ...baseParams,
    tx_ref: paymentIntent.providerRef ?? undefined,
    transaction_id: paymentIntent.events?.[0]?.providerEventId,
  };
};

const getStatusTone = (status: OrderStatus, pal: { accentSoft: string; accent: string; danger: string; dangerSoft: string; goldSoft: string; gold: string }) => {
  const bucket = getBucket(status);
  if (bucket === "completed") {
    return {
      backgroundColor: pal.accentSoft,
      color: pal.accent,
    };
  }
  if (bucket === "cancelled") {
    return {
      backgroundColor: pal.dangerSoft,
      color: pal.danger,
    };
  }
  return {
    backgroundColor: pal.goldSoft,
    color: pal.gold,
  };
};

export function OrdersScreen({
  onOpenSignIn,
  onOpenPaymentStatus,
  onOpenOrder,
  refreshToken,
}: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const isFocused = useIsFocused();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<OrderBucket>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [activeOrderAction, setActiveOrderAction] = useState<string | null>(null);
  const [pendingPaymentsByOrderId, setPendingPaymentsByOrderId] = useState<
    Record<string, OrderPayment | null>
  >({});
  const [enabledProviders, setEnabledProviders] = useState<CheckoutProvider[]>(["flutterwave"]);
  const [defaultProvider, setDefaultProvider] = useState<CheckoutProvider>("flutterwave");
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const appliedRefreshTokenRef = useRef<string | undefined>(undefined);

  const loadPaymentSettings = useCallback(async () => {
    try {
      const settings = await fetchPublicSettings();
      setEnabledProviders(settings.payments.enabledProviders);
      setDefaultProvider(settings.payments.defaultProvider);
    } catch {
      setEnabledProviders(["flutterwave"]);
      setDefaultProvider("flutterwave");
    }
  }, []);

  const loadPendingOrderPayments = useCallback(
    async (nextOrders: Order[]) => {
      if (user?.role !== "buyer") {
        setPendingPaymentsByOrderId({});
        return;
      }

      const candidates = nextOrders.filter((order) => ACTIVE_STATUSES.includes(order.status));
      if (candidates.length === 0) {
        setPendingPaymentsByOrderId({});
        return;
      }

      const entries = await Promise.all(
        candidates.map(async (order) => {
          try {
            const payments = await fetchOrderPayments(order.id);
            const pendingPayment = payments.find((payment) => payment.status === "pending") ?? null;
            return [order.id, pendingPayment] as const;
          } catch {
            return [order.id, null] as const;
          }
        }),
      );

      const nextMap: Record<string, OrderPayment | null> = {};
      entries.forEach(([orderId, payment]) => {
        nextMap[orderId] = payment;
      });
      setPendingPaymentsByOrderId(nextMap);
    },
    [user?.role],
  );

  const loadOrders = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!user?.id) {
        return;
      }

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const nextOrders = await fetchOrders();
        setOrders(nextOrders);
        setError(null);
        void loadPendingOrderPayments(nextOrders);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to load orders.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [loadPendingOrderPayments, user?.id],
  );

  const startOrderPayment = useCallback(
    async (orderId: string, payment: OrderPayment) => {
      setPayingOrderId(orderId);
      setPaymentError(null);

      try {
        const compatibleProviders = enabledProviders.filter((provider) =>
          isProviderCurrencySupported(provider, payment.currency),
        );
        if (compatibleProviders.length === 0) {
          throw new Error(`No payment provider is enabled for ${payment.currency}.`);
        }

        const provider = compatibleProviders.includes(defaultProvider)
          ? defaultProvider
          : compatibleProviders[0];

        const checkout = await createOrderPaymentCheckout({
          orderPaymentId: payment.id,
          provider,
          method: getCheckoutMethod(provider),
          returnTo: "mobile",
        });
        const canOpen = await Linking.canOpenURL(checkout.checkoutUrl);
        if (!canOpen) {
          throw new Error("Unable to open checkout URL on this device.");
        }
        await Linking.openURL(checkout.checkoutUrl);
      } catch (nextError) {
        setPaymentError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to start payable amount checkout.",
        );
      } finally {
        setPayingOrderId(null);
      }
    },
    [defaultProvider, enabledProviders],
  );

  const runOrderAction = useCallback(
    async (action: OrderAction, orderId: string, execute: () => Promise<unknown>) => {
      const actionKey = `${orderId}:${action}`;
      setActiveOrderAction(actionKey);
      setActionError(null);

      try {
        await execute();
        void loadOrders("refresh");
      } catch (nextError) {
        setActionError(nextError instanceof Error ? nextError.message : "Could not complete the order action.");
      } finally {
        setActiveOrderAction(null);
      }
    },
    [loadOrders],
  );

  const acceptOrder = useCallback(
    (orderId: string) =>
      void runOrderAction("accept", orderId, () =>
        updateOrderStatus({ orderId, status: "accepted" }),
      ),
    [runOrderAction],
  );

  const markDelivered = useCallback(
    (orderId: string) =>
      void runOrderAction("deliver", orderId, () =>
        updateOrderStatus({ orderId, status: "delivered" }),
      ),
    [runOrderAction],
  );

  const approveCompletion = useCallback(
    (orderId: string) =>
      void runOrderAction("approve", orderId, () => approveOrderCompletion(orderId)),
    [runOrderAction],
  );

  const requestPayout = useCallback(
    (orderId: string) =>
      void runOrderAction("request_release", orderId, () =>
        requestOrderRelease({
          orderId,
          percent: 20,
          note: "Requesting milestone payout from completed work.",
        }),
      ),
    [runOrderAction],
  );

  const openDispute = useCallback(
    (orderId: string) => {
      Alert.alert(
        "Open dispute",
        "Do you want to open a dispute for this order? An admin will review the case.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open dispute",
            style: "destructive",
            onPress: () =>
              void runOrderAction("dispute", orderId, () =>
                openOrderDispute({
                  orderId,
                  reason: "Order outcome is unsatisfactory.",
                  details:
                    "Please review this order. The buyer is raising a dispute during the review period.",
                }),
              ),
          },
        ],
      );
    },
    [runOrderAction],
  );

  useEffect(() => {
    if (!user) {
      return;
    }
    void loadPaymentSettings();
  }, [loadPaymentSettings, user]);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setError(null);
      setActionError(null);
      setPaymentError(null);
      setPendingPaymentsByOrderId({});
      setIsLoading(false);
      setIsRefreshing(false);
      setPayingOrderId(null);
      appliedRefreshTokenRef.current = undefined;
      hasLoadedOnceRef.current = false;
      return;
    }

    if (!isFocused) {
      return;
    }

    if (refreshToken && appliedRefreshTokenRef.current !== refreshToken) {
      appliedRefreshTokenRef.current = refreshToken;
      void loadOrders("refresh");
      return;
    }

    const mode = hasLoadedOnceRef.current ? "refresh" : "initial";
    hasLoadedOnceRef.current = true;
    void loadOrders(mode);
  }, [isFocused, loadOrders, refreshToken, user]);

  const counts = useMemo(() => {
    const nextCounts = {
      all: orders.length,
      active: 0,
      completed: 0,
      cancelled: 0,
    };

    orders.forEach((order) => {
      const bucket = getBucket(order.status);
      nextCounts[bucket] += 1;
    });

    return nextCounts;
  }, [orders]);

  const visibleOrders = useMemo(() => {
    if (selectedFilter === "all") {
      return orders;
    }
    return orders.filter((order) => getBucket(order.status) === selectedFilter);
  }, [orders, selectedFilter]);

  if (!user) {
    return (
      <View style={styles.centeredPage}>
        <View style={styles.signInCard}>
          <Text style={styles.title}>Orders</Text>
          <Text style={styles.supportingText}>
            Sign in as a buyer or provider to load your active jobs, payment milestones, and order
            history.
          </Text>
          <Pressable onPress={onOpenSignIn} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centeredPage}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Loading orders...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <Text style={[styles.title, isCompact && styles.titleCompact]}>Orders</Text>
      </View>

      <View style={[styles.filterBar, isCompact && styles.filterBarCompact]}>
        {FILTERS.map((filter) => {
          const isActive = filter.key === selectedFilter;
          return (
            <Pressable
              key={filter.key}
              onPress={() => setSelectedFilter(filter.key)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text numberOfLines={1} style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {filter.label}
              </Text>
              {counts[filter.key] > 0 ? (
                <View style={[styles.filterBadge, isActive && styles.filterBadgeActive]}>
                  <Text style={[styles.filterBadgeText, isActive && styles.filterBadgeTextActive]}>
                    {counts[filter.key]}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load orders</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable onPress={() => void loadOrders()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {actionError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not update order</Text>
          <Text style={styles.errorBody}>{actionError}</Text>
          <Pressable onPress={() => setActionError(null)} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
      {paymentError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not start payment</Text>
          <Text style={styles.errorBody}>{paymentError}</Text>
          <Pressable onPress={() => setPaymentError(null)} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={[styles.listContent, isCompact && styles.listContentCompact]}
        data={visibleOrders}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadOrders("refresh")}
            refreshing={isRefreshing}
            tintColor={palette.accent}
          />
        }
        renderItem={({ item }) => {
          const statusTone = getStatusTone(item.status, palette);
          const counterparty = formatCounterparty(item, user.id);
          const tierName = item.tier?.name
            ? item.tier.name.charAt(0).toUpperCase() + item.tier.name.slice(1)
            : "Custom";
          const paymentReturnParams = buildPaymentReturnParams(item);
          const canRetryPayment =
            item.status === "payment_pending" &&
            Boolean(paymentReturnParams);
          const pendingOrderPayment =
            user.role === "buyer" ? pendingPaymentsByOrderId[item.id] ?? null : null;
          const canPayOutstanding = Boolean(pendingOrderPayment);
          const isPayingOrder = payingOrderId === item.id;
          const paymentActionLabel = pendingOrderPayment
            ? pendingOrderPayment.stage === "deposit"
              ? "Pay initial amount"
              : "Payable amount"
            : "Pay now";
          const isProvider = user.role === "provider";
          const canProviderAccept = isProvider && item.status === "paid_to_escrow";
          const canProviderDeliver = isProvider && item.status === "in_progress";
          const canProviderRequestPayout = isProvider && item.status === "delivery_submitted";
          const canBuyerApprove =
            user.role === "buyer" && ["delivery_submitted", "delivered"].includes(item.status);
          const canBuyerDispute =
            user.role === "buyer" && ["delivery_submitted", "delivered"].includes(item.status);
          const isActioningThisOrder = (action: OrderAction) =>
            activeOrderAction === `${item.id}:${action}`;

          return (
            <View style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View style={styles.orderTitleWrap}>
                  <Text numberOfLines={1} style={styles.orderTitle}>
                    {item.service.title || "Service"}
                  </Text>
                  <Text numberOfLines={1} style={styles.orderSubtitle}>
                    With {counterparty}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: statusTone.backgroundColor }]}>
                  <Text style={[styles.statusPillText, { color: statusTone.color }]}>
                    {item.status.replace(/_/g, " ")}
                  </Text>
                </View>
              </View>

              <View style={styles.metaGrid}>
                <View style={[styles.metaBlock, isCompact && styles.metaBlockCompact]}>
                  <Text style={styles.metaLabel}>Amount</Text>
                  <Text style={styles.metaValue}>{formatCurrency(item.amountGross, item.currency)}</Text>
                </View>
                <View style={[styles.metaBlock, isCompact && styles.metaBlockCompact]}>
                  <Text style={styles.metaLabel}>Tier</Text>
                  <Text style={styles.metaValue}>{tierName}</Text>
                </View>
                <View style={[styles.metaBlock, isCompact && styles.metaBlockCompact]}>
                  <Text style={styles.metaLabel}>Created</Text>
                  <Text style={styles.metaValue}>{formatDate(item.createdAt)}</Text>
                </View>
                <View style={[styles.metaBlock, isCompact && styles.metaBlockCompact]}>
                  <Text style={styles.metaLabel}>Location</Text>
                  <Text numberOfLines={1} style={styles.metaValue}>
                    {item.service.locationCity || "Remote / flexible"}
                  </Text>
                </View>
              </View>

              <View style={[styles.footerRow, isCompact && styles.footerRowCompact]}>
                {isProvider ? (
                  <Text style={styles.footerText}>
                    Net provider: {formatCurrency(item.amountNetProvider, item.currency)}
                  </Text>
                ) : null}
                {typeof item.depositPercent === "number" ? (
                  <Text style={styles.footerText}>Deposit: {item.depositPercent}%</Text>
                ) : null}
              </View>

              <Pressable onPress={() => onOpenOrder(item)} style={styles.viewDetailButton}>
                <Text style={styles.viewDetailButtonText}>View full details</Text>
              </Pressable>

              <View style={[styles.actionRow, isCompact && styles.actionRowCompact]}>
                {canProviderAccept ? (
                  <Pressable
                    onPress={() => acceptOrder(item.id)}
                    disabled={isActioningThisOrder("accept")}
                    style={[
                      styles.actionButton,
                      styles.actionButtonPrimary,
                      isCompact && styles.actionButtonCompact,
                      isActioningThisOrder("accept") && styles.buttonDisabled,
                    ]}
                  >
                    {isActioningThisOrder("accept") ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.actionButtonText}>Accept order</Text>
                    )}
                  </Pressable>
                ) : null}

                {canProviderDeliver ? (
                  <Pressable
                    onPress={() => markDelivered(item.id)}
                    disabled={isActioningThisOrder("deliver")}
                    style={[
                      styles.actionButton,
                      styles.actionButtonPrimary,
                      isCompact && styles.actionButtonCompact,
                      isActioningThisOrder("deliver") && styles.buttonDisabled,
                    ]}
                  >
                    {isActioningThisOrder("deliver") ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.actionButtonText}>Mark delivered</Text>
                    )}
                  </Pressable>
                ) : null}

                {canProviderRequestPayout ? (
                  <Pressable
                    onPress={() => requestPayout(item.id)}
                    disabled={isActioningThisOrder("request_release")}
                    style={[
                      styles.actionButton,
                      styles.actionButtonSecondary,
                      isCompact && styles.actionButtonCompact,
                      isActioningThisOrder("request_release") && styles.buttonDisabled,
                    ]}
                  >
                    {isActioningThisOrder("request_release") ? (
                      <ActivityIndicator color={palette.ink} size="small" />
                    ) : (
                      <Text style={styles.actionButtonTextSecondary}>Request disbursement</Text>
                    )}
                  </Pressable>
                ) : null}

                {canBuyerApprove ? (
                  <Pressable
                    onPress={() => approveCompletion(item.id)}
                    disabled={isActioningThisOrder("approve")}
                    style={[
                      styles.actionButton,
                      styles.actionButtonPrimary,
                      isCompact && styles.actionButtonCompact,
                      isActioningThisOrder("approve") && styles.buttonDisabled,
                    ]}
                  >
                    {isActioningThisOrder("approve") ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.actionButtonText}>Approve & release</Text>
                    )}
                  </Pressable>
                ) : null}

                {canBuyerDispute ? (
                  <Pressable
                    onPress={() => openDispute(item.id)}
                    disabled={isActioningThisOrder("dispute")}
                    style={[
                      styles.actionButton,
                      styles.actionButtonDanger,
                      isCompact && styles.actionButtonCompact,
                      isActioningThisOrder("dispute") && styles.buttonDisabled,
                    ]}
                  >
                    {isActioningThisOrder("dispute") ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.actionButtonText}>Open dispute</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>

              {canRetryPayment && paymentReturnParams ? (
                <Pressable
                  onPress={() => onOpenPaymentStatus(paymentReturnParams)}
                  style={[styles.paymentRetryButton, isCompact && styles.paymentRetryButtonCompact]}
                >
                  <Text style={styles.paymentRetryButtonText}>Check payment</Text>
                </Pressable>
              ) : null}
              {canPayOutstanding && pendingOrderPayment ? (
                <Pressable
                  disabled={isPayingOrder}
                  onPress={() => void startOrderPayment(item.id, pendingOrderPayment)}
                  style={[
                    styles.paymentRetryButton,
                    isCompact && styles.paymentRetryButtonCompact,
                    isPayingOrder && styles.buttonDisabled,
                  ]}
                >
                  {isPayingOrder ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.paymentRetryButtonText}>{paymentActionLabel}</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyBody}>
              Orders you place or receive will show up here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  page: {
    flex: 1,
  },
  centeredPage: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  headerCompact: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    color: palette.accentDeep,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  titleCompact: {
    fontSize: 22,
  },
  supportingText: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingText: {
    color: palette.slate,
    fontSize: 14,
  },
  signInCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 20,
    width: "100%",
  },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: palette.canvas,
    fontSize: 13,
    fontWeight: "700",
  },
  filterBar: {
    backgroundColor: palette.mist,
    borderRadius: 14,
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
    padding: 4,
  },
  filterBarCompact: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  filterChip: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: palette.card,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  filterChipText: {
    color: palette.slate,
    fontSize: 11,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: palette.accentDeep,
    fontWeight: "700",
  },
  filterBadge: {
    backgroundColor: palette.line,
    borderRadius: 999,
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignItems: "center",
  },
  filterBadgeActive: {
    backgroundColor: palette.accentSoft,
  },
  filterBadgeText: {
    color: palette.slate,
    fontSize: 10,
    fontWeight: "700",
  },
  filterBadgeTextActive: {
    color: palette.accent,
  },
  errorCard: {
    backgroundColor: palette.dangerSoft,
    borderColor: palette.dangerLine,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    padding: 16,
  },
  errorTitle: {
    color: palette.danger,
    fontSize: 15,
    fontWeight: "700",
  },
  errorBody: {
    color: palette.dangerInk,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    gap: 12,
    padding: 20,
    paddingBottom: 140,
  },
  listContentCompact: {
    padding: 16,
    paddingBottom: 132,
  },
  orderCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  orderHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  orderTitleWrap: {
    flex: 1,
    gap: 4,
  },
  orderTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  orderSubtitle: {
    color: palette.slate,
    fontSize: 13,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaBlock: {
    minWidth: "47%",
  },
  metaBlockCompact: {
    minWidth: "100%",
  },
  metaLabel: {
    color: palette.slate,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metaValue: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  footerRowCompact: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  footerText: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "600",
  },
  actionRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionRowCompact: {
    gap: 8,
  },
  viewDetailButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.inputBg,
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  viewDetailButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 130,
    paddingHorizontal: 12,
  },
  actionButtonCompact: {
    minWidth: "100%",
  },
  actionButtonPrimary: {
    backgroundColor: palette.accentDeep,
  },
  actionButtonSecondary: {
    backgroundColor: palette.mist,
    borderColor: palette.line,
    borderWidth: 1,
  },
  actionButtonDanger: {
    backgroundColor: palette.danger,
  },
  actionButtonText: {
    color: palette.canvas,
    fontSize: 12,
    fontWeight: "700",
  },
  actionButtonTextSecondary: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  paymentRetryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 38,
    minWidth: 130,
    paddingHorizontal: 12,
  },
  paymentRetryButtonCompact: {
    alignSelf: "stretch",
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  paymentRetryButtonText: {
    color: palette.canvas,
    fontSize: 12,
    fontWeight: "700",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    marginTop: 40,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  emptyBody: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
}));
