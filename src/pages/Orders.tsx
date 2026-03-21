import { useMemo, useState, useCallback } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader as DialogHeaderUi,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Package,
  Calendar,
  MapPin,
  MessageSquare,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Shield,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CreditCard,
  XCircle,
} from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import {
  approveOrderCompletion,
  openOrderDispute,
  fetchOrderPayments,
  fetchOrderProgressReports,
  createOrderPaymentCheckout,
} from "@/lib/api";
import type {
  ApiOrder,
  ApiOrderStatus,
  ApiOrderUser,
  ApiOrderPayment,
  OrderProgressReport,
  CheckoutProvider,
} from "@/lib/api";
import { formatCurrencyAmount, type CurrencyCode } from "@/lib/currency";
import { useMessages } from "@/contexts/MessagesContext";
import { useAuth } from "@/contexts/useAuth";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { toast } from "sonner";

/* ─── helpers ─── */

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const fmtCurrency = (amount: number, currency: CurrencyCode) =>
  formatCurrencyAmount(amount, currency, { currencyDisplay: "code", maximumFractionDigits: 2 });

const getDisplayName = (user?: ApiOrderUser | null) => {
  if (!user) return "Provider";
  const profile = user.providerProfile ?? undefined;
  if (profile?.displayName) return profile.displayName;
  if (user.username) return `@${user.username}`;
  if (user.email) return user.email;
  if (user.phone) return user.phone;
  return "Provider";
};

const formatLocation = (location?: string | null) => {
  if (!location) return "Ghana";
  if (location.toLowerCase().includes("ghana")) return location;
  return `${location}, Ghana`;
};

type BuyerTab = "all" | "active" | "completed" | "cancelled";

const TIMELINE_STEPS: { key: ApiOrderStatus; label: string }[] = [
  { key: "created", label: "Order placed" },
  { key: "paid_to_escrow", label: "Payment secured" },
  { key: "accepted", label: "Provider accepted" },
  { key: "in_progress", label: "In progress" },
  { key: "delivery_submitted", label: "Delivery submitted" },
  { key: "delivered", label: "Delivered" },
  { key: "release_approved", label: "Release approved" },
  { key: "released", label: "Funds released" },
  { key: "disbursed", label: "Completed" },
];

const TERMINAL_LABELS: Partial<Record<ApiOrderStatus, string>> = {
  cancelled: "Cancelled",
  expired: "Expired",
  dispute_open: "Dispute opened",
  disputed: "Under dispute",
  refund_pending: "Refund pending",
  refunded: "Refunded",
  chargeback: "Chargeback",
};

const getTimelineIndex = (status: ApiOrderStatus) => {
  const idx = TIMELINE_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : -1;
};

const getBuyerStatusBadge = (status: ApiOrderStatus) => {
  if (["released", "disbursed"].includes(status)) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 gap-1">
        <CheckCircle className="h-3 w-3" />
        Completed
      </Badge>
    );
  }
  if (["cancelled", "expired"].includes(status)) {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        {status === "expired" ? "Expired" : "Cancelled"}
      </Badge>
    );
  }
  if (["dispute_open", "disputed"].includes(status)) {
    return (
      <Badge className="bg-amber-100 text-amber-700 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Dispute
      </Badge>
    );
  }
  if (["refund_pending", "refunded", "chargeback"].includes(status)) {
    return (
      <Badge className="bg-blue-100 text-blue-700 gap-1">
        <CreditCard className="h-3 w-3" />
        {status === "refunded" ? "Refunded" : status === "chargeback" ? "Chargeback" : "Refund pending"}
      </Badge>
    );
  }
  if (["delivery_submitted", "delivered"].includes(status)) {
    return (
      <Badge className="bg-primary/10 text-primary gap-1">
        <Package className="h-3 w-3" />
        Ready for review
      </Badge>
    );
  }
  if (status === "paid_to_escrow") {
    return (
      <Badge variant="outline" className="gap-1">
        <Clock className="h-3 w-3" />
        Awaiting provider
      </Badge>
    );
  }
  if (status === "accepted" || status === "in_progress") {
    return (
      <Badge className="bg-primary text-primary-foreground gap-1">
        <Clock className="h-3 w-3" />
        In progress
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="h-3 w-3" />
      {status.replace(/_/g, " ")}
    </Badge>
  );
};

