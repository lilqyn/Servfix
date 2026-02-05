import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { fetchAdminServices, updateAdminServiceStatus } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_OPTIONS = ["draft", "published", "suspended"] as const;
type ServiceStatus = (typeof STATUS_OPTIONS)[number];

const AdminServices = () => {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const queryParams = useMemo(
    () => ({
      status: statusFilter !== "all" ? (statusFilter as (typeof STATUS_OPTIONS)[number]) : undefined,
      search: search.trim() || undefined,
    }),
    [statusFilter, search],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-services", queryParams],
    queryFn: () => fetchAdminServices(queryParams),
  });

  const canModerate = hasPermission(user?.role ?? null, "services.moderate");

  const handleStatusChange = async (id: string, status: ServiceStatus) => {
    if (!canModerate) return;
    try {
      await updateAdminServiceStatus(id, status);
      toast({ title: "Service status updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update status.";
      toast({ title: message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Services</h2>
        <p className="text-sm text-muted-foreground">Moderate and manage service listings.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Search services"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full md:w-64"
          />
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
            <div className="p-6 text-sm text-muted-foreground">Loading services...</div>
          ) : isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load services."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.services.map((service) => {
                  const providerLabel =
                    service.provider.providerProfile?.displayName ||
                    service.provider.username ||
                    service.provider.email ||
                    "Provider";
                  return (
                    <TableRow key={service.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{service.title}</div>
                        <div className="text-xs text-muted-foreground">{service.category}</div>
                      </TableCell>
                      <TableCell>{providerLabel}</TableCell>
                      <TableCell>
                        {canModerate ? (
                          <Select
                            value={service.status}
                            onValueChange={(value) =>
                              handleStatusChange(service.id, value as ServiceStatus)
                            }
                          >
                            <SelectTrigger className="w-[170px]">
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
                          <span className="capitalize text-sm">{service.status}</span>
                        )}
                      </TableCell>
                      <TableCell>{new Date(service.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  );
                })}
                {data?.services.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No services found.
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

export default AdminServices;
