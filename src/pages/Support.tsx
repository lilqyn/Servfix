import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import {
  addSupportTicketMessage,
  createSupportTicket,
  fetchSupportTicket,
  fetchSupportTickets,
  type SupportTicketStatus,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const Support = () => {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    subject: "",
    category: "",
    message: "",
  });
  const [reply, setReply] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReplying, setIsReplying] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => fetchSupportTickets(),
  });

  const {
    data: selectedTicket,
    isLoading: isLoadingTicket,
    refetch: refetchTicket,
  } = useQuery({
    queryKey: ["support-ticket", selectedId],
    queryFn: () => fetchSupportTicket(selectedId!),
    enabled: Boolean(selectedId),
  });

  const hasTickets = (data?.tickets?.length ?? 0) > 0;

  const handleCreate = async () => {
    if (!form.subject.trim() || !form.message.trim()) {
      toast({ title: "Please add a subject and message." });
      return;
    }
    try {
      setIsSubmitting(true);
      const payload = {
        subject: form.subject.trim(),
        category: form.category.trim() || undefined,
        message: form.message.trim(),
      };
      const response = await createSupportTicket(payload);
      toast({ title: "Support ticket created." });
      setForm({ subject: "", category: "", message: "" });
      await refetch();
      setSelectedId(response.ticket.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create ticket.";
      toast({ title: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!selectedId || !reply.trim()) return;
    try {
      setIsReplying(true);
      await addSupportTicketMessage(selectedId, reply.trim());
      setReply("");
      await refetchTicket();
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to send reply.";
      toast({ title: message });
    } finally {
      setIsReplying(false);
    }
  };

  const displayName = useMemo(() => {
    if (!user) return "Account";
    return user.username ?? user.email ?? user.phone ?? "Account";
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Help & support</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Send a message to the support team and track your requests.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Create a ticket</h2>
                <p className="text-sm text-muted-foreground">
                  Tell us what you need help with and we will respond soon.
                </p>
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={form.subject}
                    onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                    placeholder="Issue with an order or account"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category (optional)</Label>
                  <Input
                    value={form.category}
                    onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="Billing, Order, Verification"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea
                    value={form.message}
                    onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                    rows={5}
                    placeholder={`Hi ${displayName}, describe the issue here...`}
                  />
                </div>
                <Button onClick={handleCreate} disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit ticket"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Your tickets</h2>
                <p className="text-sm text-muted-foreground">
                  Track support responses and reply if you need more help.
                </p>
              </div>
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading tickets...</div>
              ) : isError ? (
                <div className="text-sm text-muted-foreground">
                  {error instanceof Error ? error.message : "Unable to load tickets."}
                </div>
              ) : !hasTickets ? (
                <div className="text-sm text-muted-foreground">No support tickets yet.</div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                  {data?.tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      className={`w-full text-left rounded-lg border border-border/60 px-3 py-2 transition-colors ${
                        selectedId === ticket.id ? "bg-muted" : "hover:bg-muted/40"
                      }`}
                      onClick={() => setSelectedId(ticket.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">{ticket.subject}</span>
                        <span className="text-xs text-muted-foreground">
                          {STATUS_LABELS[ticket.status]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Ticket {ticket.ticketNumber}
                      </div>
                      {ticket.lastMessage?.body ? (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {ticket.lastMessage.body}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-6 space-y-4">
            {!selectedId ? (
              <div className="text-sm text-muted-foreground">
                Select a ticket to see the conversation.
              </div>
            ) : isLoadingTicket ? (
              <div className="text-sm text-muted-foreground">Loading ticket...</div>
            ) : !selectedTicket ? (
              <div className="text-sm text-muted-foreground">Ticket not found.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {selectedTicket.subject}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Ticket {selectedTicket.ticketNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Status: {STATUS_LABELS[selectedTicket.status]} · Updated{" "}
                      {formatDate(selectedTicket.lastMessageAt)}
                    </p>
                  </div>
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
                </div>

                <div className="space-y-2">
                  <Label>Reply</Label>
                  <Textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows={4}
                    placeholder="Add more details or reply to support..."
                    disabled={selectedTicket.status === "closed"}
                  />
                  <Button
                    onClick={handleReply}
                    disabled={
                      selectedTicket.status === "closed" || !reply.trim() || isReplying
                    }
                  >
                    {isReplying ? "Sending..." : "Send reply"}
                  </Button>
                  {selectedTicket.status === "closed" && (
                    <p className="text-xs text-muted-foreground">
                      This ticket is closed. Create a new ticket if you need more help.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default Support;
