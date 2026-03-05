import { useDeferredValue, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ServiceCard } from "../components/ServiceCard";
import { fetchServices } from "../lib/api";
import { palette } from "../theme";
import type { Service } from "../types";

type Props = {
  onOpenService: (serviceId: string) => void;
};

export function BrowseScreen({ onOpenService }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const loadServices = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const nextServices = await fetchServices();
      setServices(nextServices);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load services.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadServices();
  }, []);

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const filteredServices = services.filter((service) => {
    if (!normalizedQuery) {
      return true;
    }

    return [
      service.title,
      service.description,
      service.category,
      ...(service.tags || []),
      service.provider.providerProfile?.displayName || service.provider.username || "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  if (isLoading) {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.stateText}>Loading services...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Text style={styles.heading}>Browse services</Text>
        <TextInput
          onChangeText={setQuery}
          placeholder="Search by skill, title, or provider"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          value={query}
        />
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Connection issue</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable onPress={() => void loadServices()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={styles.listContent}
        data={filteredServices}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadServices("refresh")}
            refreshing={isRefreshing}
            tintColor={palette.accent}
          />
        }
        renderItem={({ item }) => <ServiceCard onPress={onOpenService} service={item} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptyBody}>Try a broader search or clear the filter.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchWrap: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  heading: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "800",
  },
  searchInput: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  listContent: {
    gap: 12,
    padding: 20,
    paddingBottom: 140,
  },
  stateWrap: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 20,
  },
  stateText: {
    color: palette.slate,
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
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
    color: "#7f1d1d",
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    padding: 24,
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyBody: {
    color: palette.slate,
    fontSize: 14,
    textAlign: "center",
  },
});
