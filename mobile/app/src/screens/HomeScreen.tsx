import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { palette } from "../theme";
import type { AuthUser } from "../types";

type Props = {
  user: AuthUser | null;
  onBrowse: () => void;
  onOpenSignIn: () => void;
};

export function HomeScreen({ user, onBrowse, onOpenSignIn }: Props) {
  const displayName =
    user?.providerProfile?.displayName || user?.username || user?.email || user?.phone || "there";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>SERVFIX ANDROID</Text>
        <Text style={styles.title}>Book trusted local services without leaving the app.</Text>
        <Text style={styles.subtitle}>
          This native shell is wired to your existing Servfix backend and starts with the highest
          value mobile flow: discover services and move toward booking.
        </Text>

        <View style={styles.heroActions}>
          <Pressable onPress={onBrowse} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Browse services</Text>
          </Pressable>
          {!user ? (
            <Pressable onPress={onOpenSignIn} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Sign in</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{user ? `Welcome back, ${displayName}` : "Start here"}</Text>
        <Text style={styles.panelBody}>
          {user
            ? "Your session is active in the mobile app. Orders and profile controls are scaffolded next."
            : "Use sign-in when you are ready to connect the mobile app to your existing Servfix account."}
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Fastest launch</Text>
          <Text style={styles.infoText}>Reuse the current API instead of building a second backend.</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Native shell</Text>
          <Text style={styles.infoText}>Ship through Android while keeping the product in TypeScript.</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Next upgrade</Text>
          <Text style={styles.infoText}>Add checkout, push notifications, and deep links after auth hardening.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 140,
  },
  hero: {
    backgroundColor: palette.ink,
    borderRadius: 28,
    gap: 14,
    padding: 22,
  },
  eyebrow: {
    color: "#99f6e4",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22,
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  panel: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 6,
    padding: 18,
  },
  panelTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "700",
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
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  infoLabel: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  infoText: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
  },
});
