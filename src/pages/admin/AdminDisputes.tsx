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
import { fetchAdminDisputes, updateAdminDisputeStatus, type AdminDispute } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_OPTIONS: AdminDispute["status"][] = ["open", "investigating", "resolved", "cancelled"];
const RESOLUTION_OPTIONS: Array<NonNullable<AdminDispute["resolution"]>> = [
  "refund",
  "release",
  "partial_refund",
  "deny",
];

const AdminDisputes = () => {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const queryParams = useMemo(
    () => ({
      status: statusFilter !== "all" ? (statusFilter as AdminDispute["status"]) : undefined,
    }),
    [statusFilter],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-disputes", queryParams],
    queryFn: () => fetchAdminDisputes(queryParams),
  });

  const canUpdate = hasPermission(user?.role ?? null, "orders.update");

  const handleStatusChange = async (id: string, status: AdminDispute["status"]) => {
    if (!canUpdate) return;
    try {
      await updateAdminDisputeStatus(id, { status });
      toast({ title: "Dispute status updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update dispute.";
      toast({ title: message });
    }
  };

  const handleResolutionChange = async (id: string, resolution: AdminDispute["resolution"]) => {
    if (!canUpdate || !resolution) return;
    try {
      await updateAdminDisputeStatus(id, { status: "resolved", resolution });
      toast({ title: "Dispute resolved." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update dispute.";
      toast({ title: message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Disputes</h2>
        <p className="text-sm text-muted-foreground">Review and resolve disputes.</p>
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
            <div className="p-6 text-sm text-muted-foreground">Loading disputes...</div>
          ) : isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load disputes."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Opened by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.disputes.map((dispute) => (
                  <TableRow key={dispute.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{dispute.order.id}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {dispute.order.status}
                      </div>
                    </TableCell>
                    <TableCell>
                      {dispute.openedBy.username ?? dispute.openedBy.email ?? "-"}
                    </TableCell>
                    <TableCell>
                      {canUpdate ? (
                        <Select
                          value={dispute.status}
                          onValueChange={(value) => handleStatusChange(dispute.id, value as AdminDispute["status"])}
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
                        <span className="text-sm capitalize">{dispute.status}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canUpdate ? (
                        <Select
                          value={dispute.resolution ?? ""}
                          onValueChange={(value) =>
                            handleResolutionChange(dispute.id, value as AdminDispute["resolution"])
                          }
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Set resolution" />
                          </SelectTrigger>
                          <SelectContent>
                            {RESOLUTION_OPTIONS.map((resolution) => (
                              <SelectItem key={resolution} value={resolution}>
                                {resolution}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm capitalize">{dispute.resolution ?? "-"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.disputes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No disputes found.
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

export default AdminDisputes;
