import { useCallback, useEffect, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { fetchMyServices, updateServiceStatus } from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { Service } from "../types";

type Props = {
  onOpenCreateService: () => void;
  onOpenEditService: (service: Service) => void;
  onBack: () => void;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  published: { bg: "#dcfce7", text: "#166534" },
  draft: { bg: "#f3f4f6", text: "#4b5563" },
  suspended: { bg: "#fee2e2", text: "#991b1b" },
};

const toNumber = (v: string | number) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function MyServicesScreen({ onOpenCreateService, onOpenEditService, onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const isFocused = useIsFocused();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMyServices();
      setServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your services.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) void load();
  }, [isFocused, load]);

  const toggleStatus = useCallback(async (service: Service) => {
    const next = service.status === "published" ? "draft" : "published";
    setTogglingId(service.id);
    try {
      await updateServiceStatus(service.id, next as "draft" | "published");
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, status: next } : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update service status.");
    } finally {
      setTogglingId(null);
    }
  }, []);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Loading your services...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>My Services</Text>
        <Pressable onPress={onOpenCreateService} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ New</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={styles.list}
        data={services}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => void load("refresh")}
            refreshing={isRefreshing}
            tintColor={palette.accent}
          />
        }
        renderItem={({ item }) => {
          const statusColor = STATUS_COLORS[item.status ?? "draft"] ?? STATUS_COLORS.draft;
          const lowestPrice = item.tiers.reduce<number | null>((acc, t) => {
            const p = toNumber(t.price);
            return acc === null || p < acc ? p : acc;
          }, null);

          return (
            <View style={styles.serviceCard}>
              <View style={styles.serviceHeader}>
                <Text numberOfLines={2} style={styles.serviceTitle}>
                  {item.title}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: statusColor.bg }]}>
                  <Text style={[styles.statusPillText, { color: statusColor.text }]}>
                    {item.status ?? "draft"}
                  </Text>
                </View>
              </View>

              <Text style={styles.serviceCategory}>{item.category}</Text>
              {lowestPrice !== null ? (
                <Text style={styles.servicePrice}>
                  From {item.tiers[0]?.currency ?? "GHS"} {lowestPrice.toLocaleString()}
                </Text>
              ) : null}
              <Text style={styles.serviceTiers}>{item.tiers.length} tier{item.tiers.length !== 1 ? "s" : ""}</Text>

              <View style={styles.serviceActions}>
                <Pressable onPress={() => onOpenEditService(item)} style={styles.editButton}>
                  <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  disabled={togglingId === item.id}
                  onPress={() => void toggleStatus(item)}
                  style={[
                    styles.toggleButton,
                    item.status === "published" ? styles.toggleButtonUnpublish : styles.toggleButtonPublish,
                    togglingId === item.id && styles.buttonDisabled,
                  ]}
                >
                  {togglingId === item.id ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.toggleButtonText}>
                      {item.status === "published" ? "Unpublish" : "Publish"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No services yet</Text>
            <Text style={styles.emptyBody}>
              Create your first service listing to start accepting orders.
            </Text>
            <Pressable onPress={onOpenCreateService} style={styles.createEmptyButton}>
              <Text style={styles.createEmptyButtonText}>Create a service</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  page: { backgroundColor: palette.canvas, flex: 1 },
  centered: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { color: palette.slate, fontSize: 14 },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  backButton: { paddingRight: 4 },
  backButtonText: { color: palette.accentDeep, fontSize: 15, fontWeight: "700" },
  topTitle: { color: palette.ink, flex: 1, fontSize: 18, fontWeight: "800" },
  createButton: {
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  errorCard: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 12,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  retryButtonText: { color: palette.danger, fontSize: 12, fontWeight: "700" },
  list: { gap: 12, padding: 20, paddingBottom: 100 },
  serviceCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  serviceHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  serviceTitle: { color: palette.ink, flex: 1, fontSize: 16, fontWeight: "700" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  serviceCategory: { color: palette.slate, fontSize: 13 },
  servicePrice: { color: palette.accent, fontSize: 14, fontWeight: "700" },
  serviceTiers: { color: palette.slate, fontSize: 12 },
  serviceActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  editButton: {
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editButtonText: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  toggleButton: {
    alignItems: "center",
    borderRadius: 10,
    minWidth: 90,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toggleButtonPublish: { backgroundColor: palette.accentDeep },
  toggleButtonUnpublish: { backgroundColor: "#9ca3af" },
  toggleButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  buttonDisabled: { opacity: 0.55 },
  emptyCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 28,
  },
  emptyTitle: { color: palette.ink, fontSize: 17, fontWeight: "800" },
  emptyBody: { color: palette.slate, fontSize: 14, lineHeight: 20, textAlign: "center" },
  createEmptyButton: {
    backgroundColor: palette.accentDeep,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  createEmptyButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
}));
