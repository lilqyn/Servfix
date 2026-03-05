import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { toast } from "sonner";
import {
  API_BASE_URL,
  fetchNotifications,
  markNotificationsRead,
  type ApiNotification,
} from "@/lib/api";
import { useAuth } from "@/contexts/useAuth";
import { NotificationsContext } from "@/contexts/notifications-context";
import {
  canAccessNotification,
  countUnreadNotifications,
  filterNotificationsForRole,
  shouldUseServerUnreadCount,
} from "@/lib/notifications";

const PAGE_SIZE = 20;

const buildWebSocketUrl = (baseUrl: string) => {
  const trimmed = baseUrl.replace(/\/$/, "");
  const wsBase = trimmed.replace(/^http/i, "ws");
  return `${wsBase}/ws`;
};

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isHydrated, user } = useAuth();
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(false);

  const resetState = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
    setNextCursor(null);
    setIsLoading(false);
    setIsLoadingMore(false);
    setHasLoaded(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchNotifications({ limit: PAGE_SIZE });
      const filtered = filterNotificationsForRole(response.notifications, user?.role);
      setNotifications(filtered);
      if (shouldUseServerUnreadCount(user?.role)) {
        setUnreadCount(response.unreadCount);
      } else {
        setUnreadCount(countUnreadNotifications(filtered));
      }
      setNextCursor(response.nextCursor ?? null);
      setHasLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load notifications.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.role]);

  const loadMore = useCallback(async () => {
    if (!isAuthenticated || isLoadingMore || !nextCursor) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const response = await fetchNotifications({ limit: PAGE_SIZE, cursor: nextCursor });
      const filtered = filterNotificationsForRole(response.notifications, user?.role);
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const merged = filtered.filter((item) => !existingIds.has(item.id));
        return [...prev, ...merged];
      });
      if (shouldUseServerUnreadCount(user?.role)) {
        setUnreadCount(response.unreadCount);
      } else {
        setUnreadCount((prev) => prev + countUnreadNotifications(filtered));
      }
      setNextCursor(response.nextCursor ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load more notifications.";
      toast.error(message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isAuthenticated, isLoadingMore, nextCursor, user?.role]);

  const markAllRead = useCallback(async () => {
    if (!isAuthenticated || notifications.length === 0) {
      return;
    }

    try {
      const response = await markNotificationsRead({ all: true });
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(response.unreadCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark notifications as read.";
      toast.error(message);
    }
  }, [isAuthenticated, notifications.length]);

  const markRead = useCallback(async (ids: string[]) => {
    if (!isAuthenticated || ids.length === 0) {
      return;
    }

    try {
      const response = await markNotificationsRead({ ids });
      setNotifications((prev) =>
        prev.map((item) => (ids.includes(item.id) ? { ...item, isRead: true } : item)),
      );
      setUnreadCount(response.unreadCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark notification as read.";
      toast.error(message);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!isAuthenticated) {
      resetState();
      return;
    }

    if (!hasLoaded) {
      void refresh();
    }
  }, [isAuthenticated, isHydrated, hasLoaded, resetState, refresh]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!isAuthenticated) {
      shouldReconnectRef.current = false;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    shouldReconnectRef.current = true;

    const scheduleReconnect = () => {
      if (!shouldReconnectRef.current) {
        return;
      }
      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      const delay = Math.min(30_000, 1000 * 2 ** attempt);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = () => {
      if (!shouldReconnectRef.current) {
        return;
      }
      const wsUrl = buildWebSocketUrl(API_BASE_URL);
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type?: string;
            notification?: ApiNotification;
          };

          if (payload?.type === "notification" && payload.notification) {
            const notification = payload.notification;
            if (!canAccessNotification(payload.notification, user?.role)) {
              return;
            }
            setNotifications((prev) => {
              const existingIndex = prev.findIndex((item) => item.id === notification.id);
              if (existingIndex >= 0) {
                const existing = prev[existingIndex];
                if (!existing) {
                  return prev;
                }
                const updated = [...prev];
                updated[existingIndex] = notification;
                if (existing.isRead && !notification.isRead) {
                  setUnreadCount((count) => count + 1);
                } else if (!existing.isRead && notification.isRead) {
                  setUnreadCount((count) => Math.max(0, count - 1));
                }
                return updated;
              }
              if (!notification.isRead) {
                setUnreadCount((count) => count + 1);
              }
              return [notification, ...prev];
            });
          }
        } catch {
          // ignore malformed messages
        }
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        if (!shouldReconnectRef.current) {
          return;
        }
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isAuthenticated, isHydrated, user?.role]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      isLoadingMore,
      hasMore: Boolean(nextCursor),
      refresh,
      loadMore,
      markAllRead,
      markRead,
    }),
    [
      notifications,
      unreadCount,
      isLoading,
      isLoadingMore,
      nextCursor,
      refresh,
      loadMore,
      markAllRead,
      markRead,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};
