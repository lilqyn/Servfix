import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import {
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
  Pressable,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  approveOrderCompletion,
  approveOrderReleaseRequest,
  createOrderPaymentCheckout,
  createOrderProgressReport,
  createOrderConversation,
  fetchOrderPayments,
  fetchOrderProgressReports,
  fetchOrderReleaseRequests,
  fetchOrders,
  fetchPublicSettings,
  fetchConversationMessages,
  openOrderDispute,
  rejectOrderReleaseRequest,
  requestOrderRelease,
  sendConversationMessage,
  markConversationRead,
  updateOrderStatus,
  uploadDisputeImage,
} from "../lib/api";
import type { OrderReleaseRequest } from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import { formatCurrency, toNumber } from "../lib/format";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import type {
  CheckoutMethod,
  CheckoutProvider,
  Order,
  OrderPayment,
  OrderProgressReport,
  ConversationMessage,
  PaymentReturnParams,
} from "../types";

type Props = {
  orderId: string;
  seedOrder?: Order;
  threadId?: string;
  onBack: () => void;
  onOpenPaymentStatus: (params: PaymentReturnParams) => void;
  onOpenSignIn: () => void;
};

type ActionKey = "accept" | "deliver" | "approve" | "dispute" | "request_release" | "report_progress";

const TRUST_TIMELINE = [
  "created",
  "paid_to_escrow",
  "accepted",
  "in_progress",
  "delivery_submitted",
  "delivered",
  "release_approved",
  "approved",
  "released",
  "disbursed",
] as const;

const BUYER_TIMELINE = [
  "created",
  "paid_to_escrow",
  "accepted",
  "in_progress",
  "delivery_submitted",
  "delivered",
] as const;