const filterByTab = (orders: ApiOrder[], tab: BuyerTab) => {
  if (tab === "all") return orders;
  if (tab === "active") {
    return orders.filter((o) =>
      ["created", "paid_to_escrow", "accepted", "in_progress", "delivery_submitted", "delivered", "approved", "release_approved"].includes(o.status),
    );
  }
  if (tab === "completed") {
    return orders.filter((o) => ["released", "disbursed"].includes(o.status));
  }
  return orders.filter((o) =>
    ["cancelled", "expired", "dispute_open", "disputed", "refund_pending", "refunded", "chargeback"].includes(o.status),
  );
};

/* ─── detail panel ─── */

function OrderDetail({
  order,
  onBack,
  onMessage,
}: {
  order: ApiOrder;
  onBack: () => void;
  onMessage: (orderId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: settingsData } = usePublicSettings();
  const [approving, setApproving] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDetails, setDisputeDetails] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [payments, setPayments] = useState<ApiOrderPayment[]>([]);
  const [reports, setReports] = useState<OrderProgressReport[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(true);
  const [paying, setPaying] = useState(false);

  const gross = toNumber(order.amountGross);
  const provider = order.provider;
  const providerName = getDisplayName(provider);
  const timelineIdx = getTimelineIndex(order.status);
  const isTerminal = order.status in TERMINAL_LABELS;
  const canApprove = ["delivery_submitted", "delivered"].includes(order.status);
  const canDispute = ["delivery_submitted", "delivered"].includes(order.status);
  const pendingPayment = payments.find((p) => p.status === "pending") ?? null;

  const loadExtra = useCallback(async () => {
    setLoadingExtra(true);
    try {
      const [p, r] = await Promise.all([
        fetchOrderPayments(order.id),
        fetchOrderProgressReports(order.id),
      ]);
      setPayments(p);
      setReports(r);
    } catch {
      /* keep empty */
    } finally {
      setLoadingExtra(false);
    }
  }, [order.id]);

  useState(() => {
    void loadExtra();
  });

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveOrderCompletion(order.id);
      toast.success("Order approved! Funds will be released to the provider.");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve.");
    } finally {
      setApproving(false);
    }
  };

  const handleDisputeSubmit = async () => {
    if (disputeReason.trim().length < 5) {
      setDisputeError("Reason must be at least 5 characters.");
      return;
    }
    setDisputeSubmitting(true);
    setDisputeError(null);
    try {
      await openOrderDispute(order.id, {
        reason: disputeReason.trim(),
        details: disputeDetails.trim() || undefined,
      });
      toast.success("Dispute opened. Our team will review it.");
      setDisputeOpen(false);
      setDisputeReason("");
      setDisputeDetails("");
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      setDisputeError(err instanceof Error ? err.message : "Could not open dispute.");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const handlePay = async (payment: ApiOrderPayment) => {
    setPaying(true);
    try {
      const providers = settingsData?.payments?.enabledProviders ?? ["flutterwave"];
      const defaultProv = settingsData?.payments?.defaultProvider ?? "flutterwave";
      const provider = providers.includes(defaultProv) ? defaultProv : providers[0];
      const checkout = await createOrderPaymentCheckout({
        orderPaymentId: payment.id,
        provider: provider as CheckoutProvider,
        method: provider === "stripe" ? "card" : "mobile_money",
        returnTo: "web",
      });
      window.location.href = checkout.checkoutUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2 text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Back to orders
      </Button>

      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">{order.service.title}</h2>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(order.createdAt), "MMM d, yyyy")}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {formatLocation(order.service.locationCity)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getBuyerStatusBadge(order.status)}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* timeline */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Order timeline
              </h3>
              {isTerminal ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50 border border-border/50">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">{TERMINAL_LABELS[order.status]}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {TIMELINE_STEPS.map((step, idx) => {
                    const reached = timelineIdx >= idx;
                    const isCurrent = timelineIdx === idx;
                    return (
                      <div key={step.key} className="flex items-center gap-3">
                        <div
                          className={`h-3 w-3 rounded-full shrink-0 ${
                            reached
                              ? isCurrent
                                ? "bg-primary ring-4 ring-primary/20"
                                : "bg-primary"
                              : "bg-border"
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            reached ? "text-foreground font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* progress reports */}
          {reports.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Progress updates
                </h3>
                <div className="space-y-3">
                  {reports.map((report) => (
                    <div key={report.id} className="p-3 rounded-lg border border-border/50 bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-foreground">{report.title}</span>
                        <Badge variant="outline" className="text-xs">{report.percentComplete}%</Badge>
                      </div>
                      {report.body && <p className="text-sm text-muted-foreground mt-1">{report.body}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(report.createdAt), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* payments */}
          {payments.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> Payments
                </h3>
                <div className="space-y-3">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
                      <div>
                        <span className="text-sm font-medium capitalize">{p.stage} payment</span>
                        <p className="text-xs text-muted-foreground">
                          {p.paidAt ? format(new Date(p.paidAt), "MMM d, yyyy") : "Pending"}
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="font-semibold text-sm">{fmtCurrency(toNumber(p.amount), p.currency)}</span>
                        {p.status === "paid" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 text-xs">Paid</Badge>
                        ) : p.status === "pending" ? (
                          <Badge variant="outline" className="text-xs">Pending</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs capitalize">{p.status}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* right sidebar */}
        <div className="space-y-6">
          {/* amount card */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <h3 className="font-semibold text-foreground">Order summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span className="font-semibold">{fmtCurrency(gross, order.currency)}</span>
                </div>
                {order.tier && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tier</span>
                      <span className="capitalize">{order.tier.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery estimate</span>
                      <span>{order.tier.deliveryDays} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revisions</span>
                      <span>{order.tier.revisionCount}</span>
                    </div>
                  </>
                )}
                {order.depositPercent != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deposit</span>
                    <span>{order.depositPercent}%</span>
                  </div>
                )}
                {order.reviewDeadlineAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Review deadline</span>
                    <span className="text-xs">{format(new Date(order.reviewDeadlineAt), "MMM d, yyyy h:mm a")}</span>
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-border/50 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Protected by Servfix Escrow</span>
              </div>
            </CardContent>
          </Card>

          {/* provider card */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold text-foreground mb-3">Service provider</h3>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {providerName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm text-foreground">{providerName}</p>
                  <p className="text-xs text-muted-foreground">Service provider</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3 gap-1"
                onClick={() => onMessage(order.id)}
              >
                <MessageSquare className="h-3.5 w-3.5" /> Message provider
              </Button>
            </CardContent>
          </Card>

          {/* actions */}
          <div className="space-y-2">
            {pendingPayment && (
              <Button
                className="w-full gap-1"
                disabled={paying}
                onClick={() => void handlePay(pendingPayment)}
              >
                <CreditCard className="h-4 w-4" />
                {paying ? "Processing..." : `Pay ${pendingPayment.stage} (${fmtCurrency(toNumber(pendingPayment.amount), pendingPayment.currency)})`}
              </Button>
            )}

            {canApprove && (
              <Button
                variant="green"
                className="w-full gap-1"
                disabled={approving}
                onClick={() => void handleApprove()}
              >
                <CheckCircle className="h-4 w-4" />
                {approving ? "Approving..." : "Approve & release funds"}
              </Button>
            )}

            {canDispute && (
              <Button
                variant="outline"
                className="w-full gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => setDisputeOpen(true)}
              >
                <AlertTriangle className="h-4 w-4" />
                Open dispute
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* dispute dialog */}
      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeaderUi>
            <DialogTitle>Open a dispute</DialogTitle>
            <DialogDescription>
              Describe the issue with this order. Our team will review and mediate.
            </DialogDescription>
          </DialogHeaderUi>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Textarea
                rows={2}
                placeholder="What went wrong?"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Details (optional)</label>
              <Textarea
                rows={3}
                placeholder="Provide additional context..."
                value={disputeDetails}
                onChange={(e) => setDisputeDetails(e.target.value)}
              />
            </div>
            {disputeError && <p className="text-sm text-destructive">{disputeError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeOpen(false)} disabled={disputeSubmitting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDisputeSubmit()}
              disabled={disputeSubmitting}
            >
              {disputeSubmitting ? "Submitting..." : "Submit dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── main page ─── */

const Orders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: orders = [], isLoading, isError, error } = useOrders();
  const { startOrderConversation, setActiveConversationId } = useMessages();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const buyerOrders = useMemo(
    () => orders.filter((o) => o.buyer?.id === user?.id),
    [orders, user?.id],
  );

  const counts = useMemo(() => ({
    all: buyerOrders.length,
    active: filterByTab(buyerOrders, "active").length,
    completed: filterByTab(buyerOrders, "completed").length,
    cancelled: filterByTab(buyerOrders, "cancelled").length,
  }), [buyerOrders]);

  const selectedOrder = useMemo(
    () => (selectedOrderId ? buyerOrders.find((o) => o.id === selectedOrderId) ?? null : null),
    [buyerOrders, selectedOrderId],
  );

  const handleMessage = async (orderId: string) => {
    try {
      const conversationId = await startOrderConversation(orderId);
      setActiveConversationId(conversationId);
      navigate("/messages");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to open conversation.");
    }
  };

  if (selectedOrder) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-8 max-w-5xl">
            <OrderDetail
              order={selectedOrder}
              onBack={() => setSelectedOrderId(null)}
              onMessage={(id) => void handleMessage(id)}
            />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">My Orders</h1>
              <p className="text-sm text-muted-foreground mt-1">Track and manage your service orders</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/browse")} className="gap-1">
              Browse services <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Tabs defaultValue="all">
            <TabsList className="mb-6">
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
              <TabsTrigger value="cancelled">Issues ({counts.cancelled})</TabsTrigger>
            </TabsList>

            {(["all", "active", "completed", "cancelled"] as BuyerTab[]).map((tab) => (
              <TabsContent key={tab} value={tab} className="space-y-3">
                {isLoading ? (
                  <div className="text-center py-16 text-muted-foreground">Loading orders...</div>
                ) : isError ? (
                  <div className="text-center py-16 text-destructive">
                    {error?.message ?? "Unable to load orders."}
                  </div>
                ) : filterByTab(buyerOrders, tab).length > 0 ? (
                  filterByTab(buyerOrders, tab).map((order) => {
                    const providerName = getDisplayName(order.provider);
                    const gross = toNumber(order.amountGross);
                    return (
                      <div
                        key={order.id}
                        className="flex items-start gap-4 p-4 border border-border/50 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        <Avatar className="h-11 w-11 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm">
                            {providerName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="font-semibold text-foreground truncate">{order.service.title}</h4>
                              <p className="text-sm text-muted-foreground">{providerName}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-primary">{fmtCurrency(gross, order.currency)}</p>
                              {order.tier && (
                                <p className="text-xs text-muted-foreground capitalize">{order.tier.name} tier</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(order.createdAt), "MMM d, yyyy")}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {formatLocation(order.service.locationCity)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            {getBuyerStatusBadge(order.status)}
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleMessage(order.id);
                                }}
                              >
                                <MessageSquare className="h-3 w-3" /> Message
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-xs"
                                onClick={() => setSelectedOrderId(order.id)}
                              >
                                Details <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-16">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No orders found</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/browse")}>
                      Browse services
                    </Button>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Orders;
