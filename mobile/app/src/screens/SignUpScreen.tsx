import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../providers/AuthProvider";
import { palette } from "../theme";

type Props = {
  onSuccess: () => void;
  onOpenSignIn: () => void;
};

export function SignUpScreen({ onSuccess, onOpenSignIn }: Props) {
  const { isSigningUp, signUp } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"buyer" | "provider">("buyer");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const usernameRef = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const canSubmit = Boolean(
    identifier.trim() &&
      username.trim() &&
      password.trim() &&
      confirmPassword.trim() &&
      !isSigningUp,
  );

  useFocusEffect(
    useCallback(() => {
      setIdentifier("");
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setRole("buyer");
      setDisplayName("");
      setError(null);
    }, []),
  );

  const submit = async () => {
    if (!canSubmit) {
      return;
    }

    const trimmedIdentifier = identifier.trim();
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedDisplayName = displayName.trim();

    if (!trimmedIdentifier) {
      setError("Email or phone is required.");
      return;
    }

    if (!trimmedUsername) {
      setError("Username is required.");
      return;
    }

    if (!/^[a-z0-9_]{3,20}$/.test(trimmedUsername)) {
      setError("Username must be 3-20 characters and use letters, numbers, or underscores.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (role === "provider" && trimmedDisplayName.length > 0 && trimmedDisplayName.length < 2) {
      setError("Display name must be at least 2 characters.");
      return;
    }

    try {
      setError(null);
      await signUp({
        identifier: trimmedIdentifier,
        username: trimmedUsername,
        password,
        role,
        displayName: role === "provider" ? trimmedDisplayName || undefined : undefined,
      });
      onSuccess();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Sign-up failed.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.page}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.eyebrowPill}>
            <Text style={styles.eyebrowText}>NEW ACCOUNT</Text>
          </View>
          <Text style={styles.title}>Create your Servfix account</Text>
          <Text style={styles.subtitle}>
            Mobile sign-up creates a standard buyer or provider account. Admin access remains
            web-only.
          </Text>

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            editable={!isSigningUp}
            onChangeText={setIdentifier}
            onSubmitEditing={() => usernameRef.current?.focus()}
            placeholder="Email or phone"
            placeholderTextColor="#94a3b8"
            returnKeyType="next"
            style={styles.input}
            value={identifier}
          />

          <TextInput
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            blurOnSubmit={false}
            editable={!isSigningUp}
            onChangeText={setUsername}
            onSubmitEditing={() => {
              if (role === "provider") {
                displayNameRef.current?.focus();
                return;
              }
              passwordRef.current?.focus();
            }}
            placeholder="Username"
            placeholderTextColor="#94a3b8"
            ref={usernameRef}
            returnKeyType="next"
            style={styles.input}
            textContentType="username"
            value={username}
          />

          <View style={styles.roleRow}>
            <Pressable
              disabled={isSigningUp}
              onPress={() => setRole("buyer")}
              style={[styles.roleButton, role === "buyer" && styles.roleButtonActive]}
            >
              <Text style={[styles.roleLabel, role === "buyer" && styles.roleLabelActive]}>
                Buyer
              </Text>
            </Pressable>
            <Pressable
              disabled={isSigningUp}
              onPress={() => setRole("provider")}
              style={[styles.roleButton, role === "provider" && styles.roleButtonActive]}
            >
              <Text style={[styles.roleLabel, role === "provider" && styles.roleLabelActive]}>
                Provider
              </Text>
            </Pressable>
          </View>

          {role === "provider" ? (
            <TextInput
              autoCorrect={false}
              blurOnSubmit={false}
              editable={!isSigningUp}
              onChangeText={setDisplayName}
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="Business / display name (optional)"
              placeholderTextColor="#94a3b8"
              ref={displayNameRef}
              returnKeyType="next"
              style={styles.input}
              value={displayName}
            />
          ) : null}

          <TextInput
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            blurOnSubmit={false}
            editable={!isSigningUp}
            onChangeText={setPassword}
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            placeholder="Password"
            placeholderTextColor="#94a3b8"
            ref={passwordRef}
            returnKeyType="next"
            secureTextEntry
            style={styles.input}
            textContentType="newPassword"
            value={password}
          />

          <TextInput
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            editable={!isSigningUp}
            onChangeText={setConfirmPassword}
            onSubmitEditing={() => void submit()}
            placeholder="Confirm password"
            placeholderTextColor="#94a3b8"
            ref={confirmPasswordRef}
            returnKeyType="done"
            secureTextEntry
            style={styles.input}
            textContentType="newPassword"
            value={confirmPassword}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={!canSubmit}
            onPress={() => void submit()}
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
          >
            {isSigningUp ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Create account</Text>
            )}
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={styles.footerHint}>Already have an account?</Text>
            <Pressable disabled={isSigningUp} onPress={onOpenSignIn}>
              <Text style={styles.footerLink}>Sign in</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: palette.canvas,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 28,
    borderWidth: 1,
    gap: 13,
    padding: 22,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  eyebrowPill: {
    alignSelf: "flex-start",
    backgroundColor: palette.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eyebrowText: {
    color: palette.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  title: {
    color: palette.ink,
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 21,
  },
  input: {
    backgroundColor: palette.canvas,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  roleRow: {
    flexDirection: "row",
    gap: 10,
  },
  roleButton: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  roleButtonActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  roleLabel: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "700",
  },
  roleLabelActive: {
    color: "#ffffff",
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  footerHint: {
    color: palette.slate,
    fontSize: 13,
  },
  footerLink: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "700",
  },
});
