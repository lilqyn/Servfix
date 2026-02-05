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
  fetchAdminSupportTicket,
  fetchAdminSupportTickets,
  updateAdminSupportTicketStatus,
  type AdminSupportTicket,
  type SupportTicketStatus,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/permissions";

const STATUS_OPTIONS: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const AdminSupport = () => {
  const { user } = useAuth();
  const canUpdate = hasPermission(user?.role ?? null, "support.update");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [isSending, setIsSending] = useState(false);

  const queryParams = useMemo(
    () => ({
      status: statusFilter !== "all" ? (statusFilter as SupportTicketStatus) : undefined,
      search: search.trim() || undefined,
    }),
    [statusFilter, search],
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
                        {ticket.requester.username ??
                          ticket.requester.email ??
                          ticket.requester.phone ??
                          "-"}
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
                    {selectedTicket.requester.username ??
                      selectedTicket.requester.email ??
                      selectedTicket.requester.phone ??
                      "Buyer"}{" "}
                    · {selectedTicket.status}
                  </p>
                </div>

                <div className="space-y-3 max-h-[320px] overflow-auto pr-2">
                  {selectedTicket.messages.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
                    >
                      <div className="text-xs text-muted-foreground">
                        {message.senderRole.replace("_", " ")} · {formatDate(message.createdAt)}
                      </div>
                      <div className="text-foreground whitespace-pre-line">{message.body}</div>
                    </div>
                  ))}
                </div>

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
