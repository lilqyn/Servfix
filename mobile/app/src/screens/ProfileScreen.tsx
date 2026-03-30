import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "../providers/AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { createThemedStyles } from "../theme";

type Props = {
  onOpenSignIn: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenProviderDashboard?: () => void;
  onOpenWallet?: () => void;
  onOpenMessages: () => void;
  onOpenBoosts?: () => void;
  onOpenSubscriptions?: () => void;
  onOpenSupport: () => void;
  onOpenWishlist?: () => void;
  onOpenCart?: () => void;
  onOpenAcademy?: () => void;
  onOpenBlog?: () => void;
  onOpenLegal?: (slug: "privacy" | "terms" | "cookies" | "providerAddendum" | "about") => void;
  onOpenProviderResources?: () => void;
  onOpenBusiness?: () => void;
  unreadNotifications?: number;
};

export function ProfileScreen({
  onOpenNotifications,
  onOpenSignIn,
  onOpenSettings,
  onOpenProviderDashboard,
  onOpenWallet,
  onOpenMessages,
  onOpenBoosts,
  onOpenSubscriptions,
  onOpenSupport,
  onOpenWishlist,
  onOpenCart,
  onOpenAcademy,
  onOpenLegal,
  onOpenProviderResources,
  onOpenBusiness,
  unreadNotifications = 0,
}: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user, signOut } = useAuth();

  if (!user) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.signInCard}>
          <View style={styles.signInIconWrap}>
            <Ionicons name="person-circle-outline" size={56} color={palette.slate} />
          </View>
          <Text style={styles.signInTitle}>Your account</Text>
          <Text style={styles.signInBody}>
            Sign in to sync your Servfix profile, active bookings, messages, and saved services.
          </Text>
          <Pressable onPress={onOpenSignIn} style={styles.signInButton}>
            <Ionicons name="log-in-outline" size={18} color={palette.canvas} />
            <Text style={styles.signInButtonText}>Sign in</Text>
          </Pressable>
        </View>

        {/* Explore - available without sign in */}
        <View style={styles.menuCard}>
          <MenuItem icon="school-outline" label="Academy" onPress={onOpenAcademy} last />
        </View>
        <View style={styles.menuCard}>
          <MenuItem icon="shield-outline" label="Privacy policy" onPress={() => onOpenLegal?.("privacy")} />
          <MenuItem icon="document-text-outline" label="Terms & conditions" onPress={() => onOpenLegal?.("terms")} />
          <MenuItem icon="reader-outline" label="Cookies policy" onPress={() => onOpenLegal?.("cookies")} last />
        </View>
      </ScrollView>
    );
  }

  const displayName =
    user.providerProfile?.displayName || user.username || user.email || user.phone || "User";
  const isProvider = user.role === "provider" || user.role === "admin" || user.role === "super_admin";
  const verificationStatus = user.providerProfile?.verificationStatus;
  const isVerified = verificationStatus === "verified";
  const ratingAvg = user.providerProfile?.ratingAvg;
  const ratingCount = user.providerProfile?.ratingCount ?? 0;
  const ratingDisplay =
    ratingAvg != null
      ? (typeof ratingAvg === "string" ? parseFloat(ratingAvg) : ratingAvg).toFixed(1)
      : null;
  const bio = user.providerProfile?.bio;
  const location = user.providerProfile?.location || user.location;
  const categories = user.providerProfile?.categories;
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  const roleLabel = isProvider ? "Service provider" : "Community member";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Banner + Avatar */}
      <View style={styles.bannerWrap}>
        <View style={styles.banner}>
          <View style={styles.bannerGradient} />
        </View>
        <View style={styles.avatarWrap}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={36} color={palette.slate} />
            </View>
          )}
        </View>
      </View>

      {/* Profile info */}
      <View style={styles.profileInfo}>
        <Text style={styles.welcomeText}>Welcome back</Text>
        <View style={styles.nameRow}>
          <Text style={styles.displayName}>{displayName}</Text>
          {isVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={palette.info} />
            </View>
          )}
        </View>

        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{roleLabel}</Text>
        </View>

        {user.username && user.username !== displayName && (
          <Text style={styles.handle}>@{user.username}</Text>
        )}

        {bio ? <Text style={styles.bio}>{bio}</Text> : null}

        {/* Info row with icons */}
        <View style={styles.infoRow}>
          {location ? (
            <View style={styles.infoItem}>
              <Ionicons name="location-outline" size={14} color={palette.slate} />
              <Text style={styles.infoText}>{location}</Text>
            </View>
          ) : null}
          {ratingDisplay ? (
            <View style={styles.infoItem}>
              <Ionicons name="star" size={14} color="#f59e0b" />
              <Text style={styles.infoTextBold}>{ratingDisplay}</Text>
              <Text style={styles.infoText}>({ratingCount})</Text>
            </View>
          ) : null}
          {memberSince ? (
            <View style={styles.infoItem}>
              <Ionicons name="calendar-outline" size={14} color={palette.slate} />
              <Text style={styles.infoText}>{memberSince}</Text>
            </View>
          ) : null}
        </View>

        {/* Category badges */}
        {categories && categories.length > 0 && (
          <View style={styles.categoriesRow}>
            {categories.map((cat) => (
              <View key={cat} style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{cat}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.contactText}>
          {user.email || user.phone || "No contact info"}
        </Text>
      </View>

      {/* Quick actions menu */}
      <View style={styles.menuCard}>
        {isProvider ? (
          <MenuItem icon="grid-outline" label="Provider dashboard" onPress={onOpenProviderDashboard} />
        ) : null}
        {isProvider ? (
          <MenuItem icon="wallet-outline" label="Earnings & disbursements" onPress={onOpenWallet} />
        ) : null}
        {isProvider ? (
          <MenuItem icon="rocket-outline" label="Boost services" onPress={onOpenBoosts} />
        ) : null}
        {isProvider ? (
          <MenuItem icon="card-outline" label="Subscription plans" onPress={onOpenSubscriptions} />
        ) : null}
        <MenuItem icon="heart-outline" label="Wishlist" onPress={onOpenWishlist} />
        <MenuItem icon="cart-outline" label="Cart" onPress={onOpenCart} />
        <MenuItem icon="chatbubbles-outline" label="Messages" onPress={onOpenMessages} />
        <MenuItem icon="notifications-outline" label="Notifications" onPress={onOpenNotifications} badge={unreadNotifications} />
        {!isProvider ? (
          <MenuItem icon="business-outline" label="Business accounts" onPress={onOpenBusiness} />
        ) : null}
        <MenuItem icon="help-buoy-outline" label="Help & support" onPress={onOpenSupport} />
        <MenuItem icon="settings-outline" label="Settings" onPress={onOpenSettings} last />
      </View>

      {/* Explore */}
      <View style={styles.menuCard}>
        <MenuItem icon="school-outline" label="Academy" onPress={onOpenAcademy} />
        {isProvider && onOpenProviderResources ? (
          <MenuItem icon="book-outline" label="Provider resources" onPress={onOpenProviderResources} last />
        ) : null}
      </View>

      {/* Legal */}
      <View style={styles.menuCard}>
        <MenuItem icon="shield-outline" label="Privacy policy" onPress={() => onOpenLegal?.("privacy")} />
        <MenuItem icon="document-text-outline" label="Terms & conditions" onPress={() => onOpenLegal?.("terms")} />
        <MenuItem icon="reader-outline" label="Cookies policy" onPress={() => onOpenLegal?.("cookies")} last />
      </View>

      <Pressable onPress={() => void signOut()} style={styles.signOutButton}>
        <Ionicons name="log-out-outline" size={18} color={palette.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  last,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress?: () => void;
  last?: boolean;
  badge?: number;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.menuRow, last && styles.menuRowLast]}>
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon} size={20} color={palette.accentDeep} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      {(badge ?? 0) > 0 && (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge! > 99 ? "99+" : badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={palette.slate} />
    </Pressable>
  );
}

const useStyles = createThemedStyles((palette) => ({
  content: {
    gap: 16,
    paddingBottom: 140,
  },
  // Sign in state
  signInCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    margin: 20,
    padding: 30,
  },
  signInIconWrap: { marginBottom: 4 },
  signInTitle: { color: palette.ink, fontSize: 20, fontWeight: "800" },
  signInBody: { color: palette.slate, fontSize: 14, lineHeight: 20, textAlign: "center" },
  signInButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 4,
  },
  signInButtonText: { color: palette.canvas, fontSize: 15, fontWeight: "700" },
  // Banner + avatar
  bannerWrap: { position: "relative", marginBottom: 40 },
  banner: { height: 140, overflow: "hidden" },
  bannerGradient: {
    flex: 1,
    backgroundColor: palette.accentDeep,
    opacity: 0.85,
  },
  avatarWrap: {
    position: "absolute",
    bottom: -36,
    left: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: palette.card,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.mist,
  },
  // Profile info
  profileInfo: {
    paddingHorizontal: 20,
    gap: 6,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  welcomeText: { color: palette.slate, fontSize: 14, fontWeight: "500", marginBottom: 2 },
  displayName: { color: palette.ink, fontSize: 24, fontWeight: "800" },
  verifiedBadge: {},
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: palette.accentSoft,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: { color: palette.accentDeep, fontSize: 12, fontWeight: "700" },
  handle: { color: palette.slate, fontSize: 14 },
  bio: { color: palette.ink, fontSize: 14, lineHeight: 20, marginTop: 2 },
  infoRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 4 },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoText: { color: palette.slate, fontSize: 13 },
  infoTextBold: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  categoriesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  categoryBadge: {
    backgroundColor: palette.goldSoft,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryBadgeText: { color: palette.gold, fontSize: 11, fontWeight: "700" },
  contactText: { color: palette.slate, fontSize: 13, marginTop: 2 },
  // Menu
  menuCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    marginHorizontal: 20,
    overflow: "hidden",
  },
  menuRow: {
    alignItems: "center",
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { color: palette.ink, fontSize: 15, fontWeight: "600", flex: 1 },
  menuBadge: {
    backgroundColor: palette.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginRight: 4,
  },
  menuBadgeText: {
    color: palette.canvas,
    fontSize: 11,
    fontWeight: "800",
  },
  // Sign out
  signOutButton: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 12,
  },
  signOutText: { color: palette.danger, fontSize: 15, fontWeight: "700" },
}));
