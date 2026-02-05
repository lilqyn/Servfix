import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { fetchAdminOrders, updateAdminOrderStatus, type AdminOrder } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_OPTIONS: AdminOrder["status"][] = [
  "created",
  "paid_to_escrow",
  "accepted",
  "in_progress",
  "delivered",
  "approved",
  "released",
  "cancelled",
  "expired",
  "disputed",
  "refund_pending",
  "refunded",
  "chargeback",
];

const AdminOrders = () => {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const queryParams = useMemo(
    () => ({
      status: statusFilter !== "all" ? (statusFilter as AdminOrder["status"]) : undefined,
    }),
    [statusFilter],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-orders", queryParams],
    queryFn: () => fetchAdminOrders(queryParams),
  });

  const canUpdate = hasPermission(user?.role ?? null, "orders.update");

  const handleStatusChange = async (id: string, status: AdminOrder["status"]) => {
    if (!canUpdate) return;
    try {
      await updateAdminOrderStatus(id, status);
      toast({ title: "Order status updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update order.";
      toast({ title: message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Orders</h2>
        <p className="text-sm text-muted-foreground">Track and manage orders.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading orders...</div>
          ) : isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load orders."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{order.service.title}</div>
                      <div className="text-xs text-muted-foreground">{order.id}</div>
                    </TableCell>
                    <TableCell>{order.buyer.username ?? order.buyer.email ?? order.buyer.phone ?? "-"}</TableCell>
                    <TableCell>
                      {order.provider.providerProfile?.displayName ??
                        order.provider.username ??
                        order.provider.email ??
                        "-"}
                    </TableCell>
                    <TableCell>
                      {canUpdate ? (
                        <Select
                          value={order.status}
                          onValueChange={(value) => handleStatusChange(order.id, value as AdminOrder["status"])}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm capitalize">{order.status}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.currency} {Number(order.amountGross).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No orders found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOrders;
