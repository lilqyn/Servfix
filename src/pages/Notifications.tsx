import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  countUnreadNotifications,
  filterNotificationsForRole,
  getNotificationDestination,
  shouldUseServerUnreadCount,
} from "@/lib/notifications";
import NotificationItem from "@/components/notifications/NotificationItem";

const Notifications = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    markAllRead,
    markRead,
  } = useNotifications();

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

  const emptyState = useMemo(() => {
    if (isLoading) {
      return null;
    }
    if (filteredNotifications.length > 0) {
      return null;
    }
    return (
      <div className="text-center py-16 text-muted-foreground">
        You are all caught up. No new notifications yet.
      </div>
    );
  }, [filteredNotifications.length, isLoading]);

  const handleNotificationClick = async (notificationId: string) => {
    const notification = filteredNotifications.find((item) => item.id === notificationId);
    if (!notification) {
      return;
    }
    if (!notification.isRead) {
      await markRead([notification.id]);
    }
    const destination = getNotificationDestination(notification, user?.role);
    navigate(destination.href, { state: destination.state });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              Notifications
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Stay updated on messages, orders, reviews, and community activity.
            </p>
          </div>
          {displayUnreadCount > 0 && (
            <Button variant="outline" onClick={() => void markAllRead()}>
              Mark all as read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-3 text-sm">Loading notifications...</span>
          </div>
        ) : (
          <>
            {filteredNotifications.length > 0 && (
              <div className="space-y-3">
                {filteredNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onClick={() => void handleNotificationClick(notification.id)}
                  />
                ))}
              </div>
            )}
            {emptyState}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => void loadMore()}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-2">Loading more...</span>
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Notifications;
