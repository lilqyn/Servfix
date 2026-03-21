import { useState } from "react";
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
import { submitServiceReview } from "../lib/api";
import { createThemedStyles } from "../theme";

type Props = {
  serviceId: string;
  serviceTitle: string;
  orderId: string;
  onDone: () => void;
  onBack: () => void;
};

const StarPicker = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) => (
  <View style={starStyles.row}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Pressable key={star} onPress={() => onChange(star)} style={starStyles.starButton}>
        <Text style={[starStyles.star, star <= value && starStyles.starFilled]}>★</Text>
      </Pressable>
    ))}
  </View>
);

const starStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  starButton: { padding: 4 },
  star: { color: "#d1d5db", fontSize: 36 },
  starFilled: { color: "#f59e0b" },
});

const RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Great",
  5: "Excellent",
};

export function ReviewScreen({ serviceId, serviceTitle, orderId, onDone, onBack }: Props) {
  const styles = useStyles();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = rating > 0 && comment.trim().length >= 20;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);
    try {
      await submitServiceReview(serviceId, { rating, comment: comment.trim() });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit review. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.centered}>
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>★</Text>
          <Text style={styles.successTitle}>Review submitted!</Text>
          <Text style={styles.successBody}>
            Thank you for reviewing {serviceTitle}. Your feedback helps other buyers find trusted professionals.
          </Text>
          <Pressable onPress={onDone} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
          <Text style={styles.title}>Rate your experience</Text>
          <Text style={styles.serviceTitle}>{serviceTitle}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your rating</Text>
          <StarPicker value={rating} onChange={setRating} />
          {rating > 0 ? (
            <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>
          ) : (
            <Text style={styles.ratingHint}>Tap to rate</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your review</Text>
          <TextInput
            editable={!isLoading}
            maxLength={2000}
            multiline
            onChangeText={(t) => {
              setComment(t);
              setError(null);
            }}
            placeholder="Share your experience in detail. What went well? What could be better? (min 20 characters)"
            placeholderTextColor="#94a3b8"
            style={styles.textarea}
            value={comment}
          />
          <Text style={[styles.charCount, comment.trim().length < 20 && styles.charCountWarn]}>
            {comment.trim().length} / 2000 {comment.trim().length < 20 ? `(${20 - comment.trim().length} more to go)` : ""}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          disabled={!canSubmit || isLoading}
          onPress={() => void handleSubmit()}
          style={[styles.primaryButton, (!canSubmit || isLoading) && styles.buttonDisabled]}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Submit review</Text>
          )}
        </Pressable>

        {!canSubmit && rating === 0 ? (
          <Text style={styles.hintText}>Select a star rating to continue.</Text>
        ) : !canSubmit ? (
          <Text style={styles.hintText}>Write at least 20 characters to submit.</Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  root: { backgroundColor: palette.canvas, flex: 1 },
  centered: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  content: { gap: 20, padding: 24, paddingBottom: 60 },
  backButton: { alignSelf: "flex-start" },
  backButtonText: { color: palette.accentDeep, fontSize: 15, fontWeight: "700" },
  hero: { gap: 6 },
  title: { color: palette.ink, fontSize: 26, fontWeight: "900" },
  serviceTitle: { color: palette.slate, fontSize: 15, fontWeight: "600" },
  section: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  sectionLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  ratingLabel: { color: "#f59e0b", fontSize: 16, fontWeight: "800" },
  ratingHint: { color: palette.slate, fontSize: 14 },
  textarea: {
    backgroundColor: "#f8fafc",
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 14,
    lineHeight: 21,
    minHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  charCount: { color: palette.slate, fontSize: 11, textAlign: "right" },
  charCountWarn: { color: "#f59e0b" },
  errorCard: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 52,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  buttonDisabled: { opacity: 0.45 },
  hintText: { color: palette.slate, fontSize: 13, textAlign: "center" },
  successCard: {
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 28,
    width: "100%",
  },
  successIcon: { color: "#f59e0b", fontSize: 48 },
  successTitle: { color: palette.accentDeep, fontSize: 22, fontWeight: "900" },
  successBody: { color: "#166534", fontSize: 14, lineHeight: 21, textAlign: "center" },
}));
