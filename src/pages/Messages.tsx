import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useMessages } from "@/contexts/MessagesContext";
import { useIsMobile } from "@/hooks/use-mobile";
import Header from "@/components/Header";
import ConversationList from "@/components/messaging/ConversationList";
import ChatView from "@/components/messaging/ChatView";
import { cn } from "@/lib/utils";

const Messages = () => {
  const { activeConversationId, setActiveConversationId, conversations, refreshConversations } = useMessages();
  const isMobile = useIsMobile();
  const location = useLocation();

  // Handle navigation state from inquiry form
  useEffect(() => {
    const state = location.state as { activeConversationId?: string } | null;
    if (state?.activeConversationId) {
      setActiveConversationId(state.activeConversationId);
      // Clear the state to prevent re-selecting on page refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setActiveConversationId]);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  // Auto-select first conversation on desktop if none selected
  useEffect(() => {
    if (!isMobile && !activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [isMobile, activeConversationId, conversations, setActiveConversationId]);

  const handleBack = () => {
    setActiveConversationId(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Messages</h1>
          <p className="text-muted-foreground">
            Communicate with service providers securely
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden h-[calc(100vh-220px)] min-h-[500px]">
          <div className="flex h-full">
            {/* Conversation List - Hidden on mobile when chat is active */}
            <div
              className={cn(
                "w-full md:w-80 lg:w-96 border-r border-border flex-shrink-0",
                isMobile && activeConversationId ? "hidden" : "block"
              )}
            >
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Conversations</h2>
                <p className="text-sm text-muted-foreground">
                  {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="h-[calc(100%-73px)]">
                <ConversationList />
              </div>
            </div>

            {/* Chat View - Full width on mobile when active */}
            <div
              className={cn(
                "flex-1",
                isMobile && !activeConversationId ? "hidden" : "block"
              )}
            >
              <ChatView onBack={handleBack} isMobile={isMobile} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Messages;
