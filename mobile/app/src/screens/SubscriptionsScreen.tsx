import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  cancelSubscription,
  createSubscriptionCheckout,
  fetchMySubscription,
  fetchPublicSettings,
  fetchSubscriptionPlans,
} from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { CheckoutProvider, ProviderSubscription, SubscriptionPlan } from "../types";

type Props = {
  onBack: () => void;
};

const PLAN_TINTS = ["#15803d", "#7c3aed", "#ea580c", "#0369a1"];

export function SubscriptionsScreen({ onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [current, setCurrent] = useState<ProviderSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<CheckoutProvider>("flutterwave");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, sub, settings] = await Promise.all([
        fetchSubscriptionPlans().catch(() => []),
        fetchMySubscription().catch(() => null),
        fetchPublicSettings().catch(() => null),
      ]);
      setPlans(p);
      setCurrent(sub);
      if (settings) setDefaultProvider(settings.payments.defaultProvider);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    setActing(true);
    try {
      const result = await createSubscriptionCheckout({
        planId: plan.id,
        provider: defaultProvider,
      });
      if (result.checkoutUrl) {
        await Linking.openURL(result.checkoutUrl);
      }
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setActing(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      "Cancel subscription",
      "Your subscription will be cancelled immediately. Are you sure?",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel subscription",
          style: "destructive",
          onPress: async () => {
            setActing(true);
            try {
              await cancelSubscription();
              Alert.alert("Cancelled", "Your subscription has been cancelled.");
              void load();
            } catch (err: unknown) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to cancel");
            } finally {
              setActing(false);
            }
          },
        },
      ],
    );
  };

  const parseBenefits = (benefits: Record<string, unknown> | string[]): string[] => {
    if (Array.isArray(benefits)) return benefits;
    return Object.entries(benefits).map(([k, v]) => `${k}: ${v}`);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Current subscription */}
      {current && (
        <View style={styles.currentCard}>
          <View style={styles.currentHeader}>
            <View style={styles.currentBadge}>
              <Ionicons name="checkmark-circle" size={18} color="#15803d" />
              <Text style={styles.currentBadgeText}>Active Plan</Text>
            </View>
            <Pressable onPress={handleCancel} disabled={acting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.currentPlanName}>{current.plan.name}</Text>
          <Text style={styles.currentPrice}>
            {current.plan.currency} {Number(current.plan.monthlyPrice).toLocaleString()}/mo
          </Text>
          {current.renewsAt && (
            <Text style={styles.currentMeta}>
              Renews: {new Date(current.renewsAt).toLocaleDateString()}
            </Text>
          )}
          {current.endsAt && (
            <Text style={styles.currentMeta}>
              Ends: {new Date(current.endsAt).toLocaleDateString()}
            </Text>
          )}
        </View>
      )}

      {/* Plans */}
      {plans.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="card-outline" size={48} color={palette.line} />
          <Text style={styles.emptyText}>No subscription plans available.</Text>
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const tint = PLAN_TINTS[index % PLAN_TINTS.length];
            const isCurrent = current?.plan.id === item.id;
            const benefits = parseBenefits(item.benefits);
            return (
              <View style={[styles.planCard, isCurrent && { borderColor: tint, borderWidth: 2 }]}>
                {isCurrent && (
                  <View style={[styles.currentTag, { backgroundColor: tint }]}>
                    <Text style={styles.currentTagText}>Current Plan</Text>
                  </View>
                )}
                <Text style={[styles.planName, { color: tint }]}>{item.name}</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.planPrice}>
                    {item.currency} {Number(item.monthlyPrice).toLocaleString()}
                  </Text>
                  <Text style={styles.planPer}>/month</Text>
                </View>
                {benefits.length > 0 && (
                  <View style={styles.benefitsList}>
                    {benefits.map((b, i) => (
                      <View key={i} style={styles.benefitRow}>
                        <Ionicons name="checkmark" size={16} color={tint} />
                        <Text style={styles.benefitText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {!isCurrent && (
                  <Pressable
                    style={[styles.subscribeBtn, { backgroundColor: tint }]}
                    onPress={() => handleSubscribe(item)}
                    disabled={acting}
                  >
                    <Text style={styles.subscribeBtnText}>Subscribe</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      {acting && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#ffffff" size="large" />
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  container: { flex: 1, backgroundColor: palette.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 14, paddingBottom: 40 },
  currentCard: {
    backgroundColor: palette.accentSoft,
    borderRadius: 16,
    margin: 16,
    marginBottom: 0,
    padding: 16,
    gap: 4,
  },
  currentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  currentBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  currentBadgeText: { color: palette.accent, fontSize: 13, fontWeight: "700" },
  cancelText: { color: palette.danger, fontSize: 13, fontWeight: "700" },
  currentPlanName: { color: palette.ink, fontSize: 20, fontWeight: "800" },
  currentPrice: { color: palette.accentDeep, fontSize: 15, fontWeight: "700" },
  currentMeta: { color: palette.slate, fontSize: 12 },
  planCard: {
    backgroundColor: palette.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 20,
    gap: 8,
  },
  currentTag: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 },
  currentTagText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  planName: { fontSize: 18, fontWeight: "800" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  planPrice: { color: palette.ink, fontSize: 28, fontWeight: "800" },
  planPer: { color: palette.slate, fontSize: 14 },
  benefitsList: { gap: 6, marginTop: 4 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  benefitText: { color: palette.ink, fontSize: 13, flex: 1 },
  subscribeBtn: { borderRadius: 12, alignItems: "center", paddingVertical: 14, marginTop: 8 },
  subscribeBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  emptyText: { color: palette.slate, fontSize: 14, textAlign: "center" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
}));
