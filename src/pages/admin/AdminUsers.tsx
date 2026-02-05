import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  fetchAdminUsers,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AdminUser,
} from "@/lib/api";
import { ALL_ROLES, getRoleLabel } from "@/lib/roles";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_OPTIONS = ["active", "suspended", "deleted"] as const;

const AdminUsers = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const queryParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter !== "all" ? (statusFilter as AdminUser["status"]) : undefined,
      role: roleFilter !== "all" ? (roleFilter as AdminUser["role"]) : undefined,
    }),
    [search, statusFilter, roleFilter],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-users", queryParams],
    queryFn: () => fetchAdminUsers(queryParams),
  });

  const canUpdateRole = hasPermission(user?.role ?? null, "users.role");
  const canUpdateStatus = hasPermission(user?.role ?? null, "users.write");

  const handleStatusToggle = async (id: string, status: AdminUser["status"]) => {
    if (!canUpdateStatus) return;
    const next = status === "active" ? "suspended" : "active";
    try {
      await updateAdminUserStatus(id, next);
      toast({ title: `User ${next === "active" ? "activated" : "suspended"}.` });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update status.";
      toast({ title: message });
    }
  };

  const handleRoleChange = async (id: string, role: AdminUser["role"]) => {
    if (!canUpdateRole) return;
    try {
      await updateAdminUserRole(id, role);
      toast({ title: "Role updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update role.";
      toast({ title: message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Users</h2>
        <p className="text-sm text-muted-foreground">Manage users, roles, and account status.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Search by email, phone, username"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full md:w-64"
          />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ALL_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {getRoleLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
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
            <div className="p-6 text-sm text-muted-foreground">Loading users...</div>
          ) : isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load users."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.users.map((item) => {
                  const label =
                    item.providerProfile?.displayName ||
                    item.username ||
                    item.email ||
                    item.phone ||
                    "User";
                  const roleValue = item.role;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.email ?? item.phone ?? item.username ?? item.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canUpdateRole ? (
                          <Select
                            value={roleValue}
                            onValueChange={(value) => handleRoleChange(item.id, value as AdminUser["role"])}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {getRoleLabel(role)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-foreground">{getRoleLabel(roleValue)}</span>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{item.status}</TableCell>
                      <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        {canUpdateStatus && item.status !== "deleted" ? (
                          <Button
                            size="sm"
                            variant={item.status === "active" ? "destructive" : "outline"}
                            onClick={() => handleStatusToggle(item.id, item.status)}
                          >
                            {item.status === "active" ? "Suspend" : "Activate"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No actions</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {data?.users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No users found.
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

export default AdminUsers;
