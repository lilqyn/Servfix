import { Ionicons } from "@expo/vector-icons";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { ServiceCard } from "../components/ServiceCard";
import { fetchServices } from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { Service } from "../types";

type SortOption = "relevance" | "rating-high" | "price-low" | "price-high" | "newest";

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "rating-high", label: "Highest rated" },
  { key: "price-low", label: "Price: low to high" },
  { key: "price-high", label: "Price: high to low" },
  { key: "newest", label: "Newest first" },
];

type Props = {
  initialCategory?: string;
  onOpenService: (serviceId: string) => void;
};

const toNumber = (v: string | number | null | undefined) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
};

export function BrowseScreen({ initialCategory, onOpenService }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [minRating, setMinRating] = useState(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const deferredQuery = useDeferredValue(query);

  const loadServices = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setIsRefreshing(true);
    else setIsLoading(true);
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

  useEffect(() => { void loadServices(); }, []);

  // Derive available categories and locations from data
  const availableCategories = useMemo(() => {
    const set = new Set(services.map((s) => s.category).filter(Boolean));
    return Array.from(set).sort();
  }, [services]);

  const availableLocations = useMemo(() => {
    const set = new Set(
      services.map((s) => s.locationCity).filter((v): v is string => !!v),
    );
    return Array.from(set).sort();
  }, [services]);

  const normalizedQuery = deferredQuery.trim().toLowerCase();

  const filteredAndSorted = useMemo(() => {
    let result = [...services];

    // Text search
    if (normalizedQuery) {
      result = result.filter((s) =>
        [s.title, s.description, s.category, ...(s.tags || []),
          s.provider.providerProfile?.displayName || s.provider.username || "",
          s.locationCity || "",
        ].join(" ").toLowerCase().includes(normalizedQuery),
      );
    }

    // Category
    if (activeCategory) {
      result = result.filter((s) => s.category === activeCategory);
    }

    // Location
    if (selectedLocations.length > 0) {
      result = result.filter((s) => s.locationCity && selectedLocations.includes(s.locationCity));
    }

    // Rating
    if (minRating > 0) {
      result = result.filter((s) => {
        const r = toNumber(s.provider.providerProfile?.ratingAvg);
        return r >= minRating;
      });
    }

    // Price range
    const minP = parseFloat(priceMin);
    const maxP = parseFloat(priceMax);
    if (Number.isFinite(minP) && minP > 0) {
      result = result.filter((s) => {
        const p = toNumber(s.tiers[0]?.price);
        return p >= minP;
      });
    }
    if (Number.isFinite(maxP) && maxP > 0) {
      result = result.filter((s) => {
        const p = toNumber(s.tiers[0]?.price);
        return p <= maxP;
      });
    }

    // Verified
    if (verifiedOnly) {
      result = result.filter(
        (s) => s.provider.providerProfile?.verificationStatus === "verified",
      );
    }

    // Sort
    result.sort((a, b) => {
      const aPrice = toNumber(a.tiers[0]?.price);
      const bPrice = toNumber(b.tiers[0]?.price);
      const aRating = toNumber(a.provider.providerProfile?.ratingAvg);
      const bRating = toNumber(b.provider.providerProfile?.ratingAvg);

      switch (sortBy) {
        case "rating-high": return bRating - aRating;
        case "price-low": return aPrice - bPrice;
        case "price-high": return bPrice - aPrice;
        case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default: {
          const aScore = aRating / 5 + (a.provider.providerProfile?.verificationStatus === "verified" ? 1 : 0);
          const bScore = bRating / 5 + (b.provider.providerProfile?.verificationStatus === "verified" ? 1 : 0);
          return bScore - aScore;
        }
      }
    });

    return result;
  }, [services, normalizedQuery, activeCategory, selectedLocations, minRating, verifiedOnly, sortBy, priceMin, priceMax]);

  const activeFilterCount =
    (activeCategory ? 1 : 0) +
    selectedLocations.length +
    (minRating > 0 ? 1 : 0) +
    (verifiedOnly ? 1 : 0) +
    (priceMin ? 1 : 0) +
    (priceMax ? 1 : 0);

  const clearAllFilters = () => {
    setActiveCategory(null);
    setSelectedLocations([]);
    setMinRating(0);
    setVerifiedOnly(false);
    setPriceMin("");
    setPriceMax("");
    setQuery("");
    setSortBy("relevance");
  };

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
      {/* Search bar + controls */}
      <View style={styles.searchSection}>
        <Text style={styles.heading}>Browse services</Text>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search-outline" size={18} color={palette.slate} />
            <TextInput
              onChangeText={setQuery}
              placeholder="Search services, providers, locations..."
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              value={query}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Filter + Sort bar */}
        <View style={styles.controlsRow}>
          <Pressable style={styles.controlBtn} onPress={() => setShowFilters(true)}>
            <Ionicons name="options-outline" size={16} color={palette.ink} />
            <Text style={styles.controlBtnText}>Filters</Text>
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.controlBtn} onPress={() => setShowSort(true)}>
            <Ionicons name="swap-vertical-outline" size={16} color={palette.ink} />
            <Text style={styles.controlBtnText}>
              {SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? "Sort"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.controlBtn}
            onPress={() => setViewMode((v) => (v === "list" ? "grid" : "list"))}
          >
            <Ionicons
              name={viewMode === "grid" ? "grid-outline" : "list-outline"}
              size={16}
              color={palette.ink}
            />
          </Pressable>
          <Text style={styles.resultCount}>
            {filteredAndSorted.length} result{filteredAndSorted.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setActiveCategory(null)}
              style={[styles.chip, !activeCategory && styles.chipActive]}
            >
              <Text style={[styles.chipText, !activeCategory && styles.chipTextActive]}>All</Text>
            </Pressable>
            {availableCategories.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setActiveCategory(activeCategory === cat ? null : cat)}
                style={[styles.chip, activeCategory === cat && styles.chipActive]}
              >
                <Text style={[styles.chipText, activeCategory === cat && styles.chipTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Active filter tags */}
        {activeFilterCount > 0 && (
          <View style={styles.activeFilters}>
            {selectedLocations.map((loc) => (
              <Pressable
                key={loc}
                style={styles.filterTag}
                onPress={() => setSelectedLocations((p) => p.filter((l) => l !== loc))}
              >
                <Text style={styles.filterTagText}>{loc}</Text>
                <Ionicons name="close" size={12} color={palette.accentDeep} />
              </Pressable>
            ))}
            {minRating > 0 && (
              <Pressable style={styles.filterTag} onPress={() => setMinRating(0)}>
                <Text style={styles.filterTagText}>{minRating}+ stars</Text>
                <Ionicons name="close" size={12} color={palette.accentDeep} />
              </Pressable>
            )}
            {verifiedOnly && (
              <Pressable style={styles.filterTag} onPress={() => setVerifiedOnly(false)}>
                <Text style={styles.filterTagText}>Verified</Text>
                <Ionicons name="close" size={12} color={palette.accentDeep} />
              </Pressable>
            )}
            {(priceMin || priceMax) && (
              <Pressable style={styles.filterTag} onPress={() => { setPriceMin(""); setPriceMax(""); }}>
                <Text style={styles.filterTagText}>
                  {priceMin && priceMax ? `${priceMin} - ${priceMax}` : priceMin ? `Min ${priceMin}` : `Max ${priceMax}`}
                </Text>
                <Ionicons name="close" size={12} color={palette.accentDeep} />
              </Pressable>
            )}
            <Pressable onPress={clearAllFilters}>
              <Text style={styles.clearAllText}>Clear all</Text>
            </Pressable>
          </View>
        )}
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
        key={viewMode}
        numColumns={viewMode === "grid" ? 2 : 1}
        columnWrapperStyle={viewMode === "grid" ? styles.gridRow : undefined}
        contentContainerStyle={styles.listContent}
        data={filteredAndSorted}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadServices("refresh")}
            refreshing={isRefreshing}
            tintColor={palette.accent}
          />
        }
        renderItem={({ item }) =>
          viewMode === "grid" ? (
            <Pressable onPress={() => onOpenService(item.id)} style={styles.gridCard}>
              {item.media[0]?.signedUrl || item.media[0]?.url ? (
                <Image source={{ uri: (item.media[0].signedUrl ?? item.media[0].url)! }} style={styles.gridImage} resizeMode="cover" />
              ) : (
                <View style={[styles.gridImage, styles.gridImagePlaceholder]}>
                  <Ionicons name="image-outline" size={24} color="#d1d5db" />
                </View>
              )}
              <View style={styles.gridInfo}>
                <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
                {item.tiers[0] && (
                  <Text style={styles.gridPrice}>
                    {item.tiers[0].currency} {parseFloat(item.tiers[0].price).toFixed(0)}
                  </Text>
                )}
                <View style={styles.gridMeta}>
                  {item.provider.providerProfile?.ratingAvg && (
                    <>
                      <Ionicons name="star" size={10} color="#f59e0b" />
                      <Text style={styles.gridMetaText}>
                        {parseFloat(String(item.provider.providerProfile.ratingAvg)).toFixed(1)}
                      </Text>
                    </>
                  )}
                  {item.locationCity && (
                    <Text style={styles.gridMetaText} numberOfLines={1}>{item.locationCity}</Text>
                  )}
                </View>
              </View>
            </Pressable>
          ) : (
            <ServiceCard onPress={onOpenService} service={item} />
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="search-outline" size={40} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No services found</Text>
            <Text style={styles.emptyBody}>Try adjusting your filters or search query</Text>
            {activeFilterCount > 0 && (
              <Pressable onPress={clearAllFilters} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Clear all filters</Text>
              </Pressable>
            )}
          </View>
        }
      />

      {/* Filter Modal */}
      <Modal visible={showFilters} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <Pressable onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={24} color={palette.ink} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Location filter */}
              <Text style={styles.filterLabel}>Location</Text>
              <View style={styles.filterChipGrid}>
                {availableLocations.map((loc) => {
                  const isActive = selectedLocations.includes(loc);
                  return (
                    <Pressable
                      key={loc}
                      style={[styles.filterChip, isActive && styles.filterChipActive]}
                      onPress={() =>
                        setSelectedLocations((prev) =>
                          isActive ? prev.filter((l) => l !== loc) : [...prev, loc],
                        )
                      }
                    >
                      <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                        {loc}
                      </Text>
                    </Pressable>
                  );
                })}
                {availableLocations.length === 0 && (
                  <Text style={styles.filterEmpty}>No locations available</Text>
                )}
              </View>

              {/* Rating filter */}
              <Text style={styles.filterLabel}>Minimum rating</Text>
              <View style={styles.ratingRow}>
                {[0, 3, 3.5, 4, 4.5].map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.ratingChip, minRating === r && styles.ratingChipActive]}
                    onPress={() => setMinRating(r)}
                  >
                    {r === 0 ? (
                      <Text style={[styles.ratingChipText, minRating === r && styles.ratingChipTextActive]}>
                        Any
                      </Text>
                    ) : (
                      <>
                        <Ionicons name="star" size={12} color={minRating === r ? "#ffffff" : "#f59e0b"} />
                        <Text style={[styles.ratingChipText, minRating === r && styles.ratingChipTextActive]}>
                          {r}+
                        </Text>
                      </>
                    )}
                  </Pressable>
                ))}
              </View>

              {/* Price range filter */}
              <Text style={styles.filterLabel}>Price range</Text>
              <View style={styles.priceRangeRow}>
                <TextInput
                  style={styles.priceInput}
                  placeholder="Min"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={priceMin}
                  onChangeText={setPriceMin}
                />
                <Text style={styles.priceDash}>—</Text>
                <TextInput
                  style={styles.priceInput}
                  placeholder="Max"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={priceMax}
                  onChangeText={setPriceMax}
                />
              </View>

              {/* Verified filter */}
              <Text style={styles.filterLabel}>Verification</Text>
              <Pressable
                style={styles.toggleRow}
                onPress={() => setVerifiedOnly(!verifiedOnly)}
              >
                <Text style={styles.toggleText}>Verified providers only</Text>
                <View style={[styles.toggle, verifiedOnly && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, verifiedOnly && styles.toggleKnobOn]} />
                </View>
              </Pressable>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.modalClearBtn}
                onPress={() => {
                  setSelectedLocations([]);
                  setMinRating(0);
                  setVerifiedOnly(false);
                  setPriceMin("");
                  setPriceMax("");
                }}
              >
                <Text style={styles.modalClearText}>Reset</Text>
              </Pressable>
              <Pressable
                style={styles.modalApplyBtn}
                onPress={() => setShowFilters(false)}
              >
                <Text style={styles.modalApplyText}>
                  Show {filteredAndSorted.length} results
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sort Modal */}
      <Modal visible={showSort} animationType="fade" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSort(false)}>
          <View style={styles.sortSheet}>
            <Text style={styles.sortTitle}>Sort by</Text>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={styles.sortOption}
                onPress={() => { setSortBy(opt.key); setShowSort(false); }}
              >
                <Text style={[styles.sortOptionText, sortBy === opt.key && styles.sortOptionTextActive]}>
                  {opt.label}
                </Text>
                {sortBy === opt.key && (
                  <Ionicons name="checkmark" size={18} color={palette.accentDeep} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  container: { flex: 1 },
  stateWrap: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 20 },
  stateText: { color: palette.slate, fontSize: 14 },
  searchSection: { gap: 10, paddingHorizontal: 20, paddingTop: 18 },
  heading: { color: palette.ink, fontSize: 24, fontWeight: "800" },
  searchRow: { flexDirection: "row", gap: 8 },
  searchInputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: palette.ink, fontSize: 14, paddingVertical: 11 },
  controlsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  controlBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  controlBtnText: { color: palette.ink, fontSize: 12, fontWeight: "600" },
  filterBadge: {
    backgroundColor: palette.accentDeep, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: "center", justifyContent: "center",
  },
  filterBadgeText: { color: palette.canvas, fontSize: 10, fontWeight: "800" },
  resultCount: { color: palette.slate, fontSize: 12, fontWeight: "600", marginLeft: "auto" },
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  chip: {
    backgroundColor: palette.mist, borderColor: palette.line, borderRadius: 999, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  chipActive: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
  chipText: { color: palette.slate, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: palette.accentDeep, fontWeight: "800" },
  activeFilters: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  filterTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: palette.accentSoft, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  filterTagText: { color: palette.accentDeep, fontSize: 11, fontWeight: "700" },
  clearAllText: { color: palette.danger, fontSize: 12, fontWeight: "700" },
  listContent: { gap: 12, padding: 20, paddingBottom: 158 },
  errorCard: {
    backgroundColor: palette.dangerSoft, borderColor: palette.dangerLine, borderRadius: 18, borderWidth: 1,
    gap: 8, marginHorizontal: 20, marginTop: 14, padding: 16,
  },
  errorTitle: { color: palette.danger, fontSize: 15, fontWeight: "700" },
  errorBody: { color: palette.dangerInk, fontSize: 14, lineHeight: 20 },
  retryButton: { alignSelf: "flex-start", backgroundColor: palette.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  retryButtonText: { color: palette.danger, fontSize: 13, fontWeight: "700" },
  emptyCard: {
    alignItems: "center", backgroundColor: palette.card, borderColor: palette.line,
    borderRadius: 20, borderWidth: 1, gap: 8, padding: 30,
  },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: "700" },
  emptyBody: { color: palette.slate, fontSize: 14, textAlign: "center" },
  clearBtn: {
    backgroundColor: palette.accentSoft, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 4,
  },
  clearBtnText: { color: palette.accentDeep, fontSize: 13, fontWeight: "700" },

  // Filter modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: palette.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 20, borderBottomWidth: 1, borderBottomColor: palette.line,
  },
  modalTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" },
  modalBody: { padding: 20 },
  filterLabel: { color: palette.ink, fontSize: 14, fontWeight: "700", marginBottom: 10, marginTop: 16 },
  filterChipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: {
    borderRadius: 20, borderWidth: 1, borderColor: palette.line,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: palette.card,
  },
  filterChipActive: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
  filterChipText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  filterChipTextActive: { color: palette.accentDeep, fontWeight: "700" },
  filterEmpty: { color: palette.slate, fontSize: 13 },
  ratingRow: { flexDirection: "row", gap: 8 },
  ratingChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, borderWidth: 1, borderColor: palette.line,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: palette.card,
  },
  ratingChipActive: { backgroundColor: palette.accentDeep, borderColor: palette.accentDeep },
  ratingChipText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  ratingChipTextActive: { color: palette.canvas },
  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8,
  },
  toggleText: { color: palette.ink, fontSize: 14, fontWeight: "600" },
  toggle: {
    width: 48, height: 28, borderRadius: 14, backgroundColor: palette.line,
    justifyContent: "center", padding: 2,
  },
  toggleOn: { backgroundColor: palette.accentDeep },
  toggleKnob: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: palette.card,
  },
  toggleKnobOn: { alignSelf: "flex-end" },
  modalFooter: {
    flexDirection: "row", gap: 10, padding: 20,
    borderTopWidth: 1, borderTopColor: palette.line,
  },
  modalClearBtn: {
    flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: palette.line,
    paddingVertical: 14,
  },
  modalClearText: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  modalApplyBtn: {
    flex: 2, alignItems: "center", backgroundColor: palette.accentDeep, borderRadius: 12,
    paddingVertical: 14,
  },
  modalApplyText: { color: palette.canvas, fontSize: 14, fontWeight: "700" },

  // Sort modal
  sortSheet: {
    backgroundColor: palette.card, borderRadius: 20, margin: 20, marginTop: "auto",
    marginBottom: 40, padding: 20,
  },
  sortTitle: { color: palette.ink, fontSize: 16, fontWeight: "800", marginBottom: 12 },
  sortOption: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.line,
  },
  sortOptionText: { color: palette.ink, fontSize: 15, fontWeight: "600" },
  sortOptionTextActive: { color: palette.accentDeep, fontWeight: "800" },

  // Price range
  priceRangeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  priceInput: {
    flex: 1, backgroundColor: palette.card, borderColor: palette.line, borderRadius: 12,
    borderWidth: 1, color: palette.ink, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10,
  },
  priceDash: { color: palette.slate, fontSize: 16, fontWeight: "700" },

  // Grid view
  gridRow: { gap: 12 },
  gridCard: {
    flex: 1, backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16,
    borderWidth: 1, overflow: "hidden",
  },
  gridImage: { width: "100%", height: 110 },
  gridImagePlaceholder: { backgroundColor: palette.mist, alignItems: "center", justifyContent: "center" },
  gridInfo: { gap: 4, padding: 10 },
  gridTitle: { color: palette.ink, fontSize: 13, fontWeight: "700", lineHeight: 17 },
  gridPrice: { color: palette.accent, fontSize: 14, fontWeight: "800" },
  gridMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  gridMetaText: { color: palette.slate, fontSize: 11, fontWeight: "600" },
}));
