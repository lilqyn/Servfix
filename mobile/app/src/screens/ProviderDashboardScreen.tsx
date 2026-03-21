import { Ionicons } from "@expo/vector-icons";
import { Component, useCallback, useEffect, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  fetchOrders,
  fetchProviderReviewAnalytics,
  fetchProviderReviews,
  fetchWallet,
  replyToProviderReview,
} from "../lib/api";
import type { ProviderReview, ProviderReviewAnalytics } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { formatCurrency, toNumber } from "../lib/format";
import { useTheme } from "../providers/ThemeProvider";
import { createThemedStyles, palette } from "../theme";
import type { Order, WalletData } from "../types";

type Props = {
  onOpenOrders: () => void;
  onOpenMyServices: () => void;
  onOpenWallet: () => void;
  onOpenCreateService: () => void;
  onOpenBoosts?: () => void;
  onOpenSubscriptions?: () => void;
};

const ACTIVE_STATUSES = new Set([
  "paid_to_escrow",
  "accepted",
  "in_progress",
  "delivery_submitted",
  "delivered",
]);

/* ─── Star helpers ──────────────────────────────────────────────────────────── */

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  const stars: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Ionicons
        key={i}
        name={i <= Math.round(rating) ? "star" : "star-outline"}
        size={size}
        color="#f59e0b"
      />,
    );
  }
  return <View style={{ flexDirection: "row", gap: 1 }}>{stars}</View>;
}

/* ─── Rating bar component ──────────────────────────────────────────────────── */

function RatingBar({ star, count, total }: { star: number; count: number; total: number }) {
  const styles = useStyles();
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={styles.ratingBarRow}>
      <Text style={styles.ratingBarLabel}>{star}</Text>
      <Ionicons name="star" size={10} color="#f59e0b" />
      <View style={styles.ratingBarTrack}>
        <View style={[styles.ratingBarFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.ratingBarCount}>{count}</Text>
    </View>
  );
}

/* ─── Single review card ────────────────────────────────────────────────────── */

