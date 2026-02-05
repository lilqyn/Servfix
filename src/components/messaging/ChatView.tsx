import { useEffect, useMemo, useRef } from "react";
import { useMessages } from "@/contexts/MessagesContext";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { ArrowLeft, Phone, Video, MoreVertical, Shield } from "lucide-react";
import MessageInput from "./MessageInput";
import { toast } from "sonner";

interface ChatViewProps {
  onBack?: () => void;
  isMobile?: boolean;
}

const ChatView = ({ onBack, isMobile }: ChatViewProps) => {
  const { conversations, messages, activeConversationId, sendMessage, markAsRead } = useMessages();
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const conversationMessages = useMemo(
    () =>
      messages
        .filter((m) => m.conversationId === activeConversationId)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    [messages, activeConversationId],
  );

  const otherParticipant = activeConversation?.participants.find((p) => p.id !== "current-user");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationMessages]);

  useEffect(() => {
    if (activeConversationId && (activeConversation?.unreadCount ?? 0) > 0) {
      void markAsRead(activeConversationId);
    }
  }, [activeConversationId, activeConversation?.unreadCount, markAsRead]);

  const formatMessageDate = (date: Date) => {
    if (isToday(date)) {
      return format(date, "h:mm a");
    } else if (isYesterday(date)) {
      return `Yesterday ${format(date, "h:mm a")}`;
    }
    return format(date, "MMM d, h:mm a");
  };

  const handleSend = async (content: string) => {
    if (activeConversationId) {
      try {
        await sendMessage(activeConversationId, content);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to send message.";
        toast.error(message);
      }
    }
  };

  if (!activeConversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-muted/30">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <span className="text-4xl">💬</span>
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Select a conversation</h3>
        <p className="text-muted-foreground max-w-sm">
          Choose a conversation from the list to start messaging with service providers
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-background">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        <Avatar className="h-10 w-10">
          <AvatarImage src={otherParticipant?.avatar} alt={otherParticipant?.name} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {otherParticipant?.name?.replace(/^@/, "").charAt(0)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{otherParticipant?.name}</h3>
          {activeConversation.serviceName && (
            <Badge variant="outline" className="text-xs font-normal">
              {activeConversation.serviceName}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="hidden sm:flex">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden sm:flex">
            <Video className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Security Notice */}
      <div className="flex items-center gap-2 px-4 py-2 bg-secondary/20 text-sm">
        <Shield className="h-4 w-4 text-secondary" />
        <span className="text-muted-foreground">
          All messages are secured. Do not share personal contact information.
        </span>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {conversationMessages.map((message, index) => {
            const isCurrentUser =
              message.senderId === "current-user" || (user?.id && message.senderId === user.id);
            const sender = activeConversation.participants.find((p) => p.id === message.senderId);

            // Show date separator for first message or when date changes
            const showDateSeparator =
              index === 0 ||
              new Date(message.timestamp).toDateString() !==
                new Date(conversationMessages[index - 1].timestamp).toDateString();

            return (
              <div key={message.id}>
                {showDateSeparator && (
                  <div className="flex items-center justify-center my-4">
                    <span className="px-3 py-1 text-xs text-muted-foreground bg-muted rounded-full">
                      {isToday(message.timestamp)
                        ? "Today"
                        : isYesterday(message.timestamp)
                        ? "Yesterday"
                        : format(message.timestamp, "MMMM d, yyyy")}
                    </span>
                  </div>
                )}

                <div
                  className={cn(
                    "flex items-end gap-2",
                    isCurrentUser ? "justify-end" : "justify-start"
                  )}
                >
                  {!isCurrentUser && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={sender?.avatar} alt={sender?.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {sender?.name?.replace(/^@/, "").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={cn(
                      "max-w-[70%] px-4 py-2 rounded-2xl",
                      isCurrentUser
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                    <p
                      className={cn(
                        "text-[10px] mt-1",
                        isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}
                    >
                      {formatMessageDate(message.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Message Input */}
      <MessageInput onSend={handleSend} />
    </div>
  );
};

export default ChatView;
