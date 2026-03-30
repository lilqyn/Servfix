import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../providers/ThemeProvider";
import { createThemedStyles } from "../theme";
import { resetPassword } from "../lib/api";

type Props = {
  token: string;
  onBack: () => void;
  onSuccess: () => void;
};

export default function ResetPasswordScreen({
  token,
  onBack,
  onSuccess,
}: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordValid = password.length >= 8;
  const passwordsMatch = password === confirmPassword;
  const canSubmit = passwordValid && passwordsMatch && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError(null);
    setSubmitting(true);

    try {
      await resetPassword({ token, password });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Failed to reset password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color={palette.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reset Password</Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.centered}>
          <View style={styles.successIconContainer}>
            <Ionicons
              name="checkmark-circle"
              size={72}
              color={palette.accent}
            />
          </View>
          <Text style={styles.successTitle}>Password Reset!</Text>
          <Text style={styles.successSubtitle}>
            Your password has been updated successfully. You can now sign in with
            your new password.
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={onSuccess}
            activeOpacity={0.8}
          >
            <Text style={styles.signInButtonText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={palette.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reset Password</Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Icon + instruction */}
          <View style={styles.card}>
            <View style={styles.lockIconRow}>
              <View style={styles.lockIconCircle}>
                <Ionicons
                  name="lock-closed"
                  size={32}
                  color={palette.accent}
                />
              </View>
            </View>
            <Text style={styles.instructionTitle}>Create New Password</Text>
            <Text style={styles.instructionText}>
              Enter your new password below. It must be at least 8 characters
              long.
            </Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            {/* New Password */}
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor={palette.slate}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={palette.slate}
                />
              </TouchableOpacity>
            </View>
            {password.length > 0 && !passwordValid ? (
              <Text style={styles.validationError}>
                Password must be at least 8 characters
              </Text>
            ) : null}

            {/* Confirm Password */}
            <Text style={[styles.label, styles.labelSpacing]}>
              Confirm Password
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={palette.slate}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity
                onPress={() => setShowConfirm(!showConfirm)}
                style={styles.eyeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showConfirm ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={palette.slate}
                />
              </TouchableOpacity>
            </View>
            {confirmPassword.length > 0 && !passwordsMatch ? (
              <Text style={styles.validationError}>Passwords do not match</Text>
            ) : null}

            {/* Password strength indicators */}
            {password.length > 0 ? (
              <View style={styles.strengthRow}>
                <Ionicons
                  name={
                    passwordValid
                      ? "checkmark-circle"
                      : "close-circle"
                  }
                  size={16}
                  color={passwordValid ? palette.accent : palette.slate}
                />
                <Text
                  style={[
                    styles.strengthText,
                    passwordValid && styles.strengthTextValid,
                  ]}
                >
                  At least 8 characters
                </Text>
              </View>
            ) : null}
            {confirmPassword.length > 0 ? (
              <View style={styles.strengthRow}>
                <Ionicons
                  name={
                    passwordsMatch
                      ? "checkmark-circle"
                      : "close-circle"
                  }
                  size={16}
                  color={passwordsMatch ? palette.accent : palette.danger}
                />
                <Text
                  style={[
                    styles.strengthText,
                    passwordsMatch && styles.strengthTextValid,
                    !passwordsMatch && styles.strengthTextError,
                  ]}
                >
                  Passwords match
                </Text>
              </View>
            ) : null}
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorCard}>
              <Ionicons
                name="alert-circle"
                size={20}
                color={palette.danger}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Submit */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>Reset Password</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  container: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: palette.card,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: palette.ink,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.line,
  },
  lockIconRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  lockIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: palette.ink,
    textAlign: "center",
    marginBottom: 6,
  },
  instructionText: {
    fontSize: 14,
    color: palette.slate,
    textAlign: "center",
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: palette.ink,
    marginBottom: 6,
  },
  labelSpacing: {
    marginTop: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    backgroundColor: palette.mist,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.ink,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  validationError: {
    fontSize: 12,
    color: palette.danger,
    marginTop: 4,
  },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  strengthText: {
    fontSize: 13,
    color: palette.slate,
  },
  strengthTextValid: {
    color: palette.accent,
  },
  strengthTextError: {
    color: palette.danger,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.dangerSoft,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.dangerLine,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: palette.danger,
    lineHeight: 18,
  },
  submitButton: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: palette.ink,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: palette.slate,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  signInButton: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: "center",
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
}));
