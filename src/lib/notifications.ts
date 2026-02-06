import type { ApiNotification } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";
import type { UserRole } from "@/lib/roles";

export type NotificationDestination = {
  href: string;
  state?: Record<string, unknown>;
};

const getNotificationData = (notification: ApiNotification) => {
  if (!notification.data || typeof notification.data !== "object") {
    return {} as Record<string, unknown>;
  }
  return notification.data as Record<string, unknown>;
};

export const getNotificationDestination = (
  notification: ApiNotification,
  viewerRole?: AuthUser["role"],
): NotificationDestination => {
  const data = getNotificationData(notification);
  const threadId = typeof data.threadId === "string" ? data.threadId : null;
  const postId = typeof data.postId === "string" ? data.postId : null;
  const followerId = typeof data.followerId === "string" ? data.followerId : null;

  switch (notification.type) {
    case "message_received":
      return {
        href: "/messages",
        state: threadId ? { activeConversationId: threadId } : undefined,
      };
    case "order_created":
    case "order_status":
      if (viewerRole === "buyer") {
        return { href: "/cart" };
      }
      return { href: "/dashboard" };
    case "review_received":
      return { href: "/dashboard" };
    case "review_reply": {
      const serviceId = typeof data.serviceId === "string" ? data.serviceId : null;
      return { href: serviceId ? `/service/${serviceId}` : "/dashboard" };
    }
    case "follow_received": {
      const profileId =
        notification.actor?.username ??
        notification.actor?.id ??
        (followerId ?? null);
      return { href: profileId ? `/profile/${profileId}` : "/community" };
    }
    case "community_post_liked":
    case "community_post_commented":
    case "community_new_post":
      return { href: postId ? `/community?post=${postId}` : "/community" };
    case "payout_update":
      return { href: "/dashboard/payouts" };
    default:
      return { href: "/notifications" };
  }
};

const ROUTE_ACCESS_RULES: Array<{ match: RegExp; roles: UserRole[] }> = [
  { match: /^\/messages\b/, roles: ["buyer", "provider", "admin"] },
  { match: /^\/cart\b/, roles: ["buyer", "admin"] },
  { match: /^\/dashboard\b/, roles: ["provider", "admin"] },
  { match: /^\/account\b/, roles: ["buyer", "provider", "admin"] },
  { match: /^\/support\b/, roles: ["buyer", "provider", "admin"] },
];

const canAccessRoute = (href: string, role?: UserRole | null) => {
  const rule = ROUTE_ACCESS_RULES.find((entry) => entry.match.test(href));
  if (!rule) {
    return true;
  }
  if (!role) {
    return false;
  }
  return rule.roles.includes(role);
};

export const shouldUseServerUnreadCount = (role?: UserRole | null) => Boolean(role);

export const canAccessNotification = (
  notification: ApiNotification,
  role?: UserRole | null,
) => {
  const destination = getNotificationDestination(notification, role ?? undefined);
  return canAccessRoute(destination.href, role ?? undefined);
};

export const filterNotificationsForRole = (
  notifications: ApiNotification[],
  role?: UserRole | null,
) => notifications.filter((notification) => canAccessNotification(notification, role));

export const countUnreadNotifications = (notifications: ApiNotification[]) =>
  notifications.reduce((count, item) => count + (item.isRead ? 0 : 1), 0);
