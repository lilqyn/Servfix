import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../providers/AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { createThemedStyles } from "../theme";

type Props = {
  onSuccess: () => void;
  onOpenSignUp: () => void;
  onOpenForgotPassword?: () => void;
};

export function SignInScreen({ onSuccess, onOpenSignUp, onOpenForgotPassword }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { isSigningIn, signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const canSubmit = Boolean(identifier.trim() && password.trim() && !isSigningIn);

  useFocusEffect(
    useCallback(() => {
      setIdentifier("");
      setPassword("");
      setError(null);
    }, []),
  );

  const submit = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      setError(null);
      await signIn(identifier, password);
      onSuccess();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Sign-in failed.");
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
            <Text style={styles.eyebrowText}>MOBILE ACCESS</Text>
          </View>
          <Text style={styles.title}>Sign in to Servfix</Text>
          <Text style={styles.subtitle}>
            Use the same account you already use on the web app. The mobile scaffold reuses the
            same backend.
          </Text>

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            editable={!isSigningIn}
            onChangeText={setIdentifier}
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder="Email or phone"
            placeholderTextColor="#94a3b8"
            returnKeyType="next"
            style={styles.input}
            value={identifier}
          />

          <View style={styles.passwordWrap}>
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              autoCorrect={false}
              editable={!isSigningIn}
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              ref={passwordRef}
              returnKeyType="done"
              secureTextEntry={!showPassword}
              style={[styles.input, { flex: 1, borderWidth: 0 }]}
              textContentType="password"
              value={password}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={palette.slate} />
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            disabled={!canSubmit}
            onPress={() => void submit()}
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
          >
            {isSigningIn ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={styles.footerHint}>Need an account?</Text>
            <Pressable disabled={isSigningIn} onPress={onOpenSignUp}>
              <Text style={styles.footerLink}>Create one</Text>
            </Pressable>
          </View>
          {onOpenForgotPassword ? (
            <Pressable onPress={onOpenForgotPassword} style={styles.forgotRow}>
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </Pressable>
          ) : null}

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
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
    shadowColor: palette.shadow,
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
  passwordWrap: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
  },
  eyeBtn: {
    padding: 12,
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
    color: palette.canvas,
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
  forgotRow: { alignItems: "center" },
  forgotLink: { color: palette.slate, fontSize: 13 },
}));
