import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Edit, Eye, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProviderServices } from "@/hooks/useProviderServices";
import { formatCurrencyAmount } from "@/lib/currency";
import { deleteService, updateServiceStatus } from "@/lib/api";
import { toast } from "sonner";
import type { ApiService } from "@/lib/api";

interface ServiceRow {
  id: string;
  name: string;
  category: string;
  price: string;
  apiStatus: ApiService["status"];
  status: "active" | "paused" | "draft";
  bookings: number;
  rating: number;
}

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

const formatPriceRange = (tiers: ApiService["tiers"]) => {
  if (!tiers || tiers.length === 0) {
    return "—";
  }

  const ranges = tiers
    .map((tier) => ({
      min: toNumber(tier.price),
      max: toNumber(tier.priceMax ?? tier.price),
    }))
    .filter((range) => range.min > 0);
  if (ranges.length === 0) {
    return "—";
  }

  const minPrice = Math.min(...ranges.map((range) => range.min));
  const maxPrice = Math.max(...ranges.map((range) => range.max));
  const currency = tiers[0]?.currency ?? "GHS";
  if (minPrice === maxPrice) {
    return formatCurrencyAmount(minPrice, currency, {
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    });
  }

  return `${formatCurrencyAmount(minPrice, currency, {
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  })} - ${formatCurrencyAmount(maxPrice, currency, {
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  })}`;
};

const mapStatus = (status: ApiService["status"]): ServiceRow["status"] => {
  if (status === "published") return "active";
  if (status === "suspended") return "paused";
  return "draft";
};

const ServicesList = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: services = [], isLoading, isError, error } = useProviderServices();
  const refreshServices = () => queryClient.invalidateQueries({ queryKey: ["services", "mine"] });

  const statusMutation = useMutation({
    mutationFn: ({ serviceId, status }: { serviceId: string; status: ApiService["status"] }) =>
      updateServiceStatus(serviceId, status),
    onSuccess: refreshServices,
  });

  const deleteMutation = useMutation({
    mutationFn: (serviceId: string) => deleteService(serviceId),
    onSuccess: refreshServices,
  });

  const rows: ServiceRow[] = services.map((service) => {
    const providerProfile = service.provider.providerProfile ?? null;
    const rating = providerProfile ? toNumber(providerProfile.ratingAvg) : 0;
    const bookings = service._count?.orders ?? 0;

    return {
      id: service.id,
      name: service.title,
      category: service.category,
      price: formatPriceRange(service.tiers),
      apiStatus: service.status,
      status: mapStatus(service.status),
      bookings,
      rating: Math.round(rating * 10) / 10,
    };
  });

  const handleToggleStatus = async (service: ServiceRow) => {
    const nextStatus: ApiService["status"] =
      service.apiStatus === "published" ? "suspended" : "published";
    const nextLabel = nextStatus === "published" ? "activated" : "paused";

    try {
      await statusMutation.mutateAsync({ serviceId: service.id, status: nextStatus });
      toast.success(`Service ${nextLabel}.`);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error ? mutationError.message : "Unable to update service status.";
      toast.error(message);
    }
  };

  const handleDelete = async (service: ServiceRow) => {
    if (service.bookings > 0) {
      toast.error("Cannot delete a service with existing bookings.");
      return;
    }

    const confirmed = window.confirm(`Delete "${service.name}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(service.id);
      toast.success("Service deleted.");
    } catch (mutationError) {
      const message =
        mutationError instanceof Error ? mutationError.message : "Unable to delete service.";
      toast.error(message);
    }
  };

  const getStatusBadge = (status: ServiceRow["status"]) => {
    switch (status) {
      case "active":
        return <Badge className="bg-secondary text-secondary-foreground">Active</Badge>;
      case "paused":
        return <Badge variant="secondary">Paused</Badge>;
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">My Services</CardTitle>
        <Button 
          variant="gold" 
          size="sm" 
          className="gap-2"
          onClick={() => navigate("/dashboard/services/new")}
        >
          <Plus className="h-4 w-4" />
          Add Service
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price Range</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Bookings</TableHead>
              <TableHead className="text-center">Rating</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Loading services...
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-destructive">
                  {error?.message ?? "Unable to load services."}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No services yet. Create your first listing.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && rows.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>{service.category}</TableCell>
                <TableCell>{service.price}</TableCell>
                <TableCell>{getStatusBadge(service.status)}</TableCell>
                <TableCell className="text-center">{service.bookings}</TableCell>
                <TableCell className="text-center">
                  {service.rating > 0 ? (
                    <span className="flex items-center justify-center gap-1">
                      <span className="text-primary">★</span>
                      {service.rating}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => navigate(`/service/${service.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2"
                        onClick={() => navigate(`/dashboard/services/${service.id}/edit`)}
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2"
                        disabled={statusMutation.isPending}
                        onClick={() => {
                          void handleToggleStatus(service);
                        }}
                      >
                        {service.status === "active" ? (
                          <>
                            <ToggleLeft className="h-4 w-4" />
                            Pause
                          </>
                        ) : (
                          <>
                            <ToggleRight className="h-4 w-4" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          void handleDelete(service);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default ServicesList;
