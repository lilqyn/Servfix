import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../providers/AuthProvider";
import { palette } from "../theme";

type Props = {
  onOpenSignIn: () => void;
  onOpenNotifications: () => void;
};

export function ProfileScreen({ onOpenNotifications, onOpenSignIn }: Props) {
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
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{user.role.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.inkTitle}>Notifications</Text>
        <Text style={styles.inkBody}>
          In-app notifications are now available from the Alerts tab and list your recent updates.
        </Text>
      </View>

      <Pressable onPress={onOpenNotifications} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Open notifications</Text>
      </Pressable>

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
    backgroundColor: "#111111",
    borderColor: palette.accent,
    borderRadius: 24,
    borderWidth: 1,
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
    color: palette.accentSoft,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  lightTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
  lightBody: {
    color: "#d1d5db",
    fontSize: 14,
    lineHeight: 21,
  },
  rolePill: {
    alignSelf: "flex-start",
    backgroundColor: palette.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rolePillText: {
    color: palette.gold,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
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
    borderColor: palette.accentSoft,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: {
    color: palette.accentDeep,
    fontSize: 14,
    fontWeight: "800",
  },
});
