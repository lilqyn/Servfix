import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  addAdminSupportTicketMessage,
  addAdminSupportTicketNote,
  createAdminSupportTicketMeeting,
  fetchAdminSupportTicket,
  fetchAdminSupportTickets,
  fetchSupportAgents,
  updateAdminSupportTicketAssignment,
  updateAdminSupportTicketStatus,
  type AdminSupportTicket,
  type SupportDepartment,
  type SupportTicketMeetingInput,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/permissions";
import { getRoleLabel, type UserRole } from "@/lib/roles";

const STATUS_OPTIONS: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const DEPARTMENT_OPTIONS: SupportDepartment[] = [
  "general",
  "customer_service",
  "finance",
  "accounting",
  "operations",
  "disputes",
  "technical",
];
const PRIORITY_OPTIONS: SupportTicketPriority[] = ["low", "medium", "high", "urgent"];
const ROLE_OPTIONS: UserRole[] = [
  "support_agent",
  "dispute_manager",
  "operations_manager",
  "finance_manager",
  "technical_admin",
  "moderator",
  "admin",
  "super_admin",
  "marketing_manager",
  "data_analyst",
];

const formatDepartment = (value: SupportDepartment) =>
  value.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

const formatPriority = (value: SupportTicketPriority) =>
  value.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const AdminSupport = () => {
  const { user } = useAuth();
  const canUpdate = hasPermission(user?.role ?? null, "support.update");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [internalNote, setInternalNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [meetingForm, setMeetingForm] = useState<SupportTicketMeetingInput>({
    scheduledAt: "",
    durationMinutes: 30,
    meetingUrl: "",
    notes: "",
  });
  const [isSchedulingMeeting, setIsSchedulingMeeting] = useState(false);

  const queryParams = useMemo(
    () => ({
      status: statusFilter !== "all" ? (statusFilter as SupportTicketStatus) : undefined,
      department:
        departmentFilter !== "all" ? (departmentFilter as SupportDepartment) : undefined,
      priority:
        priorityFilter !== "all" ? (priorityFilter as SupportTicketPriority) : undefined,
      assignedRole: roleFilter !== "all" ? (roleFilter as UserRole) : undefined,
      search: search.trim() || undefined,
    }),
    [statusFilter, departmentFilter, priorityFilter, roleFilter, search],
  );

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-support-tickets", queryParams],
    queryFn: () => fetchAdminSupportTickets(queryParams),
  });

  const {
    data: selectedTicket,
    isLoading: isLoadingTicket,
    refetch: refetchTicket,
  } = useQuery({
    queryKey: ["admin-support-ticket", selectedId],
    queryFn: () => fetchAdminSupportTicket(selectedId!),
    enabled: Boolean(selectedId),
  });

  const { data: agentsData } = useQuery({
    queryKey: ["support-agents"],
    queryFn: fetchSupportAgents,
  });

  const supportAgents = agentsData?.agents ?? [];

  const handleStatusChange = async (ticket: AdminSupportTicket, status: SupportTicketStatus) => {
    if (!canUpdate) return;
    try {
      await updateAdminSupportTicketStatus(ticket.id, status);
      toast({ title: "Ticket status updated." });
      await refetch();
      if (selectedId === ticket.id) {
        await refetchTicket();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update ticket.";
      toast({ title: message });
    }
  };

  const handleReply = async () => {
    if (!selectedId || !reply.trim()) return;
    try {
      setIsSending(true);
      await addAdminSupportTicketMessage(selectedId, reply.trim());
      setReply("");
      await refetchTicket();
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to send reply.";
      toast({ title: message });
    } finally {
      setIsSending(false);
    }
  };

  const handleRoutingUpdate = async (updates: {
    department?: SupportDepartment;
    priority?: SupportTicketPriority;
    assignedRole?: UserRole | null;
    assignedUserId?: string | null;
  }) => {
    if (!selectedId || !canUpdate) return;
    try {
      await updateAdminSupportTicketAssignment(selectedId, updates);
      toast({ title: "Routing updated." });
      await refetchTicket();
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update routing.";
      toast({ title: message });
    }
  };

  const handleAddNote = async () => {
    if (!selectedId || !internalNote.trim() || !canUpdate) return;
    try {
      setIsAddingNote(true);
      await addAdminSupportTicketNote(selectedId, internalNote.trim());
      setInternalNote("");
      await refetchTicket();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to add note.";
      toast({ title: message });
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleScheduleMeeting = async () => {
    if (!selectedId || !meetingForm.scheduledAt || !canUpdate) return;
    try {
      setIsSchedulingMeeting(true);
      await createAdminSupportTicketMeeting(selectedId, {
        scheduledAt: meetingForm.scheduledAt,
        durationMinutes: meetingForm.durationMinutes,
        meetingUrl: meetingForm.meetingUrl?.trim() || undefined,
        notes: meetingForm.notes?.trim() || undefined,
      });
      setMeetingForm({
        scheduledAt: "",
        durationMinutes: 30,
        meetingUrl: "",
        notes: "",
      });
      await refetchTicket();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to schedule meeting.";
      toast({ title: message });
    } finally {
      setIsSchedulingMeeting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Support tickets</h2>
        <p className="text-sm text-muted-foreground">
          Review buyer tickets and respond to support requests.
        </p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
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
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {DEPARTMENT_OPTIONS.map((department) => (
                <SelectItem key={department} value={department}>
                  {formatDepartment(department)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priority</SelectItem>
              {PRIORITY_OPTIONS.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {formatPriority(priority)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Assigned role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLE_OPTIONS.map((role) => (
                <SelectItem key={role} value={role}>
                  {getRoleLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject or requester"
            className="w-[240px]"
          />
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="border-border/60">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading tickets...</div>
            ) : isError ? (
              <div className="p-6 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Unable to load tickets."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.tickets.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      className={selectedId === ticket.id ? "bg-muted/40" : undefined}
                    >
                      <TableCell>
                        <button
                          type="button"
                          className="text-left space-y-1"
                          onClick={() => setSelectedId(ticket.id)}
                        >
                          <div className="font-medium text-foreground">{ticket.subject}</div>
                          <div className="text-xs text-muted-foreground">
                            Ticket {ticket.ticketNumber}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDepartment(ticket.department)} - {formatPriority(ticket.priority)}
                          </div>
                          {ticket.category ? (
                            <div className="text-xs text-muted-foreground">{ticket.category}</div>
                          ) : null}
                          {ticket.lastMessage?.body ? (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {ticket.lastMessage.body}
                            </div>
                          ) : null}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {ticket.requester.username ??
                            ticket.requester.email ??
                            ticket.requester.phone ??
                            "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ticket.assignedUser
                            ? `Assigned to ${ticket.assignedUser.username ?? ticket.assignedUser.email ?? ticket.assignedUser.phone}`
                            : ticket.assignedRole
                              ? `Role: ${getRoleLabel(ticket.assignedRole)}`
                              : "Unassigned"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canUpdate ? (
                          <Select
                            value={ticket.status}
                            onValueChange={(value) =>
                              handleStatusChange(ticket, value as SupportTicketStatus)
                            }
                          >
                            <SelectTrigger className="w-[160px]">
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
                          <span className="capitalize text-sm">{ticket.status}</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(ticket.lastMessageAt)}</TableCell>
                    </TableRow>
                  ))}
                  {data?.tickets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No support tickets found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-6 space-y-4">
            {!selectedId ? (
              <div className="text-sm text-muted-foreground">
                Select a ticket to view conversation details.
              </div>
            ) : isLoadingTicket ? (
              <div className="text-sm text-muted-foreground">Loading ticket...</div>
            ) : !selectedTicket ? (
              <div className="text-sm text-muted-foreground">Ticket not found.</div>
            ) : (
              <>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">{selectedTicket.subject}</h3>
                  <p className="text-xs text-muted-foreground">
                    Ticket {selectedTicket.ticketNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedTicket.requester.username ??
                      selectedTicket.requester.email ??
                      selectedTicket.requester.phone ??
                      "Buyer"}{" "}
                    · {selectedTicket.status}
                  </p>
                </div>

                <div className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-3">
                  <div className="text-sm font-semibold text-foreground">Routing</div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Select
                      value={selectedTicket.department}
                      onValueChange={(value) =>
                        handleRoutingUpdate({ department: value as SupportDepartment })
                      }
                      disabled={!canUpdate}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENT_OPTIONS.map((department) => (
                          <SelectItem key={department} value={department}>
                            {formatDepartment(department)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={selectedTicket.priority}
                      onValueChange={(value) =>
                        handleRoutingUpdate({ priority: value as SupportTicketPriority })
                      }
                      disabled={!canUpdate}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {formatPriority(priority)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Assigned role</Label>
                    <Select
                      value={selectedTicket.assignedRole ?? "unassigned"}
                      onValueChange={(value) =>
                        handleRoutingUpdate({
                          assignedRole: value === "unassigned" ? null : (value as UserRole),
                        })
                      }
                      disabled={!canUpdate}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {getRoleLabel(role)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Assigned user</Label>
                    <Select
                      value={selectedTicket.assignedUser?.id ?? "unassigned"}
                      onValueChange={(value) =>
                        handleRoutingUpdate({
                          assignedUserId: value === "unassigned" ? null : value,
                        })
                      }
                      disabled={!canUpdate}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {supportAgents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.username ??
                              agent.email ??
                              agent.phone ??
                              agent.id}{" "}
                            - {getRoleLabel(agent.role)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 max-h-[320px] overflow-auto pr-2">
                  {selectedTicket.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        message.isInternal
                          ? "border-amber-200 bg-amber-50"
                          : "border-border/60 bg-card"
                      }`}
                    >
                      {message.isInternal && (
                        <div className="text-[10px] font-semibold uppercase text-amber-600">
                          Internal note
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {message.senderRole.replace("_", " ")} · {formatDate(message.createdAt)}
                      </div>
                      <div className="text-foreground whitespace-pre-line">{message.body}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="internal-note">Internal note</Label>
                  <Textarea
                    id="internal-note"
                    value={internalNote}
                    onChange={(event) => setInternalNote(event.target.value)}
                    rows={3}
                    placeholder="Add a private note for the team..."
                    disabled={!canUpdate}
                  />
                  <Button
                    variant="outline"
                    onClick={handleAddNote}
                    disabled={!canUpdate || !internalNote.trim() || isAddingNote}
                  >
                    {isAddingNote ? "Adding..." : "Add internal note"}
                  </Button>
                </div>

                <div className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-3">
                  <div className="text-sm font-semibold text-foreground">Meetings</div>
                  {selectedTicket.meetings && selectedTicket.meetings.length > 0 ? (
                    <div className="space-y-2">
                      {selectedTicket.meetings.map((meeting) => (
                        <div key={meeting.id} className="rounded-md border border-border/60 p-2">
                          <div className="text-xs text-muted-foreground">
                            {formatDate(meeting.scheduledAt)}
                            {meeting.durationMinutes
                              ? ` - ${meeting.durationMinutes} mins`
                              : ""}
                          </div>
                          {meeting.meetingUrl ? (
                            <a
                              href={meeting.meetingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline"
                            >
                              Join meeting
                            </a>
                          ) : null}
                          {meeting.notes ? (
                            <div className="text-xs text-muted-foreground mt-1">
                              {meeting.notes}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No meetings scheduled.</div>
                  )}
                  <div className="space-y-2">
                    <Label>Schedule meeting</Label>
                    <Input
                      type="datetime-local"
                      value={meetingForm.scheduledAt}
                      onChange={(event) =>
                        setMeetingForm((prev) => ({ ...prev, scheduledAt: event.target.value }))
                      }
                      disabled={!canUpdate}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={5}
                        max={480}
                        value={meetingForm.durationMinutes ?? ""}
                        onChange={(event) =>
                          setMeetingForm((prev) => ({
                            ...prev,
                            durationMinutes: Number(event.target.value || 0) || undefined,
                          }))
                        }
                        placeholder="Duration (mins)"
                        disabled={!canUpdate}
                      />
                      <Input
                        value={meetingForm.meetingUrl ?? ""}
                        onChange={(event) =>
                          setMeetingForm((prev) => ({ ...prev, meetingUrl: event.target.value }))
                        }
                        placeholder="Meeting link (optional)"
                        disabled={!canUpdate}
                      />
                    </div>
                    <Textarea
                      value={meetingForm.notes ?? ""}
                      onChange={(event) =>
                        setMeetingForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      rows={2}
                      placeholder="Notes (optional)"
                      disabled={!canUpdate}
                    />
                    <Button
                      variant="outline"
                      onClick={handleScheduleMeeting}
                      disabled={!canUpdate || !meetingForm.scheduledAt || isSchedulingMeeting}
                    >
                      {isSchedulingMeeting ? "Scheduling..." : "Schedule meeting"}
                    </Button>
                  </div>
                </div>

                {selectedTicket.events && selectedTicket.events.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-border/60 bg-card/60 p-3">
                    <div className="text-sm font-semibold text-foreground">Activity</div>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {selectedTicket.events.map((event) => (
                        <div key={event.id} className="flex justify-between gap-2">
                          <span>
                            {event.type.replace("_", " ")}{" "}
                            {event.actor?.username ??
                              event.actor?.email ??
                              event.actor?.phone ??
                              ""}
                          </span>
                          <span>{formatDate(event.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="support-reply">Reply</Label>
                  <Textarea
                    id="support-reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows={4}
                    placeholder="Write a response to the buyer..."
                    disabled={!canUpdate || selectedTicket.status === "closed"}
                  />
                  <Button
                    onClick={handleReply}
                    disabled={!canUpdate || !reply.trim() || isSending || selectedTicket.status === "closed"}
                  >
                    {isSending ? "Sending..." : "Send reply"}
                  </Button>
                  {selectedTicket.status === "closed" && (
                    <p className="text-xs text-muted-foreground">
                      This ticket is closed. Change status to reopen replies.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminSupport;
