import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import {
  approveAdminPayoutRequest,
  denyAdminPayoutRequest,
  fetchAdminPayoutRequests,
  fetchAdminPayouts,
} from "@/lib/api";

const AdminPayouts = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: fetchAdminPayouts,
  });
  const {
    data: requestData,
    isLoading: isLoadingRequests,
    isError: isErrorRequests,
    error: requestError,
    refetch: refetchRequests,
  } = useQuery({
    queryKey: ["admin-payout-requests"],
    queryFn: fetchAdminPayoutRequests,
  });
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("all");

  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = (value?: string | null) =>
    Boolean(value && value.toLowerCase().includes(normalizedSearch));

  const filteredPayouts = useMemo(() => {
    if (!data?.payouts) return [];
    if (!normalizedSearch) return data.payouts;
    return data.payouts.filter((entry) => {
      const provider = entry.provider;
      const profile = provider.providerProfile;
      return (
        matchesSearch(profile?.displayName ?? "") ||
        matchesSearch(provider.username ?? "") ||
        matchesSearch(provider.email ?? "") ||
        matchesSearch(provider.phone ?? "") ||
        matchesSearch(profile?.momoNumber ?? "")
      );
    });
  }, [data?.payouts, normalizedSearch]);

  const filteredRequests = useMemo(() => {
    if (!requestData?.requests) return [];
    const now = Date.now();
    const rangeDays =
      rangeFilter === "7d" ? 7 : rangeFilter === "30d" ? 30 : rangeFilter === "90d" ? 90 : null;
    const cutoff = rangeDays ? now - rangeDays * 24 * 60 * 60 * 1000 : null;

    return requestData.requests.filter((request) => {
      if (statusFilter !== "all" && request.status !== statusFilter) {
        return false;
      }
      if (cutoff) {
        const createdAt = new Date(request.createdAt).getTime();
        if (Number.isFinite(createdAt) && createdAt < cutoff) {
          return false;
        }
      }
      if (!normalizedSearch) {
        return true;
      }
      const provider = request.provider;
      const profile = provider.providerProfile;
      return (
        matchesSearch(profile?.displayName ?? "") ||
        matchesSearch(provider.username ?? "") ||
        matchesSearch(provider.email ?? "") ||
        matchesSearch(provider.phone ?? "") ||
        matchesSearch(request.destinationMomo ?? "") ||
        matchesSearch(profile?.momoNumber ?? "")
      );
    });
  }, [requestData?.requests, normalizedSearch, rangeFilter, statusFilter]);

  const exportRequests = () => {
    if (filteredRequests.length === 0) {
      toast("No payout requests to export.");
      return;
    }
    const headers = [
      "Request ID",
      "Provider",
      "Email",
      "Phone",
      "Amount",
      "Currency",
      "Status",
      "Destination",
      "Network",
      "Reference",
      "Created At",
    ];
    const escapeValue = (value: string) => {
      const escaped = value.replace(/"/g, "\"\"");
      return `"${escaped}"`;
    };
    const rows = filteredRequests.map((request) => {
      const provider = request.provider;
      const profile = provider.providerProfile;
      const label =
        profile?.displayName || provider.username || provider.email || provider.phone || "Provider";
      const destination = request.destinationMomo ?? "";
      const network = request.momoNetwork ?? "";
      const createdAt = new Date(request.createdAt).toISOString();
      return [
        request.id,
        label,
        provider.email ?? "",
        provider.phone ?? "",
        request.amount,
        request.currency,
        request.status,
        destination,
        network,
        request.reference ?? "",
        createdAt,
      ].map((value) => escapeValue(String(value)));
    });
    const csv = [headers.map(escapeValue).join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payout-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleApprove = async (id: string) => {
    setActiveActionId(id);
    try {
      await approveAdminPayoutRequest(id);
      toast("Payout approved and sent.");
      await refetchRequests();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to approve payout.");
    } finally {
      setActiveActionId(null);
    }
  };

  const handleDeny = async (id: string) => {
    setActiveActionId(id);
    try {
      await denyAdminPayoutRequest(id);
      toast("Payout request denied.");
      await refetchRequests();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to deny payout.");
    } finally {
      setActiveActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Payouts</h2>
        <p className="text-sm text-muted-foreground">Track provider earnings and payout totals.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading payouts...</div>
          ) : isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load payouts."}{" "}
              <button className="text-primary underline" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>MoMo</TableHead>
                  <TableHead>Released</TableHead>
                  <TableHead>Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayouts.map((entry) => {
                  const provider = entry.provider;
                  const profile = provider.providerProfile;
                  const label =
                    profile?.displayName || provider.username || provider.email || provider.phone || "Provider";
                  return (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {provider.email ?? provider.phone ?? provider.username ?? provider.id}
                        </div>
                      </TableCell>
                      <TableCell>{profile?.momoNumber ?? "-"}</TableCell>
                      <TableCell>GHS {Number(entry.totals.released).toLocaleString()}</TableCell>
                      <TableCell>GHS {Number(entry.totals.pending).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
                {filteredPayouts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No payout data found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="grid gap-3 md:grid-cols-3 md:items-end md:flex-1">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Search provider</label>
            <Input
              placeholder="Name, email, phone, MoMo..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date range</label>
            <Select value={rangeFilter} onValueChange={setRangeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button variant="outline" onClick={exportRequests}>
          Export CSV
        </Button>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoadingRequests ? (
            <div className="p-6 text-sm text-muted-foreground">Loading payout requests...</div>
          ) : isErrorRequests ? (
            <div className="p-6 text-sm text-muted-foreground">
              {requestError instanceof Error ? requestError.message : "Unable to load payout requests."}{" "}
              <button className="text-primary underline" onClick={() => refetchRequests()}>
                Retry
              </button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => {
                  const provider = request.provider;
                  const profile = provider.providerProfile;
                  const label =
                    profile?.displayName || provider.username || provider.email || provider.phone || "Provider";
                  const destination = `${request.momoNetwork ? request.momoNetwork.toUpperCase() + " · " : ""}${request.destinationMomo}`;
                  const statusVariant =
                    request.status === "paid"
                      ? "secondary"
                      : request.status === "failed"
                        ? "destructive"
                        : request.status === "processing"
                          ? "outline"
                          : "default";
                  const requestedAt = new Date(request.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                  const isProcessing = activeActionId === request.id;
                  const canAct = request.status === "requested";

                  return (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {provider.email ?? provider.phone ?? provider.username ?? provider.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        {request.currency} {Number(request.amount).toLocaleString()}
                      </TableCell>
                      <TableCell>{destination}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant}>{request.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{requestedAt}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canAct || isProcessing}
                            onClick={() => void handleApprove(request.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canAct || isProcessing}
                            onClick={() => void handleDeny(request.id)}
                          >
                            Deny
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No payout requests found.
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

export default AdminPayouts;
