import React, {
  createContext,
  useContext,
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
import { useAuth } from "@/contexts/AuthContext";

type NotificationsContextType = {
  notifications: ApiNotification[];
  unreadCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const PAGE_SIZE = 20;

const buildWebSocketUrl = (baseUrl: string, token: string) => {
  const trimmed = baseUrl.replace(/\/$/, "");
  const wsBase = trimmed.replace(/^http/i, "ws");
  return `${wsBase}/ws?token=${encodeURIComponent(token)}`;
};

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isHydrated, token } = useAuth();
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

  const resetState = () => {
    setNotifications([]);
    setUnreadCount(0);
    setNextCursor(null);
    setIsLoading(false);
    setIsLoadingMore(false);
    setHasLoaded(false);
  };

  const refresh = async () => {
    if (!isAuthenticated) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchNotifications({ limit: PAGE_SIZE });
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
      setNextCursor(response.nextCursor ?? null);
      setHasLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load notifications.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = async () => {
    if (!isAuthenticated || isLoadingMore || !nextCursor) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const response = await fetchNotifications({ limit: PAGE_SIZE, cursor: nextCursor });
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const merged = response.notifications.filter((item) => !existingIds.has(item.id));
        return [...prev, ...merged];
      });
      setUnreadCount(response.unreadCount);
      setNextCursor(response.nextCursor ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load more notifications.";
      toast.error(message);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const markAllRead = async () => {
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
  };

  const markRead = async (ids: string[]) => {
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
  };

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
  }, [isAuthenticated, isHydrated, hasLoaded]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!isAuthenticated || !token) {
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
      const wsUrl = buildWebSocketUrl(API_BASE_URL, token);
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
            setNotifications((prev) => {
              const existingIndex = prev.findIndex((item) => item.id === payload.notification!.id);
              if (existingIndex >= 0) {
                const existing = prev[existingIndex];
                const updated = [...prev];
                updated[existingIndex] = payload.notification!;
                if (existing.isRead && !payload.notification!.isRead) {
                  setUnreadCount((count) => count + 1);
                } else if (!existing.isRead && payload.notification!.isRead) {
                  setUnreadCount((count) => Math.max(0, count - 1));
                }
                return updated;
              }
              if (!payload.notification!.isRead) {
                setUnreadCount((count) => count + 1);
              }
              return [payload.notification!, ...prev];
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
  }, [isAuthenticated, isHydrated, token]);

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
    [notifications, unreadCount, isLoading, isLoadingMore, nextCursor],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
};
