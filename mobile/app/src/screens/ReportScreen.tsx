import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { submitReport } from "../lib/api";
import { useTheme } from "../providers/ThemeProvider";
import { createThemedStyles } from "../theme";
import type { ReportTargetType } from "../types";

type Props = {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  onBack: () => void;
  onDone: () => void;
};

const REASONS: Record<ReportTargetType, string[]> = {
  user: ["Spam", "Harassment", "Fake account", "Inappropriate content", "Scam / Fraud", "Other"],
  service: ["Misleading description", "Scam / Fraud", "Inappropriate content", "Wrong category", "Duplicate listing", "Other"],
  community_post: ["Spam", "Harassment", "Misinformation", "Inappropriate content", "Other"],
  community_comment: ["Spam", "Harassment", "Inappropriate language", "Other"],
  review: ["Fake review", "Inappropriate content", "Spam", "Conflict of interest", "Other"],
  order: ["Payment issue", "Provider not responding", "Service not as described", "Scam / Fraud", "Other"],
};

const TARGET_LABELS: Record<ReportTargetType, string> = {
  user: "User",
  service: "Service",
  community_post: "Post",
  community_comment: "Comment",
  review: "Review",
  order: "Order",
};

export function ReportScreen({ targetType, targetId, targetLabel, onBack, onDone }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reasons = REASONS[targetType] ?? REASONS.user;

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert("Required", "Please select a reason for your report.");
      return;
    }
    setSubmitting(true);
    try {
      await submitReport({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color="#15803d" />
          </View>
          <Text style={styles.successTitle}>Report Submitted</Text>
          <Text style={styles.successText}>
            Thank you for helping keep Servfix safe. Our team will review your report and take
            appropriate action.
          </Text>
          <Pressable style={styles.doneBtn} onPress={onDone}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.infoCard}>
          <Ionicons name="flag" size={20} color={palette.danger} />
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>
              Report {TARGET_LABELS[targetType]}
            </Text>
            {targetLabel ? (
              <Text style={styles.infoSubtext} numberOfLines={1}>
                {targetLabel}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.label}>Reason</Text>
        <View style={styles.reasonsGrid}>
          {reasons.map((r) => (
            <Pressable
              key={r}
              style={[styles.reasonChip, reason === r && styles.reasonChipActive]}
              onPress={() => setReason(r)}
            >
              {reason === r && <Ionicons name="checkmark-circle" size={16} color="#ffffff" />}
              <Text style={[styles.reasonChipText, reason === r && styles.reasonChipTextActive]}>
                {r}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Additional details (optional)</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Provide more context to help our review team..."
          placeholderTextColor={palette.slate}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{details.length}/500</Text>

        <Pressable
          style={[styles.submitBtn, !reason && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !reason}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Report</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  container: { flex: 1, backgroundColor: palette.canvas },
  form: { padding: 20, gap: 12, paddingBottom: 40 },
  infoCard: {
    backgroundColor: palette.dangerSoft,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 4,
  },
  infoBody: { flex: 1, gap: 2 },
  infoTitle: { color: palette.danger, fontSize: 15, fontWeight: "700" },
  infoSubtext: { color: palette.slate, fontSize: 13 },
  label: { color: palette.ink, fontSize: 13, fontWeight: "700", marginTop: 4 },
  reasonsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: palette.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reasonChipActive: { backgroundColor: palette.danger, borderColor: palette.danger },
  reasonChipText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  reasonChipTextActive: { color: "#ffffff" },
  textArea: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: palette.ink,
    minHeight: 100,
  },
  charCount: { color: palette.slate, fontSize: 11, alignSelf: "flex-end" },
  submitBtn: {
    backgroundColor: palette.danger,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  successCard: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    gap: 12,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  successIcon: { marginBottom: 4 },
  successTitle: { color: palette.ink, fontSize: 20, fontWeight: "800" },
  successText: { color: palette.slate, fontSize: 14, lineHeight: 20, textAlign: "center" },
  doneBtn: {
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 12,
    marginTop: 8,
  },
  doneBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
}));
