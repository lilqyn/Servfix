import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { palette } from "../theme";
import type { AuthUser } from "../types";

type Props = {
  user: AuthUser | null;
  onBrowse: () => void;
  onOpenSignIn: () => void;
};

export function HomeScreen({ user, onBrowse, onOpenSignIn }: Props) {
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const displayName =
    user?.providerProfile?.displayName || user?.username || user?.email || user?.phone || "there";

  return (
    <ScrollView contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>SERVFIX MOBILE</Text>
        <Text style={[styles.title, isCompact && styles.titleCompact]}>
          Need a pro today?{"\n"}
          <Text style={styles.titleAccent}>Book in minutes.</Text>
        </Text>
        <Text style={styles.subtitle}>
          Explore verified experts, compare offers, and move from search to payment in one smooth
          flow.
        </Text>

        <View style={styles.heroActions}>
          <Pressable onPress={onBrowse} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Start browsing</Text>
          </Pressable>
          {!user ? (
            <Pressable onPress={onOpenSignIn} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Sign in</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={[styles.statRow, isCompact && styles.statRowCompact]}>
        <View style={[styles.statCard, styles.statCardSky, isCompact && styles.statCardCompact]}>
          <Text style={styles.statValue}>24/7</Text>
          <Text style={styles.statLabel}>Instant requests</Text>
        </View>
        <View style={[styles.statCard, styles.statCardMint, isCompact && styles.statCardCompact]}>
          <Text style={styles.statValue}>Top-rated</Text>
          <Text style={styles.statLabel}>Verified providers</Text>
        </View>
        <View style={[styles.statCard, styles.statCardSun, isCompact && styles.statCardCompact]}>
          <Text style={styles.statValue}>Secure</Text>
          <Text style={styles.statLabel}>In-app payments</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{user ? `Welcome back, ${displayName}` : "Start here"}</Text>
        <Text style={styles.panelBody}>
          {user
            ? "Your account is active. Jump into Browse to discover new services or check your latest orders."
            : "Sign in to save favorites, track orders, and unlock fast checkout from your phone."}
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Quick booking</Text>
          <Text style={styles.infoText}>Open a service, choose a tier, and place your order in a few taps.</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Live status</Text>
          <Text style={styles.infoText}>Track order progress, payment status, and next actions from one place.</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Smooth return</Text>
          <Text style={styles.infoText}>After checkout, payment verification deep-links back into the app.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    padding: 20,
    paddingBottom: 158,
  },
  contentCompact: {
    padding: 16,
    paddingBottom: 144,
  },
  hero: {
    backgroundColor: "#111111",
    borderColor: "#2b2b2b",
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 22,
    shadowColor: "#111111",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  eyebrow: {
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    color: "#ffffff",
    fontSize: 31,
    fontWeight: "800",
    lineHeight: 36,
    letterSpacing: 0.1,
  },
  titleCompact: {
    fontSize: 28,
    lineHeight: 33,
  },
  titleAccent: {
    color: "#fdba74",
  },
  subtitle: {
    color: "#d1d5db",
    fontSize: 15,
    lineHeight: 22,
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 14,
    elevation: 2,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: palette.accentDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
  },
  primaryButtonText: {
    color: "#ecfdf3",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.26)",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  statRow: {
    flexDirection: "row",
    gap: 8,
  },
  statRowCompact: {
    flexDirection: "column",
  },
  statCard: {
    borderRadius: 14,
    flex: 1,
    gap: 2,
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statCardCompact: {
    minHeight: 72,
  },
  statCardSky: {
    backgroundColor: "#dcfce7",
  },
  statCardMint: {
    backgroundColor: "#ffffff",
  },
  statCardSun: {
    backgroundColor: "#ffedd5",
  },
  statValue: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  statLabel: {
    color: "#4b5563",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  panel: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    padding: 18,
  },
  panelTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  panelBody: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    gap: 12,
  },
  infoCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  infoLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  infoText: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
  },
});
