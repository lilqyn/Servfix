import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchPage, type StaticPageContent } from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";

type AcademyPost = NonNullable<StaticPageContent["posts"]>[number];

interface AcademyScreenProps {
  onBack: () => void;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncate(text: string, lines: number): string {
  const avgCharsPerLine = 70;
  const max = avgCharsPerLine * lines;
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

function openYouTube(url: string) {
  Linking.openURL(url).catch(() => {});
}

function FeaturedCard({ post }: { post: AcademyPost }) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <View style={styles.featuredCard}>
      {post.imageSignedUrl || post.image ? (
        <Image
          source={{ uri: post.imageSignedUrl ?? post.image }}
          style={styles.featuredImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.featuredImagePlaceholder}>
          <Ionicons name="school-outline" size={48} color={palette.line} />
        </View>
      )}
      <View style={styles.featuredContent}>
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>Featured</Text>
        </View>
        <Text style={styles.featuredTitle} numberOfLines={2}>
          {post.title}
        </Text>
        <Text style={styles.featuredBody} numberOfLines={3}>
          {post.body}
        </Text>
        <View style={styles.featuredFooter}>
          {post.publishedAt ? (
            <Text style={styles.dateText}>{formatDate(post.publishedAt)}</Text>
          ) : <View />}
          {post.videoUrl ? (
            <TouchableOpacity
              style={styles.youtubeBtn}
              onPress={() => openYouTube(post.videoUrl!)}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-youtube" size={18} color="#fff" />
              <Text style={styles.youtubeBtnText}>Watch on YouTube</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function PostCard({ post }: { post: AcademyPost }) {
  const styles = useStyles();
  return (
    <View style={styles.postCard}>
      <View style={styles.postTextArea}>
        <Text style={styles.postTitle} numberOfLines={2}>
          {post.title}
        </Text>
        <Text style={styles.postBody} numberOfLines={3}>
          {truncate(post.body, 3)}
        </Text>
        <View style={styles.postFooter}>
          {post.publishedAt ? (
            <Text style={styles.dateText}>{formatDate(post.publishedAt)}</Text>
          ) : <View />}
          {post.videoUrl ? (
            <TouchableOpacity
              style={styles.youtubeBtnSmall}
              onPress={() => openYouTube(post.videoUrl!)}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-youtube" size={14} color="#fff" />
              <Text style={styles.youtubeBtnSmallText}>YouTube</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {(post.imageSignedUrl || post.image) ? (
        <Image
          source={{ uri: post.imageSignedUrl ?? post.image }}
          style={styles.postThumbnail}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

export default function AcademyScreen({ onBack }: AcademyScreenProps) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [page, setPage] = useState<StaticPageContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await fetchPage("academy");
      setPage(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load academy");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const posts = page?.posts ?? [];
  const featured = posts.length > 0 ? posts[0] : null;
  const remaining = posts.length > 1 ? posts.slice(1) : [];

  const renderHeader = () => (
    <View>
      {page?.intro ? (
        <Text style={styles.introText}>{page.intro}</Text>
      ) : null}
      {featured ? (
        <>
          <FeaturedCard post={featured} />
          {remaining.length > 0 ? (
            <Text style={styles.sectionLabel}>More lessons</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.loadingText}>Loading academy...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={56} color={palette.line} />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (posts.length === 0) {
      return (
        <View style={styles.center}>
          <Ionicons name="school-outline" size={56} color={palette.line} />
          <Text style={styles.emptyTitle}>No lessons yet</Text>
          <Text style={styles.emptyBody}>
            Check back soon for tutorials and learning materials.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={remaining}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={palette.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Academy</Text>
        <View style={styles.backBtn} />
      </View>
      {renderContent()}
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
    paddingBottom: 14,
    backgroundColor: palette.card,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: palette.ink,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  introText: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.slate,
    marginTop: 20,
    marginBottom: 16,
  },
  // Featured card
  featuredCard: {
    backgroundColor: palette.card,
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  featuredImage: {
    width: "100%",
    height: 200,
  },
  featuredImagePlaceholder: {
    width: "100%",
    height: 200,
    backgroundColor: palette.mist,
    alignItems: "center",
    justifyContent: "center",
  },
  featuredContent: {
    padding: 18,
  },
  featuredBadge: {
    alignSelf: "flex-start",
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 10,
  },
  featuredBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  featuredTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: palette.ink,
    lineHeight: 26,
    marginBottom: 8,
  },
  featuredBody: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.slate,
    marginBottom: 10,
  },
  featuredFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: {
    fontSize: 12,
    color: palette.slate,
    opacity: 0.7,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.ink,
    marginBottom: 12,
  },
  // YouTube buttons
  youtubeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dc2626",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  youtubeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  youtubeBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dc2626",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  youtubeBtnSmallText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  // Post card
  postCard: {
    flexDirection: "row",
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  postTextArea: {
    flex: 1,
    marginRight: 12,
  },
  postTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.ink,
    lineHeight: 20,
    marginBottom: 6,
  },
  postBody: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.slate,
    marginBottom: 8,
  },
  postFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  postThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  // States
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 14,
    color: palette.slate,
    marginTop: 12,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: palette.ink,
    marginTop: 16,
    marginBottom: 6,
  },
  errorBody: {
    fontSize: 14,
    color: palette.slate,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: palette.accent,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: palette.ink,
    marginTop: 16,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 14,
    color: palette.slate,
    textAlign: "center",
    lineHeight: 20,
  },
}));