const TERMINAL_STATUSES: Record<string, string> = {
  cancelled: "Cancelled",
  expired: "Expired",
  dispute_open: "Dispute opened",
  disputed: "Under dispute",
  refund_pending: "Refund pending",
  refunded: "Refunded",
  chargeback: "Chargeback",
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
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const messageSortTime = (message: ConversationMessage) => {
  const date = new Date(message.timestamp);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const mergeConversationMessages = (messages: ConversationMessage[]) => {
  const latestById = new Map<string, ConversationMessage>();
  messages.forEach((message) => {
    latestById.set(message.id, message);
  });
  return [...latestById.values()].sort((a, b) => messageSortTime(a) - messageSortTime(b));
};

const mergeAndSortConversationMessages = (
  previous: ConversationMessage[],
  incoming: ConversationMessage[],
) => {
  return mergeConversationMessages([...previous, ...incoming]);
};

const getTimelineEntries = (status: string, role: string) => {
  const terminalLabel = TERMINAL_STATUSES[status];
  if (terminalLabel) {
    return { terminal: terminalLabel, steps: [] };
  }
  const timeline = role === "buyer" ? BUYER_TIMELINE : TRUST_TIMELINE;
  const currentIndex = (timeline as readonly string[]).indexOf(status);
  const steps = timeline.map((entry, index) => ({
    key: entry,
    reached: currentIndex >= 0 && index <= currentIndex,
  }));
  return { terminal: null, steps };
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

export function OrderDetailScreen({
  orderId,
  seedOrder,
  threadId,
  onBack,
  onOpenPaymentStatus,
  onOpenSignIn,
}: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(seedOrder ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [enabledProviders, setEnabledProviders] = useState<CheckoutProvider[]>(["flutterwave"]);
  const [defaultProvider, setDefaultProvider] = useState<CheckoutProvider>("flutterwave");
  const [pendingPayment, setPendingPayment] = useState<OrderPayment | null>(null);
  const [progressReports, setProgressReports] = useState<OrderProgressReport[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [progressTitle, setProgressTitle] = useState("");
  const [progressBody, setProgressBody] = useState("");
  const [progressPercent, setProgressPercent] = useState("");
  const [paying, setPaying] = useState(false);
  const [releaseRequests, setReleaseRequests] = useState<OrderReleaseRequest[]>([]);
  const [loadingReleaseRequests, setLoadingReleaseRequests] = useState(false);
  const [releaseRequestActionId, setReleaseRequestActionId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDetails, setDisputeDetails] = useState("");
  const [disputeImages, setDisputeImages] = useState<{ uri: string; key?: string }[]>([]);
  const [uploadingDisputeImages, setUploadingDisputeImages] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const messageListRef = useRef<FlatList<ConversationMessage> | null>(null);

  const canPayOutstanding = Boolean(pendingPayment) && user?.role === "buyer";
  const timeline = useMemo(() => (order ? getTimelineEntries(order.status, user?.role ?? "") : { terminal: null, steps: [] }), [order, user?.role]);

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

  const loadConversationMessages = useCallback(
    async (
      threadId: string,
      options: { showLoader?: boolean } = {},
      currentUserId?: string,
    ) => {
      const shouldShowLoader = options.showLoader ?? false;
      if (shouldShowLoader) {
        setLoadingMessages(true);
      }

      try {
        const nextMessages = await fetchConversationMessages(threadId);
        const syncedMessages = mergeConversationMessages(nextMessages).map((message) =>
          currentUserId && message.senderId !== currentUserId
            ? { ...message, read: true }
            : message,
        );
        setMessages(syncedMessages);
        await markConversationRead(threadId);
      } finally {
        if (shouldShowLoader) {
          setLoadingMessages(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!threadId || !user?.id) {
      return;
    }
    if (conversationId === threadId) {
      return;
    }

    setConversationId(threadId);
    void loadConversationMessages(
      threadId,
      {
        showLoader: true,
      },
      user.id,
    );
  }, [conversationId, loadConversationMessages, threadId, user?.id]);

  const refreshOrder = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!user?.id || !orderId) {
        return;
      }

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      setMessageError(null);

      try {
        const orders = await fetchOrders();
        const nextOrder = orders.find((value) => value.id === orderId) ?? seedOrder ?? null;
        if (!nextOrder) {
          throw new Error("Order no longer available.");
        }

        setOrder(nextOrder);
        try {
          const reports = await fetchOrderProgressReports(nextOrder.id);
          setProgressReports(reports);
        } catch {
          setProgressReports([]);
        }

        try {
          const requests = await fetchOrderReleaseRequests(nextOrder.id);
          setReleaseRequests(requests);
        } catch {
          setReleaseRequests([]);
        }

        let conversationThreadId: string | null = null;
        try {
          const conversation = await createOrderConversation(nextOrder.id);
          conversationThreadId = conversation.id;
          setConversationId(conversationThreadId);
        } catch {
          setConversationId(null);
          setMessages([]);
          setLoadingMessages(false);
          return;
        }

        try {
          await loadConversationMessages(
            conversationThreadId,
            {
              showLoader: true,
            },
            user.id,
          );
        } catch {
          // Preserve thread id if messages are temporarily unavailable.
        }

        if (user.role === "buyer") {
          const payments = await fetchOrderPayments(nextOrder.id);
          const pending = payments.find(
            (payment) => payment.status === "pending",
          ) ?? null;
          setPendingPayment(pending);
      } else {
        setPendingPayment(null);
      }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to load order details.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [loadConversationMessages, orderId, seedOrder, user?.id, user?.role],
  );

  useEffect(() => {
    if (!conversationId || !user?.id) {
      return;
    }
    const currentUserId = user.id;

    let isSubscribed = true;
    const pollIntervalMs = 8000;

    const pollMessages = async () => {
      try {
        const nextMessages = await fetchConversationMessages(conversationId);
        if (!isSubscribed) {
          return;
        }
        setMessages((previous) =>
          mergeAndSortConversationMessages(previous, nextMessages).map((message) =>
            message.senderId !== currentUserId ? { ...message, read: true } : message,
          ),
        );
        void markConversationRead(conversationId);
      } catch {
        // Keep the existing conversation state if polling fails temporarily.
      }
    };

    void pollMessages();
    const intervalId = setInterval(() => {
      void pollMessages();
    }, pollIntervalMs);

    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
    };
  }, [conversationId, user?.id]);

  const runOrderAction = useCallback(
    async (action: ActionKey, execute: () => Promise<unknown>) => {
      const actionKey = `${orderId}:${action}`;
      setActiveActionKey(actionKey);
      setActionError(null);

      try {
        await execute();
        await refreshOrder("refresh");
      } catch (nextError) {
        setActionError(nextError instanceof Error ? nextError.message : "Could not complete action.");
      } finally {
        setActiveActionKey(null);
      }
    },
    [orderId, refreshOrder],
  );

  const acceptOrder = useCallback(
    () =>
      void runOrderAction("accept", () => updateOrderStatus({ orderId, status: "accepted" })),
    [orderId, runOrderAction],
  );

  const sendMessage = useCallback(async () => {
    if (!conversationId) {
      setMessageError("Unable to open order message thread yet.");
      return;
    }

    const text = messageDraft.trim();
    if (!text) {
      return;
    }

    setSendingMessage(true);
    setMessageError(null);

    try {
      const nextMessage = await sendConversationMessage(conversationId, text);
      setMessages((previous) => mergeAndSortConversationMessages(previous, [nextMessage]));
      setMessageDraft("");
    } catch (nextError) {
      setMessageError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to send this message.",
      );
    } finally {
      setSendingMessage(false);
    }
  }, [conversationId, messageDraft]);

  useEffect(() => {
    if (!messageListRef.current || messages.length === 0) {
      return;
    }

    messageListRef.current.scrollToEnd({ animated: true });
  }, [messages]);

  const markDelivered = useCallback(
    () =>
      void runOrderAction("deliver", () => updateOrderStatus({ orderId, status: "delivered" })),
    [orderId, runOrderAction],
  );

  const approveCompletion = useCallback(
    () => void runOrderAction("approve", () => approveOrderCompletion(orderId)),
    [orderId, runOrderAction],
  );

  const requestPayout = useCallback(
    () =>
      void runOrderAction("request_release", () =>
        requestOrderRelease({
          orderId,
          percent: 20,
          note: "Requesting milestone payout from completed work.",
        }),
      ),
    [orderId, runOrderAction],
  );

  const handleApproveReleaseRequest = useCallback(
    async (requestId: string) => {
      setReleaseRequestActionId(requestId);
      try {
        await approveOrderReleaseRequest(requestId);
        if (order) {
          try {
            const requests = await fetchOrderReleaseRequests(order.id);
            setReleaseRequests(requests);
          } catch {
            setReleaseRequests([]);
          }
        }
        await refreshOrder("refresh");
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Could not approve release request.");
      } finally {
        setReleaseRequestActionId(null);
      }
    },
    [order, refreshOrder],
  );

  const handleRejectReleaseRequest = useCallback(
    async (requestId: string) => {
      setReleaseRequestActionId(requestId);
      try {
        await rejectOrderReleaseRequest(requestId);
        if (order) {
          try {
            const requests = await fetchOrderReleaseRequests(order.id);
            setReleaseRequests(requests);
          } catch {
            setReleaseRequests([]);
          }
        }
        await refreshOrder("refresh");
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Could not reject release request.");
      } finally {
        setReleaseRequestActionId(null);
      }
    },
    [order, refreshOrder],
  );

  const pickDisputeImages = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 4 - disputeImages.length,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const newImages = result.assets.slice(0, 4 - disputeImages.length).map((asset) => ({
        uri: asset.uri,
      }));
      setDisputeImages((prev) => [...prev, ...newImages].slice(0, 4));
    } catch {
      setActionError("Could not open image picker.");
    }
  }, [disputeImages.length]);

  const removeDisputeImage = useCallback((index: number) => {
    setDisputeImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const submitDispute = useCallback(async () => {
    const reason = disputeReason.trim();
    if (reason.length < 3) {
      setActionError("Please provide a reason for the dispute (at least 3 characters).");
      return;
    }

    setActiveActionKey(`${orderId}:dispute`);
    setActionError(null);

    try {
      let imageKeys: string[] = [];
      if (disputeImages.length > 0) {
        setUploadingDisputeImages(true);
        const uploadResults = await Promise.all(
          disputeImages.map((img) => uploadDisputeImage(img.uri)),
        );
        imageKeys = uploadResults.map((r) => r.key);
        setUploadingDisputeImages(false);
      }

      await openOrderDispute({
        orderId,
        reason,
        details: disputeDetails.trim() || undefined,
        imageKeys: imageKeys.length > 0 ? imageKeys : undefined,
      });

      setDisputeReason("");
      setDisputeDetails("");
      setDisputeImages([]);
      setShowDisputeForm(false);
      await refreshOrder("refresh");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not open dispute.");
    } finally {
      setActiveActionKey(null);
      setUploadingDisputeImages(false);
    }
  }, [disputeDetails, disputeImages, disputeReason, orderId, refreshOrder]);

  const submitProgressReport = useCallback(() => {
    if (!order) {
      return;
    }

    const title = progressTitle.trim();
    if (title.length < 3 || title.length > 120) {
      setActionError("Progress title must be between 3 and 120 characters.");
      return;
    }

    const normalizedPercent = progressPercent.trim();
    let percentComplete: number | undefined;
    if (normalizedPercent.length > 0) {
      const parsed = Number.parseInt(normalizedPercent, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
        setActionError("Progress percentage must be between 1 and 100.");
        return;
      }
      percentComplete = parsed;
    }

    const body = progressBody.trim();

    void runOrderAction("report_progress", () =>
      createOrderProgressReport(order.id, {
        title,
        ...(body ? { body } : {}),
        ...(percentComplete !== undefined ? { percentComplete } : {}),
      }).then(() => {
        setProgressTitle("");
        setProgressBody("");
        setProgressPercent("");
      }),
    );
  }, [order, progressBody, progressPercent, progressTitle, runOrderAction]);

  const startOrderPayment = useCallback(async () => {
    if (!order) {
      return;
    }

    const payment = pendingPayment;
    if (!payment) {
      return;
    }

    setPaying(true);
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
      setPaymentError(nextError instanceof Error ? nextError.message : "Unable to start checkout.");
    } finally {
      setPaying(false);
    }
  }, [defaultProvider, enabledProviders, order, pendingPayment]);

  useEffect(() => {
    if (!user) {
      return;
    }
    void loadPaymentSettings();
  }, [loadPaymentSettings, user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    void refreshOrder("initial");
  }, [refreshOrder, user]);

  if (!user) {
    return (
      <View style={styles.centeredPage}>
        <View style={styles.card}>
          <Text style={styles.title}>Order details</Text>
          <Text style={styles.supportingText}>
            Sign in to view and manage your order details, approvals, disputes, and disbursements.
          </Text>
          <Pressable onPress={onOpenSignIn} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centeredPage}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>
          {isLoading ? "Loading order..." : "Order unavailable."}
        </Text>
        {error ? <Text style={styles.errorBody}>{error}</Text> : null}
        <Pressable onPress={() => void refreshOrder("refresh")} style={styles.backButton}>
          <Text style={styles.backButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const counterparty = formatCounterparty(order, user.id);
  const paymentReturnParams = buildPaymentReturnParams(order);
  const paymentActionLabel =
    pendingPayment && pendingPayment.stage === "deposit" ? "Pay initial amount" : "Pay outstanding";
  const canProviderAccept = user.role === "provider" && order.status === "paid_to_escrow";
  const canProviderDeliver = user.role === "provider" && order.status === "in_progress";
  const canProviderRequestPayout = user.role === "provider" && order.status === "delivery_submitted";
  const canProviderReport =
    user.role === "provider" && ["accepted", "in_progress", "delivery_submitted"].includes(order.status);
  const canBuyerApprove =
    user.role === "buyer" && ["delivery_submitted", "delivered"].includes(order.status);
  const canBuyerDispute =
    user.role === "buyer" && ["delivery_submitted", "delivered"].includes(order.status);
  const isActioning = (action: ActionKey) => activeActionKey === `${order.id}:${action}`;
  const canShowConversation = user.role === "buyer" || user.role === "provider";
  const unreadMessageCount = messages.filter(
    (message) => !message.read && message.senderId !== user.id,
  ).length;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl onRefresh={() => void refreshOrder("refresh")} refreshing={isRefreshing} tintColor={palette.accent} />}
    >
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.title}>Order details</Text>
        <Text style={styles.serviceTitle}>{order.service.title}</Text>
        <Text style={styles.supportingText}>Counterparty: {counterparty}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>Timeline</Text>
          <Text style={styles.statusText}>{order.status.replace(/_/g, " ")}</Text>
        </View>
        <View style={styles.timeline}>
          {timeline.terminal ? (
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotTerminal]} />
              <Text style={[styles.timelineText, styles.timelineTextTerminal]}>
                {timeline.terminal}
              </Text>
            </View>
          ) : (
            timeline.steps.map((entry) => (
              <View key={entry.key} style={styles.timelineItem}>
                <View
                  style={[styles.timelineDot, entry.reached && styles.timelineDotReached]}
                />
                <Text style={[styles.timelineText, entry.reached && styles.timelineTextReached]}>
                  {entry.key.replace(/_/g, " ")}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Amounts</Text>
        <Text style={styles.rowText}>Gross: {formatCurrency(order.amountGross, order.currency)}</Text>
        {user.role !== "buyer" && (
          <Text style={styles.rowText}>Net to provider: {formatCurrency(order.amountNetProvider, order.currency)}</Text>
        )}
        {typeof order.depositPercent === "number" ? (
          <Text style={styles.rowText}>Deposit: {order.depositPercent}%</Text>
        ) : null}
        <Text style={styles.rowText}>Created: {formatDate(order.createdAt)}</Text>
        <Text style={styles.rowText}>Updated: {formatDate(order.updatedAt)}</Text>
      </View>

      {order.tier ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service tier</Text>
          <Text style={styles.rowText}>
            {order.tier.name.charAt(0).toUpperCase() + order.tier.name.slice(1)} - {order.tier.deliveryDays} day
            estimate
          </Text>
          <Text style={styles.rowText}>Revisions: {order.tier.revisionCount}</Text>
          <Text style={styles.rowText}>Price: {formatCurrency(order.tier.price, order.tier.currency)}</Text>
        </View>
      ) : null}

      {actionError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not complete action</Text>
          <Text style={styles.errorBody}>{actionError}</Text>
        </View>
      ) : null}

      {(user.role === "provider" || progressReports.length > 0) ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Progress reports</Text>
          {progressReports.length === 0 ? (
            <Text style={styles.rowText}>No progress updates submitted yet.</Text>
          ) : (
            <View style={styles.reportList}>
              {progressReports.map((report) => (
                <View key={report.id} style={styles.reportItem}>
                  <View style={styles.reportHeader}>
                    <Text style={styles.reportTitle} numberOfLines={1}>
                      {report.title}
                    </Text>
                    <Text style={styles.reportPercent}>{report.percentComplete}% complete</Text>
                  </View>
                  {report.body ? <Text style={styles.rowText}>{report.body}</Text> : null}
                  <Text style={styles.reportDate}>Reported {formatDate(report.createdAt)}</Text>
                </View>
              ))}
            </View>
          )}
          {canProviderReport ? (
            <View style={styles.progressForm}>
              <Text style={styles.formLabel}>Update title</Text>
              <TextInput
                editable={!isActioning("report_progress")}
                onChangeText={setProgressTitle}
                placeholder="Enter progress milestone"
                placeholderTextColor="#94a3b8"
                style={styles.textInput}
                value={progressTitle}
              />
              <Text style={styles.formLabel}>Notes (optional)</Text>
              <TextInput
                editable={!isActioning("report_progress")}
                multiline
                onChangeText={setProgressBody}
                placeholder="Add details for the buyer"
                placeholderTextColor="#94a3b8"
                style={[styles.textInput, styles.textArea]}
                value={progressBody}
              />
              <Text style={styles.formLabel}>Percent complete (optional)</Text>
              <TextInput
                editable={!isActioning("report_progress")}
                keyboardType="number-pad"
                onChangeText={(value) => setProgressPercent(value.replace(/[^0-9]/g, ""))}
                placeholder="1-100"
                placeholderTextColor="#94a3b8"
                style={styles.textInput}
                value={progressPercent}
              />
              <Pressable
                disabled={isActioning("report_progress")}
                onPress={submitProgressReport}
                style={[
                  styles.actionButton,
                  isActioning("report_progress") && styles.buttonDisabled,
                ]}
              >
                {isActioning("report_progress") ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.actionButtonText}>Post update</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {paymentError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Payment issue</Text>
          <Text style={styles.errorBody}>{paymentError}</Text>
        </View>
      ) : null}

      {canShowConversation ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Messages</Text>
          {unreadMessageCount > 0 ? (
            <Text style={styles.unreadBadgeText}>
              {unreadMessageCount} unread message{unreadMessageCount === 1 ? "" : "s"}
            </Text>
          ) : null}
          <View style={styles.messageList}>
            {messages.length === 0 ? (
              <Text style={styles.rowText}>
                {loadingMessages ? "Loading messages..." : "No messages yet. Send the first note to coordinate with your partner."}
              </Text>
            ) : (
              <FlatList
                ref={messageListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
    const isMine = item.senderId === user.id;
    const messageMetaLabel = isMine
      ? `${item.read ? "Seen" : "Sent"} | ${formatMessageTime(item.timestamp)}`
      : formatMessageTime(item.timestamp);
    return (
      <View
        style={[
          styles.messageBubble,
          isMine ? styles.messageMine : styles.messagePeer,
        ]}
                    >
                      <Text style={isMine ? styles.messageMineText : styles.messagePeerText}>
                        {item.content}
                      </Text>
                      <Text style={styles.messageMeta}>{messageMetaLabel}</Text>
                    </View>
                  );
                }}
                contentContainerStyle={styles.messageListContent}
                scrollEnabled
              />
            )}
          </View>

          {messageError ? (
            <View style={styles.messageErrorCard}>
              <Text style={styles.errorTitle}>Message issue</Text>
              <Text style={styles.errorBody}>{messageError}</Text>
            </View>
          ) : null}

          <View style={styles.messageComposer}>
            <TextInput
              editable={!sendingMessage}
              multiline
              onChangeText={setMessageDraft}
              placeholder="Send a quick update..."
              placeholderTextColor="#94a3b8"
              style={[styles.textInput, styles.messageInput]}
              value={messageDraft}
            />
            <Pressable
              disabled={sendingMessage || messageDraft.trim().length === 0}
              onPress={() => void sendMessage()}
              style={[
                styles.messageSendButton,
                (sendingMessage || messageDraft.trim().length === 0) && styles.buttonDisabled,
              ]}
            >
              {sendingMessage ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.messageSendText}>Send</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {releaseRequests.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Ionicons name="cash-outline" size={18} color={palette.accent} />
            <Text style={[styles.cardTitle, { marginLeft: 6 }]}>Release Requests</Text>
          </View>
          {releaseRequests.map((req) => {
            const isPending = req.status === "pending";
            const canAct = isPending && user.role === "buyer" && req.requestedById !== user.id;
            const isActing = releaseRequestActionId === req.id;
            return (
              <View key={req.id} style={styles.releaseRequestItem}>
                <View style={styles.releaseRequestHeader}>
                  <Text style={styles.releaseRequestAmount}>
                    {formatCurrency(req.amount, req.currency as Order["currency"])}
                  </Text>
                  <View
                    style={[
                      styles.releaseStatusBadge,
                      req.status === "approved" && styles.releaseStatusApproved,
                      req.status === "rejected" && styles.releaseStatusRejected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.releaseStatusText,
                        req.status === "approved" && styles.releaseStatusTextApproved,
                        req.status === "rejected" && styles.releaseStatusTextRejected,
                      ]}
                    >
                      {req.status}
                    </Text>
                  </View>
                </View>
                {req.note ? <Text style={styles.rowText}>{req.note}</Text> : null}
                <Text style={styles.reportDate}>{formatDate(req.createdAt)}</Text>
                {canAct ? (
                  <View style={styles.releaseRequestActions}>
                    <Pressable
                      disabled={isActing}
                      onPress={() => void handleApproveReleaseRequest(req.id)}
                      style={[styles.releaseApproveButton, isActing && styles.buttonDisabled]}
                    >
                      {isActing ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={14} color="#ffffff" />
                          <Text style={styles.releaseApproveText}>Approve</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      disabled={isActing}
                      onPress={() => void handleRejectReleaseRequest(req.id)}
                      style={[styles.releaseRejectButton, isActing && styles.buttonDisabled]}
                    >
                      {isActing ? (
                        <ActivityIndicator color={palette.danger} size="small" />
                      ) : (
                        <>
                          <Ionicons name="close-circle-outline" size={14} color={palette.danger} />
                          <Text style={styles.releaseRejectText}>Reject</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {canBuyerDispute ? (
        <View style={styles.card}>
          <Pressable
            onPress={() => setShowDisputeForm((v) => !v)}
            style={styles.disputeToggleRow}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="alert-circle-outline" size={18} color={palette.danger} />
              <Text style={[styles.cardTitle, { color: palette.danger }]}>Open Dispute</Text>
            </View>
            <Ionicons
              name={showDisputeForm ? "chevron-up" : "chevron-down"}
              size={18}
              color={palette.slate}
            />
          </Pressable>
          {showDisputeForm ? (
            <View style={styles.disputeForm}>
              <Text style={styles.formLabel}>Reason</Text>
              <TextInput
                editable={!isActioning("dispute")}
                onChangeText={setDisputeReason}
                placeholder="Why are you opening a dispute?"
                placeholderTextColor="#94a3b8"
                style={styles.textInput}
                value={disputeReason}
              />
              <Text style={styles.formLabel}>Details (optional)</Text>
              <TextInput
                editable={!isActioning("dispute")}
                multiline
                onChangeText={setDisputeDetails}
                placeholder="Provide additional context"
                placeholderTextColor="#94a3b8"
                style={[styles.textInput, styles.textArea]}
                value={disputeDetails}
              />
              <Text style={styles.formLabel}>Evidence images (optional, up to 4)</Text>
              <View style={styles.disputeImageRow}>
                {disputeImages.map((img, index) => (
                  <View key={`dispute-img-${index}`} style={styles.disputeImageThumb}>
                    <Image source={{ uri: img.uri }} style={styles.disputeImagePreview} />
                    <Pressable
                      onPress={() => removeDisputeImage(index)}
                      style={styles.disputeImageRemove}
                    >
                      <Ionicons name="close" size={14} color="#ffffff" />
                    </Pressable>
                  </View>
                ))}
                {disputeImages.length < 4 ? (
                  <Pressable
                    onPress={() => void pickDisputeImages()}
                    style={styles.disputeImageAdd}
                  >
                    <Ionicons name="camera-outline" size={22} color={palette.slate} />
                    <Text style={styles.disputeImageAddText}>Add</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                disabled={isActioning("dispute")}
                onPress={() => void submitDispute()}
                style={[
                  styles.actionButton,
                  styles.actionDanger,
                  isActioning("dispute") && styles.buttonDisabled,
                ]}
              >
                {isActioning("dispute") ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.actionButtonText}>
                      {uploadingDisputeImages ? "Uploading images..." : "Opening dispute..."}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.actionButtonText}>Submit dispute</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionCard}>
        {canProviderAccept ? (
          <Pressable
            disabled={isActioning("accept")}
            onPress={acceptOrder}
            style={[styles.actionButton, isActioning("accept") && styles.buttonDisabled]}
          >
            {isActioning("accept") ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.actionButtonText}>Accept order</Text>
            )}
          </Pressable>
        ) : null}

        {canProviderDeliver ? (
          <Pressable
            disabled={isActioning("deliver")}
            onPress={markDelivered}
            style={[styles.actionButton, isActioning("deliver") && styles.buttonDisabled]}
          >
            {isActioning("deliver") ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.actionButtonText}>Mark delivered</Text>
            )}
          </Pressable>
        ) : null}

        {canProviderRequestPayout ? (
          <Pressable
            disabled={isActioning("request_release")}
            onPress={requestPayout}
            style={[
              styles.actionButton,
              styles.actionSecondary,
              isActioning("request_release") && styles.buttonDisabled,
            ]}
          >
            {isActioning("request_release") ? (
              <ActivityIndicator color={palette.ink} size="small" />
            ) : (
              <Text style={styles.actionButtonTextSecondary}>Request disbursement</Text>
            )}
          </Pressable>
        ) : null}

        {canBuyerApprove ? (
          <Pressable
            disabled={isActioning("approve")}
            onPress={approveCompletion}
            style={[styles.actionButton, isActioning("approve") && styles.buttonDisabled]}
          >
            {isActioning("approve") ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.actionButtonText}>Approve & release</Text>
            )}
          </Pressable>
        ) : null}

        {order.status === "payment_pending" && paymentReturnParams ? (
          <Pressable
            onPress={() => onOpenPaymentStatus(paymentReturnParams)}
            style={[styles.actionButton, styles.actionSecondary]}
          >
            <Text style={styles.actionButtonTextSecondary}>Check payment</Text>
          </Pressable>
        ) : null}

        {canPayOutstanding && pendingPayment ? (
          <Pressable
            disabled={paying}
            onPress={() => void startOrderPayment()}
            style={[
              styles.actionButton,
              styles.actionSecondary,
              paying && styles.buttonDisabled,
            ]}
          >
            {paying ? (
              <ActivityIndicator color={palette.ink} size="small" />
            ) : (
              <Text style={styles.actionButtonTextSecondary}>{paymentActionLabel}</Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {isLoading ? <Text style={styles.loadingText}>Refreshing...</Text> : null}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  content: {
    gap: 14,
    padding: 20,
    paddingBottom: 140,
  },
  centeredPage: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  actionCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  title: {
    color: palette.accentDeep,
    fontSize: 24,
    fontWeight: "800",
  },
  serviceTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  supportingText: {
    color: palette.slate,
    fontSize: 14,
  },
  cardTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  rowText: {
    color: palette.slate,
    fontSize: 14,
    marginTop: 4,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statusText: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  timeline: {
    gap: 8,
    marginTop: 10,
  },
  timelineItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  timelineDot: {
    backgroundColor: palette.line,
    borderRadius: 8,
    height: 14,
    width: 14,
  },
  timelineDotReached: {
    backgroundColor: palette.accentDeep,
  },
  timelineText: {
    color: palette.slate,
    fontSize: 13,
  },
  timelineTextReached: {
    color: palette.accentDeep,
    fontWeight: "700",
  },
  timelineDotTerminal: {
    backgroundColor: palette.danger,
  },
  timelineTextTerminal: {
    color: palette.danger,
    fontWeight: "700",
  },
  errorCard: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  errorTitle: {
    color: palette.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  errorBody: {
    color: "#7f1d1d",
    fontSize: 13,
    lineHeight: 19,
  },
  messageList: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    maxHeight: 250,
    overflow: "hidden",
    padding: 10,
  },
  messageListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  messageBubble: {
    borderRadius: 12,
    gap: 6,
    maxWidth: "85%",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  messageMine: {
    alignSelf: "flex-end",
    backgroundColor: palette.accentDeep,
  },
  messagePeer: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
  },
  messageMineText: {
    color: "#ffffff",
    fontSize: 13,
  },
  messagePeerText: {
    color: palette.ink,
    fontSize: 13,
  },
  messageMeta: {
    color: "#94a3b8",
    fontSize: 10,
  },
  messageErrorCard: {
    marginTop: 10,
  },
  unreadBadgeText: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 8,
  },
  messageComposer: {
    gap: 8,
    marginTop: 10,
  },
  messageInput: {
    maxHeight: 88,
    minHeight: 52,
  },
  messageSendButton: {
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  messageSendText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  actionButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionSecondary: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
    borderWidth: 1,
  },
  actionDanger: {
    backgroundColor: palette.danger,
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  actionButtonTextSecondary: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  reportList: {
    gap: 10,
    marginTop: 8,
  },
  reportItem: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  reportHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  reportTitle: {
    color: palette.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  reportPercent: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  reportDate: {
    color: palette.slate,
    fontSize: 11,
  },
  progressForm: {
    gap: 8,
    marginTop: 10,
  },
  formLabel: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
  },
  textInput: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  loadingText: {
    color: palette.slate,
    fontSize: 13,
  },
  releaseRequestItem: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    marginTop: 8,
    padding: 12,
  },
  releaseRequestHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  releaseRequestAmount: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  releaseStatusBadge: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  releaseStatusApproved: {
    backgroundColor: palette.accentSoft,
  },
  releaseStatusRejected: {
    backgroundColor: "#fff1f2",
  },
  releaseStatusText: {
    color: "#92400e",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  releaseStatusTextApproved: {
    color: palette.accentDeep,
  },
  releaseStatusTextRejected: {
    color: palette.danger,
  },
  releaseRequestActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  releaseApproveButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 10,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  releaseApproveText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  releaseRejectButton: {
    alignItems: "center",
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  releaseRejectText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  disputeToggleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  disputeForm: {
    gap: 8,
    marginTop: 10,
  },
  disputeImageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  disputeImageThumb: {
    borderRadius: 10,
    height: 72,
    overflow: "hidden",
    position: "relative",
    width: 72,
  },
  disputeImagePreview: {
    borderRadius: 10,
    height: 72,
    width: 72,
  },
  disputeImageRemove: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: 3,
    top: 3,
    width: 20,
  },
  disputeImageAdd: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: 2,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  disputeImageAddText: {
    color: palette.slate,
    fontSize: 10,
    fontWeight: "600",
  },
}));
