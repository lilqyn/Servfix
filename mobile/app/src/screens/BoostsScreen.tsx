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
  createBoostCheckout,
  fetchBoostOptions,
  fetchMyBoosts,
  fetchMyServices,
  fetchPublicSettings,
  purchaseBoostWithWallet,
} from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { BoostOption, BoostPurchase, BoostType, CheckoutProvider, Service } from "../types";

type Props = {
  onBack: () => void;
};

const BOOST_ICONS: Record<BoostType, React.ComponentProps<typeof Ionicons>["name"]> = {
  featured: "star",
  feed_boost: "trending-up",
  category_top: "trophy",
};

const getBoostColors = (p: { warnSoft: string; warnInk: string; infoSoft: string; info: string }) => ({
  featured: { bg: p.warnSoft, tone: p.warnInk },
  feed_boost: { bg: p.infoSoft, tone: p.info },
  category_top: { bg: "#fce7f3", tone: "#be185d" },
} as Record<BoostType, { bg: string; tone: string }>);

const getBoostStatusBadge = (p: { accentSoft: string; accent: string; infoSoft: string; info: string; mist: string; slate: string; dangerSoft: string; danger: string }) => ({
  active: { bg: p.accentSoft, color: p.accent, label: "Active" },
  scheduled: { bg: p.infoSoft, color: p.info, label: "Scheduled" },
  ended: { bg: p.mist, color: p.slate, label: "Ended" },
  cancelled: { bg: p.dangerSoft, color: p.danger, label: "Cancelled" },
} as Record<string, { bg: string; color: string; label: string }>);

