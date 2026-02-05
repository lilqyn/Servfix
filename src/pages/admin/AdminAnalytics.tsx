import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAdminAnalytics } from "@/lib/api";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const MetricCard = ({ label, value }: { label: string; value: string | number }) => (
  <Card className="border-border/60">
    <CardContent className="p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-2">{value}</p>
    </CardContent>
  </Card>
);

const AdminAnalytics = () => {
  const [metric, setMetric] = useState("gross");
  const [range, setRange] = useState("6");
  const months = Number(range);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-analytics", months],
    queryFn: () => fetchAdminAnalytics({ months }),
  });

  const locale = data?.localization?.locale ?? "en-GH";
  const currency = data?.localization?.currency ?? "GHS";
  const timeZone = data?.localization?.timezone ?? "Africa/Accra";

  const chartData = useMemo(() => {
    if (!data?.trend?.series) return [];
    return data.trend.series.map((item) => ({
      ...item,
      gross: Number(item.gross),
      platformFee: Number(item.platformFee),
    }));
  }, [data]);

  const metricLabelMap: Record<string, string> = {
    gross: "Gross revenue",
    platformFee: "Platform fees",
    orders: "Orders",
    users: "New users",
    reviews: "Reviews",
    posts: "Community posts",
  };

  const formatNumber = (value: number) => {
    try {
      return new Intl.NumberFormat(locale).format(value);
    } catch {
      return Number(value).toLocaleString();
    }
  };

  const formatCurrency = (value: number) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: "code",
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${currency} ${Number(value).toLocaleString()}`;
    }
  };

  const formatValue = (value: number) =>
    metric === "gross" || metric === "platformFee" ? formatCurrency(value) : formatNumber(value);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading analytics...</div>;
  }

  if (isError) {
    return (
      <div className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Unable to load analytics."}{" "}
        <button className="text-primary underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Analytics</h2>
        <p className="text-sm text-muted-foreground">Platform activity and revenue overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total users" value={formatNumber(data.totals.users)} />
        <MetricCard label="Active users" value={formatNumber(data.totals.activeUsers)} />
        <MetricCard label="Suspended users" value={formatNumber(data.totals.suspendedUsers)} />
        <MetricCard label="Orders" value={formatNumber(data.totals.orders)} />
        <MetricCard label="Community posts" value={formatNumber(data.totals.posts)} />
        <MetricCard label="Reviews" value={formatNumber(data.totals.reviews)} />
        <MetricCard label="Gross revenue" value={formatCurrency(Number(data.revenue.gross))} />
        <MetricCard label="Platform fees" value={formatCurrency(Number(data.revenue.platformFee))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Trend</h3>
                <p className="text-sm text-muted-foreground">
                  {metricLabelMap[metric]} over the last {data.trend.months} months (timezone: {timeZone})
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={metric} onValueChange={setMetric}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Metric" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gross">Gross revenue</SelectItem>
                    <SelectItem value="platformFee">Platform fees</SelectItem>
                    <SelectItem value="orders">Orders</SelectItem>
                    <SelectItem value="users">New users</SelectItem>
                    <SelectItem value="reviews">Reviews</SelectItem>
                    <SelectItem value="posts">Community posts</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={range} onValueChange={setRange}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Last 6 months</SelectItem>
                    <SelectItem value="12">Last 12 months</SelectItem>
                    <SelectItem value="18">Last 18 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="analyticsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="10%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => formatValue(Number(value))}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatValue(Number(value)), metricLabelMap[metric]]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#analyticsGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-foreground">Activity mix</h3>
              <p className="text-sm text-muted-foreground">
                Monthly volume of orders, reviews, posts, and new users
              </p>
            </div>

            <div className="mt-6 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatNumber(Number(value)),
                      String(name),
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={24}
                    formatter={(value) => (
                      <span className="text-xs text-muted-foreground">{String(value)}</span>
                    )}
                  />
                  <Bar dataKey="orders" stackId="activity" fill="hsl(var(--primary))" name="Orders" />
                  <Bar dataKey="reviews" stackId="activity" fill="hsl(var(--secondary))" name="Reviews" />
                  <Bar dataKey="posts" stackId="activity" fill="hsl(var(--accent))" name="Posts" />
                  <Bar dataKey="users" stackId="activity" fill="hsl(var(--muted-foreground))" name="New users" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminAnalytics;
