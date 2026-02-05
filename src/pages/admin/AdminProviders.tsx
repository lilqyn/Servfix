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
import { fetchAdminProviders, updateAdminProviderVerification } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";

const VERIFICATION_OPTIONS = ["unverified", "pending", "verified", "rejected"] as const;
type VerificationStatus = (typeof VERIFICATION_OPTIONS)[number];

const AdminProviders = () => {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const queryParams = useMemo(
    () => ({
      verificationStatus:
        statusFilter !== "all" ? (statusFilter as (typeof VERIFICATION_OPTIONS)[number]) : undefined,
    }),
    [statusFilter],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-providers", queryParams],
    queryFn: () => fetchAdminProviders(queryParams),
  });

  const canVerify = hasPermission(user?.role ?? null, "providers.verify");

  const handleVerificationChange = async (id: string, status: VerificationStatus) => {
    if (!canVerify) return;
    try {
      await updateAdminProviderVerification(id, status);
      toast({ title: "Verification status updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update status.";
      toast({ title: message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Providers</h2>
        <p className="text-sm text-muted-foreground">Verify providers and review their profiles.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Verification status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {VERIFICATION_OPTIONS.map((status) => (
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
            <div className="p-6 text-sm text-muted-foreground">Loading providers...</div>
          ) : isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load providers."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>MoMo</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.providers.map((provider) => {
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
                      <TableCell className="capitalize">
                        {canVerify ? (
                          <Select
                            value={profile?.verificationStatus ?? "unverified"}
                            onValueChange={(value) =>
                              handleVerificationChange(provider.id, value as VerificationStatus)
                            }
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VERIFICATION_OPTIONS.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm">{profile?.verificationStatus ?? "unverified"}</span>
                        )}
                      </TableCell>
                      <TableCell>{profile?.momoNumber ?? "-"}</TableCell>
                      <TableCell>{new Date(provider.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  );
                })}
                {data?.providers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No providers found.
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

export default AdminProviders;
