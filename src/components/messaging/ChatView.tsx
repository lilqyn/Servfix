import { useEffect, useMemo, useRef, useState } from "react";
import { useMessages } from "@/contexts/MessagesContext";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Shield,
  FileText,
} from "lucide-react";
import MessageInput from "./MessageInput";
import { toast } from "sonner";
import { useOrders } from "@/hooks/useOrders";
import { useConversationQuotes } from "@/hooks/useConversationQuotes";
import { useOrderProgressReports } from "@/hooks/useOrderProgressReports";
import { useOrderPayments } from "@/hooks/useOrderPayments";
import { useService } from "@/hooks/useService";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import {
  acceptQuote,
  createOrderPaymentCheckout,
  createOrderProgressReport,
  createThreadQuote,
  rejectQuote,
} from "@/lib/api";

interface ChatViewProps {
  onBack?: () => void;
  isMobile?: boolean;
}

const ChatView = ({ onBack, isMobile }: ChatViewProps) => {
  const { conversations, messages, activeConversationId, sendMessage, markAsRead } = useMessages();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const orderId = activeConversation?.orderId ?? null;
  const { data: orders = [] } = useOrders();
  const order = orderId ? orders.find((item) => item.id === orderId) : undefined;
  const { data: quotes = [], refetch: refetchQuotes } = useConversationQuotes(activeConversationId);
  const { data: orderPayments = [], refetch: refetchOrderPayments } = useOrderPayments(orderId);
  const { data: progressReports = [], refetch: refetchProgressReports } =
    useOrderProgressReports(orderId);
  const { data: serviceDetails } = useService(activeConversation?.serviceId ?? undefined);
  const { data: publicSettings } = usePublicSettings();
  const paymentConfig = publicSettings?.payments;
  const enabledProviders =
    paymentConfig?.enabledProviders ?? ["flutterwave", "stripe", "paystack"];
  const defaultProvider = paymentConfig?.defaultProvider ?? "flutterwave";
  const paymentProvider = enabledProviders.length
    ? enabledProviders.includes(defaultProvider)
      ? defaultProvider
      : enabledProviders[0]
    : "flutterwave";
  const paymentMethod = paymentProvider === "stripe" ? "card" : "mobile_money";

  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteTierId, setQuoteTierId] = useState<string | null>(null);
  const [quoteQuantity, setQuoteQuantity] = useState("1");
  const [quoteDeposit, setQuoteDeposit] = useState(50);
  const [quoteMessage, setQuoteMessage] = useState("");

  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [progressTitle, setProgressTitle] = useState("");
  const [progressBody, setProgressBody] = useState("");
  const [progressPercent, setProgressPercent] = useState(50);
  const conversationMessages = useMemo(
    () =>
      messages
        .filter((m) => m.conversationId === activeConversationId)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    [messages, activeConversationId],
  );

  const otherParticipant = activeConversation?.participants.find((p) => p.id !== "current-user");
  const latestQuote = quotes[0];
  const pendingBalancePayment = orderPayments.find(
    (payment) => payment.stage === "balance" && payment.status === "pending",
  );
  const amountPaid = order?.amountPaid ? Number(order.amountPaid) : 0;
  const amountGross = order?.amountGross ? Number(order.amountGross) : 0;
  const balanceDue = amountGross > 0 && amountPaid < amountGross;
  const serviceTiers = serviceDetails?.tiers ?? [];
  const selectedQuoteTier =
    serviceTiers.find((tier) => tier.id === quoteTierId) ?? serviceTiers[0];
  const quotePricingType = selectedQuoteTier?.pricingType ?? "flat";
  const quoteUnitLabel = selectedQuoteTier?.unitLabel?.trim() || "unit";
  const quoteCurrency = selectedQuoteTier?.currency ?? "GHS";
  const parsedQuoteQuantity = Number(quoteQuantity);
  const safeQuoteQuantity =
    Number.isFinite(parsedQuoteQuantity) && parsedQuoteQuantity > 0
      ? Math.floor(parsedQuoteQuantity)
      : 1;
  const parsedQuoteAmount = Number(quoteAmount);
  const quoteTotal =
    Number.isFinite(parsedQuoteAmount) && parsedQuoteAmount > 0
      ? quotePricingType === "per_unit"
        ? parsedQuoteAmount * safeQuoteQuantity
        : parsedQuoteAmount
      : null;
  const latestQuoteQuantity = latestQuote?.quantity ?? 1;
  const latestQuoteTier = serviceTiers.find((tier) => tier.id === latestQuote?.tierId);
  const latestQuotePricingType = latestQuoteTier?.pricingType ?? "flat";
  const latestQuoteUnitLabel = latestQuoteTier?.unitLabel?.trim() || "unit";
  const latestQuoteRate =
    latestQuotePricingType === "per_unit" && latestQuoteQuantity > 0 && latestQuote
      ? Number(latestQuote.amount) / latestQuoteQuantity
      : null;

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

  useEffect(() => {
    if (!serviceTiers.length) {
      setQuoteTierId(null);
      return;
    }
    setQuoteTierId((prev) =>
      prev && serviceTiers.some((tier) => tier.id === prev) ? prev : serviceTiers[0].id,
    );
  }, [serviceTiers, activeConversationId]);

  const formatMessageDate = (date: Date) => {
    if (isToday(date)) {
      return format(date, "h:mm a");
    } else if (isYesterday(date)) {
      return `Yesterday ${format(date, "h:mm a")}`;
    }
    return format(date, "MMM d, h:mm a");
  };

  const handleSendQuote = async () => {
    if (!activeConversationId || !activeConversation?.serviceId) {
      toast.error("This conversation is not linked to a service.");
      return;
    }
    const amountValue = Number(quoteAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error("Enter a valid quote amount.");
      return;
    }
    if (quotePricingType === "per_unit") {
      if (!Number.isFinite(parsedQuoteQuantity) || parsedQuoteQuantity < 1) {
        toast.error("Enter a valid quantity.");
        return;
      }
    }

    try {
      await createThreadQuote(activeConversationId, {
        serviceId: activeConversation.serviceId ?? undefined,
        tierId: selectedQuoteTier?.id,
        amount: amountValue,
        quantity: quotePricingType === "per_unit" ? safeQuoteQuantity : 1,
        depositPercent: quoteDeposit,
        message: quoteMessage.trim() || undefined,
      });
      setIsQuoteOpen(false);
      setQuoteAmount("");
      setQuoteQuantity("1");
      setQuoteDeposit(50);
      setQuoteMessage("");
      await refetchQuotes();
      toast.success("Quote sent.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send quote.";
      toast.error(message);
    }
  };

  const handleAcceptQuote = async () => {
    if (!latestQuote) {
      return;
    }
    if (enabledProviders.length === 0) {
      toast.error("No payment providers are currently available.");
      return;
    }
    try {
      const response = await acceptQuote(latestQuote.id);
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await refetchQuotes();
      const checkout = await createOrderPaymentCheckout({
        orderPaymentId: response.orderPayment.id,
        provider: paymentProvider,
        method: paymentMethod,
      });
      window.location.href = checkout.checkoutUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to accept quote.";
      toast.error(message);
    }
  };

  const handleRejectQuote = async () => {
    if (!latestQuote) {
      return;
    }
    try {
      await rejectQuote(latestQuote.id);
      await refetchQuotes();
      toast.success("Quote declined.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to decline quote.";
      toast.error(message);
    }
  };

  const handlePayBalance = async () => {
    if (!pendingBalancePayment) {
      return;
    }
    if (enabledProviders.length === 0) {
      toast.error("No payment providers are currently available.");
      return;
    }
    try {
      const checkout = await createOrderPaymentCheckout({
        orderPaymentId: pendingBalancePayment.id,
        provider: paymentProvider,
        method: paymentMethod,
      });
      window.location.href = checkout.checkoutUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start balance payment.";
      toast.error(message);
    }
  };

  const handleSubmitProgress = async () => {
    if (!orderId) {
      return;
    }
    if (!progressTitle.trim()) {
      toast.error("Enter a progress title.");
      return;
    }
    try {
      await createOrderProgressReport(orderId, {
        title: progressTitle.trim(),
        body: progressBody.trim() || undefined,
        percentComplete: progressPercent,
      });
      setIsProgressOpen(false);
      setProgressTitle("");
      setProgressBody("");
      setProgressPercent(50);
      await Promise.all([
        refetchProgressReports(),
        refetchOrderPayments(),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
      ]);
      toast.success("Progress report submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit progress report.";
      toast.error(message);
    }
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

      {(latestQuote || (user?.role === "provider" && activeConversation?.serviceId) || pendingBalancePayment || (user?.role === "provider" && balanceDue)) && (
        <div className="border-b border-border bg-muted/20 px-4 py-3 space-y-3">
          {latestQuote && (
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Quote</p>
                  <p className="text-xs text-muted-foreground">
                    Status: {latestQuote.status}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs capitalize">
                  {latestQuote.status}
                </Badge>
              </div>
              <div className="mt-2 text-sm text-muted-foreground space-y-1">
                <div>
                  Total: {latestQuote.currency} {Number(latestQuote.amount).toLocaleString()}
                </div>
                {latestQuotePricingType === "per_unit" && (
                  <div>
                    Quantity: {latestQuoteQuantity} {latestQuoteUnitLabel}
                  </div>
                )}
                {latestQuoteRate !== null && (
                  <div>
                    Rate: {latestQuote.currency} {latestQuoteRate.toLocaleString()} per{" "}
                    {latestQuoteUnitLabel}
                  </div>
                )}
                <div>
                  Deposit: {latestQuote.depositPercent}% (
                  {latestQuote.currency} {Number(latestQuote.depositAmount).toLocaleString()})
                </div>
                <div>
                  Balance: {latestQuote.currency} {Number(latestQuote.balanceAmount).toLocaleString()}
                </div>
                {latestQuote.message && (
                  <div className="text-xs text-muted-foreground mt-2">
                    {latestQuote.message}
                  </div>
                )}
              </div>
              {user?.role === "buyer" && latestQuote.status === "sent" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="gold" onClick={handleAcceptQuote}>
                    {latestQuote.depositPercent > 0 ? "Accept & Pay Deposit" : "Accept & Pay"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRejectQuote}>
                    Decline
                  </Button>
                </div>
              )}
            </div>
          )}

          {user?.role === "provider" && activeConversation?.serviceId && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsQuoteOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                Send Quote
              </Button>
              {order && balanceDue && amountPaid > 0 && (
                <Button size="sm" variant="secondary" onClick={() => setIsProgressOpen(true)}>
                  Submit Progress Report
                </Button>
              )}
            </div>
          )}

          {user?.role === "buyer" && pendingBalancePayment && (
            <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Balance payment due</p>
                <p className="text-xs text-muted-foreground">
                  Remaining balance is ready for payment.
                </p>
              </div>
              <Button size="sm" variant="gold" onClick={handlePayBalance}>
                Pay Balance
              </Button>
            </div>
          )}

          {progressReports.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-sm font-semibold">Latest progress report</p>
              <p className="text-xs text-muted-foreground">{progressReports[0].title}</p>
            </div>
          )}
        </div>
      )}

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

      <Dialog open={isQuoteOpen} onOpenChange={setIsQuoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {serviceTiers.length > 0 && (
              <div>
                <label className="text-sm font-medium text-foreground">Package</label>
                <Select
                  value={quoteTierId ?? ""}
                  onValueChange={(value) => setQuoteTierId(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select package" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTiers.map((tier) => (
                      <SelectItem key={tier.id} value={tier.id}>
                        {tier.name.charAt(0).toUpperCase() + tier.name.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {quotePricingType === "per_unit" && (
              <div>
                <label className="text-sm font-medium text-foreground">
                  Quantity ({quoteUnitLabel})
                </label>
                <Input
                  type="number"
                  min={1}
                  value={quoteQuantity}
                  onChange={(event) => setQuoteQuantity(event.target.value)}
                  placeholder="e.g., 50"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-foreground">
                {quotePricingType === "per_unit"
                  ? `Rate per ${quoteUnitLabel} (${quoteCurrency})`
                  : `Total Amount (${quoteCurrency})`}
              </label>
              <Input
                type="number"
                value={quoteAmount}
                onChange={(event) => setQuoteAmount(event.target.value)}
                placeholder="e.g., 2500"
              />
            </div>
            {quoteTotal !== null && (
              <p className="text-xs text-muted-foreground">
                Estimated total: {quoteCurrency} {quoteTotal.toLocaleString()}
              </p>
            )}
            <div>
              <label className="text-sm font-medium text-foreground">Deposit %</label>
              <Select
                value={String(quoteDeposit)}
                onValueChange={(value) => setQuoteDeposit(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select deposit percent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50%</SelectItem>
                  <SelectItem value="70">70%</SelectItem>
                  <SelectItem value="100">100%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Message (optional)</label>
              <Textarea
                value={quoteMessage}
                onChange={(event) => setQuoteMessage(event.target.value)}
                rows={3}
                placeholder="Add scope, timelines, or notes..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsQuoteOpen(false)}>
                Cancel
              </Button>
              <Button variant="gold" onClick={handleSendQuote}>
                Send Quote
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isProgressOpen} onOpenChange={setIsProgressOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Progress Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Title</label>
              <Input
                value={progressTitle}
                onChange={(event) => setProgressTitle(event.target.value)}
                placeholder="e.g., Mid-project update"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Completion %</label>
              <Input
                type="number"
                value={progressPercent}
                onChange={(event) => setProgressPercent(Number(event.target.value))}
                min={1}
                max={100}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Details (optional)</label>
              <Textarea
                value={progressBody}
                onChange={(event) => setProgressBody(event.target.value)}
                rows={3}
                placeholder="Describe progress or attach expectations."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsProgressOpen(false)}>
                Cancel
              </Button>
              <Button variant="gold" onClick={handleSubmitProgress}>
                Submit Report
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatView;
