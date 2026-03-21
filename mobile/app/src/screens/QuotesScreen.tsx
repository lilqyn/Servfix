import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { acceptQuote, createQuote, fetchThreadQuotes, rejectQuote } from "../lib/api";
import { useTheme } from "../providers/ThemeProvider";
import { createThemedStyles } from "../theme";
import type { Quote, QuoteStatus } from "../types";

type Props = {
  threadId: string;
  userRole: "buyer" | "provider" | "admin" | "super_admin" | "staff";
  onBack: () => void;
  onOrderCreated?: (orderId: string) => void;
};

const STATUS_CONFIG: Record<QuoteStatus, { bg: string; color: string; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  sent: { bg: "#dbeafe", color: "#1d4ed8", label: "Pending", icon: "time-outline" },
  accepted: { bg: "#dcfce7", color: "#15803d", label: "Accepted", icon: "checkmark-circle" },
  rejected: { bg: "#fee2e2", color: "#dc2626", label: "Rejected", icon: "close-circle" },
  cancelled: { bg: "#f3f4f6", color: "#6b7280", label: "Cancelled", icon: "ban" },
  expired: { bg: "#fef3c7", color: "#b45309", label: "Expired", icon: "alarm-outline" },
};

const DEPOSIT_OPTIONS = [50, 70, 100];
const CURRENCY_OPTIONS: ("GHS" | "USD" | "EUR")[] = ["GHS", "USD", "EUR"];

