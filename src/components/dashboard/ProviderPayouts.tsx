import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchProviderPayouts } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const formatMoney = (value: number, currency: "GHS" | "USD" | "EUR") =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(value);

const ProviderPayouts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isProvider = user?.role === "provider";

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["provider-payouts"],
    queryFn: fetchProviderPayouts,
    enabled: isProvider,
  });

  const wallet = data?.wallet;
  const requests = data?.requests ?? [];
  const currency = wallet?.currency ?? "GHS";
  const available = Number(wallet?.availableBalance ?? 0);
  const pending = Number(wallet?.pendingBalance ?? 0);

  const rows = useMemo(
    () =>
      requests.map((request) => {
        const createdAt = new Date(request.createdAt);
        const dateLabel = Number.isNaN(createdAt.getTime())
          ? ""
          : createdAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
        const destination = `${request.momoNetwork ? request.momoNetwork.toUpperCase() + " · " : ""}${request.destinationMomo}`;
        return { ...request, dateLabel, destination };
      }),
    [requests],
  );

  if (!isProvider) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Payout history is available for provider accounts only.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Payout history</h2>
          <p className="text-sm text-muted-foreground">
            Track your payout requests and transfer status.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/dashboard/earnings")}>
          Request payout
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Available balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {formatMoney(available, currency)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {formatMoney(pending, currency)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading payout history...</div>
          ) : isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load payout history."}{" "}
              <button className="text-primary underline" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((request) => {
                  const statusVariant =
                    request.status === "paid"
                      ? "secondary"
                      : request.status === "failed"
                        ? "destructive"
                        : request.status === "processing"
                          ? "outline"
                          : "default";
                  return (
                    <TableRow key={request.id}>
                      <TableCell>{request.dateLabel || "-"}</TableCell>
                      <TableCell>
                        {request.currency} {Number(request.amount).toLocaleString()}
                      </TableCell>
                      <TableCell>{request.destination || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant}>{request.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {request.reference ?? "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No payout requests yet.
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

export default ProviderPayouts;
