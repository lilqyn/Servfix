import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  changePassword,
  fetchMyAccountDeletionRequest,
  requestMyAccountDeletion,
  requestPasswordReset,
  updateProfile,
  uploadProfileAvatar,
  uploadProfileBanner,
} from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { AuthUser } from "../types";

const PREFERENCES_KEY = "servfix-preferences";

type Props = {
  onBack: () => void;
  onUpdated?: (user: AuthUser) => void;
};

type PreferencesState = {
  inApp: boolean;
  emailUpdates: boolean;
  smsAlerts: boolean;
  communityDigest: boolean;
};

const defaultPrefs: PreferencesState = {
  inApp: true,
  emailUpdates: true,
  smsAlerts: true,
  communityDigest: true,
};

const MOMO_NETWORKS = [
  { label: "MTN", value: "mtn" as const },
  { label: "Vodafone", value: "vodafone" as const },
  { label: "AirtelTigo", value: "airteltigo" as const },
];

const isValidImageUrl = (url?: string | null) =>
  !!url && (url.startsWith("http://") || url.startsWith("https://"));

const useFieldStyles = createThemedStyles((palette) => ({
  wrap: { gap: 6 },
  label: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase" as const,
  },
  hint: { color: palette.slate, fontSize: 12 },
}));

const Field = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) => {
  const fieldStyles = useFieldStyles();
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
      {hint ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
    </View>
  );
};

