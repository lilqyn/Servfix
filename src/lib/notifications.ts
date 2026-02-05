import type { ApiNotification } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";

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
