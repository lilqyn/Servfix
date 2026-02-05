import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { fetchAdminOverview } from "@/lib/api";

const OverviewCard = ({ label, value }: { label: string; value: number }) => (
  <Card className="border-border/60">
    <CardContent className="p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-2">{value}</p>
    </CardContent>
  </Card>
);

const AdminOverview = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: fetchAdminOverview,
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading overview...</div>;
  }

  if (isError) {
    return (
      <div className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Unable to load overview."}{" "}
        <button className="text-primary underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const totals = data?.totals;
  if (!totals) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Overview</h2>
        <p className="text-sm text-muted-foreground">
          Snapshot of activity across the platform.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewCard label="Total users" value={totals.users} />
        <OverviewCard label="Providers" value={totals.providers} />
        <OverviewCard label="Services" value={totals.services} />
        <OverviewCard label="Orders" value={totals.orders} />
        <OverviewCard label="Reviews" value={totals.reviews} />
        <OverviewCard label="Community posts" value={totals.posts} />
        <OverviewCard label="Reports" value={totals.reports} />
        <OverviewCard label="Disputes" value={totals.disputes} />
      </div>
    </div>
  );
};

export default AdminOverview;
