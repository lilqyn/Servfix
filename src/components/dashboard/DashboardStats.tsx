import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Package, ShoppingCart, Star, Wallet } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useProviderServices } from "@/hooks/useProviderServices";
import { useAuth } from "@/contexts/AuthContext";
import type { ApiOrderStatus } from "@/lib/api";

const ACTIVE_STATUSES: ApiOrderStatus[] = [
  "created",
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

const DashboardStats = () => {
  const { data: orders = [] } = useOrders();
  const { data: services = [] } = useProviderServices();
  const { user } = useAuth();

  const stats = useMemo(() => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`;

    let currentMonthTotal = 0;
    let lastMonthTotal = 0;
    let activeOrders = 0;

    orders.forEach((order) => {
      if (!order.createdAt) return;
      const createdAt = new Date(order.createdAt);
      if (Number.isNaN(createdAt.getTime())) return;

      const status = order.status;
      const isRevenue = !NON_REVENUE_STATUSES.includes(status);
      const amount = toNumber(order.amountNetProvider);

      if (ACTIVE_STATUSES.includes(status)) {
        activeOrders += 1;
      }

      if (!isRevenue) {
        return;
      }

      const orderKey = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
      if (orderKey === currentKey) {
        currentMonthTotal += amount;
      } else if (orderKey === lastKey) {
        lastMonthTotal += amount;
      }
    });

    const change =
      lastMonthTotal > 0 ? ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : null;
    const changeLabel = change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
    const trend = change === null ? "up" : change >= 0 ? "up" : "down";

    const providerProfile = user?.providerProfile as
      | {
          ratingAvg?: string;
          ratingCount?: number;
        }
      | undefined;
    const ratingAvg = providerProfile?.ratingAvg ? toNumber(providerProfile.ratingAvg) : 0;
    const ratingCount = providerProfile?.ratingCount ?? 0;

    const currency = orders[0]?.currency ?? "GHS";

    return [
      {
        title: "Total Earnings",
        value: formatCurrency(currentMonthTotal, currency),
        change: changeLabel,
        trend,
        icon: Wallet,
        description: "This month",
      },
      {
        title: "Active Orders",
        value: activeOrders.toString(),
        change: "—",
        trend: "up",
        icon: ShoppingCart,
        description: "In progress",
      },
      {
        title: "Total Services",
        value: services.length.toString(),
        change: "—",
        trend: "up",
        icon: Package,
        description: "Listed",
      },
      {
        title: "Average Rating",
        value: ratingAvg > 0 ? ratingAvg.toFixed(1) : "—",
        change: "—",
        trend: "up",
        icon: Star,
        description: ratingCount > 0 ? `From ${ratingCount} reviews` : "No reviews yet",
      },
    ];
  }, [orders, services.length, user]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="border-border/50 hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div
                className={`flex items-center gap-1 text-sm font-medium ${
                  stat.trend === "up" ? "text-secondary" : "text-destructive"
                }`}
              >
                {stat.trend === "up" ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {stat.change}
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-bold text-foreground">{stat.value}</h3>
              <p className="text-sm text-muted-foreground">{stat.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DashboardStats;
