import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  approveOrderCompletion,
  createOrderPaymentCheckout,
  createOrderProgressReport,
  createOrderConversation,
  fetchOrderPayments,
  fetchOrderProgressReports,
  fetchOrders,
  fetchPublicSettings,
  fetchConversationMessages,
  openOrderDispute,
  requestOrderRelease,
  sendConversationMessage,
  markConversationRead,
  updateOrderStatus,
} from "../lib/api";
import { palette } from "../theme";
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
  "payment_pending",
  "paid_to_escrow",
  "accepted",
  "in_progress",
  "delivery_submitted",
  "release_approved",
  "approved",
  "released",
  "disbursed",
  "dispute_open",
  "disputed",
  "cancelled",
] as const;

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

const formatCurrency = (amount: string | number, currency: Order["currency"]) => {
  const numeric = toNumber(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(numeric);
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

const getTimelineEntries = (status: string) => {
  const currentIndex = TRUST_TIMELINE.indexOf(status as (typeof TRUST_TIMELINE)[number]);
  if (currentIndex < 0) {
    return TRUST_TIMELINE.map((entry) => ({ key: entry, reached: false }));
  }
  return TRUST_TIMELINE.map((entry, index) => ({ key: entry, reached: index <= currentIndex }));
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
  const messageListRef = useRef<FlatList<ConversationMessage> | null>(null);

  const canPayOutstanding = Boolean(pendingPayment) && user?.role === "buyer";
  const timeline = useMemo(() => (order ? getTimelineEntries(order.status) : []), [order]);

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
    if (!conversationId) {
      return;
    }

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
            message.senderId !== user.id ? { ...message, read: true } : message,
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
  }, [conversationId]);

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

  const openDispute = useCallback(() => {
    Alert.alert(
      "Open dispute",
      "Do you want to open a dispute for this order? This pauses release until resolved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open dispute",
          style: "destructive",
          onPress: () =>
            void runOrderAction("dispute", () =>
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
  }, [orderId, runOrderAction]);

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
            Sign in to view and manage your order details, approvals, disputes, and payouts.
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
          {timeline.map((entry) => (
            <View key={entry.key} style={styles.timelineItem}>
              <View
                style={[styles.timelineDot, entry.reached && styles.timelineDotReached]}
              />
              <Text style={[styles.timelineText, entry.reached && styles.timelineTextReached]}>
                {entry.key.replace(/_/g, " ")}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Amounts</Text>
        <Text style={styles.rowText}>Gross: {formatCurrency(order.amountGross, order.currency)}</Text>
        <Text style={styles.rowText}>Net to provider: {formatCurrency(order.amountNetProvider, order.currency)}</Text>
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
              <Text style={styles.actionButtonTextSecondary}>Request payout</Text>
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

        {canBuyerDispute ? (
          <Pressable
            disabled={isActioning("dispute")}
            onPress={openDispute}
            style={[
              styles.actionButton,
              styles.actionDanger,
              isActioning("dispute") && styles.buttonDisabled,
            ]}
          >
            {isActioning("dispute") ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.actionButtonText}>Open dispute</Text>
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

const styles = StyleSheet.create({
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
});
