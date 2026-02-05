import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { ApiNotification } from "@/lib/api";

type NotificationItemProps = {
  notification: ApiNotification;
  onClick?: () => void;
  compact?: boolean;
};

const formatRelativeTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) {
    return "Just now";
  }
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getInitials = (name: string) => {
  if (!name) {
    return "SG";
  }
  const tokens = name.split(" ").filter(Boolean);
  const first = tokens[0]?.[0] ?? name[0];
  const second = tokens[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
};

const NotificationItem = ({ notification, onClick, compact }: NotificationItemProps) => {
  const actorName = notification.actor?.name ?? "Someone";
  const initials = getInitials(actorName);
  const timestamp = formatRelativeTime(notification.createdAt);
  const content = (
    <>
      <Avatar className={compact ? "h-9 w-9" : "h-10 w-10"}>
        {notification.actor?.avatarUrl ? (
          <AvatarImage src={notification.actor.avatarUrl} alt={actorName} />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-semibold text-foreground", compact ? "text-xs" : "")}>
            {notification.title}
          </p>
          {timestamp ? (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{timestamp}</span>
          ) : null}
        </div>
        {notification.body ? (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notification.body}</p>
        ) : null}
      </div>
      {!notification.isRead && (
        <span className="mt-2 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full text-left flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 transition",
          compact ? "px-3 py-2" : "px-4 py-4",
          "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          notification.isRead ? "bg-card" : "bg-primary/5 border-primary/10",
        )}
        aria-label={notification.title}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "w-full text-left flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 transition",
        compact ? "px-3 py-2" : "px-4 py-4",
        notification.isRead ? "bg-card" : "bg-primary/5 border-primary/10",
      )}
      aria-label={notification.title}
    >
      {content}
    </div>
  );
};

export default NotificationItem;
