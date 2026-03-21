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
import { Ionicons } from "@expo/vector-icons";
import { fetchNotifications, markNotificationsRead } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { AppNotification } from "../types";

type Props = {
  onOpenOrder: (orderId: string, threadId?: string) => void;
  onOpenService: (serviceId: string) => void;
  onOpenChat: (threadId: string) => void;
  onOpenSignIn: () => void;
};

const PAGE_LIMIT = 20;

const getMetaString = (data: Record<string, unknown> | null, key: string): string | null => {
  if (!data) {
    return null;
  }
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
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

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

const getNotificationIcon = (type: string): React.ComponentProps<typeof Ionicons>["name"] => {
  if (type.includes("order") || type.includes("payment") || type.includes("escrow")) return "receipt";
  if (type.includes("message") || type.includes("chat") || type.includes("thread")) return "chatbubble";
  if (type.includes("service")) return "construct";
  if (type.includes("review") || type.includes("rating")) return "star";
  if (type.includes("payout") || type.includes("wallet")) return "wallet";
  if (type.includes("dispute")) return "warning";
  if (type.includes("community") || type.includes("post")) return "people";
  return "notifications";
};

const getNotificationIconColor = (type: string, palette: { accent: string; danger: string; slate: string }): string => {
  if (type.includes("order") || type.includes("payment") || type.includes("escrow")) return "#ea580c";
  if (type.includes("message") || type.includes("chat") || type.includes("thread")) return "#7c3aed";
  if (type.includes("service")) return palette.accent;
  if (type.includes("review") || type.includes("rating")) return "#eab308";
  if (type.includes("payout") || type.includes("wallet")) return "#0891b2";
  if (type.includes("dispute")) return palette.danger;
  if (type.includes("community") || type.includes("post")) return "#0369a1";
  return palette.slate;
};

export function NotificationsScreen({ onOpenOrder, onOpenService, onOpenChat, onOpenSignIn }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
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
  const [isMarkingAll, setIsMarkingAll] = useState(false);
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
    if (unreadCount <= 0 || isMarkingAll) {
      return;
    }

    setIsMarkingAll(true);
    try {
      const response = await markNotificationsRead({ all: true });
      setUnreadCount(response.unreadCount);
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not mark all notifications as read.");
    } finally {
      setIsMarkingAll(false);
    }
  }, [isMarkingAll, unreadCount]);

  const handleOpenNotification = useCallback(
    (notification: AppNotification) => {
      if (!notification.isRead) {
        void markSingleNotification(notification.id);
      }

      const orderId = getMetaString(notification.data, "orderId");
      const serviceId = getMetaString(notification.data, "serviceId");
      const threadId = getMetaString(notification.data, "threadId");

      // Priority: orderId > threadId > serviceId > no action
      if (orderId) {
        onOpenOrder(orderId, threadId ?? undefined);
        return;
      }

      if (threadId) {
        onOpenChat(threadId);
        return;
      }

      if (serviceId) {
        onOpenService(serviceId);
        return;
      }

      // No actionable link
      Alert.alert("Notification", notification.body || notification.title || "No additional details.");
    },
    [markSingleNotification, onOpenOrder, onOpenService, onOpenChat],
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

  // Determine action label and icon for a notification
  const getActionInfo = (notification: AppNotification) => {
    const orderId = getMetaString(notification.data, "orderId");
    const serviceId = getMetaString(notification.data, "serviceId");
    const threadId = getMetaString(notification.data, "threadId");

    if (orderId) return { label: "Open order", icon: "receipt-outline" as const };
    if (threadId) return { label: "Open chat", icon: "chatbubble-outline" as const };
    if (serviceId) return { label: "View service", icon: "construct-outline" as const };
    return null;
  };

  if (!user) {
    return (
      <View style={styles.centeredWrap}>
        <View style={styles.signInCard}>
          <Ionicons name="notifications-outline" size={40} color={palette.accentDeep} style={{ alignSelf: "center" }} />
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
          <View style={styles.unreadSummary}>
            <View style={styles.unreadBadge}>
              <Ionicons name="mail-unread-outline" size={16} color={unreadCount > 0 ? palette.accentDeep : palette.slate} />
              <Text style={[styles.unreadBadgeText, unreadCount > 0 && styles.unreadBadgeTextActive]}>
                {unreadCount} unread
              </Text>
            </View>
          </View>
          <Pressable
            disabled={unreadCount === 0 || isMarkingAll}
            onPress={() => void markAllAsRead()}
            style={[
              styles.markAllButton,
              (unreadCount === 0 || isMarkingAll) && styles.buttonDisabled,
            ]}
          >
            {isMarkingAll ? (
              <ActivityIndicator size={14} color={palette.accentDeep} />
            ) : (
              <Ionicons name="checkmark-done-outline" size={16} color={unreadCount === 0 ? palette.slate : palette.accentDeep} />
            )}
            <Text style={[styles.markAllText, (unreadCount === 0 || isMarkingAll) && styles.buttonTextDisabled]}>
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
          const body = item.body ?? "No additional details.";
          const actionInfo = getActionInfo(item);
          const iconName = getNotificationIcon(item.type);
          const iconColor = getNotificationIconColor(item.type, palette);

          return (
            <Pressable
              onPress={() => handleOpenNotification(item)}
              style={({ pressed }) => [
                styles.itemCard,
                !item.isRead && styles.itemCardUnread,
                item.isRead && styles.itemCardRead,
                pressed && styles.itemCardPressed,
              ]}
            >
              {!item.isRead && <View style={styles.unreadStripe} />}

              <View style={styles.itemRow}>
                <View style={[styles.iconCircle, { backgroundColor: `${iconColor}14` }]}>
                  <Ionicons name={iconName} size={18} color={iconColor} />
                </View>

                <View style={styles.itemBody}>
                  <View style={styles.itemHeader}>
                    <Text
                      numberOfLines={2}
                      style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]}
                    >
                      {item.title || "Notification"}
                    </Text>
                    {!item.isRead ? (
                      <View style={styles.unreadDot} />
                    ) : null}
                  </View>
                  <Text style={[styles.bodyText, item.isRead && styles.bodyTextRead]} numberOfLines={3}>
                    {body}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>
                      {actorName}
                    </Text>
                    <Text style={styles.metaDot}>&middot;</Text>
                    <Text style={styles.metaText}>
                      {formatNotificationDate(item.createdAt)}
                    </Text>
                  </View>

                  <View style={styles.actionRow}>
                    {actionInfo ? (
                      <Pressable onPress={() => handleOpenNotification(item)} style={styles.actionPrimary}>
                        <Ionicons name={actionInfo.icon} size={14} color={palette.canvas} />
                        <Text style={styles.actionPrimaryText}>{actionInfo.label}</Text>
                      </Pressable>
                    ) : null}

                    {!item.isRead ? (
                      <Pressable
                        onPress={() => void markSingleNotification(item.id)}
                        style={styles.actionSecondary}
                      >
                        <Ionicons name="checkmark-outline" size={14} color={palette.ink} />
                        <Text style={styles.actionSecondaryText}>Mark read</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={48} color={palette.slate} />
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
              <Text style={styles.loadingMoreText}>Loading more...</Text>
            </View>
          ) : nextCursor ? (
            <Pressable onPress={() => void loadMore()} style={styles.loadMoreButton}>
              <Text style={styles.loadMoreText}>Load more</Text>
              <Ionicons name="chevron-down-outline" size={16} color={palette.accentDeep} />
            </Pressable>
          ) : notifications.length > PAGE_LIMIT ? (
            <View style={styles.endOfList}>
              <Text style={styles.endOfListText}>You're all caught up</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const useStyles = createThemedStyles((palette) => ({
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
    color: palette.canvas,
    fontSize: 13,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonTextDisabled: {
    color: palette.slate,
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
  unreadSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unreadBadge: {
    alignItems: "center",
    backgroundColor: palette.accentSoft,
    borderRadius: 20,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unreadBadgeText: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "700",
  },
  unreadBadgeTextActive: {
    color: palette.accentDeep,
  },
  markAllButton: {
    alignItems: "center",
    backgroundColor: palette.inputBg,
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  markAllText: {
    color: palette.accentDeep,
    fontSize: 12,
    fontWeight: "800",
  },
  errorCard: {
    backgroundColor: palette.dangerSoft,
    borderColor: palette.dangerLine,
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
    color: palette.dangerInk,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.card,
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
    gap: 10,
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
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  itemCardUnread: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  itemCardRead: {
    opacity: 0.85,
  },
  itemCardPressed: {
    opacity: 0.7,
  },
  unreadStripe: {
    backgroundColor: palette.accentDeep,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
    width: 4,
  },
  itemRow: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    paddingLeft: 16,
  },
  iconCircle: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginTop: 2,
    width: 40,
  },
  itemBody: {
    flex: 1,
    gap: 6,
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
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  itemTitleUnread: {
    color: palette.ink,
    fontWeight: "800",
  },
  unreadDot: {
    backgroundColor: palette.accentDeep,
    borderRadius: 5,
    height: 10,
    marginTop: 5,
    width: 10,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  metaText: {
    color: palette.slate,
    fontSize: 12,
    lineHeight: 17,
  },
  metaDot: {
    color: palette.slate,
    fontSize: 12,
  },
  bodyText: {
    color: palette.ink,
    fontSize: 13,
    lineHeight: 19,
  },
  bodyTextRead: {
    color: palette.slate,
  },
  actionRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  actionPrimary: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 10,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionPrimaryText: {
    color: palette.canvas,
    fontSize: 12,
    fontWeight: "700",
  },
  actionSecondary: {
    alignItems: "center",
    backgroundColor: palette.inputBg,
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    gap: 10,
    padding: 32,
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
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 14,
  },
  loadingMoreText: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "600",
  },
  loadMoreButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: palette.accentSoft,
    borderRadius: 12,
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  loadMoreText: {
    color: palette.accentDeep,
    fontSize: 13,
    fontWeight: "700",
  },
  endOfList: {
    alignItems: "center",
    paddingVertical: 14,
  },
  endOfListText: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "600",
  },
}));
