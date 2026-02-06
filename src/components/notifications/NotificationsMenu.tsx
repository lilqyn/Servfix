import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  countUnreadNotifications,
  filterNotificationsForRole,
  getNotificationDestination,
  shouldUseServerUnreadCount,
} from "@/lib/notifications";
import NotificationItem from "@/components/notifications/NotificationItem";

const NotificationsMenu = () => {
  const [open, setOpen] = useState(false);
  const [hasFetchedOnOpen, setHasFetchedOnOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    isLoading,
    refresh,
    markAllRead,
    markRead,
  } = useNotifications();

  useEffect(() => {
    if (!open) {
      setHasFetchedOnOpen(false);
      return;
    }

    if (!hasFetchedOnOpen && notifications.length === 0 && !isLoading) {
      setHasFetchedOnOpen(true);
      void refresh();
    }
  }, [open, hasFetchedOnOpen, notifications.length, isLoading, refresh]);

  const filteredNotifications = useMemo(
    () => filterNotificationsForRole(notifications, user?.role),
    [notifications, user?.role],
  );

  const displayUnreadCount = useMemo(() => {
    if (shouldUseServerUnreadCount(user?.role)) {
      return unreadCount;
    }
    return countUnreadNotifications(filteredNotifications);
  }, [filteredNotifications, unreadCount, user?.role]);

  const visibleNotifications = useMemo(
    () => filteredNotifications.slice(0, 6),
    [filteredNotifications],
  );

  const handleNavigate = async (notificationId: string) => {
    const notification = filteredNotifications.find((item) => item.id === notificationId);
    if (!notification) {
      return;
    }
    if (!notification.isRead) {
      await markRead([notification.id]);
    }
    const destination = getNotificationDestination(notification, user?.role);
    setOpen(false);
    navigate(destination.href, { state: destination.state });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {displayUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-semibold">
              {displayUnreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <DropdownMenuLabel className="p-0 text-sm font-semibold text-foreground">
            Notifications
          </DropdownMenuLabel>
          {displayUnreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                void markAllRead();
              }}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="ml-2 text-sm">Loading notifications...</span>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            You are all caught up.
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            <div className="flex flex-col gap-2 px-3 py-3">
              {visibleNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  compact
                  onClick={() => void handleNavigate(notification.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
        <DropdownMenuSeparator />
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}
          >
            View all notifications
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationsMenu;
