import { createContext } from "react";
import type { ApiNotification } from "@/lib/api";

export type NotificationsContextType = {
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

export const NotificationsContext = createContext<NotificationsContextType | undefined>(
  undefined,
);
