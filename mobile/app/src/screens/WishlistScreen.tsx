import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WishlistItem {
  id: string;
  title: string;
  category: string;
  location?: string;
  rating?: number;
  image?: string;
  price?: string;
  currency?: string;
  verified?: boolean;
}

// ---------------------------------------------------------------------------
// AsyncStorage helpers (exported for use elsewhere in the app)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "servfix-wishlist";

export async function getWishlist(): Promise<WishlistItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addToWishlist(item: WishlistItem): Promise<void> {
  const list = await getWishlist();
  const exists = list.some((i) => i.id === item.id);
  if (exists) return;
  list.unshift(item);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export async function removeFromWishlist(id: string): Promise<void> {
  const list = await getWishlist();
  const next = list.filter((i) => i.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function isInWishlist(id: string): Promise<boolean> {
  const list = await getWishlist();
  return list.some((i) => i.id === id);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  onOpenService: (serviceId: string) => void;
  onOpenBrowse: () => void;
  onBack: () => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_GAP = 12;
const HORIZONTAL_PAD = 16;
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PAD * 2 - CARD_GAP) / 2;
const IMAGE_HEIGHT = CARD_WIDTH * 0.72;

// ---------------------------------------------------------------------------
// WishlistScreen
// ---------------------------------------------------------------------------

export function WishlistScreen({ onOpenService, onOpenBrowse, onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getWishlist();
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemove = useCallback(
    async (id: string) => {
      await removeFromWishlist(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [],
  );

  const handleClearAll = useCallback(() => {
    Alert.alert(
      "Clear Wishlist",
      "Remove all saved services from your wishlist?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem(STORAGE_KEY);
            setItems([]);
          },
        },
      ],
    );
  }, []);

  // ----- Header -----
  const renderHeader = () => (
    <View style={styles.header}>
      <Pressable
        style={styles.backBtn}
        hitSlop={12}
        onPress={onBack}
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={palette.ink} />
      </Pressable>

      <Text style={styles.headerTitle}>Wishlist</Text>

      {items.length > 0 ? (
        <Pressable
          style={styles.clearBtn}
          hitSlop={8}
          onPress={handleClearAll}
          accessibilityLabel="Clear all wishlist items"
        >
          <Text style={styles.clearBtnText}>Clear All</Text>
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );

  // ----- Empty state -----
  if (!loading && items.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="heart-outline" size={56} color={palette.accent} />
          </View>
          <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
          <Text style={styles.emptySubtitle}>
            Save services you love and find them here anytime.
          </Text>
          <Pressable style={styles.browseBtn} onPress={onOpenBrowse}>
            <Ionicons
              name="compass-outline"
              size={20}
              color={palette.card}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.browseBtnText}>Browse Services</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ----- Loading state -----
  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      </View>
    );
  }

  // ----- Card renderer -----
  const renderCard = ({ item }: { item: WishlistItem }) => (
    <Pressable
      style={styles.card}
      onPress={() => onOpenService(item.id)}
      accessibilityLabel={`Open ${item.title}`}
    >
      {/* Image */}
      <View style={styles.imageWrapper}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={palette.line} />
          </View>
        )}

        {/* Remove (heart) button */}
        <Pressable
          style={styles.heartBtn}
          hitSlop={8}
          onPress={() => handleRemove(item.id)}
          accessibilityLabel={`Remove ${item.title} from wishlist`}
        >
          <Ionicons name="heart" size={20} color={palette.danger} />
        </Pressable>

        {/* Verified badge */}
        {item.verified && (
          <View style={styles.verifiedBadge}>
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={palette.accent}
            />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>

        <Text style={styles.cardCategory} numberOfLines={1}>
          {item.category}
        </Text>

        {/* Rating row */}
        {item.rating !== undefined && item.rating > 0 && (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={13} color={palette.gold} />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}

        {/* Location */}
        {item.location ? (
          <View style={styles.locationRow}>
            <Ionicons
              name="location-outline"
              size={13}
              color={palette.slate}
            />
            <Text style={styles.locationText} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        ) : null}

        {/* Price */}
        {item.price ? (
          <Text style={styles.priceText}>
            {item.currency ?? "$"}
            {item.price}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  // ----- Grid -----
  return (
    <View style={styles.container}>
      {renderHeader()}
      <FlatList
        data={items}
        renderItem={renderCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = createThemedStyles((palette) => ({
  container: {
    flex: 1,
    backgroundColor: palette.canvas,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: HORIZONTAL_PAD,
    paddingTop: 54,
    paddingBottom: 12,
    backgroundColor: palette.card,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.mist,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: palette.ink,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: palette.mist,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.danger,
  },
  headerSpacer: {
    width: 36,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: palette.ink,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: palette.slate,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 22,
  },
  browseBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.card,
  },

  // List
  listContent: {
    paddingHorizontal: HORIZONTAL_PAD,
    paddingTop: 16,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: CARD_GAP,
  },

  // Card
  card: {
    width: CARD_WIDTH,
    backgroundColor: palette.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
  },
  imageWrapper: {
    width: "100%",
    height: IMAGE_HEIGHT,
    backgroundColor: palette.mist,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.mist,
  },
  heartBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  verifiedBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: "600",
    color: palette.accent,
    marginLeft: 3,
  },

  // Card body
  cardBody: {
    padding: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.ink,
    lineHeight: 18,
    marginBottom: 3,
  },
  cardCategory: {
    fontSize: 11,
    fontWeight: "500",
    color: palette.slate,
    marginBottom: 5,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.gold,
    marginLeft: 3,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  locationText: {
    fontSize: 11,
    color: palette.slate,
    marginLeft: 3,
    flex: 1,
  },
  priceText: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.accent,
    marginTop: 2,
  },
}));

export default WishlistScreen;
