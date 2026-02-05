import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, MapPin, MessageSquare, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { updateOrderStatus } from "@/lib/api";
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
  status: OrderStatus;
  escrowStatus: "held" | "released" | "pending";
  rawStatus: ApiOrderStatus;
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

const formatCurrency = (amount: number, currency: "GHS" | "USD" | "EUR") =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(amount);

const mapStatus = (status: ApiOrderStatus): OrderStatus => {
  switch (status) {
    case "created":
    case "paid_to_escrow":
      return "pending";
    case "accepted":
      return "confirmed";
    case "in_progress":
      return "in_progress";
    case "delivered":
    case "approved":
    case "released":
      return "completed";
    default:
      return "cancelled";
  }
};

const mapEscrowStatus = (status: ApiOrderStatus): Order["escrowStatus"] => {
  if (status === "released") {
    return "released";
  }
  if (["paid_to_escrow", "accepted", "in_progress", "delivered", "approved"].includes(status)) {
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

  const mappedOrders = useMemo<Order[]>(() => {
    return orders.map((order) => {
      const client = order.buyer ?? order.provider;
      const amount = toNumber(order.amountGross);

      return {
        id: order.id,
        clientName: getDisplayName(client),
        clientAvatar: "",
        service: order.service?.title ?? "Service",
        date: order.createdAt ? format(new Date(order.createdAt), "MMM d, yyyy") : "—",
        location: formatLocation(order.service?.locationCity ?? null),
        amount: formatCurrency(amount, order.currency),
        status: mapStatus(order.status),
        escrowStatus: mapEscrowStatus(order.status),
        rawStatus: order.status,
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
            : "Order marked complete.";
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update order.";
      toast.error(message);
    } finally {
      setActionState(null);
    }
  };

  const OrderCard = ({ order }: { order: Order }) => {
    const canAccept = order.rawStatus === "paid_to_escrow";
    const canDecline = ["created", "paid_to_escrow"].includes(order.rawStatus);
    const isBusy = actionState?.id === order.id;

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
          <div className="text-right">
            <p className="font-bold text-primary">{order.amount}</p>
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
            {order.status === "in_progress" && (
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
      </CardContent>
    </Card>
  );
};

export default OrdersList;