function ReviewCard({
  review,
  onReplied,
}: {
  review: ProviderReview;
  onReplied: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState(review.reply ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitReply = async () => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await replyToProviderReview(review.id, trimmed);
      setShowReplyInput(false);
      onReplied();
    } catch {
      // silently fail — user can retry
    } finally {
      setSubmitting(false);
    }
  };

  const dateStr = new Date(review.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.reviewerName}>
            {review.reviewer.username ?? "User"}
          </Text>
          <Text style={styles.reviewService}>{review.service.title}</Text>
        </View>
        <Text style={styles.reviewDate}>{dateStr}</Text>
      </View>

      <StarRow rating={review.rating} size={13} />

      {review.comment ? (
        <Text style={styles.reviewComment}>{review.comment}</Text>
      ) : null}

      {/* Existing reply */}
      {review.reply ? (
        <View style={styles.replyBubble}>
          <Text style={styles.replyLabel}>Your reply</Text>
          <Text style={styles.replyText}>{review.reply}</Text>
        </View>
      ) : null}

      {/* Reply button / input */}
      {!review.reply && !showReplyInput ? (
        <Pressable
          onPress={() => setShowReplyInput(true)}
          style={styles.replyButton}
        >
          <Ionicons name="chatbubble-outline" size={13} color={palette.accent} />
          <Text style={styles.replyButtonText}>Reply</Text>
        </Pressable>
      ) : null}

      {showReplyInput ? (
        <View style={styles.replyInputWrap}>
          <TextInput
            style={styles.replyInput}
            placeholder="Write your reply..."
            placeholderTextColor="#94a3b8"
            value={replyText}
            onChangeText={setReplyText}
            multiline
            editable={!submitting}
          />
          <View style={styles.replyActions}>
            <Pressable
              onPress={() => setShowReplyInput(false)}
              style={styles.replyCancelBtn}
            >
              <Text style={styles.replyCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmitReply}
              disabled={submitting || !replyText.trim()}
              style={[
                styles.replySendBtn,
                (submitting || !replyText.trim()) && { opacity: 0.5 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.replySendText}>Send</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ─── Error boundary (class component — cannot use hooks, uses static palette) */

const ebStyles = StyleSheet.create({
  centered: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  retryButtonText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: "700",
  },
});

class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ProviderDashboard crash:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.centered}>
          <Ionicons name="warning-outline" size={40} color={palette.danger} />
          <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "700", marginTop: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ color: palette.slate, fontSize: 13, textAlign: "center", marginTop: 4 }}>
            The dashboard couldn't load. Please try again.
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false })}
            style={ebStyles.retryButton}
          >
            <Text style={ebStyles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

/* ─── Main screen ───────────────────────────────────────────────────────────── */

export function ProviderDashboardScreen(props: Props) {
  return (
    <DashboardErrorBoundary>
      <ProviderDashboardInner {...props} />
    </DashboardErrorBoundary>
  );
}

function ProviderDashboardInner({
  onOpenOrders,
  onOpenMyServices,
  onOpenWallet,
  onOpenCreateService,
  onOpenBoosts,
  onOpenSubscriptions,
}: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [reviewAnalytics, setReviewAnalytics] =
    useState<ProviderReviewAnalytics | null>(null);
  const [recentReviews, setRecentReviews] = useState<ProviderReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      try {
        const [ordersData, walletData, analytics, reviewsData] =
          await Promise.all([
            fetchOrders(),
            fetchWallet().catch(() => null),
            fetchProviderReviewAnalytics().catch(() => null),
            fetchProviderReviews({ limit: 5 }).catch(() => ({
              reviews: [] as ProviderReview[],
            })),
          ]);
        setOrders(ordersData);
        setWallet(walletData);
        setReviewAnalytics(analytics);
        setRecentReviews(reviewsData.reviews);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load dashboard.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [],
  );

  const reloadReviews = useCallback(async () => {
    try {
      const [analytics, reviewsData] = await Promise.all([
        fetchProviderReviewAnalytics().catch(() => null),
        fetchProviderReviews({ limit: 5 }).catch(() => ({
          reviews: [] as ProviderReview[],
        })),
      ]);
      setReviewAnalytics(analytics);
      setRecentReviews(reviewsData.reviews);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.has(o.status));
  const newOrders = orders.filter((o) => o.status === "paid_to_escrow");
  const completedOrders = orders.filter((o) =>
    ["approved", "released", "disbursed"].includes(o.status),
  );

  const totalEarned = completedOrders.reduce(
    (sum, o) => sum + toNumber(o.amountNetProvider),
    0,
  );

  const displayName =
    user?.providerProfile?.displayName || user?.username || "Provider";
  const ratingAvg = user?.providerProfile?.ratingAvg;
  const ratingDisplay =
    ratingAvg != null
      ? (typeof ratingAvg === "string"
          ? parseFloat(ratingAvg)
          : ratingAvg
        ).toFixed(1)
      : null;

  const walletCurrency = wallet?.earnings?.currency ?? "GHS";

  // Earnings totals from wallet
  const totalEarnings = wallet?.earnings
    ? toNumber(wallet.earnings.payable) +
      toNumber(wallet.earnings.pending_release) +
      toNumber(wallet.earnings.reserved_for_disbursement)
    : 0;
  const availableBalance = wallet?.earnings ? toNumber(wallet.earnings.payable) : 0;
  const pendingAmount = wallet?.earnings ? toNumber(wallet.earnings.pending_release) : 0;

  // Payout history
  const payouts = wallet?.disbursement_requests ?? [];
  const recentPayouts = payouts.slice(0, 5);

  return (
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
      {/* Greeting */}
      <View style={styles.greetCard}>
        <Text style={styles.eyebrow}>PROVIDER DASHBOARD</Text>
        <Text style={styles.greetTitle}>Welcome, {displayName}</Text>
        {ratingDisplay ? (
          <Text style={styles.greetRating}>
            <Ionicons name="star" size={14} color="#fbbf24" /> {ratingDisplay}{" "}
            average rating
          </Text>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Stat cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardGreen]}>
          <Text style={styles.statValue}>{newOrders.length}</Text>
          <Text style={styles.statLabel}>New orders</Text>
        </View>
        <View style={[styles.statCard, styles.statCardBlue]}>
          <Text style={styles.statValue}>{activeOrders.length}</Text>
          <Text style={styles.statLabel}>Active jobs</Text>
        </View>
        <View style={[styles.statCard, styles.statCardOrange]}>
          <Text style={styles.statValue}>{completedOrders.length}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={[styles.statCard, styles.statCardPurple]}>
          <Text style={styles.statValue}>
            {formatCurrency(totalEarned, "GHS")}
          </Text>
          <Text style={styles.statLabel}>Total earned</Text>
        </View>
      </View>

      {/* ─── Earnings card ──────────────────────────────────────────────── */}
      {wallet ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="cash-outline" size={20} color={palette.accent} />
            <Text style={styles.sectionTitle}>Earnings</Text>
          </View>

          <View style={styles.earningsGrid}>
            <View style={styles.earningsItem}>
              <Ionicons
                name="wallet-outline"
                size={22}
                color={palette.accentDeep}
              />
              <Text style={styles.earningsAmount}>
                {formatCurrency(totalEarnings, walletCurrency)}
              </Text>
              <Text style={styles.earningsLabel}>Total earnings</Text>
            </View>
            <View style={styles.earningsItem}>
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color="#16a34a"
              />
              <Text style={styles.earningsAmount}>
                {formatCurrency(availableBalance, walletCurrency)}
              </Text>
              <Text style={styles.earningsLabel}>Available</Text>
            </View>
            <View style={styles.earningsItem}>
              <Ionicons name="time-outline" size={22} color="#f59e0b" />
              <Text style={styles.earningsAmount}>
                {formatCurrency(pendingAmount, walletCurrency)}
              </Text>
              <Text style={styles.earningsLabel}>Pending</Text>
            </View>
          </View>

          <Pressable onPress={onOpenWallet} style={styles.viewDetailsBtn}>
            <Text style={styles.viewDetailsBtnText}>View earnings details</Text>
            <Ionicons
              name="arrow-forward"
              size={14}
              color={palette.accent}
            />
          </Pressable>
        </View>
      ) : null}

      {/* ─── Recent payouts card ────────────────────────────────────────── */}
      {recentPayouts.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons
              name="swap-horizontal-outline"
              size={20}
              color={palette.accent}
            />
            <Text style={styles.sectionTitle}>Recent disbursements</Text>
          </View>

          {recentPayouts.map((p) => {
            const statusColor =
              p.status === "paid"
                ? "#16a34a"
                : p.status === "processing"
                  ? "#f59e0b"
                  : p.status === "failed"
                    ? palette.danger
                    : palette.slate;
            const statusIcon: keyof typeof Ionicons.glyphMap =
              p.status === "paid"
                ? "checkmark-circle"
                : p.status === "processing"
                  ? "hourglass"
                  : p.status === "failed"
                    ? "close-circle"
                    : "ellipse-outline";
            return (
              <View key={p.id} style={styles.payoutRow}>
                <Ionicons name={statusIcon} size={18} color={statusColor} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.payoutAmount}>
                    {formatCurrency(p.amount, p.currency)}
                  </Text>
                  <Text style={styles.payoutMeta}>
                    {p.destinationMomo}
                    {p.momoNetwork ? ` (${p.momoNetwork})` : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={[styles.payoutStatus, { color: statusColor }]}>
                    {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                  </Text>
                  <Text style={styles.payoutDate}>
                    {new Date(p.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Wallet summary (existing compact card) */}
      {wallet ? (
        <Pressable onPress={onOpenWallet} style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <Text style={styles.walletTitle}>Earnings</Text>
            <Text style={styles.walletLink}>View details →</Text>
          </View>
          <View style={styles.walletGrid}>
            <View style={styles.walletItem}>
              <Text style={styles.walletAmount}>
                {formatCurrency(wallet.earnings?.payable ?? 0, walletCurrency)}
              </Text>
              <Text style={styles.walletLabel}>Available</Text>
            </View>
            <View style={styles.walletItem}>
              <Text style={styles.walletAmount}>
                {formatCurrency(
                  wallet.earnings?.pending_release ?? 0,
                  walletCurrency,
                )}
              </Text>
              <Text style={styles.walletLabel}>Pending release</Text>
            </View>
          </View>
        </Pressable>
      ) : null}

      {/* ─── Reviews section ────────────────────────────────────────────── */}
      {reviewAnalytics ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="star-outline" size={20} color={palette.accent} />
            <Text style={styles.sectionTitle}>Reviews</Text>
          </View>

          {/* Analytics summary */}
          <View style={styles.reviewSummaryRow}>
            {/* Big average */}
            <View style={styles.reviewBigAvg}>
              <Text style={styles.reviewBigNumber}>
                {(reviewAnalytics.averageRating ?? 0).toFixed(1)}
              </Text>
              <StarRow rating={reviewAnalytics.averageRating ?? 0} size={16} />
              <Text style={styles.reviewTotalCount}>
                {reviewAnalytics.totalCount ?? 0}{" "}
                {reviewAnalytics.totalCount === 1 ? "review" : "reviews"}
              </Text>
            </View>

            {/* Rating breakdown bars */}
            <View style={styles.ratingBarsContainer}>
              {[5, 4, 3, 2, 1].map((star) => (
                <RatingBar
                  key={star}
                  star={star}
                  count={reviewAnalytics.breakdown?.[String(star)] ?? 0}
                  total={reviewAnalytics.totalCount ?? 0}
                />
              ))}
            </View>
          </View>

          {/* Recent reviews list */}
          {recentReviews.length > 0 ? (
            <View style={{ gap: 10, marginTop: 6 }}>
              <Text style={styles.reviewSubheading}>Recent reviews</Text>
              {recentReviews.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  onReplied={reloadReviews}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyReviews}>No reviews yet.</Text>
          )}
        </View>
      ) : null}

      {/* Quick actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actionGrid}>
          <Pressable
            onPress={onOpenCreateService}
            style={[styles.actionCard, styles.actionCardPrimary]}
          >
            <Ionicons name="add-circle" size={24} color="#ffffff" />
            <Text style={styles.actionCardTitleLight}>Create service</Text>
            <Text style={styles.actionCardHintLight}>List a new offering</Text>
          </Pressable>
          <Pressable onPress={onOpenMyServices} style={styles.actionCard}>
            <Ionicons name="briefcase-outline" size={22} color={palette.accentDeep} />
            <Text style={styles.actionCardTitle}>My services</Text>
            <Text style={styles.actionCardHint}>Manage listings</Text>
          </Pressable>
          <Pressable onPress={onOpenOrders} style={styles.actionCard}>
            <Ionicons name="receipt-outline" size={22} color={palette.accentDeep} />
            <Text style={styles.actionCardTitle}>Orders</Text>
            <Text style={styles.actionCardHint}>View all jobs</Text>
          </Pressable>
          <Pressable onPress={onOpenWallet} style={styles.actionCard}>
            <Ionicons name="wallet-outline" size={22} color={palette.accentDeep} />
            <Text style={styles.actionCardTitle}>Wallet</Text>
            <Text style={styles.actionCardHint}>Withdraw funds</Text>
          </Pressable>
          {onOpenBoosts && (
            <Pressable onPress={onOpenBoosts} style={styles.actionCard}>
              <Ionicons name="rocket-outline" size={22} color={palette.accentDeep} />
              <Text style={styles.actionCardTitle}>Boosts</Text>
              <Text style={styles.actionCardHint}>Promote services</Text>
            </Pressable>
          )}
          {onOpenSubscriptions && (
            <Pressable onPress={onOpenSubscriptions} style={styles.actionCard}>
              <Ionicons name="diamond-outline" size={22} color={palette.accentDeep} />
              <Text style={styles.actionCardTitle}>Plans</Text>
              <Text style={styles.actionCardHint}>Subscription plans</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* New orders list */}
      {newOrders.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Awaiting your acceptance</Text>
          {newOrders.slice(0, 3).map((order) => (
            <View key={order.id} style={styles.orderRow}>
              <View style={styles.orderDot} />
              <View style={styles.orderInfo}>
                <Text numberOfLines={1} style={styles.orderTitle}>
                  {order.service?.title ?? "Service"}
                </Text>
                <Text style={styles.orderMeta}>
                  {formatCurrency(order.amountGross, order.currency)} ·{" "}
                  {order.tier?.name ?? "Custom"}
                </Text>
              </View>
              <Pressable onPress={onOpenOrders} style={styles.orderAction}>
                <Text style={styles.orderActionText}>View</Text>
              </Pressable>
            </View>
          ))}
          {newOrders.length > 3 ? (
            <Pressable onPress={onOpenOrders}>
              <Text style={styles.viewAllText}>
                View all {newOrders.length} pending orders →
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  centered: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { color: palette.slate, fontSize: 14 },
  content: { gap: 16, padding: 20, paddingBottom: 100 },
  greetCard: {
    backgroundColor: palette.ink,
    borderRadius: 24,
    gap: 6,
    padding: 22,
  },
  eyebrow: {
    color: "#6ee7b7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  greetTitle: { color: "#ffffff", fontSize: 22, fontWeight: "800" },
  greetRating: { color: "#d1fae5", fontSize: 14 },
  errorCard: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  retryButtonText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    borderRadius: 18,
    gap: 4,
    minWidth: "47%",
    padding: 16,
    flex: 1,
  },
  statCardGreen: { backgroundColor: "#dcfce7" },
  statCardBlue: { backgroundColor: "#e0f2fe" },
  statCardOrange: { backgroundColor: "#ffedd5" },
  statCardPurple: { backgroundColor: "#faf5ff" },
  statValue: { color: palette.ink, fontSize: 20, fontWeight: "900" },
  statLabel: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  /* ── Earnings ────────────────────────────────────────────────────────── */
  earningsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  earningsItem: {
    alignItems: "center",
    backgroundColor: palette.mist,
    borderRadius: 14,
    flex: 1,
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  earningsAmount: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  earningsLabel: {
    color: palette.slate,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  viewDetailsBtn: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
  },
  viewDetailsBtnText: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "700",
  },

  /* ── Payouts ─────────────────────────────────────────────────────────── */
  payoutRow: {
    alignItems: "center",
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  payoutAmount: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  payoutMeta: { color: palette.slate, fontSize: 12 },
  payoutStatus: { fontSize: 12, fontWeight: "700" },
  payoutDate: { color: palette.slate, fontSize: 11 },

  /* ── Reviews ─────────────────────────────────────────────────────────── */
  reviewSummaryRow: {
    flexDirection: "row",
    gap: 16,
  },
  reviewBigAvg: {
    alignItems: "center",
    gap: 4,
    minWidth: 80,
  },
  reviewBigNumber: {
    color: palette.ink,
    fontSize: 32,
    fontWeight: "900",
  },
  reviewTotalCount: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  ratingBarsContainer: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
  },
  ratingBarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  ratingBarLabel: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
    width: 12,
    textAlign: "right",
  },
  ratingBarTrack: {
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    flex: 1,
    height: 8,
    overflow: "hidden",
  },
  ratingBarFill: {
    backgroundColor: "#f59e0b",
    borderRadius: 4,
    height: "100%",
  },
  ratingBarCount: {
    color: palette.slate,
    fontSize: 11,
    fontWeight: "600",
    minWidth: 20,
    textAlign: "right",
  },
  reviewSubheading: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  reviewCard: {
    backgroundColor: palette.mist,
    borderRadius: 14,
    gap: 8,
    padding: 14,
  },
  reviewHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
  },
  reviewerName: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  reviewService: { color: palette.slate, fontSize: 12 },
  reviewDate: { color: palette.slate, fontSize: 11 },
  reviewComment: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  replyBubble: {
    backgroundColor: "#e0f2fe",
    borderRadius: 10,
    gap: 4,
    padding: 10,
  },
  replyLabel: {
    color: palette.slate,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  replyText: { color: palette.ink, fontSize: 13 },
  replyButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    paddingVertical: 4,
  },
  replyButtonText: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  replyInputWrap: { gap: 8 },
  replyInput: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 13,
    maxHeight: 100,
    padding: 10,
  },
  replyActions: {
    alignSelf: "flex-end",
    flexDirection: "row",
    gap: 8,
  },
  replyCancelBtn: {
    borderColor: palette.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  replyCancelText: { color: palette.slate, fontSize: 12, fontWeight: "600" },
  replySendBtn: {
    backgroundColor: palette.accentDeep,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  replySendText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  emptyReviews: {
    color: palette.slate,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 4,
  },

  /* ── Shared section ──────────────────────────────────────────────────── */
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },

  /* ── Wallet card ─────────────────────────────────────────────────────── */
  walletCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  walletHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  walletTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  walletLink: { color: palette.accent, fontSize: 13, fontWeight: "700" },
  walletGrid: { flexDirection: "row", gap: 20 },
  walletItem: { gap: 4 },
  walletAmount: { color: palette.ink, fontSize: 18, fontWeight: "900" },
  walletLabel: { color: palette.slate, fontSize: 12, fontWeight: "700" },
  section: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard: {
    backgroundColor: palette.mist,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minWidth: "47%",
    padding: 14,
  },
  actionCardPrimary: {
    backgroundColor: palette.accentDeep,
    borderColor: palette.accentDeep,
  },
  actionCardGlyph: { color: "#ffffff", fontSize: 24, fontWeight: "900" },
  actionCardGlyph2: {
    color: palette.accentDeep,
    fontSize: 20,
    fontWeight: "900",
  },
  actionCardTitle: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  actionCardTitleLight: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  actionCardHint: { color: palette.slate, fontSize: 12 },
  actionCardHintLight: { color: "#bbf7d0", fontSize: 12 },
  orderRow: {
    alignItems: "center",
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  orderDot: {
    backgroundColor: "#f59e0b",
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  orderInfo: { flex: 1, gap: 2 },
  orderTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  orderMeta: { color: palette.slate, fontSize: 12 },
  orderAction: {
    backgroundColor: palette.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  orderActionText: {
    color: palette.accentDeep,
    fontSize: 12,
    fontWeight: "700",
  },
  viewAllText: { color: palette.accent, fontSize: 13, fontWeight: "700" },
}));
