import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetchWallet, requestPayout } from "../lib/api";
import { formatCurrency, toNumber } from "../lib/format";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { PayoutRequest, WalletData } from "../types";

type Props = {
  onBack: () => void;
};

const formatDate = (value: string) => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const makeStatusColors = (p: import("../theme").Palette): Record<string, { bg: string; text: string }> => ({
  requested: { bg: p.warnSoft, text: p.warnInk },
  processing: { bg: p.infoSoft, text: p.info },
  paid: { bg: p.accentSoft, text: p.accentDeep },
  failed: { bg: p.dangerSoft, text: p.dangerInk },
  cancelled: { bg: p.mist, text: p.slate },
});

export function WalletScreen({ onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const STATUS_COLORS = makeStatusColors(palette);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const data = await fetchWallet();
      setWallet(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load wallet.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleWithdraw = useCallback(async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError("Enter a valid amount.");
      return;
    }

    const available = toNumber(wallet?.earnings.payable ?? 0);
    if (amount > available) {
      setWithdrawError(`Maximum available is ${formatCurrency(available, wallet?.earnings.currency ?? "GHS")}.`);
      return;
    }

    Alert.alert(
      "Confirm withdrawal",
      `Withdraw ${formatCurrency(amount, wallet?.earnings.currency ?? "GHS")} to your registered MoMo number?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setIsWithdrawing(true);
            setWithdrawError(null);
            try {
              await requestPayout({ amount });
              setWithdrawAmount("");
              await load("refresh");
            } catch (err) {
              setWithdrawError(err instanceof Error ? err.message : "Withdrawal failed. Try again.");
            } finally {
              setIsWithdrawing(false);
            }
          },
        },
      ],
    );
  }, [load, wallet?.earnings.currency, wallet?.earnings.payable, withdrawAmount]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Loading earnings...</Text>
      </View>
    );
  }

  const currency = wallet?.earnings.currency ?? "GHS";
  const payable = toNumber(wallet?.earnings.payable ?? 0);
  const pendingRelease = toNumber(wallet?.earnings.pending_release ?? 0);
  const reserved = toNumber(wallet?.earnings.reserved_for_disbursement ?? 0);
  const payoutHistory = wallet?.disbursement_requests ?? [];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            onRefresh={() => void load("refresh")}
            refreshing={isRefreshing}
            tintColor={palette.accent}
          />
        }
      >
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
          <Text style={styles.topTitle}>Earnings</Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Balance cards */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available to withdraw</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(payable, currency)}</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceSub}>
              <Text style={styles.balanceSubAmount}>{formatCurrency(pendingRelease, currency)}</Text>
              <Text style={styles.balanceSubLabel}>Pending release</Text>
            </View>
            <View style={styles.balanceSub}>
              <Text style={styles.balanceSubAmount}>{formatCurrency(reserved, currency)}</Text>
              <Text style={styles.balanceSubLabel}>In disbursement</Text>
            </View>
          </View>
        </View>

        {/* Withdraw form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Withdraw to MoMo</Text>
          <Text style={styles.sectionHint}>
            Funds will be sent to the mobile money number registered in your account settings.
            KYC verification is required.
          </Text>
          <View style={styles.withdrawRow}>
            <TextInput
              editable={!isWithdrawing}
              keyboardType="decimal-pad"
              onChangeText={(t) => {
                setWithdrawAmount(t.replace(/[^0-9.]/g, ""));
                setWithdrawError(null);
              }}
              placeholder={`Amount in ${currency}`}
              placeholderTextColor={palette.slate}
              style={styles.withdrawInput}
              value={withdrawAmount}
            />
            <Pressable
              disabled={isWithdrawing || !withdrawAmount}
              onPress={() => void handleWithdraw()}
              style={[
                styles.withdrawButton,
                (isWithdrawing || !withdrawAmount) && styles.buttonDisabled,
              ]}
            >
              {isWithdrawing ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.withdrawButtonText}>Withdraw</Text>
              )}
            </Pressable>
          </View>
          {withdrawError ? <Text style={styles.withdrawError}>{withdrawError}</Text> : null}
        </View>

        {/* Payout history */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Disbursement history</Text>
          {payoutHistory.length === 0 ? (
            <Text style={styles.emptyText}>No disbursement requests yet.</Text>
          ) : (
            payoutHistory.map((req) => {
              const statusColor =
                STATUS_COLORS[req.status] ?? STATUS_COLORS.cancelled;
              return (
                <View key={req.id} style={styles.payoutRow}>
                  <View style={styles.payoutInfo}>
                    <Text style={styles.payoutAmount}>
                      {formatCurrency(req.amount, req.currency)}
                    </Text>
                    <Text style={styles.payoutMeta}>
                      {formatDate(req.createdAt)}
                      {req.momoNetwork ? ` · ${req.momoNetwork.toUpperCase()}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.payoutStatus, { backgroundColor: statusColor.bg }]}>
                    <Text style={[styles.payoutStatusText, { color: statusColor.text }]}>
                      {req.status}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  root: { backgroundColor: palette.canvas, flex: 1 },
  centered: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { color: palette.slate, fontSize: 14 },
  content: { gap: 16, padding: 20, paddingBottom: 80 },
  topBar: { alignItems: "center", flexDirection: "row", gap: 12 },
  backButton: {},
  backButtonText: { color: palette.accentDeep, fontSize: 15, fontWeight: "700" },
  topTitle: { color: palette.ink, fontSize: 20, fontWeight: "800" },
  errorCard: {
    backgroundColor: palette.dangerSoft,
    borderColor: palette.dangerLine,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.card,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  retryButtonText: { color: palette.danger, fontSize: 12, fontWeight: "700" },
  balanceCard: {
    backgroundColor: palette.accentDeep,
    borderRadius: 24,
    gap: 10,
    padding: 24,
  },
  balanceLabel: { color: "#bbf7d0", fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  balanceAmount: { color: "#ffffff", fontSize: 36, fontWeight: "900", letterSpacing: 0.2 },
  balanceRow: { flexDirection: "row", gap: 24, marginTop: 6 },
  balanceSub: { gap: 2 },
  balanceSubAmount: { color: "#d1fae5", fontSize: 15, fontWeight: "700" },
  balanceSubLabel: { color: "#6ee7b7", fontSize: 11, fontWeight: "600" },
  section: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  sectionHint: { color: palette.slate, fontSize: 13, lineHeight: 19 },
  withdrawRow: { flexDirection: "row", gap: 10 },
  withdrawInput: {
    backgroundColor: palette.inputBg,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    color: palette.ink,
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  withdrawButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  withdrawButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  buttonDisabled: { opacity: 0.5 },
  withdrawError: { color: palette.danger, fontSize: 13 },
  emptyText: { color: palette.slate, fontSize: 14 },
  payoutRow: {
    alignItems: "center",
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 12,
  },
  payoutInfo: { flex: 1, gap: 3 },
  payoutAmount: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  payoutMeta: { color: palette.slate, fontSize: 12 },
  payoutStatus: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  payoutStatusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
}));
