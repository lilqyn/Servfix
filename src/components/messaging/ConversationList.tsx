import { useMessages, Conversation } from "@/contexts/MessagesContext";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const ConversationList = () => {
  const { conversations, activeConversationId, setActiveConversationId, markAsRead } = useMessages();
  const { user } = useAuth();

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversationId(conv.id);
    if (conv.unreadCount > 0) {
      void markAsRead(conv.id);
    }
  };

  const getOtherParticipant = (conv: Conversation) => {
    const currentId = user?.id;
    return (
      conv.participants.find((p) => p.id !== "current-user" && p.id !== currentId) ??
      conv.participants.find((p) => p.id !== "current-user") ??
      conv.participants[0]
    );
  };

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <span className="text-2xl">💬</span>
        </div>
        <h3 className="font-semibold text-foreground mb-2">No conversations yet</h3>
        <p className="text-sm text-muted-foreground">
          Start a conversation by contacting a service provider
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y divide-border">
        {conversations.map((conv) => {
          const otherParticipant = getOtherParticipant(conv);
          const isActive = activeConversationId === conv.id;

          return (
            <button
              key={conv.id}
              onClick={() => handleSelectConversation(conv)}
              className={cn(
                "w-full p-4 text-left transition-colors hover:bg-accent/50",
                isActive && "bg-accent"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={otherParticipant?.avatar} alt={otherParticipant?.name} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {otherParticipant?.name?.replace(/^@/, "").charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className={cn(
                      "font-medium truncate",
                      conv.unreadCount > 0 ? "text-foreground" : "text-foreground"
                    )}>
                      {otherParticipant?.name}
                    </h4>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {conv.lastMessage
                        ? formatDistanceToNow(conv.lastMessage.timestamp, { addSuffix: true })
                        : formatDistanceToNow(conv.createdAt, { addSuffix: true })}
                    </span>
                  </div>

                  {conv.serviceName && (
                    <Badge variant="secondary" className="mb-1 text-xs font-normal">
                      {conv.serviceName}
                    </Badge>
                  )}

                  {conv.lastMessage && (
                    <p className={cn(
                      "text-sm truncate",
                      conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {(conv.lastMessage.senderId === "current-user" ||
                        (user?.id && conv.lastMessage.senderId === user.id)) &&
                        "You: "}
                      {conv.lastMessage.content}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
};

export default ConversationList;
