import { useCallback, useEffect, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { fetchNotifications, markNotificationsRead } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { palette } from "../theme";
import type { AppNotification } from "../types";

type Props = {
  onOpenOrder: (orderId: string, threadId?: string) => void;
  onOpenSignIn: () => void;
};

const PAGE_LIMIT = 20;

const getMetaString = (data: Record<string, unknown> | null, key: string): string | null => {
  const value = data[key];
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value;
};

const formatNotificationDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }
  return date.toLocaleString("en-US", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const dedupeAndSortNotifications = (current: AppNotification[], incoming: AppNotification[]) => {
  const seen = new Map<string, AppNotification>();
  current.forEach((item) => {
    seen.set(item.id, item);
  });
  incoming.forEach((item) => {
    seen.set(item.id, item);
  });

  return Array.from(seen.values()).sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
};

export function NotificationsScreen({ onOpenOrder, onOpenSignIn }: Props) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const isFocused = useIsFocused();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(
    async (mode: "initial" | "refresh" | "more" = "initial", cursor?: string) => {
      if (mode === "more" && !cursor) {
        return;
      }

      setError(null);

      if (mode === "initial") {
        setIsLoading(true);
      } else if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await fetchNotifications({
          limit: PAGE_LIMIT,
          cursor,
        });
        setUnreadCount(response.unreadCount);
        setNextCursor(response.nextCursor);

        if (mode === "more") {
          setNotifications((previous) => dedupeAndSortNotifications(previous, response.notifications));
        } else {
          setNotifications(response.notifications);
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Could not load notifications.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || isLoadingMore || isLoading || isRefreshing) {
      return;
    }
    void loadNotifications("more", nextCursor);
  }, [isLoading, isLoadingMore, isRefreshing, loadNotifications, nextCursor]);

  const handleRefresh = useCallback(() => {
    void loadNotifications("refresh");
  }, [loadNotifications]);

  const markSingleNotification = useCallback(async (notificationId: string) => {
    try {
      const response = await markNotificationsRead({ ids: [notificationId] });
      setUnreadCount(response.unreadCount);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item)),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not mark the notification as read.");
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (unreadCount <= 0) {
      return;
    }

    try {
      const response = await markNotificationsRead({ all: true });
      setUnreadCount(response.unreadCount);
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not mark all notifications as read.");
    }
  }, [unreadCount]);

  const handleOpenNotification = useCallback(
    (notification: AppNotification) => {
      if (!notification.isRead) {
        void markSingleNotification(notification.id);
      }

      const orderId = getMetaString(notification.data, "orderId");
      const threadId = getMetaString(notification.data, "threadId");
      if (orderId) {
        onOpenOrder(orderId, threadId ?? undefined);
        return;
      }

      if (threadId) {
        Alert.alert("No order link", "This update is linked to a message thread but no order was provided.");
        return;
      }

      Alert.alert("No action", "This notification does not include a direct action.");
    },
    [markSingleNotification, onOpenOrder],
  );

  useEffect(() => {
    if (!user || !isFocused) {
      if (!user) {
        setNotifications([]);
        setUnreadCount(0);
        setNextCursor(null);
      }
      return;
    }

    void loadNotifications("initial");
  }, [isFocused, loadNotifications, user]);

  if (!user) {
    return (
      <View style={styles.centeredWrap}>
        <View style={styles.signInCard}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>
            Sign in to view order and message alerts, and to mark updates as read.
          </Text>
          <Pressable onPress={onOpenSignIn} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoading && notifications.length === 0) {
    return (
      <View style={styles.centeredWrap}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <Text style={[styles.title, isCompact && styles.titleCompact]}>Notifications</Text>
        <Text style={styles.subtitle}>Keep track of bookings, messaging, and payment updates.</Text>

        <View style={styles.toolbar}>
          <View>
            <Text style={styles.subtone}>Unread</Text>
            <Text style={styles.countText}>{unreadCount}</Text>
          </View>
          <Pressable
            disabled={unreadCount === 0}
            onPress={() => void markAllAsRead()}
            style={[
              styles.primaryButton,
              styles.ghostButton,
              unreadCount === 0 && styles.buttonDisabled,
            ]}
          >
            <Text style={[styles.ghostButtonText, unreadCount === 0 && styles.buttonTextDisabled]}>
              Mark all read
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load notifications</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable onPress={() => void loadNotifications("refresh")} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={[styles.listContent, isCompact && styles.listContentCompact]}
        data={notifications}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            tintColor={palette.accent}
          />
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.3}
        renderItem={({ item }) => {
          const actorName = item.actor?.name || "System";
          const orderId = getMetaString(item.data, "orderId");
          const threadId = getMetaString(item.data, "threadId");
          const body = item.body ?? "No additional details.";
          const primaryActionLabel = threadId ? "Open messages" : "Open order";

          return (
            <View style={[styles.itemCard, !item.isRead && styles.itemCardUnread]}>
              <View style={styles.itemHeader}>
                <Text
                  numberOfLines={2}
                  style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]}
                >
                  {item.title || "Notification"}
                </Text>
                {!item.isRead ? <View style={styles.unreadPill}><Text style={styles.unreadPillText}>New</Text></View> : null}
              </View>
              <Text style={styles.metaText}>
                From {actorName} | {formatNotificationDate(item.createdAt)}
              </Text>
              <Text style={styles.bodyText} numberOfLines={6}>
                {body}
              </Text>

              <View style={styles.actionRow}>
                {orderId || threadId ? (
                  <Pressable onPress={() => handleOpenNotification(item)} style={styles.actionPrimary}>
                    <Text style={styles.actionPrimaryText}>{primaryActionLabel}</Text>
                  </Pressable>
                ) : null}

                {!item.isRead ? (
                  <Pressable
                    onPress={() => void markSingleNotification(item.id)}
                    style={styles.actionSecondary}
                  >
                    <Text style={styles.actionSecondaryText}>Mark read</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>
              New activity from bookings and messaging will appear here once available.
            </Text>
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMoreWrap}>
              <ActivityIndicator size="small" color={palette.accent} />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = {
  page: {
    backgroundColor: palette.canvas,
    flex: 1,
  },
  centeredWrap: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  signInCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 20,
    width: "100%",
  },
  title: {
    color: palette.accentDeep,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  titleCompact: {
    fontSize: 22,
    lineHeight: 30,
  },
  subtitle: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonTextDisabled: {
    color: "#9ca3af",
  },
  loadingText: {
    color: palette.slate,
    fontSize: 14,
  },
  header: {
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  headerCompact: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  subtone: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
  },
  countText: {
    color: palette.ink,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  ghostButton: {
    backgroundColor: "#f8fafc",
    borderColor: palette.line,
    borderWidth: 1,
  },
  ghostButtonText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  errorCard: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    padding: 16,
  },
  errorTitle: {
    color: palette.danger,
    fontSize: 15,
    fontWeight: "700",
  },
  errorBody: {
    color: "#7f1d1d",
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    gap: 12,
    padding: 20,
    paddingBottom: 140,
  },
  listContentCompact: {
    padding: 16,
    paddingBottom: 132,
  },
  itemCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  itemCardUnread: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
  itemHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  itemTitle: {
    color: palette.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  itemTitleUnread: {
    color: palette.ink,
    fontWeight: "800",
  },
  unreadPill: {
    alignSelf: "flex-start",
    backgroundColor: palette.accentDeep,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unreadPillText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  metaText: {
    color: palette.slate,
    fontSize: 12,
    lineHeight: 17,
  },
  bodyText: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionPrimary: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionPrimaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  actionSecondary: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionSecondaryText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 24,
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyBody: {
    color: palette.slate,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  loadingMoreWrap: {
    paddingVertical: 14,
    alignItems: "center",
  },
} as const;


