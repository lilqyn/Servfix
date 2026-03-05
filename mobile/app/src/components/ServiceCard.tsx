import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "../theme";
import type { Service } from "../types";

type Props = {
  service: Service;
  onPress: (serviceId: string) => void;
};

export function ServiceCard({ service, onPress }: Props) {
  const tier = service.tiers[0];
  const providerName =
    service.provider.providerProfile?.displayName || service.provider.username || "Provider";

  return (
    <Pressable onPress={() => onPress(service.id)} style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{service.category}</Text>
        </View>
        <Text style={styles.locationText}>
          {service.isRemote ? "Remote" : service.locationCity || "On-site"}
        </Text>
      </View>

      <Text style={styles.title}>{service.title}</Text>
      <Text numberOfLines={3} style={styles.description}>
        {service.description}
      </Text>

      <View style={styles.metaRow}>
        <Text style={styles.provider}>{providerName}</Text>
        <Text style={styles.price}>
          {tier ? `${tier.currency} ${tier.price}` : "Quote based"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  badge: {
    backgroundColor: palette.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  locationText: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "600",
  },
  title: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  description: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  provider: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  price: {
    color: palette.gold,
    fontSize: 13,
    fontWeight: "700",
  },
});
