import { useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowUpRight, Wallet, Lock, Clock, Download } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useOrders } from "@/hooks/useOrders";
import { useQuery } from "@tanstack/react-query";
import { fetchProviderPayouts, requestProviderPayout } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { ApiOrderStatus, ApiOrderUser } from "@/lib/api";

const IN_ESCROW_STATUSES: ApiOrderStatus[] = [
  "paid_to_escrow",
  "accepted",
  "in_progress",
  "delivered",
  "approved",
];

const NON_REVENUE_STATUSES: ApiOrderStatus[] = [
  "cancelled",
  "expired",
  "disputed",
  "refund_pending",
  "refunded",
  "chargeback",
];

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

const getDisplayName = (user?: ApiOrderUser | null) => {
  if (!user) return "Customer";
  const profile = user.providerProfile ?? undefined;
  if (profile?.displayName) return profile.displayName;
  if (user.username) return `@${user.username}`;
  if (user.email) return user.email;
  if (user.phone) return user.phone;
  return "Customer";
};

const EarningsOverview = () => {
  const { data: orders = [] } = useOrders();
  const { user } = useAuth();
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const { data: payoutData, refetch: refetchPayouts } = useQuery({
    queryKey: ["provider-payouts"],
    queryFn: fetchProviderPayouts,
    enabled: user?.role === "provider",
  });

  const derived = useMemo(() => {
    const currency = orders[0]?.currency ?? "GHS";
    const now = new Date();
    const months = Array.from({ length: 7 }, (_, index) => {
      const date = subMonths(now, 6 - index);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: format(date, "MMM"),
      };
    });

    const totals = new Map<string, number>();
    let availableBalance = 0;
    let inEscrow = 0;
    let pendingClearance = 0;

    orders.forEach((order) => {
      if (!order.createdAt) return;
      const createdAt = new Date(order.createdAt);
      if (Number.isNaN(createdAt.getTime())) return;

      const amount = toNumber(order.amountNetProvider);
      const status = order.status;
      const isRevenue = !NON_REVENUE_STATUSES.includes(status);

      if (status === "released") {
        availableBalance += amount;
      } else if (IN_ESCROW_STATUSES.includes(status)) {
        inEscrow += amount;
      } else if (status === "created" || status === "refund_pending") {
        pendingClearance += amount;
      }

      if (!isRevenue) return;
      const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
      totals.set(key, (totals.get(key) ?? 0) + amount);
    });

    const monthlyData = months.map((month) => ({
      month: month.label,
      earnings: totals.get(month.key) ?? 0,
    }));

    const currentMonthEarnings = monthlyData[monthlyData.length - 1]?.earnings ?? 0;
    const goal = Math.max(currentMonthEarnings * 1.2, 1000);
    const progress = goal > 0 ? Math.min((currentMonthEarnings / goal) * 100, 100) : 0;

    const pendingPayments = orders
      .filter((order) => IN_ESCROW_STATUSES.includes(order.status))
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 3)
      .map((order) => ({
        id: order.id,
        client: getDisplayName(order.buyer ?? order.provider),
        service: order.service?.title ?? "Service",
        amount: formatCurrency(toNumber(order.amountNetProvider), order.currency),
        releaseDate:
          order.status === "approved" ? "Pending release" : "After completion",
      }));

    return {
      currency,
      monthlyData,
      availableBalance,
      inEscrow,
      pendingClearance,
      currentMonthEarnings,
      goal,
      progress,
      pendingPayments,
    };
  }, [orders]);

  const providerProfile = (user?.providerProfile ?? {}) as {
    momoNumber?: string | null;
    momoNetwork?: string | null;
  };
  const momoNumber = providerProfile.momoNumber ?? "";
  const momoNetwork = providerProfile.momoNetwork ?? "";
  const hasPayoutDestination = Boolean(momoNumber && momoNetwork);

  const walletAvailable = payoutData?.wallet
    ? toNumber(payoutData.wallet.availableBalance)
    : derived.availableBalance;
  const walletPending = payoutData?.wallet
    ? toNumber(payoutData.wallet.pendingBalance)
    : derived.inEscrow;
  const displayCurrency = payoutData?.wallet?.currency ?? derived.currency;

  const handleRequestPayout = async () => {
    const amountValue = Number(payoutAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast("Enter a valid payout amount.");
      return;
    }
    if (amountValue > walletAvailable) {
      toast("Amount exceeds available balance.");
      return;
    }
    try {
      await requestProviderPayout(amountValue);
      toast("Payout request submitted.");
      setPayoutAmount("");
      setPayoutOpen(false);
      await refetchPayouts();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to request payout.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Chart */}
      <Card className="lg:col-span-2 border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Earnings Overview</CardTitle>
            <p className="text-sm text-muted-foreground">Last 7 months</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={derived.monthlyData}>
                <defs>
                  <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="month" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => `${derived.currency} ${Math.round(value / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [
                    formatCurrency(Number(value), derived.currency),
                    "Earnings",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="earnings"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorEarnings)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Earnings Breakdown */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Available Balance */}
          <div className="p-4 rounded-lg bg-gradient-gold/10 border border-primary/20">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Available Balance
            </div>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(walletAvailable, displayCurrency)}
            </p>
            <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="gold"
                  size="sm"
                  className="w-full mt-3 gap-2"
                  disabled={!hasPayoutDestination || walletAvailable <= 0}
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Request payout
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request payout</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg border border-border/50 bg-muted/40 p-3 text-sm">
                    <div className="text-xs text-muted-foreground">Destination</div>
                    <div className="font-medium text-foreground">
                      {hasPayoutDestination
                        ? `${momoNetwork.toUpperCase()} · ${momoNumber}`
                        : "Set your MoMo details in Settings"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payout-amount">Amount ({displayCurrency})</Label>
                    <Input
                      id="payout-amount"
                      type="number"
                      min="1"
                      value={payoutAmount}
                      onChange={(event) => setPayoutAmount(event.target.value)}
                      placeholder="Enter amount"
                    />
                    <p className="text-xs text-muted-foreground">
                      Available: {formatCurrency(walletAvailable, displayCurrency)}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPayoutOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void handleRequestPayout()}
                    disabled={!hasPayoutDestination || walletAvailable <= 0}
                  >
                    Submit request
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* In Escrow */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Lock className="h-4 w-4" />
              In Escrow
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(walletPending, displayCurrency)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Released after service completion
            </p>
          </div>

          {/* Pending */}
          <div className="p-4 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              Pending Clearance
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(derived.pendingClearance, derived.currency)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Processing time: 2-3 days</p>
          </div>

          {/* Monthly Goal */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Monthly Goal</span>
              <span className="text-sm text-muted-foreground">
                {formatCurrency(derived.currentMonthEarnings, derived.currency)} /{" "}
                {formatCurrency(derived.goal, derived.currency)}
              </span>
            </div>
            <Progress value={derived.progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(derived.progress)}% of goal reached
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pending Payments */}
      <Card className="lg:col-span-3 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Pending Escrow Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {derived.pendingPayments.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No pending escrow payments.
            </div>
          ) : (
            <div className="space-y-3">
              {derived.pendingPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 border border-border/50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{payment.client}</p>
                    <p className="text-sm text-muted-foreground">{payment.service}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">{payment.amount}</p>
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="h-3 w-3" />
                      {payment.releaseDate}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EarningsOverview;
