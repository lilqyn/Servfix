import { useState } from "react";
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
import { requestPasswordReset } from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";

type Props = {
  onBack: () => void;
};

export function ForgotPasswordScreen({ onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const trimmed = identifier.trim();
    if (!trimmed) {
      setError("Enter your email or phone number.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const isEmail = trimmed.includes("@");
      await requestPasswordReset(isEmail ? { email: trimmed } : { phone: trimmed });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset link. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            Enter your email or phone number and we'll send you a reset link.
          </Text>
        </View>

        {sent ? (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Reset link sent</Text>
            <Text style={styles.successBody}>
              Check your email or phone for the reset link. It expires in 60 minutes.
            </Text>
            <Pressable onPress={onBack} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Back to sign in</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email or phone</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                keyboardType="email-address"
                onChangeText={(value) => {
                  setIdentifier(value);
                  setError(null);
                }}
                placeholder="you@example.com or +233..."
                placeholderTextColor={palette.slate}
                style={styles.input}
                value={identifier}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              disabled={isLoading}
              onPress={() => void handleSubmit()}
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Send reset link</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  root: {
    backgroundColor: palette.canvas,
    flex: 1,
  },
  content: {
    gap: 24,
    padding: 24,
    paddingBottom: 60,
  },
  backButton: {
    alignSelf: "flex-start",
  },
  backButtonText: {
    color: palette.accentDeep,
    fontSize: 15,
    fontWeight: "700",
  },
  hero: {
    gap: 8,
  },
  title: {
    color: palette.ink,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  subtitle: {
    color: palette.slate,
    fontSize: 15,
    lineHeight: 22,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: palette.inputBg,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 50,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  successCard: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  successTitle: {
    color: palette.accentDeep,
    fontSize: 18,
    fontWeight: "800",
  },
  successBody: {
    color: palette.accentDeep,
    fontSize: 14,
    lineHeight: 21,
  },
}));
