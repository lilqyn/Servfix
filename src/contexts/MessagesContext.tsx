import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  createConversation,
  createOrderConversation,
  fetchConversationMessages,
  fetchConversations,
  markConversationRead,
  sendConversationMessage,
  type ApiConversation,
  type ApiConversationMessage,
} from "@/lib/api";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  read: boolean;
}

export interface Conversation {
  id: string;
  participants: {
    id: string;
    name: string;
    avatar: string;
    isProvider: boolean;
  }[];
  serviceId?: string | null;
  serviceName?: string | null;
  lastMessage?: Message;
  unreadCount: number;
  createdAt: Date;
}

interface MessagesContextType {
  conversations: Conversation[];
  messages: Message[];
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  refreshConversations: () => Promise<void>;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  startConversation: (
    providerId: string,
    providerName: string,
    providerAvatar: string,
    serviceId?: string,
    serviceName?: string
  ) => Promise<string>;
  startOrderConversation: (orderId: string) => Promise<string>;
  markAsRead: (conversationId: string) => Promise<void>;
  getUnreadCount: () => number;
}

const MessagesContext = createContext<MessagesContextType | undefined>(undefined);

const toDate = (value: string | Date | undefined | null) => {
  if (!value) {
    return new Date();
  }
  if (value instanceof Date) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const mapMessage = (message: ApiConversationMessage): Message => ({
  ...message,
  timestamp: toDate(message.timestamp),
});

const mapConversation = (conversation: ApiConversation): Conversation => ({
  ...conversation,
  createdAt: toDate(conversation.createdAt),
  lastMessage: conversation.lastMessage ? mapMessage(conversation.lastMessage) : undefined,
});

const sortConversations = (items: Conversation[]) => {
  return [...items].sort((a, b) => {
    const aTime = a.lastMessage?.timestamp ?? a.createdAt;
    const bTime = b.lastMessage?.timestamp ?? b.createdAt;
    return bTime.getTime() - aTime.getTime();
  });
};

export const MessagesProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isHydrated } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadedConversations, setLoadedConversations] = useState<Set<string>>(new Set());

  const refreshConversations = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    try {
      const data = await fetchConversations();
      setConversations(sortConversations(data.map(mapConversation)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load conversations.";
      toast.error(message);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!isAuthenticated) {
      setConversations([]);
      setMessages([]);
      setActiveConversationId(null);
      setLoadedConversations(new Set());
      return;
    }

    void refreshConversations();
  }, [isAuthenticated, isHydrated, refreshConversations]);

  useEffect(() => {
    if (!activeConversationId || !isAuthenticated) {
      return;
    }

    const activeConversation = conversations.find((conv) => conv.id === activeConversationId);
    const lastMessageTime = activeConversation?.lastMessage?.timestamp;
    const hasLoaded = loadedConversations.has(activeConversationId);
    const activeMessages = messages.filter((msg) => msg.conversationId === activeConversationId);
    const latestLoaded = activeMessages.length > 0 ? activeMessages[activeMessages.length - 1].timestamp : null;
    const hasNewer =
      lastMessageTime && (!latestLoaded || lastMessageTime.getTime() > latestLoaded.getTime());

    if (hasLoaded && activeMessages.length > 0 && !hasNewer) {
      return;
    }

    let cancelled = false;

    fetchConversationMessages(activeConversationId)
      .then((data) => {
        if (cancelled) return;
        const mapped = data.map(mapMessage);
        setMessages((prev) => {
          const filtered = prev.filter((msg) => msg.conversationId !== activeConversationId);
          return [...filtered, ...mapped];
        });
        setLoadedConversations((prev) => new Set([...prev, activeConversationId]));
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to load messages.";
        toast.error(message);
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, isAuthenticated, loadedConversations, conversations, messages]);

  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    if (!isAuthenticated) {
      throw new Error("Authorization required");
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const response = await sendConversationMessage(conversationId, trimmed);
    const mapped = mapMessage(response);

    setMessages((prev) => [...prev, mapped]);
    setLoadedConversations((prev) => new Set([...prev, conversationId]));
    setConversations((prev) =>
      sortConversations(
        prev.map((conv) =>
          conv.id === conversationId
            ? { ...conv, lastMessage: mapped }
            : conv,
        ),
      ),
    );
  }, [isAuthenticated]);

  const startConversation = useCallback(async (
    providerId: string,
    _providerName: string,
    _providerAvatar: string,
    serviceId?: string,
    _serviceName?: string,
  ): Promise<string> => {
    if (!isAuthenticated) {
      throw new Error("Authorization required");
    }

    void _providerName;
    void _providerAvatar;
    void _serviceName;

    const conversation = await createConversation({ providerId, serviceId });
    const mapped = mapConversation(conversation);

    setConversations((prev) => {
      const existing = prev.find((conv) => conv.id === mapped.id);
      if (existing) {
        return sortConversations(
          prev.map((conv) => (conv.id === mapped.id ? { ...conv, ...mapped } : conv)),
        );
      }
      return sortConversations([mapped, ...prev]);
    });

    return mapped.id;
  }, [isAuthenticated]);

  const startOrderConversation = useCallback(async (orderId: string): Promise<string> => {
    if (!isAuthenticated) {
      throw new Error("Authorization required");
    }

    const conversation = await createOrderConversation(orderId);
    const mapped = mapConversation(conversation);

    setConversations((prev) => {
      const existing = prev.find((conv) => conv.id === mapped.id);
      if (existing) {
        return sortConversations(
          prev.map((conv) => (conv.id === mapped.id ? { ...conv, ...mapped } : conv)),
        );
      }
      return sortConversations([mapped, ...prev]);
    });

    return mapped.id;
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (conversationId: string) => {
    if (!isAuthenticated) {
      return;
    }

    try {
      await markConversationRead(conversationId);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.conversationId === conversationId ? { ...msg, read: true } : msg,
        ),
      );
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to mark messages as read.";
      toast.error(message);
    }
  }, [isAuthenticated]);

  const getUnreadCount = useCallback(() => {
    return conversations.reduce((acc, conv) => acc + conv.unreadCount, 0);
  }, [conversations]);

  return (
    <MessagesContext.Provider
      value={{
        conversations,
        messages,
        activeConversationId,
        setActiveConversationId,
        refreshConversations,
        sendMessage,
        startConversation,
        startOrderConversation,
        markAsRead,
        getUnreadCount,
      }}
    >
      {children}
    </MessagesContext.Provider>
  );
};

export const useMessages = () => {
  const context = useContext(MessagesContext);
  if (context === undefined) {
    throw new Error("useMessages must be used within a MessagesProvider");
  }
  return context;
};
