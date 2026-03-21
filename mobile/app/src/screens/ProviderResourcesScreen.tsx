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
import { useTheme } from "../providers/ThemeProvider";
import { createThemedStyles } from "../theme";
import { fetchPage, StaticPageContent } from "../lib/api";

type Props = {
  onBack: () => void;
  onOpenDashboard: () => void;
};

export default function ProviderResourcesScreen({
  onBack,
  onOpenDashboard,
}: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [content, setContent] = useState<StaticPageContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchPage("providerResources");
      setContent(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load resources");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

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
          Provider Resources
        </Text>
        <View style={styles.backButton} />
      </View>

      {/* Loading */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.loadingText}>Loading resources...</Text>
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
          {/* Intro card */}
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Ionicons name="rocket" size={28} color={palette.accent} />
              <Text style={styles.pageTitle}>Provider Resources</Text>
            </View>
            {content?.intro ? (
              <Text style={styles.introText}>{content.intro}</Text>
            ) : (
              <Text style={styles.introText}>
                Everything you need to get started and succeed as a SERVFIX
                provider.
              </Text>
            )}
          </View>

          {/* Launch Checklist */}
          {content?.checklist && content.checklist.length > 0 ? (
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons
                  name="checkbox-outline"
                  size={22}
                  color={palette.accent}
                />
                <Text style={styles.sectionHeading}>Launch Checklist</Text>
              </View>
              <Text style={styles.sectionSubtext}>
                Complete these steps to get your services live.
              </Text>
              {content.checklist.map((item, index) => (
                <View key={index} style={styles.checklistRow}>
                  <View style={styles.checkboxContainer}>
                    <Ionicons
                      name="square-outline"
                      size={22}
                      color={palette.accent}
                    />
                  </View>
                  <Text style={styles.checklistText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Resource Sections */}
          {content?.sections?.map((section, sectionIndex) => (
            <View key={sectionIndex} style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons
                  name="book-outline"
                  size={20}
                  color={palette.accent}
                />
                <Text style={styles.sectionHeading}>{section.heading}</Text>
              </View>
              {section.body ? (
                <Text style={styles.bodyText}>{section.body}</Text>
              ) : null}
              {section.items?.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.bulletRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={palette.accent}
                    style={styles.bulletIcon}
                  />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          ))}

          {/* Body text (fallback) */}
          {content?.body ? (
            <View style={styles.card}>
              <Text style={styles.bodyText}>{content.body}</Text>
            </View>
          ) : null}

          {/* Open Dashboard button */}
          <TouchableOpacity
            style={styles.dashboardButton}
            onPress={onOpenDashboard}
            activeOpacity={0.8}
          >
            <Ionicons name="grid-outline" size={20} color="#ffffff" />
            <Text style={styles.dashboardButtonText}>Open Dashboard</Text>
          </TouchableOpacity>

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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.ink,
    flex: 1,
  },
  sectionSubtext: {
    fontSize: 13,
    color: palette.slate,
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 14,
    color: palette.ink,
    lineHeight: 22,
    marginBottom: 8,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.mist,
  },
  checkboxContainer: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  checklistText: {
    flex: 1,
    fontSize: 14,
    color: palette.ink,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 4,
    marginTop: 6,
  },
  bulletIcon: {
    marginTop: 2,
    marginRight: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: palette.ink,
    lineHeight: 22,
  },
  dashboardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  dashboardButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  bottomSpacer: {
    height: 32,
  },
}));
