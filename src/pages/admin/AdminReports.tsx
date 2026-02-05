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
import { fetchAdminReports, updateAdminReportStatus, type AdminReport } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_OPTIONS: AdminReport["status"][] = ["open", "resolved", "dismissed"];

const AdminReports = () => {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const queryParams = useMemo(
    () => ({
      status: statusFilter !== "all" ? (statusFilter as AdminReport["status"]) : undefined,
    }),
    [statusFilter],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-reports", queryParams],
    queryFn: () => fetchAdminReports(queryParams),
  });

  const canUpdate = hasPermission(user?.role ?? null, "reports.update");

  const handleStatusChange = async (id: string, status: AdminReport["status"]) => {
    if (!canUpdate) return;
    try {
      await updateAdminReportStatus(id, status);
      toast({ title: "Report updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update report.";
      toast({ title: message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Reports</h2>
        <p className="text-sm text-muted-foreground">Review reports and resolve issues.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
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
            <div className="p-6 text-sm text-muted-foreground">Loading reports...</div>
          ) : isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load reports."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <div className="font-medium text-foreground capitalize">{report.targetType.replace("_", " ")}</div>
                      <div className="text-xs text-muted-foreground">{report.reason}</div>
                    </TableCell>
                    <TableCell>
                      {report.reporter?.username ?? report.reporter?.email ?? report.reporter?.phone ?? "-"}
                    </TableCell>
                    <TableCell>
                      {canUpdate ? (
                        <Select
                          value={report.status}
                          onValueChange={(value) => handleStatusChange(report.id, value as AdminReport["status"])}
                        >
                          <SelectTrigger className="w-[180px]">
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
                        <span className="capitalize text-sm">{report.status}</span>
                      )}
                    </TableCell>
                    <TableCell>{new Date(report.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {data?.reports.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No reports found.
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

export default AdminReports;
