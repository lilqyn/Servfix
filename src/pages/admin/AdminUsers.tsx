import { useEffect, useMemo, useState } from "react";
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
  approveAdminAccountDeletionRequest,
  createAdminStaffInvitation,
  deleteAdminStaffUser,
  fetchAdminAccountDeletionRequests,
  fetchAdminStaffInvitations,
  fetchAdminUsers,
  rejectAdminAccountDeletionRequest,
  revokeAdminStaffInvitation,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AdminAccountDeletionRequest,
  type AdminStaffInvitation,
  type AdminUser,
} from "@/lib/api";
import {
  ADMIN_ROLES,
  ALL_ROLES,
  canAssignRole,
  canManageRole,
  getRoleLabel,
  type UserRole,
} from "@/lib/roles";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/useAuth";

const STATUS_OPTIONS = ["active", "suspended", "deleted"] as const;
const FALLBACK_INVITABLE_ROLES = ADMIN_ROLES;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const formatInvitationStatus = (status: AdminStaffInvitation["status"]) => {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "revoked":
      return "Revoked";
    case "expired":
      return "Expired";
    default:
      return status;
  }
};

const formatDeletionRequestStatus = (status: AdminAccountDeletionRequest["status"]) => {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
};

const AdminUsers = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("admin");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [reviewingDeletionRequestId, setReviewingDeletionRequestId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

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

  const {
    data: invitationData,
    isLoading: isInvitationsLoading,
    isError: isInvitationsError,
    error: invitationsError,
    refetch: refetchInvitations,
  } = useQuery({
    queryKey: ["admin-staff-invitations"],
    queryFn: () => fetchAdminStaffInvitations({ limit: 100 }),
  });

  const {
    data: deletionRequestData,
    isLoading: isDeletionRequestsLoading,
    isError: isDeletionRequestsError,
    error: deletionRequestsError,
    refetch: refetchDeletionRequests,
  } = useQuery({
    queryKey: ["admin-account-deletion-requests"],
    queryFn: () => fetchAdminAccountDeletionRequests({ status: "pending", limit: 100 }),
  });

  const actorRole = user?.role ?? null;
  const assignableRoles = actorRole
    ? ALL_ROLES.filter((role) => canAssignRole(actorRole, role))
    : [];
  const invitableRoles = invitationData?.invitableRoles?.length
    ? invitationData.invitableRoles
    : FALLBACK_INVITABLE_ROLES.filter((role) => (actorRole ? canAssignRole(actorRole, role) : false));

  useEffect(() => {
    if (invitableRoles.length === 0) {
      return;
    }
    if (!invitableRoles.includes(inviteRole)) {
      setInviteRole(invitableRoles[0]);
    }
  }, [inviteRole, invitableRoles]);

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
    if (!canUpdateRole || !actorRole || !canAssignRole(actorRole, role)) return;
    try {
      await updateAdminUserRole(id, role);
      toast({ title: "Role updated." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update role.";
      toast({ title: message });
    }
  };

  const canDeleteStaffAccount = (item: AdminUser) => {
    if (!canUpdateStatus) return false;
    if (!actorRole) return false;
    if (item.id === user?.id) return false;
    if (item.status === "deleted") return false;
    if (!canManageRole(actorRole, item.role)) return false;
    if (item.role === "buyer" || item.role === "provider" || item.role === "super_admin") {
      return false;
    }
    return true;
  };

  const handleDeleteStaffAccount = async (item: AdminUser) => {
    if (!canDeleteStaffAccount(item)) return;
    const label = item.username || item.email || item.phone || item.id;
    const confirmed = window.confirm(
      `Delete staff account "${label}"?\n\nThis immediately revokes access and cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingUserId(item.id);
    try {
      await deleteAdminStaffUser(item.id);
      toast({ title: "Staff account deleted." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete staff account.";
      toast({ title: message });
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleCreateInvite = async () => {
    if (!canUpdateRole || !actorRole || !canAssignRole(actorRole, inviteRole)) return;
    const email = inviteEmail.trim().toLowerCase();

    if (!email) {
      toast({ title: "Email is required." });
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      toast({ title: "Enter a valid email address." });
      return;
    }

    setIsSendingInvite(true);
    try {
      await createAdminStaffInvitation({ email, role: inviteRole });
      setInviteEmail("");
      toast({ title: "Invitation sent." });
      await refetchInvitations();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to send invitation.";
      toast({ title: message });
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    if (!canUpdateRole) return;
    setRevokingInvitationId(id);
    try {
      await revokeAdminStaffInvitation(id);
      toast({ title: "Invitation revoked." });
      await refetchInvitations();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to revoke invitation.";
      toast({ title: message });
    } finally {
      setRevokingInvitationId(null);
    }
  };

  const handleApproveDeletionRequest = async (id: string) => {
    if (!canUpdateStatus) return;
    setReviewingDeletionRequestId(id);
    try {
      await approveAdminAccountDeletionRequest(id);
      toast({ title: "Deletion request approved and account deleted." });
      await refetchDeletionRequests();
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to approve deletion request.";
      toast({ title: message });
    } finally {
      setReviewingDeletionRequestId(null);
    }
  };

  const handleRejectDeletionRequest = async (id: string) => {
    if (!canUpdateStatus) return;
    setReviewingDeletionRequestId(id);
    try {
      await rejectAdminAccountDeletionRequest(id);
      toast({ title: "Deletion request rejected." });
      await refetchDeletionRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reject deletion request.";
      toast({ title: message });
    } finally {
      setReviewingDeletionRequestId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Users</h2>
        <p className="text-sm text-muted-foreground">Manage users, roles, and account status.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Staff invitations</h3>
              <p className="text-sm text-muted-foreground">
                Invite staff by email and assign their role before first login.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void refetchInvitations();
              }}
            >
              Refresh invites
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Input
              placeholder="staff@company.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="w-full md:w-72"
              disabled={!canUpdateRole || isSendingInvite}
            />
            <Select
              value={inviteRole}
              onValueChange={(value) => setInviteRole(value as UserRole)}
              disabled={!canUpdateRole || isSendingInvite || invitableRoles.length === 0}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Staff role" />
              </SelectTrigger>
              <SelectContent>
                {invitableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {getRoleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                void handleCreateInvite();
              }}
              disabled={!canUpdateRole || isSendingInvite || invitableRoles.length === 0}
            >
              {isSendingInvite ? "Sending..." : "Send invite"}
            </Button>
          </div>

          {!canUpdateRole && (
            <p className="text-xs text-muted-foreground">You do not have permission to send invitations.</p>
          )}

          <div className="border border-border/60 rounded-lg">
            {isInvitationsLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading invitations...</div>
            ) : isInvitationsError ? (
              <div className="p-4 text-sm text-muted-foreground">
                {invitationsError instanceof Error ? invitationsError.message : "Unable to load invitations."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitationData?.invitations.map((invitation) => {
                    const inviterLabel =
                      invitation.invitedBy.username ||
                      invitation.invitedBy.email ||
                      invitation.invitedBy.id;
                    const canRevoke =
                      canUpdateRole &&
                      invitation.status === "pending" &&
                      Boolean(actorRole && canAssignRole(actorRole, invitation.role)) &&
                      revokingInvitationId !== invitation.id;
                    return (
                      <TableRow key={invitation.id}>
                        <TableCell>
                          <div className="font-medium text-foreground">{invitation.email}</div>
                          <div className="text-xs text-muted-foreground">By {inviterLabel}</div>
                        </TableCell>
                        <TableCell>{getRoleLabel(invitation.role)}</TableCell>
                        <TableCell>{formatInvitationStatus(invitation.status)}</TableCell>
                        <TableCell>{new Date(invitation.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{new Date(invitation.expiresAt).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {canRevoke ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                void handleRevokeInvite(invitation.id);
                              }}
                            >
                              Revoke
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {revokingInvitationId === invitation.id ? "Revoking..." : "No actions"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {invitationData?.invitations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No staff invitations yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Provider deletion requests</h3>
              <p className="text-sm text-muted-foreground">
                Review provider account deletion requests and approve only if eligible.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void refetchDeletionRequests();
              }}
            >
              Refresh requests
            </Button>
          </div>

          <div className="border border-border/60 rounded-lg">
            {isDeletionRequestsLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading deletion requests...</div>
            ) : isDeletionRequestsError ? (
              <div className="p-4 text-sm text-muted-foreground">
                {deletionRequestsError instanceof Error
                  ? deletionRequestsError.message
                  : "Unable to load deletion requests."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Eligibility</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deletionRequestData?.requests.map((request) => {
                    const label =
                      request.user.providerProfile?.displayName ||
                      request.user.username ||
                      request.user.email ||
                      request.user.phone ||
                      request.user.id;
                    const reviewing = reviewingDeletionRequestId === request.id;
                    const canAct = canUpdateStatus && request.status === "pending" && !reviewing;
                    const eligibility = request.eligibility;
                    const eligibilityLabel =
                      request.user.role === "provider"
                        ? eligibility?.eligible
                          ? "Eligible"
                          : eligibility?.reasons?.[0] ?? "Needs review"
                        : "N/A";

                    return (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="font-medium text-foreground">{label}</div>
                          <div className="text-xs text-muted-foreground">
                            {request.user.email ?? request.user.phone ?? request.user.id}
                          </div>
                          {request.reason && (
                            <div className="text-xs text-muted-foreground mt-1">Reason: {request.reason}</div>
                          )}
                        </TableCell>
                        <TableCell>{new Date(request.requestedAt).toLocaleString()}</TableCell>
                        <TableCell>{formatDeletionRequestStatus(request.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {eligibilityLabel}
                        </TableCell>
                        <TableCell className="text-right">
                          {canAct ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  void handleRejectDeletionRequest(request.id);
                                }}
                              >
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  void handleApproveDeletionRequest(request.id);
                                }}
                              >
                                Approve
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {reviewing ? "Saving..." : "No actions"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {deletionRequestData?.requests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No pending provider deletion requests.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

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
          <Button
            variant="outline"
            onClick={() => {
              void refetch();
              void refetchInvitations();
              void refetchDeletionRequests();
            }}
          >
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
                  const deleting = deletingUserId === item.id;
                  const canManageUser = Boolean(actorRole && canManageRole(actorRole, item.role));
                  const canEditRole = canUpdateRole && canManageUser;
                  const canDeleteStaff = canDeleteStaffAccount(item);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.email ?? item.phone ?? item.username ?? item.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canEditRole ? (
                          <Select
                            value={roleValue}
                            onValueChange={(value) => handleRoleChange(item.id, value as AdminUser["role"])}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {assignableRoles.map((role) => (
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
                        {canUpdateStatus && canManageUser && item.status !== "deleted" ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant={item.status === "active" ? "destructive" : "outline"}
                              onClick={() => handleStatusToggle(item.id, item.status)}
                              disabled={deleting}
                            >
                              {item.status === "active" ? "Suspend" : "Activate"}
                            </Button>
                            {canDeleteStaff && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  void handleDeleteStaffAccount(item);
                                }}
                                disabled={deleting}
                              >
                                {deleting ? "Deleting..." : "Delete"}
                              </Button>
                            )}
                          </div>
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