export function BoostsScreen({ onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [tab, setTab] = useState<"options" | "history">("options");
  const [options, setOptions] = useState<BoostOption[]>([]);
  const [purchases, setPurchases] = useState<BoostPurchase[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<CheckoutProvider>("flutterwave");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [opts, boosts, myServices, settings] = await Promise.all([
        fetchBoostOptions().catch(() => []),
        fetchMyBoosts().catch(() => []),
        fetchMyServices().catch(() => []),
        fetchPublicSettings().catch(() => null),
      ]);
      setOptions(opts);
      setPurchases(boosts);
      setServices(myServices);
      if (settings) setDefaultProvider(settings.payments.defaultProvider);
      if (myServices.length > 0 && !selectedService) {
        setSelectedService(myServices[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedService]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCheckout = async (option: BoostOption) => {
    if (!selectedService) {
      Alert.alert("Select a service", "Choose a service to boost first.");
      return;
    }
    setPurchasing(true);
    try {
      const result = await createBoostCheckout({
        serviceId: selectedService.id,
        type: option.type,
        provider: defaultProvider,
      });
      if (result.checkoutUrl) {
        await Linking.openURL(result.checkoutUrl);
      }
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setPurchasing(false);
    }
  };

  const handleWalletPurchase = async (option: BoostOption) => {
    if (!selectedService) {
      Alert.alert("Select a service", "Choose a service to boost first.");
      return;
    }
    Alert.alert(
      "Pay with earnings",
      `Use ${option.currency} ${Number(option.price).toLocaleString()} from your earnings to boost "${selectedService.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pay",
          onPress: async () => {
            setPurchasing(true);
            try {
              await purchaseBoostWithWallet({
                serviceId: selectedService.id,
                type: option.type,
              });
              Alert.alert("Success", "Boost activated!");
              void load();
            } catch (err: unknown) {
              Alert.alert("Error", err instanceof Error ? err.message : "Purchase failed");
            } finally {
              setPurchasing(false);
            }
          },
        },
      ],
    );
  };

  const renderOption = ({ item }: { item: BoostOption }) => {
    const colors = getBoostColors(palette)[item.type] ?? getBoostColors(palette).featured;
    const icon = BOOST_ICONS[item.type] ?? "star";
    return (
      <View style={[styles.optionCard, { borderColor: colors.tone + "30" }]}>
        <View style={[styles.optionIconWrap, { backgroundColor: colors.bg }]}>
          <Ionicons name={icon} size={24} color={colors.tone} />
        </View>
        <View style={styles.optionBody}>
          <Text style={styles.optionLabel}>{item.label || item.type.replace(/_/g, " ")}</Text>
          <Text style={styles.optionDesc} numberOfLines={2}>
            {item.description || "Boost your service visibility"}
          </Text>
          <Text style={styles.optionPrice}>
            {item.currency} {Number(item.price).toLocaleString()}
            {item.durationDays ? ` · ${item.durationDays} days` : ""}
          </Text>
        </View>
        <View style={styles.optionActions}>
          <Pressable
            style={[styles.optionBtn, { backgroundColor: colors.tone }]}
            onPress={() => handleCheckout(item)}
            disabled={purchasing}
          >
            <Text style={styles.optionBtnText}>Pay</Text>
          </Pressable>
          <Pressable
            style={[styles.optionBtnSecondary, { borderColor: colors.tone }]}
            onPress={() => handleWalletPurchase(item)}
            disabled={purchasing}
          >
            <Text style={[styles.optionBtnSecondaryText, { color: colors.tone }]}>Earnings</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderPurchase = ({ item }: { item: BoostPurchase }) => {
    const colors = getBoostColors(palette)[item.type] ?? getBoostColors(palette).featured;
    const badge = getBoostStatusBadge(palette)[item.status] ?? getBoostStatusBadge(palette).ended;
    return (
      <View style={styles.purchaseCard}>
        <View style={styles.purchaseRow}>
          <View style={[styles.purchaseIconWrap, { backgroundColor: colors.bg }]}>
            <Ionicons name={BOOST_ICONS[item.type] ?? "star"} size={18} color={colors.tone} />
          </View>
          <View style={styles.purchaseBody}>
            <Text style={styles.purchaseType}>{item.type.replace(/_/g, " ")}</Text>
            {item.service?.title ? (
              <Text style={styles.purchaseService} numberOfLines={1}>{item.service.title}</Text>
            ) : null}
            <Text style={styles.purchaseDates}>
              {new Date(item.startsAt).toLocaleDateString()} – {new Date(item.endsAt).toLocaleDateString()}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>
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
    <View style={styles.container}>
      {/* Service selector */}
      {services.length > 0 && tab === "options" && (
        <View style={styles.serviceSelector}>
          <Text style={styles.serviceSelectorLabel}>Boost service:</Text>
          <FlatList
            data={services}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.serviceChips}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.serviceChip,
                  selectedService?.id === item.id && styles.serviceChipActive,
                ]}
                onPress={() => setSelectedService(item)}
              >
                <Text
                  style={[
                    styles.serviceChipText,
                    selectedService?.id === item.id && styles.serviceChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        {(["options", "history"] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
              {t === "options" ? "Boost Options" : "My Boosts"}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "options" ? (
        options.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="rocket-outline" size={48} color={palette.line} />
            <Text style={styles.emptyText}>No boost options available right now.</Text>
          </View>
        ) : (
          <FlatList
            data={options}
            keyExtractor={(o) => o.type}
            renderItem={renderOption}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : purchases.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={48} color={palette.line} />
          <Text style={styles.emptyText}>No boosts purchased yet.</Text>
        </View>
      ) : (
        <FlatList
          data={purchases}
          keyExtractor={(p) => p.id}
          renderItem={renderPurchase}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {purchasing && (
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
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  serviceSelector: { padding: 16, paddingBottom: 0, gap: 8 },
  serviceSelectorLabel: { color: palette.slate, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  serviceChips: { gap: 8 },
  serviceChip: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 180,
  },
  serviceChipActive: { backgroundColor: palette.accentDeep, borderColor: palette.accentDeep },
  serviceChipText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  serviceChipTextActive: { color: "#ffffff" },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: palette.mist,
    borderRadius: 12,
    padding: 3,
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  tabBtnActive: { backgroundColor: palette.card, shadowColor: palette.shadow, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tabBtnText: { color: palette.slate, fontSize: 13, fontWeight: "700" },
  tabBtnTextActive: { color: palette.ink },
  optionCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  optionBody: { flex: 1, gap: 3 },
  optionLabel: { color: palette.ink, fontSize: 15, fontWeight: "700", textTransform: "capitalize" },
  optionDesc: { color: palette.slate, fontSize: 12, lineHeight: 17 },
  optionPrice: { color: palette.accentDeep, fontSize: 13, fontWeight: "800", marginTop: 2 },
  optionActions: { gap: 6 },
  optionBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center" },
  optionBtnText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  optionBtnSecondary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, alignItems: "center", borderWidth: 1.5 },
  optionBtnSecondaryText: { fontSize: 12, fontWeight: "800" },
  purchaseCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 14,
  },
  purchaseRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  purchaseIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  purchaseBody: { flex: 1, gap: 2 },
  purchaseType: { color: palette.ink, fontSize: 14, fontWeight: "700", textTransform: "capitalize" },
  purchaseService: { color: palette.slate, fontSize: 12 },
  purchaseDates: { color: palette.slate, fontSize: 11 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  emptyText: { color: palette.slate, fontSize: 14, textAlign: "center" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
}));
