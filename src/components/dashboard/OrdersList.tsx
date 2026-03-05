import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, MapPin, MessageSquare, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { requestOrderRelease, updateOrderStatus } from "@/lib/api";
import { formatCurrencyAmount, type CurrencyCode } from "@/lib/currency";
import type { ApiOrderStatus, ApiOrderUser } from "@/lib/api";
import { useMessages } from "@/contexts/MessagesContext";
import { toast } from "sonner";

type OrderStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";

interface Order {
  id: string;
  clientName: string;
  clientAvatar: string;
  service: string;
  date: string;
  location: string;
  amount: string;
  gross: number;
  fee: number;
  tax: number;
  net: number;
  currency: "GHS" | "USD" | "EUR";
  status: OrderStatus;
  escrowStatus: "held" | "released" | "pending";
  rawStatus: ApiOrderStatus;
  amountPaidNet: number;
  amountReleasedNet: number;
  depositPercent?: number | null;
}

const formatLocation = (location?: string | null) => {
  if (!location) return "Ghana";
  if (location.toLowerCase().includes("ghana")) return location;
  return `${location}, Ghana`;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatCurrency = (amount: number, currency: CurrencyCode) =>
  formatCurrencyAmount(amount, currency, {
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  });

const mapStatus = (status: ApiOrderStatus): OrderStatus => {
  switch (status) {
    case "created":
    case "paid_to_escrow":
      return "pending";
    case "accepted":
      return "confirmed";
    case "in_progress":
    case "delivery_submitted":
    case "delivered":
    case "dispute_open":
      return "in_progress";
    case "release_approved":
    case "approved":
    case "released":
    case "disbursed":
      return "completed";
    default:
      return "cancelled";
  }
};

const mapEscrowStatus = (status: ApiOrderStatus): Order["escrowStatus"] => {
  if (["release_approved", "released", "disbursed"].includes(status)) {
    return "released";
  }
  if (
    ["paid_to_escrow", "accepted", "in_progress", "delivery_submitted", "delivered", "dispute_open", "approved"].includes(
      status,
    )
  ) {
    return "held";
  }
  return "pending";
};

const getDisplayName = (user?: ApiOrderUser | null) => {
  if (!user) return "Customer";
  const profile = user.providerProfile ?? undefined;
  if (profile?.displayName) return profile.displayName;
  if (user.username) return `@${user.username}`;
  if (user.email) return user.email;
  if (user.phone) return user.phone;
  return "Customer";
};

const OrdersList = () => {
  const { data: orders = [], isLoading, isError, error } = useOrders();
  const { startOrderConversation, setActiveConversationId } = useMessages();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionState, setActionState] = useState<{ id: string; action: "accepted" | "cancelled" | "delivered" } | null>(null);
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [releaseOrder, setReleaseOrder] = useState<Order | null>(null);
  const [releasePercent, setReleasePercent] = useState("20");
  const [releaseReason, setReleaseReason] = useState("");
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);

  const mappedOrders = useMemo<Order[]>(() => {
    return orders.map((order) => {
      const client = order.buyer ?? order.provider;
      const gross = toNumber(order.amountGross);
      const fee = toNumber(order.platformFee);
      const tax = toNumber(order.taxAmount);
      const net = toNumber(order.amountNetProvider);
      const amountPaidNet = toNumber(order.amountPaidNet ?? order.amountNetProvider);
      const amountReleasedNet = toNumber(order.amountReleasedNet ?? 0);

      return {
        id: order.id,
        clientName: getDisplayName(client),
        clientAvatar: "",
        service: order.service?.title ?? "Service",
        date: order.createdAt ? format(new Date(order.createdAt), "MMM d, yyyy") : "-",
        location: formatLocation(order.service?.locationCity ?? null),
        amount: formatCurrency(gross, order.currency),
        gross,
        fee,
        tax,
        net,
        currency: order.currency,
        status: mapStatus(order.status),
        escrowStatus: mapEscrowStatus(order.status),
        rawStatus: order.status,
        amountPaidNet,
        amountReleasedNet,
        depositPercent: order.depositPercent ?? null,
      };
    });
  }, [orders]);

  const counts = useMemo(() => {
    return {
      all: mappedOrders.length,
      pending: mappedOrders.filter((order) => order.status === "pending" || order.status === "confirmed").length,
      inProgress: mappedOrders.filter((order) => order.status === "in_progress").length,
      completed: mappedOrders.filter((order) => order.status === "completed").length,
    };
  }, [mappedOrders]);

  const getStatusBadge = (status: Order["status"]) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case "confirmed":
        return (
          <Badge className="bg-accent text-accent-foreground gap-1">
            <CheckCircle className="h-3 w-3" />
            Confirmed
          </Badge>
        );
      case "in_progress":
        return (
          <Badge className="bg-primary text-primary-foreground gap-1">
            <Clock className="h-3 w-3" />
            In Progress
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-secondary text-secondary-foreground gap-1">
            <CheckCircle className="h-3 w-3" />
            Completed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Cancelled
          </Badge>
        );
    }
  };

  const getEscrowBadge = (status: Order["escrowStatus"]) => {
    switch (status) {
      case "held":
        return <Badge variant="secondary" className="text-xs">In Escrow</Badge>;
      case "released":
        return <Badge className="bg-secondary/20 text-secondary text-xs">Released</Badge>;
      case "pending":
        return <Badge variant="outline" className="text-xs">Awaiting Payment</Badge>;
    }
  };

  const filterOrders = (status: string) => {
    if (status === "all") return mappedOrders;
    if (status === "pending") {
      return mappedOrders.filter((order) => order.status === "pending" || order.status === "confirmed");
    }
    return mappedOrders.filter((order) => order.status === status);
  };

  const handleMessage = async (orderId: string) => {
    try {
      const conversationId = await startOrderConversation(orderId);
      setActiveConversationId(conversationId);
      navigate("/messages");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to open conversation.";
      toast.error(message);
    }
  };

  const handleStatusUpdate = async (orderId: string, status: "accepted" | "cancelled" | "delivered") => {
    setActionState({ id: orderId, action: status });
    try {
      await updateOrderStatus(orderId, status);
      const message =
        status === "accepted"
          ? "Order accepted."
          : status === "cancelled"
            ? "Order declined."
            : "Order marked complete and sent for buyer review.";
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update order.";
      toast.error(message);
    } finally {
      setActionState(null);
    }
  };

  const handleReleaseRequest = (order: Order) => {
    setReleaseOrder(order);
    setReleasePercent("20");
    setReleaseReason("");
    setReleaseError(null);
    setReleaseDialogOpen(true);
  };

  const handleReleaseSubmit = async () => {
    if (!releaseOrder) {
      return;
    }
    const percent = Number(releasePercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 20) {
      setReleaseError("Enter a valid percent between 1 and 20.");
      return;
    }
    if (releaseReason.trim().length < 5) {
      setReleaseError("Reason is required (min 5 characters).");
      return;
    }

    setReleaseSubmitting(true);
    setReleaseError(null);
    try {
      await requestOrderRelease(releaseOrder.id, { percent, note: releaseReason.trim() });
      toast.success("Earnings release request sent to admin.");
      setReleaseDialogOpen(false);
      setReleaseOrder(null);
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to request release.";
      setReleaseError(message);
    } finally {
      setReleaseSubmitting(false);
    }
  };

  const OrderCard = ({ order }: { order: Order }) => {
    const canAccept = order.rawStatus === "paid_to_escrow";
    const canDecline = ["created", "paid_to_escrow"].includes(order.rawStatus);
    const isBusy = actionState?.id === order.id;
    const feePercent =
      order.gross > 0 ? Math.round((order.fee / order.gross) * 1000) / 10 : null;
    const canRequestRelease =
      order.amountPaidNet > order.amountReleasedNet &&
      ["paid_to_escrow", "accepted", "in_progress", "delivery_submitted", "delivered"].includes(order.rawStatus);

    return (
    <div className="flex items-start gap-4 p-4 border border-border/50 rounded-lg hover:bg-muted/50 transition-colors">
      <Avatar className="h-12 w-12">
        <AvatarImage src={order.clientAvatar} />
        <AvatarFallback className="bg-primary/10 text-primary">
          {order.clientName.split(" ").map((n) => n[0]).join("")}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold text-foreground">{order.clientName}</h4>
            <p className="text-sm text-muted-foreground truncate">{order.service}</p>
          </div>
          <div className="text-right space-y-1">
            <p className="font-bold text-primary">{order.amount}</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>
                SERVFIX fee{feePercent !== null ? ` (${feePercent}%)` : ""}:{" "}
                {formatCurrency(order.fee, order.currency)}
              </div>
              {order.tax > 0 && (
                <div>Tax on fee: {formatCurrency(order.tax, order.currency)}</div>
              )}
              <div className="font-semibold text-foreground">
                You earn: {formatCurrency(order.net, order.currency)}
              </div>
            </div>
            {getEscrowBadge(order.escrowStatus)}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {order.date}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {order.location}
          </span>
        </div>
        <div className="flex items-center justify-between mt-3">
          {getStatusBadge(order.status)}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => handleMessage(order.id)}
            >
              <MessageSquare className="h-3 w-3" />
              Message
            </Button>
            {canRequestRelease && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReleaseRequest(order)}
              >
                Request Earnings Release
              </Button>
            )}
            {(canAccept || canDecline) && (
              <>
                {canDecline && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleStatusUpdate(order.id, "cancelled")}
                  >
                    {isBusy && actionState?.action === "cancelled" ? "Declining..." : "Decline"}
                  </Button>
                )}
                {canAccept && (
                  <Button
                    variant="gold"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleStatusUpdate(order.id, "accepted")}
                  >
                    {isBusy && actionState?.action === "accepted" ? "Accepting..." : "Accept"}
                  </Button>
                )}
              </>
            )}
            {order.rawStatus === "in_progress" && (
              <Button
                variant="green"
                size="sm"
                disabled={isBusy}
                onClick={() => handleStatusUpdate(order.id, "delivered")}
              >
                {isBusy && actionState?.action === "delivered" ? "Completing..." : "Mark Complete"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
    );
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Orders</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress ({counts.inProgress})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
          </TabsList>

          {["all", "pending", "in_progress", "completed"].map((tab) => (
            <TabsContent key={tab} value={tab} className="space-y-3">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
              ) : isError ? (
                <div className="text-center py-8 text-destructive">
                  {error?.message ?? "Unable to load orders."}
                </div>
              ) : filterOrders(tab).length > 0 ? (
                filterOrders(tab).map((order) => <OrderCard key={order.id} order={order} />)
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No orders found
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
        <Dialog
          open={releaseDialogOpen}
          onOpenChange={(open) => {
            setReleaseDialogOpen(open);
            if (!open) {
              setReleaseOrder(null);
              setReleaseError(null);
              setReleaseSubmitting(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeaderUi>
              <DialogTitle>Request earnings release</DialogTitle>
              <DialogDescription>
                Request up to 20% total of the escrow for this order. Admin will review the request.
              </DialogDescription>
            </DialogHeaderUi>
            <div className="space-y-4">
              {releaseOrder && (
                <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center justify-between">
                    <span>Paid to escrow</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(releaseOrder.amountPaidNet, releaseOrder.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Already released</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(releaseOrder.amountReleasedNet, releaseOrder.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Remaining escrow</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(
                        Math.max(0, releaseOrder.amountPaidNet - releaseOrder.amountReleasedNet),
                        releaseOrder.currency,
                      )}
                    </span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="release-percent" className="text-sm font-medium text-foreground">
                  Percent to request (1-20%)
                </label>
                <Input
                  id="release-percent"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  step={1}
                  value={releasePercent}
                  onChange={(event) => setReleasePercent(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="release-reason" className="text-sm font-medium text-foreground">
                  Reason
                </label>
                <Textarea
                  id="release-reason"
                  rows={3}
                  placeholder="Briefly explain why you need the early release."
                  value={releaseReason}
                  onChange={(event) => setReleaseReason(event.target.value)}
                />
              </div>
              {releaseError && (
                <p className="text-sm text-destructive">{releaseError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReleaseDialogOpen(false)}
                disabled={releaseSubmitting}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleReleaseSubmit} disabled={releaseSubmitting}>
                {releaseSubmitting ? "Sending..." : "Send Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default OrdersList;

