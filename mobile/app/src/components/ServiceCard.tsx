import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, Text, View } from "react-native";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { Service } from "../types";

type Props = {
  service: Service;
  onPress: (serviceId: string) => void;
  onSave?: (serviceId: string) => void;
  isSaved?: boolean;
};

const isValidImageUrl = (url?: string | null) =>
  !!url && (url.startsWith("http://") || url.startsWith("https://"));

const CURRENCY_SYMBOLS: Record<string, string> = { GHS: "GH\u20B5", USD: "$", EUR: "\u20AC" };

function formatCategory(raw: string): string {
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ServiceCard({ service, onPress, onSave, isSaved }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const tier = service.tiers[0];
  const providerName =
    service.provider.providerProfile?.displayName || service.provider.username || "Provider";
  const isVerified = service.provider.providerProfile?.verificationStatus === "verified";
  const ratingAvg = service.provider.providerProfile?.ratingAvg;
  const ratingDisplay =
    ratingAvg != null
      ? (typeof ratingAvg === "string" ? parseFloat(ratingAvg) : ratingAvg).toFixed(1)
      : null;
  const ratingCount = service.provider.providerProfile?.ratingCount ?? 0;

  const coverMedia = service.coverMedia ?? service.media?.[0];
  const imageUrl = coverMedia?.signedUrl ?? coverMedia?.url;
  const hasImage = isValidImageUrl(imageUrl);

  const avatarUrl = service.provider.avatarUrl;
  const hasAvatar = isValidImageUrl(avatarUrl);

  const currencySymbol = tier ? (CURRENCY_SYMBOLS[tier.currency] ?? tier.currency) : "";

  return (
    <Pressable
      onPress={() => onPress(service.id)}
      style={styles.card}
      accessibilityLabel={`${service.title} by ${providerName}${tier ? `, ${currencySymbol}${Number(tier.price).toLocaleString()}` : ", quote based"}`}
      accessibilityRole="button"
    >
      {/* Cover image */}
      <View style={styles.imageWrap}>
        {hasImage ? (
          <Image source={{ uri: imageUrl! }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={palette.slate} />
          </View>
        )}
        {/* Badges overlay */}
        <View style={styles.badgeOverlay}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{formatCategory(service.category)}</Text>
          </View>
          {isVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={palette.info} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>
        {/* Save / favourite button */}
        {onSave && (
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); onSave(service.id); }}
            style={styles.saveBtn}
            accessibilityLabel={isSaved ? "Remove from wishlist" : "Save to wishlist"}
            hitSlop={8}
          >
            <Ionicons
              name={isSaved ? "heart" : "heart-outline"}
              size={20}
              color={isSaved ? palette.danger : "#ffffff"}
            />
          </Pressable>
        )}
        {/* Location pill */}
        <View style={styles.locationPill}>
          <Ionicons name="location-outline" size={10} color={palette.canvas} />
          <Text style={styles.locationPillText}>
            {service.isRemote ? "Remote" : service.locationCity || "On-site"}
          </Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.title}>{service.title}</Text>

        <View style={styles.providerRow}>
          {hasAvatar ? (
            <Image source={{ uri: avatarUrl! }} style={styles.providerAvatar} />
          ) : (
            <View style={[styles.providerAvatar, styles.providerAvatarFallback]}>
              <Text style={styles.providerAvatarInitial}>
                {providerName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text numberOfLines={1} style={styles.providerName}>{providerName}</Text>
          {ratingDisplay && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color="#f59e0b" />
              <Text style={styles.ratingText}>{ratingDisplay}</Text>
              <Text style={styles.ratingCount}>({ratingCount})</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.price}>
            {tier
              ? `${currencySymbol} ${Number(tier.price).toLocaleString()}`
              : "Quote based"}
          </Text>
          {tier && tier.pricingType === "per_unit" && tier.unitLabel && (
            <Text style={styles.priceUnit}>/ {tier.unitLabel}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const useStyles = createThemedStyles((palette) => ({
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  imageWrap: {
    height: 160,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: palette.mist,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeOverlay: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    gap: 6,
  },
  categoryBadge: {
    backgroundColor: palette.accentSoft,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryBadgeText: {
    color: palette.accentDeep,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: palette.infoSoft,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verifiedText: {
    color: palette.info,
    fontSize: 10,
    fontWeight: "700",
  },
  saveBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${palette.shadow}59`,
    alignItems: "center",
    justifyContent: "center",
  },
  locationPill: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: `${palette.shadow}80`,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  locationPillText: {
    color: palette.canvas,
    fontSize: 10,
    fontWeight: "600",
  },
  body: {
    padding: 14,
    gap: 8,
  },
  title: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  providerAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 6,
  },
  providerAvatarFallback: {
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  providerAvatarInitial: {
    color: palette.accentDeep,
    fontSize: 11,
    fontWeight: "700",
  },
  providerName: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  ratingCount: {
    color: palette.slate,
    fontSize: 11,
  },
  footer: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  price: {
    color: palette.gold,
    fontSize: 15,
    fontWeight: "800",
  },
  priceUnit: {
    color: palette.slate,
    fontSize: 12,
  },
}));
