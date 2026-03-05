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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { fetchAdminDisputes, updateAdminDisputeStatus, type AdminDispute } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/useAuth";

const STATUS_OPTIONS: AdminDispute["status"][] = ["open", "investigating", "resolved", "cancelled"];
const RESOLUTION_OPTIONS: Array<NonNullable<AdminDispute["resolution"]>> = [
  "refund",
  "release",
  "partial_refund",
  "deny",
];

const formatDisputeDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }
  return parsed.toLocaleString();
};

const AdminDisputes = () => {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedEvidence, setSelectedEvidence] = useState<{
    url: string;
    index: number;
    total: number;
  } | null>(null);

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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Opened by</TableHead>
                    <TableHead>Case</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Resolution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.disputes.map((dispute) => {
                    const evidence = dispute.evidence ?? [];
                    return (
                      <TableRow key={dispute.id}>
                        <TableCell className="align-top">
                          <div className="font-medium text-foreground">{dispute.order.id}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {dispute.order.status}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {dispute.openedBy.username ?? dispute.openedBy.email ?? "-"}
                        </TableCell>
                        <TableCell className="min-w-[260px] max-w-[320px] align-top">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground break-words">{dispute.reason}</p>
                            {dispute.details ? (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                {dispute.details}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">No additional details.</p>
                            )}
                            <p className="text-[11px] text-muted-foreground">
                              Opened {formatDisputeDate(dispute.createdAt)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[220px] align-top">
                          {evidence.length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                {evidence.slice(0, 4).map((url, index) => (
                                  <button
                                    type="button"
                                    key={`dispute-${dispute.id}-thumb-${index}`}
                                    onClick={() =>
                                      setSelectedEvidence({
                                        url,
                                        index: index + 1,
                                        total: evidence.length,
                                      })
                                    }
                                    title={`Open evidence photo ${index + 1}`}
                                    className="rounded-md transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                  >
                                    <img
                                      src={url}
                                      alt={`Evidence ${index + 1}`}
                                      className="h-14 w-14 rounded-md border border-border/60 object-cover"
                                      loading="lazy"
                                    />
                                  </button>
                                ))}
                                {evidence.length > 4 ? (
                                  <span className="text-xs text-muted-foreground self-center">
                                    +{evidence.length - 4} more
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {evidence.map((url, index) => (
                                  <button
                                    type="button"
                                    key={`dispute-${dispute.id}-link-${index}`}
                                    onClick={() =>
                                      setSelectedEvidence({
                                        url,
                                        index: index + 1,
                                        total: evidence.length,
                                      })
                                    }
                                    className="text-xs text-primary underline-offset-2 hover:underline"
                                  >
                                    Photo {index + 1}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No evidence photos.</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          {canUpdate ? (
                            <Select
                              value={dispute.status}
                              onValueChange={(value) =>
                                handleStatusChange(dispute.id, value as AdminDispute["status"])
                              }
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
                        <TableCell className="align-top">
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
                    );
                  })}
                  {data?.disputes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No disputes found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedEvidence)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEvidence(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              Evidence photo
              {selectedEvidence ? ` ${selectedEvidence.index} of ${selectedEvidence.total}` : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedEvidence ? (
            <div className="space-y-3">
              <div className="max-h-[75vh] overflow-auto rounded-md border border-border/60 bg-muted/20 p-2">
                <img
                  src={selectedEvidence.url}
                  alt={`Dispute evidence ${selectedEvidence.index}`}
                  className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md object-contain"
                />
              </div>
              <div className="flex justify-end">
                <a
                  href={selectedEvidence.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  Open original image
                </a>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDisputes;
