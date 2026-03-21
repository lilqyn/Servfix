import { useCallback, useEffect, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { fetchThreads } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { Thread } from "../types";

type Props = {
  onOpenThread: (threadId: string, threadTitle?: string) => void;
  onOpenSignIn: () => void;
};

const formatTime = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getOtherParticipant = (thread: Thread, isSelf: (id: string) => boolean) => {
  return thread.participants?.find((p) => !isSelf(p.id)) ?? thread.participants?.[0] ?? null;
};

export function MessagesScreen({ onOpenThread, onOpenSignIn }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!user) return;
      if (mode === "refresh") setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      try {
        const data = await fetchThreads();
        setThreads(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load messages.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user || !isFocused) {
      if (!user) setThreads([]);
      return;
    }
    void load();
  }, [isFocused, load, user]);

  if (!user) {
    return (
      <View style={styles.centered}>
        <View style={styles.signInCard}>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>Sign in to view your conversations with providers.</Text>
          <Pressable onPress={onOpenSignIn} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  const isSelf = (id: string) => id === user.id || id === "current-user";

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <Text style={styles.subtitle}>Your conversations with buyers and providers.</Text>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load messages</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={styles.list}
        data={threads}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => void load("refresh")}
            refreshing={isRefreshing}
            tintColor={palette.accent}
          />
        }
        renderItem={({ item }) => {
          const other = getOtherParticipant(item, isSelf);
          const title = item.serviceName || other?.name || "Conversation";
          const hasUnread = item.unreadCount > 0;

          return (
            <Pressable
              onPress={() => onOpenThread(item.id, title)}
              style={[styles.threadCard, hasUnread && styles.threadCardUnread]}
            >
              <View style={styles.threadAvatar}>
                {other?.avatar ? (
                  <Image source={{ uri: other.avatar }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>
                      {(other?.name ?? "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                {hasUnread ? (
                  <View style={styles.unreadDot}>
                    <Text style={styles.unreadDotText}>{Math.min(item.unreadCount, 9)}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.threadBody}>
                <View style={styles.threadTop}>
                  <Text numberOfLines={1} style={[styles.threadTitle, hasUnread && styles.threadTitleUnread]}>
                    {title}
                  </Text>
                  <Text style={styles.threadTime}>{formatTime(item.lastMessage?.timestamp ?? item.createdAt)}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.threadPreview, hasUnread && styles.threadPreviewUnread]}>
                  {item.lastMessage?.content ?? "No messages yet"}
                </Text>
                {other?.name && item.serviceName ? (
                  <Text numberOfLines={1} style={styles.threadParticipant}>
                    with {other.name}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyBody}>
              When you message a provider or receive a message, it will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
  page: { flex: 1, backgroundColor: palette.canvas },
  centered: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  header: { gap: 4, paddingHorizontal: 20, paddingTop: 18 },
  title: { color: palette.accentDeep, fontSize: 24, fontWeight: "800", letterSpacing: 0.2 },
  subtitle: { color: palette.slate, fontSize: 14, lineHeight: 20 },
  signInCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 20,
    width: "100%",
  },
  loadingText: { color: palette.slate, fontSize: 14 },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  errorCard: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    margin: 20,
    padding: 14,
  },
  errorTitle: { color: palette.danger, fontSize: 14, fontWeight: "700" },
  errorBody: { color: "#7f1d1d", fontSize: 13 },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  retryButtonText: { color: palette.danger, fontSize: 12, fontWeight: "700" },
  list: { gap: 2, paddingBottom: 140, paddingTop: 12 },
  threadCard: {
    backgroundColor: palette.card,
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  threadCardUnread: { backgroundColor: "#f0fdf4" },
  threadAvatar: { position: "relative" },
  avatarImage: { borderRadius: 26, height: 52, width: 52 },
  avatarFallback: {
    alignItems: "center",
    backgroundColor: palette.accentSoft,
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  avatarFallbackText: { color: palette.accentDeep, fontSize: 20, fontWeight: "800" },
  unreadDot: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 2,
    bottom: -2,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 20,
  },
  unreadDotText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },
  threadBody: { flex: 1, gap: 3, justifyContent: "center" },
  threadTop: { alignItems: "center", flexDirection: "row", gap: 8 },
  threadTitle: { color: palette.ink, flex: 1, fontSize: 15, fontWeight: "700" },
  threadTitleUnread: { fontWeight: "900" },
  threadTime: { color: palette.slate, fontSize: 11 },
  threadPreview: { color: palette.slate, fontSize: 13 },
  threadPreviewUnread: { color: palette.ink, fontWeight: "600" },
  threadParticipant: { color: palette.slate, fontSize: 11 },
  emptyCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    margin: 20,
    padding: 24,
  },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: "700" },
  emptyBody: { color: palette.slate, fontSize: 14, lineHeight: 20, textAlign: "center" },
}));
