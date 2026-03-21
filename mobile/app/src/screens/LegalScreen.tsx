import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import { fetchPage, StaticPageContent } from "../lib/api";

type LegalSlug = "privacy" | "terms" | "cookies" | "providerAddendum" | "about";

type Props = {
  slug: LegalSlug;
  onBack: () => void;
};

const TITLE_MAP: Record<LegalSlug, string> = {
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  cookies: "Cookies Policy",
  providerAddendum: "Provider Addendum",
  about: "About SERVFIX",
};

function renderBody(body: string, styles: ReturnType<typeof useStyles>) {
  const paragraphs = body.split("\n\n");
  return paragraphs.map((paragraph, index) => {
    const trimmed = paragraph.trim();
    if (!trimmed) return null;

    const isBold =
      /^\d+[\.\)]/.test(trimmed) ||
      (trimmed.startsWith("**") && trimmed.endsWith("**"));

    const displayText = trimmed.replace(/^\*\*/, "").replace(/\*\*$/, "");

    return (
      <Text
        key={index}
        style={[styles.bodyText, isBold && styles.bodyTextBold]}
      >
        {displayText}
      </Text>
    );
  });
}

export default function LegalScreen({ slug, onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [content, setContent] = useState<StaticPageContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchPage(slug);
      setContent(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load page");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const title = TITLE_MAP[slug] || slug;

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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.backButton} />
      </View>

      {/* Loading */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={palette.danger}
          />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.accent}
              colors={[palette.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Page title card */}
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Ionicons
                name={
                  slug === "about"
                    ? "information-circle"
                    : slug === "privacy"
                    ? "shield-checkmark"
                    : slug === "cookies"
                    ? "ellipse"
                    : "document-text"
                }
                size={28}
                color={palette.accent}
              />
              <Text style={styles.pageTitle}>{title}</Text>
            </View>

            {/* Intro text */}
            {content?.intro ? (
              <Text style={styles.introText}>{content.intro}</Text>
            ) : null}
          </View>

          {/* Body */}
          {content?.body ? (
            <View style={styles.card}>{renderBody(content.body, styles)}</View>
          ) : null}

          {/* Sections */}
          {content?.sections?.map((section, sectionIndex) => (
            <View key={sectionIndex} style={styles.card}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              {section.body ? (
                <Text style={styles.bodyText}>{section.body}</Text>
              ) : null}
              {section.items?.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.bulletRow}>
                  <Ionicons
                    name="ellipse"
                    size={6}
                    color={palette.accent}
                    style={styles.bulletIcon}
                  />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  container: {
    flex: 1,
    backgroundColor: palette.canvas,
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: palette.slate,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: palette.danger,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: palette.accent,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: palette.ink,
    flex: 1,
  },
  introText: {
    fontSize: 14,
    color: palette.slate,
    lineHeight: 20,
    marginTop: 8,
  },
  bodyText: {
    fontSize: 14,
    color: palette.ink,
    lineHeight: 22,
    marginBottom: 10,
  },
  bodyTextBold: {
    fontWeight: "700",
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.ink,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 4,
    marginTop: 6,
  },
  bulletIcon: {
    marginTop: 7,
    marginRight: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: palette.ink,
    lineHeight: 22,
  },
  bottomSpacer: {
    height: 32,
  },
}));