export function QuotesScreen({ threadId, userRole, onBack, onOrderCreated }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const isBuyer = userRole === "buyer";
  const isProvider = userRole === "provider" || userRole === "admin" || userRole === "super_admin";

  // Quote creation form (provider only)
  const [showForm, setShowForm] = useState(false);
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState<"GHS" | "USD" | "EUR">("GHS");
  const [formQuantity, setFormQuantity] = useState("1");
  const [formDeposit, setFormDeposit] = useState(50);
  const [formMessage, setFormMessage] = useState("");
  const [formSending, setFormSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchThreadQuotes(threadId);
      setQuotes(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccept = (quote: Quote) => {
    Alert.alert(
      "Accept Quote",
      `Accept this quote for ${quote.currency} ${Number(quote.amount).toLocaleString()}? An order will be created and payment will be required.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: async () => {
            setActing(quote.id);
            try {
              const result = await acceptQuote(quote.id);
              Alert.alert("Quote accepted", "An order has been created.");
              onOrderCreated?.(result.order.id);
              void load();
            } catch (err: unknown) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to accept quote");
            } finally {
              setActing(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = (quote: Quote) => {
    Alert.alert("Reject Quote", "Are you sure you want to reject this quote?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          setActing(quote.id);
          try {
            await rejectQuote(quote.id);
            void load();
          } catch (err: unknown) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to reject quote");
          } finally {
            setActing(null);
          }
        },
      },
    ]);
  };

  const handleSendQuote = async () => {
    const amount = parseFloat(formAmount);
    if (!formAmount || isNaN(amount) || amount <= 0) {
      setFormError("Enter a valid amount.");
      return;
    }
    const quantity = parseInt(formQuantity, 10) || 1;

    setFormSending(true);
    setFormError(null);
    try {
      await createQuote(threadId, {
        amount,
        currency: formCurrency,
        quantity,
        depositPercent: formDeposit,
        message: formMessage.trim() || undefined,
      });
      setFormAmount("");
      setFormQuantity("1");
      setFormMessage("");
      setFormDeposit(50);
      setShowForm(false);
      void load();
      Alert.alert("Quote sent", "The buyer will be notified.");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to send quote.");
    } finally {
      setFormSending(false);
    }
  };

  const renderQuote = ({ item }: { item: Quote }) => {
    const config = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.sent;
    const providerName =
      item.provider?.providerProfile?.displayName ?? item.provider?.username ?? "Provider";
    const canAct = isBuyer && item.status === "sent";
    const isActing = acting === item.id;

    return (
      <View style={styles.quoteCard}>
        <View style={styles.quoteHeader}>
          <View style={styles.quoteHeaderLeft}>
            <Ionicons name="document-text" size={18} color={palette.accentDeep} />
            <Text style={styles.quoteFrom}>Quote from {providerName}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
            <Ionicons name={config.icon} size={12} color={config.color} />
            <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>

        {item.service?.title && (
          <Text style={styles.quoteService} numberOfLines={1}>
            {item.service.title}
          </Text>
        )}

        <View style={styles.quoteAmountRow}>
          <View style={styles.quoteAmountBlock}>
            <Text style={styles.quoteAmountLabel}>Total</Text>
            <Text style={styles.quoteAmountValue}>
              {item.currency} {Number(item.amount).toLocaleString()}
            </Text>
          </View>
          {item.depositPercent > 0 && (
            <View style={styles.quoteAmountBlock}>
              <Text style={styles.quoteAmountLabel}>Deposit ({item.depositPercent}%)</Text>
              <Text style={styles.quoteDepositValue}>
                {item.currency} {Number(item.depositAmount).toLocaleString()}
              </Text>
            </View>
          )}
          {item.quantity > 1 && (
            <View style={styles.quoteAmountBlock}>
              <Text style={styles.quoteAmountLabel}>Qty</Text>
              <Text style={styles.quoteQty}>{item.quantity}</Text>
            </View>
          )}
        </View>

        {item.message && (
          <View style={styles.quoteMessage}>
            <Text style={styles.quoteMessageText}>{item.message}</Text>
          </View>
        )}

        {item.expiresAt && (
          <Text style={styles.quoteExpiry}>
            Expires: {new Date(item.expiresAt).toLocaleDateString()}
          </Text>
        )}

        <Text style={styles.quoteDate}>
          Sent: {new Date(item.createdAt).toLocaleDateString()}
        </Text>

        {canAct && (
          <View style={styles.quoteActions}>
            <Pressable
              style={styles.acceptBtn}
              onPress={() => handleAccept(item)}
              disabled={isActing}
            >
              {isActing ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#ffffff" />
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={styles.rejectBtn}
              onPress={() => handleReject(item)}
              disabled={isActing}
            >
              <Ionicons name="close" size={18} color={palette.danger} />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.accent} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      {/* Provider: Send quote FAB */}
      {isProvider && !showForm && (
        <Pressable style={styles.fab} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>Send quote</Text>
        </Pressable>
      )}

      {/* Provider: Quote creation form */}
      {isProvider && showForm && (
        <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>New Quote</Text>
              <Pressable onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={22} color={palette.ink} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Amount</Text>
            <TextInput
              keyboardType="decimal-pad"
              onChangeText={(t) => { setFormAmount(t.replace(/[^0-9.]/g, "")); setFormError(null); }}
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={formAmount}
            />

            <Text style={styles.fieldLabel}>Currency</Text>
            <View style={styles.chipRow}>
              {CURRENCY_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setFormCurrency(c)}
                  style={[styles.chip, formCurrency === c && styles.chipActive]}
                >
                  <Text style={[styles.chipText, formCurrency === c && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Quantity</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(t) => setFormQuantity(t.replace(/[^0-9]/g, ""))}
              placeholder="1"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={formQuantity}
            />

            <Text style={styles.fieldLabel}>Deposit %</Text>
            <View style={styles.chipRow}>
              {DEPOSIT_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setFormDeposit(d)}
                  style={[styles.chip, formDeposit === d && styles.chipActive]}
                >
                  <Text style={[styles.chipText, formDeposit === d && styles.chipTextActive]}>{d}%</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Message (optional)</Text>
            <TextInput
              multiline
              onChangeText={setFormMessage}
              placeholder="Add details about this quote..."
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.textarea]}
              value={formMessage}
            />

            {formError && <Text style={styles.formError}>{formError}</Text>}

            <Pressable
              disabled={formSending}
              onPress={() => void handleSendQuote()}
              style={[styles.sendBtn, formSending && styles.btnDisabled]}
            >
              {formSending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendBtnText}>Send quote</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* Quote list or empty state */}
      {!showForm && (
        <>
          {quotes.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No quotes for this conversation yet.</Text>
              <Text style={styles.emptySubtext}>
                {isBuyer
                  ? "The provider can send you a quote from here."
                  : "Tap \"Send quote\" to create one."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={quotes}
              keyExtractor={(q) => q.id}
              renderItem={renderQuote}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshing={loading}
              onRefresh={load}
            />
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  container: { flex: 1, backgroundColor: palette.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 14, paddingBottom: 80 },
  quoteCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    gap: 8,
  },
  quoteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  quoteHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  quoteFrom: { color: palette.ink, fontSize: 14, fontWeight: "700", flex: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "700" },
  quoteService: { color: palette.slate, fontSize: 13 },
  quoteAmountRow: { flexDirection: "row", gap: 16, marginTop: 4 },
  quoteAmountBlock: { gap: 2 },
  quoteAmountLabel: { color: palette.slate, fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  quoteAmountValue: { color: palette.ink, fontSize: 22, fontWeight: "800" },
  quoteDepositValue: { color: palette.accentDeep, fontSize: 16, fontWeight: "800" },
  quoteQty: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  quoteMessage: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginTop: 2,
  },
  quoteMessageText: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  quoteExpiry: { color: "#b45309", fontSize: 12, fontWeight: "600" },
  quoteDate: { color: palette.slate, fontSize: 11 },
  quoteActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  acceptBtn: {
    flex: 1,
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  acceptBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  rejectBtn: {
    flex: 1,
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  rejectBtnText: { color: palette.danger, fontSize: 14, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  emptyText: { color: palette.slate, fontSize: 15, fontWeight: "600", textAlign: "center" },
  emptySubtext: { color: palette.slate, fontSize: 13, textAlign: "center" },
  // FAB
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    zIndex: 10,
    backgroundColor: palette.accentDeep,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  fabText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  // Form
  formWrap: { padding: 16, paddingBottom: 40 },
  formCard: {
    backgroundColor: palette.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 18,
    gap: 12,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  formTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" },
  fieldLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#f8fafc",
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  chipText: { color: palette.slate, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: palette.accentDeep, fontWeight: "800" },
  formError: { color: palette.danger, fontSize: 13 },
  sendBtn: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 48,
    marginTop: 4,
  },
  sendBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
}));
