import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../providers/AuthProvider";
import { palette } from "../theme";

type Props = {
  onOpenSignIn: () => void;
};

export function ProfileScreen({ onOpenSignIn }: Props) {
  const { user, signOut } = useAuth();

  if (!user) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.inkTitle}>Your account</Text>
          <Text style={styles.inkBody}>
            Sign in to sync your Servfix profile, active bookings, messages, and saved services.
          </Text>
          <Pressable onPress={onOpenSignIn} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const displayName =
    user.providerProfile?.displayName || user.username || user.email || user.phone || "User";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Text style={styles.eyebrow}>SIGNED IN</Text>
        <Text style={styles.lightTitle}>{displayName}</Text>
        <Text style={styles.lightBody}>
          Role: {user.role}
          {"\n"}
          {user.email || user.phone || "No primary contact available"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.inkTitle}>Next mobile upgrades</Text>
        <Text style={styles.inkBody}>
          Profile editing, push alerts, and in-app messages can slot into this area.
        </Text>
      </View>

      <Pressable onPress={() => void signOut()} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 140,
  },
  headerCard: {
    backgroundColor: palette.accent,
    borderRadius: 24,
    gap: 8,
    padding: 20,
  },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  eyebrow: {
    color: "#99f6e4",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  lightTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
  lightBody: {
    color: "#d1fae5",
    fontSize: 14,
    lineHeight: 21,
  },
  inkTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  inkBody: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.ink,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
});