export function SettingsScreen({ onBack, onUpdated }: Props) {
  const styles = useStyles();
  const fieldStyles = useFieldStyles();
  const { palette, mode: themeMode, setMode: setThemeMode } = useTheme();
  const { user, updateUser } = useAuth();

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.providerProfile?.displayName ?? "");
  const [bio, setBio] = useState(user?.providerProfile?.bio ?? "");
  const [location, setLocation] = useState(user?.providerProfile?.location ?? user?.location ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [momoNumber, setMomoNumber] = useState("");
  const [momoNetwork, setMomoNetwork] = useState<"mtn" | "vodafone" | "airteltigo">("mtn");

  // Avatar & banner
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState(user?.bannerUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  // Notification preferences (local)
  const [prefs, setPrefs] = useState<PreferencesState>(defaultPrefs);

  // Profile save
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);

  // Account deletion
  const [deletionRequest, setDeletionRequest] = useState<{ id: string; status: string; createdAt: string } | null>(null);
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionLoading, setDeletionLoading] = useState(false);

  // Load preferences
  useEffect(() => {
    AsyncStorage.getItem(PREFERENCES_KEY).then((raw) => {
      if (raw) {
        try {
          const p = JSON.parse(raw) as Partial<PreferencesState>;
          setPrefs({ ...defaultPrefs, ...p });
        } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  // Save preferences on change
  const updatePref = useCallback((key: keyof PreferencesState, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Load deletion request
  useEffect(() => {
    fetchMyAccountDeletionRequest()
      .then((res) => setDeletionRequest(res.request))
      .catch(() => {});
  }, []);

  // Pick avatar
  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setAvatarUploading(true);
    try {
      const upload = await uploadProfileAvatar(result.assets[0].uri);
      setAvatarUrl(upload.signedUrl);
      await updateProfile({ avatarKey: upload.key });
      const updated = { ...user!, avatarUrl: upload.signedUrl };
      await updateUser(updated);
    } catch {
      Alert.alert("Upload failed", "Could not upload avatar.");
    } finally {
      setAvatarUploading(false);
    }
  };

  // Remove avatar
  const removeAvatar = async () => {
    try {
      await updateProfile({ avatarKey: null });
      setAvatarUrl(null);
      const updated = { ...user!, avatarUrl: null };
      await updateUser(updated);
    } catch { /* ignore */ }
  };

  // Pick banner
  const pickBanner = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setBannerUploading(true);
    try {
      const upload = await uploadProfileBanner(result.assets[0].uri);
      setBannerUrl(upload.signedUrl);
      await updateProfile({ bannerKey: upload.key });
      const updated = { ...user!, bannerUrl: upload.signedUrl };
      await updateUser(updated);
    } catch {
      Alert.alert("Upload failed", "Could not upload banner.");
    } finally {
      setBannerUploading(false);
    }
  };

  // Remove banner
  const removeBanner = async () => {
    try {
      await updateProfile({ bannerKey: null });
      setBannerUrl(null);
      const updated = { ...user!, bannerUrl: null };
      await updateUser(updated);
    } catch { /* ignore */ }
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const updated = await updateProfile({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        location: location.trim() || undefined,
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        momoNumber: momoNumber.trim() || undefined,
        momoNetwork,
      });
      await updateUser(updated);
      onUpdated?.(updated);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) { setPwError("Enter your current password."); return; }
    if (newPassword.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPwError("Passwords do not match."); return; }
    setPwLoading(true);
    setPwError(null);
    setPwSaved(false);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwSaved(true);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setPwLoading(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    try {
      await requestPasswordReset({ email: user?.email ?? undefined });
      Alert.alert("Email sent", "Check your inbox for a password reset link.");
    } catch {
      Alert.alert("Error", "Could not send password reset email.");
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This action is permanent and cannot be undone. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletionLoading(true);
            try {
              await requestMyAccountDeletion(deletionReason);
              const req = await fetchMyAccountDeletionRequest();
              setDeletionRequest(req.request);
              Alert.alert("Request submitted", "Your account deletion request is being processed.");
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Could not request deletion.");
            } finally {
              setDeletionLoading(false);
            }
          },
        },
      ],
    );
  };

  const initial = (user?.providerProfile?.displayName || user?.username || user?.email || "?")[0].toUpperCase();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={palette.accentDeep} />
          </Pressable>
          <Text style={styles.topTitle}>Account settings</Text>
        </View>

        <Text style={styles.subtitle}>
          Manage your profile, contact details, notifications, and preferences.
        </Text>

        {/* ── Profile media ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile media</Text>
          <Text style={styles.sectionHint}>Upload a photo and banner so people recognize you.</Text>

          {/* Banner */}
          <Text style={fieldStyles.label}>Profile banner</Text>
          <Pressable onPress={() => void pickBanner()} style={styles.bannerWrap}>
            {bannerUploading ? (
              <ActivityIndicator color={palette.accent} />
            ) : isValidImageUrl(bannerUrl) ? (
              <Image source={{ uri: bannerUrl! }} style={styles.bannerImage} resizeMode="cover" />
            ) : (
              <View style={styles.bannerPlaceholder}>
                <Ionicons name="image-outline" size={28} color="#d1d5db" />
                <Text style={styles.bannerPlaceholderText}>No banner uploaded.</Text>
              </View>
            )}
          </Pressable>
          {isValidImageUrl(bannerUrl) && (
            <Pressable onPress={() => void removeBanner()}>
              <Text style={styles.removeText}>Remove banner</Text>
            </Pressable>
          )}

          {/* Avatar */}
          <Text style={fieldStyles.label}>Profile photo</Text>
          <View style={styles.avatarRow}>
            <Pressable onPress={() => void pickAvatar()} style={styles.avatarCircle}>
              {avatarUploading ? (
                <ActivityIndicator color={palette.accent} />
              ) : isValidImageUrl(avatarUrl) ? (
                <Image source={{ uri: avatarUrl! }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitial}>{initial}</Text>
              )}
            </Pressable>
            <View style={styles.avatarActions}>
              <Pressable onPress={() => void pickAvatar()} style={styles.outlineButton}>
                <Text style={styles.outlineButtonText}>Choose photo</Text>
              </Pressable>
              {isValidImageUrl(avatarUrl) && (
                <Pressable onPress={() => void removeAvatar()}>
                  <Text style={styles.removeText}>Remove photo</Text>
                </Pressable>
              )}
              <Text style={fieldStyles.hint}>Square image recommended. JPG, PNG, or WebP up to 10 MB.</Text>
            </View>
          </View>
        </View>

        {/* ── Profile details ───────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile details</Text>
          <Text style={styles.sectionHint}>Update how others see you in the community and search.</Text>

          <Field label="Username" hint="Use 3-20 characters with letters, numbers, or underscores.">
            <TextInput
              autoCapitalize="none"
              editable={!profileLoading}
              onChangeText={(t) => { setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, "")); setProfileSaved(false); }}
              placeholder="e.g. john_doe"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={username}
            />
          </Field>

          <Field label="Display name">
            <TextInput
              editable={!profileLoading}
              onChangeText={(t) => { setDisplayName(t); setProfileSaved(false); }}
              placeholder="Your public name"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={displayName}
            />
          </Field>

          <Field label="Location" hint="We use your location to show nearby providers first.">
            <TextInput
              editable={!profileLoading}
              onChangeText={(t) => { setLocation(t); setProfileSaved(false); }}
              placeholder="City or service area"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={location}
            />
          </Field>

          <Field label="Bio">
            <TextInput
              editable={!profileLoading}
              maxLength={500}
              multiline
              onChangeText={(t) => { setBio(t); setProfileSaved(false); }}
              placeholder="Tell buyers about yourself..."
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.textarea]}
              value={bio}
            />
          </Field>
        </View>

        {/* ── Contact info ──────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact info</Text>
          <Text style={styles.sectionHint}>Keep your email and phone up to date for order updates.</Text>

          <Field label="Email address">
            <TextInput
              autoCapitalize="none"
              editable={!profileLoading}
              keyboardType="email-address"
              onChangeText={(t) => { setEmail(t); setProfileSaved(false); }}
              placeholder="your@email.com"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={email}
            />
          </Field>

          <Field label="Phone number">
            <TextInput
              editable={!profileLoading}
              keyboardType="phone-pad"
              onChangeText={(t) => { setPhone(t); setProfileSaved(false); }}
              placeholder="+233 ..."
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={phone}
            />
          </Field>
        </View>

        {/* ── Payout (MoMo) ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout settings</Text>

          <Field label="MoMo number" hint="Used for payouts. Must match your registered MoMo account.">
            <TextInput
              editable={!profileLoading}
              keyboardType="phone-pad"
              onChangeText={(t) => { setMomoNumber(t.replace(/[^0-9+]/g, "")); setProfileSaved(false); }}
              placeholder="e.g. 0244000000"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={momoNumber}
            />
          </Field>

          <Field label="MoMo network">
            <View style={styles.chipRow}>
              {MOMO_NETWORKS.map((net) => (
                <Pressable
                  key={net.value}
                  onPress={() => { setMomoNetwork(net.value); setProfileSaved(false); }}
                  style={[styles.chip, momoNetwork === net.value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, momoNetwork === net.value && styles.chipTextActive]}>
                    {net.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>
        </View>

        {/* Save all profile changes */}
        {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
        {profileSaved ? <Text style={styles.successText}>Changes saved!</Text> : null}

        <Pressable
          disabled={profileLoading}
          onPress={() => void handleSaveProfile()}
          style={[styles.primaryButton, profileLoading && styles.buttonDisabled]}
        >
          {profileLoading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Save changes</Text>
          )}
        </Pressable>

        {/* ── Appearance ────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.sectionHint}>Choose your preferred theme.</Text>

          <View style={styles.themeRow}>
            {([
              { key: "system" as const, label: "System", icon: "phone-portrait-outline" as const },
              { key: "light" as const, label: "Light", icon: "sunny-outline" as const },
              { key: "dark" as const, label: "Dark", icon: "moon-outline" as const },
            ]).map((opt) => {
              const active = themeMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setThemeMode(opt.key)}
                  style={[styles.themeChip, active && styles.themeChipActive]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={active ? palette.accentDeep : palette.slate}
                  />
                  <Text style={[styles.themeChipText, active && styles.themeChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Notifications ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Text style={styles.sectionHint}>Choose how you want to receive updates.</Text>

          <View style={styles.switchCard}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>In-app notifications</Text>
              <Text style={styles.switchHint}>Required for messages and orders.</Text>
            </View>
            <Switch
              onValueChange={(v) => updatePref("inApp", v)}
              thumbColor={prefs.inApp ? palette.accentDeep : "#f4f3f4"}
              trackColor={{ false: "#d1d5db", true: palette.accentSoft }}
              value={prefs.inApp}
            />
          </View>

          <View style={styles.switchCard}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Email updates</Text>
              <Text style={styles.switchHint}>Order status and reminders.</Text>
            </View>
            <Switch
              onValueChange={(v) => updatePref("emailUpdates", v)}
              thumbColor={prefs.emailUpdates ? palette.accentDeep : "#f4f3f4"}
              trackColor={{ false: "#d1d5db", true: palette.accentSoft }}
              value={prefs.emailUpdates}
            />
          </View>

          <View style={styles.switchCard}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>SMS alerts</Text>
              <Text style={styles.switchHint}>Critical order updates only.</Text>
            </View>
            <Switch
              onValueChange={(v) => updatePref("smsAlerts", v)}
              thumbColor={prefs.smsAlerts ? palette.accentDeep : "#f4f3f4"}
              trackColor={{ false: "#d1d5db", true: palette.accentSoft }}
              value={prefs.smsAlerts}
            />
          </View>

          <View style={styles.switchCard}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Community digest</Text>
              <Text style={styles.switchHint}>Weekly highlights.</Text>
            </View>
            <Switch
              onValueChange={(v) => updatePref("communityDigest", v)}
              thumbColor={prefs.communityDigest ? palette.accentDeep : "#f4f3f4"}
              trackColor={{ false: "#d1d5db", true: palette.accentSoft }}
              value={prefs.communityDigest}
            />
          </View>
        </View>

        {/* ── Security ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <Text style={styles.sectionHint}>Manage your password and account safety.</Text>

          <Field label="Current password">
            <TextInput
              autoComplete="password"
              editable={!pwLoading}
              onChangeText={(t) => { setCurrentPassword(t); setPwSaved(false); setPwError(null); }}
              placeholder="Enter current password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={styles.input}
              value={currentPassword}
            />
          </Field>

          <Field label="New password">
            <TextInput
              autoComplete="new-password"
              editable={!pwLoading}
              onChangeText={(t) => { setNewPassword(t); setPwSaved(false); setPwError(null); }}
              placeholder="At least 8 characters"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={styles.input}
              value={newPassword}
            />
          </Field>

          <Field label="Confirm new password">
            <TextInput
              editable={!pwLoading}
              onChangeText={(t) => { setConfirmPassword(t); setPwSaved(false); setPwError(null); }}
              placeholder="Repeat new password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={styles.input}
              value={confirmPassword}
            />
          </Field>

          {pwError ? <Text style={styles.errorText}>{pwError}</Text> : null}
          {pwSaved ? <Text style={styles.successText}>Password changed!</Text> : null}

          <Pressable
            disabled={pwLoading}
            onPress={() => void handleChangePassword()}
            style={[styles.primaryButton, pwLoading && styles.buttonDisabled]}
          >
            {pwLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Change password</Text>
            )}
          </Pressable>

          <View style={styles.divider} />

          <Pressable onPress={() => void handleRequestPasswordReset()} style={styles.outlineButton}>
            <Text style={styles.outlineButtonText}>Request password reset</Text>
          </Pressable>
          <Text style={fieldStyles.hint}>We'll send a reset link to your email.</Text>
        </View>

        {/* ── Danger zone ───────────────────────────────────── */}
        <View style={styles.dangerSection}>
          <Text style={styles.dangerTitle}>Danger zone</Text>
          <Text style={styles.dangerHint}>
            Account deletion is permanent and cannot be undone.
          </Text>

          {deletionRequest?.status === "pending" ? (
            <View style={styles.deletionPending}>
              <Ionicons name="time-outline" size={18} color="#b45309" />
              <Text style={styles.deletionPendingText}>
                Deletion request pending since {new Date(deletionRequest.createdAt).toLocaleDateString()}.
              </Text>
            </View>
          ) : (
            <>
              <Field label="Reason (optional)">
                <TextInput
                  multiline
                  onChangeText={setDeletionReason}
                  placeholder="Why are you leaving?"
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, styles.textarea]}
                  value={deletionReason}
                />
              </Field>
              <Pressable
                disabled={deletionLoading}
                onPress={handleDeleteAccount}
                style={[styles.dangerButton, deletionLoading && styles.buttonDisabled]}
              >
                {deletionLoading ? (
                  <ActivityIndicator color={palette.danger} size="small" />
                ) : (
                  <Text style={styles.dangerButtonText}>Delete account</Text>
                )}
              </Pressable>
              <Text style={fieldStyles.hint}>
                Buyers can delete immediately only when there are no active orders or deposits.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  root: { backgroundColor: palette.canvas, flex: 1 },
  content: { gap: 16, padding: 20, paddingBottom: 80 },
  topBar: { alignItems: "center", flexDirection: "row", gap: 12 },
  backButton: { padding: 4 },
  topTitle: { color: palette.ink, fontSize: 20, fontWeight: "800" },
  subtitle: { color: palette.slate, fontSize: 14, marginTop: -8 },
  section: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
    padding: 18,
  },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  sectionHint: { color: palette.slate, fontSize: 13, marginTop: -8 },
  input: {
    backgroundColor: palette.inputBg,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textarea: { minHeight: 90, textAlignVertical: "top" },

  // Avatar & banner
  bannerWrap: {
    backgroundColor: palette.mist,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    height: 100,
    overflow: "hidden",
  },
  bannerImage: { width: "100%", height: "100%" },
  bannerPlaceholder: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  bannerPlaceholderText: { color: "#9ca3af", fontSize: 13 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarCircle: {
    alignItems: "center",
    backgroundColor: palette.accentSoft,
    borderRadius: 36,
    height: 72,
    justifyContent: "center",
    overflow: "hidden",
    width: 72,
  },
  avatarImage: { width: 72, height: 72 },
  avatarInitial: { color: palette.accentDeep, fontSize: 28, fontWeight: "800" },
  avatarActions: { flex: 1, gap: 6 },
  removeText: { color: palette.danger, fontSize: 13, fontWeight: "600" },

  // Buttons
  outlineButton: {
    alignItems: "center",
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  outlineButtonText: { color: palette.ink, fontSize: 13, fontWeight: "700" },

  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    backgroundColor: palette.mist,
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  chipText: { color: palette.slate, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: palette.accentDeep, fontWeight: "800" },

  // Notification toggles
  switchCard: {
    alignItems: "center",
    backgroundColor: palette.inputBg,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 14,
  },
  switchInfo: { flex: 1, gap: 2 },
  switchLabel: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  switchHint: { color: palette.slate, fontSize: 12 },

  divider: { backgroundColor: palette.line, height: 1 },

  // Feedback
  errorText: { color: palette.danger, fontSize: 13 },
  successText: { color: palette.accentDeep, fontSize: 13, fontWeight: "600" },

  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonText: { color: palette.canvas, fontSize: 14, fontWeight: "800" },
  buttonDisabled: { opacity: 0.5 },

  // Danger zone
  dangerSection: {
    backgroundColor: palette.dangerSoft,
    borderColor: palette.dangerLine,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  dangerTitle: { color: palette.danger, fontSize: 16, fontWeight: "800" },
  dangerHint: { color: palette.slate, fontSize: 13 },
  dangerButton: {
    alignItems: "center",
    backgroundColor: palette.danger,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 46,
  },
  dangerButtonText: { color: palette.canvas, fontSize: 14, fontWeight: "700" },
  deletionPending: {
    alignItems: "center",
    backgroundColor: palette.goldSoft,
    borderColor: palette.gold,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 14,
  },
  deletionPendingText: { color: palette.gold, flex: 1, fontSize: 13 },

  // Appearance
  themeRow: {
    backgroundColor: palette.mist,
    borderRadius: 14,
    flexDirection: "row",
    gap: 0,
    padding: 4,
  },
  themeChip: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 10,
  },
  themeChipActive: {
    backgroundColor: palette.card,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  themeChipText: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "700",
  },
  themeChipTextActive: {
    color: palette.accentDeep,
  },
}));
