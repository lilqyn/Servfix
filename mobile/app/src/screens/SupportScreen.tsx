import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createSupportTicket,
  fetchSupportTicket,
  fetchSupportTickets,
  sendSupportMessage,
} from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { SupportTicket, SupportTicketMessage } from "../types";

type Props = {
  onBack: () => void;
};

const getStatusBadge = (p: { infoSoft: string; info: string; warnSoft: string; warnInk: string; accentSoft: string; accent: string; mist: string; slate: string }) => ({
  open: { bg: p.infoSoft, color: p.info, label: "Open" },
  in_progress: { bg: p.warnSoft, color: p.warnInk, label: "In Progress" },
  resolved: { bg: p.accentSoft, color: p.accent, label: "Resolved" },
  closed: { bg: p.mist, color: p.slate, label: "Closed" },
} as Record<string, { bg: string; color: string; label: string }>);

const CATEGORIES = [
  "General",
  "Payment",
  "Order Issue",
  "Account",
  "Technical",
  "Feedback",
];

type ScreenView = "list" | "create" | "detail";

export function SupportScreen({ onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [view, setView] = useState<ScreenView>("list");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create form
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("General");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  // Reply
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const loadTickets = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const result = await fetchSupportTickets({ cursor, limit: 20 });
      if (cursor) {
        setTickets((prev) => [...prev, ...result.tickets]);
      } else {
        setTickets(result.tickets);
      }
      setNextCursor(result.nextCursor);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const openTicket = async (ticketId: string) => {
    setDetailLoading(true);
    setView("detail");
    try {
      const ticket = await fetchSupportTicket(ticketId);
      setActiveTicket(ticket);
    } catch {
      Alert.alert("Error", "Failed to load ticket");
      setView("list");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert("Required", "Please fill in subject and message.");
      return;
    }
    setCreating(true);
    try {
      await createSupportTicket({
        subject: subject.trim(),
        category,
        message: message.trim(),
      });
      Alert.alert("Ticket created", "We'll get back to you soon.");
      setSubject("");
      setMessage("");
      setView("list");
      void loadTickets();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async () => {
    if (!reply.trim() || !activeTicket) return;
    setSending(true);
    try {
      const result = await sendSupportMessage(activeTicket.id, reply.trim());
      setActiveTicket((prev) =>
        prev
          ? {
              ...prev,
              status: result.status as SupportTicket["status"],
              messages: [...(prev.messages ?? []), result.message],
            }
          : prev,
      );
      setReply("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  // ── List view ──
  if (view === "list") {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Support Tickets</Text>
          <Pressable style={styles.newBtn} onPress={() => setView("create")}>
            <Ionicons name="add" size={18} color="#ffffff" />
            <Text style={styles.newBtnText}>New Ticket</Text>
          </Pressable>
        </View>
        {loading && tickets.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.accent} size="large" />
          </View>
        ) : tickets.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="help-buoy-outline" size={48} color={palette.line} />
            <Text style={styles.emptyText}>No support tickets yet.</Text>
            <Text style={styles.emptySubtext}>Tap "New Ticket" to get help.</Text>
          </View>
        ) : (
          <FlatList
            data={tickets}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (nextCursor && !loading) void loadTickets(nextCursor);
            }}
            onEndReachedThreshold={0.3}
            renderItem={({ item }) => {
              const badge = getStatusBadge(palette)[item.status] ?? getStatusBadge(palette).open;
              return (
                <Pressable style={styles.ticketCard} onPress={() => openTicket(item.id)}>
                  <View style={styles.ticketHeader}>
                    <Text style={styles.ticketNumber}>#{item.ticketNumber}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.ticketSubject} numberOfLines={1}>{item.subject}</Text>
                  {item.lastMessage?.body ? (
                    <Text style={styles.ticketLastMsg} numberOfLines={1}>{item.lastMessage.body}</Text>
                  ) : null}
                  <Text style={styles.ticketDate}>
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    );
  }

  // ── Create view ──
  if (view === "create") {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.createForm}>
          <Pressable style={styles.backRow} onPress={() => setView("list")}>
            <Ionicons name="arrow-back" size={20} color={palette.ink} />
            <Text style={styles.backText}>Back to tickets</Text>
          </Pressable>

          <Text style={styles.formLabel}>Subject</Text>
          <TextInput
            style={styles.input}
            placeholder="Brief summary of your issue"
            placeholderTextColor={palette.slate}
            value={subject}
            onChangeText={setSubject}
            maxLength={120}
          />

          <Text style={styles.formLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.categoryChip, category === c && styles.categoryChipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.formLabel}>Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe your issue in detail..."
            placeholderTextColor={palette.slate}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />

          <Pressable
            style={[styles.submitBtn, (!subject.trim() || !message.trim()) && styles.submitBtnDisabled]}
            onPress={handleCreate}
            disabled={creating || !subject.trim() || !message.trim()}
          >
            {creating ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Ticket</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Detail view ──
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Pressable style={styles.backRow2} onPress={() => { setView("list"); setActiveTicket(null); }}>
        <Ionicons name="arrow-back" size={20} color={palette.ink} />
        <Text style={styles.backText}>Back to tickets</Text>
      </Pressable>

      {detailLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.accent} size="large" />
        </View>
      ) : activeTicket ? (
        <>
          <View style={styles.detailHeader}>
            <Text style={styles.detailSubject}>{activeTicket.subject}</Text>
            <View style={styles.detailMeta}>
              <Text style={styles.ticketNumber}>#{activeTicket.ticketNumber}</Text>
              <View style={[styles.statusBadge, { backgroundColor: (getStatusBadge(palette)[activeTicket.status] ?? getStatusBadge(palette).open).bg }]}>
                <Text style={[styles.statusBadgeText, { color: (getStatusBadge(palette)[activeTicket.status] ?? getStatusBadge(palette).open).color }]}>
                  {(getStatusBadge(palette)[activeTicket.status] ?? getStatusBadge(palette).open).label}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {activeTicket.messages?.map((msg) => {
              const isStaff = msg.senderRole === "admin" || msg.senderRole === "super_admin" || msg.senderRole === "staff";
              return (
                <View
                  key={msg.id}
                  style={[styles.msgBubble, isStaff ? styles.msgBubbleStaff : styles.msgBubbleUser]}
                >
                  <Text style={styles.msgSender}>{isStaff ? "Support" : "You"}</Text>
                  <Text style={styles.msgBody}>{msg.body}</Text>
                  <Text style={styles.msgTime}>{new Date(msg.createdAt).toLocaleString()}</Text>
                </View>
              );
            })}

            {activeTicket.meetings && activeTicket.meetings.length > 0 && (
              <View style={styles.meetingsSection}>
                <Text style={styles.meetingsTitle}>Scheduled Meetings</Text>
                {activeTicket.meetings.map((m) => (
                  <View key={m.id} style={styles.meetingCard}>
                    <Ionicons name="videocam" size={18} color="#7c3aed" />
                    <View style={styles.meetingBody}>
                      <Text style={styles.meetingDate}>
                        {new Date(m.scheduledAt).toLocaleString()}
                        {m.durationMinutes ? ` (${m.durationMinutes} min)` : ""}
                      </Text>
                      {m.notes ? <Text style={styles.meetingNotes}>{m.notes}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {activeTicket.status !== "closed" && (
            <View style={styles.replyBar}>
              <TextInput
                style={styles.replyInput}
                placeholder="Type a reply..."
                placeholderTextColor={palette.slate}
                value={reply}
                onChangeText={setReply}
                maxLength={2000}
              />
              <Pressable
                style={[styles.sendBtn, !reply.trim() && styles.sendBtnDisabled]}
                onPress={handleReply}
                disabled={sending || !reply.trim()}
              >
                {sending ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Ionicons name="send" size={18} color="#ffffff" />
                )}
              </Pressable>
            </View>
          )}
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  container: { flex: 1, backgroundColor: palette.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  headerTitle: { color: palette.ink, fontSize: 20, fontWeight: "800" },
  newBtn: {
    backgroundColor: palette.accentDeep,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 40 },
  ticketCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 14,
    gap: 4,
  },
  ticketHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ticketNumber: { color: palette.slate, fontSize: 12, fontWeight: "700" },
  ticketSubject: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  ticketLastMsg: { color: palette.slate, fontSize: 13 },
  ticketDate: { color: palette.slate, fontSize: 11, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  emptyText: { color: palette.slate, fontSize: 15, fontWeight: "600" },
  emptySubtext: { color: palette.slate, fontSize: 13 },
  // Create form
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backRow2: { flexDirection: "row", alignItems: "center", gap: 6, padding: 16, paddingBottom: 0 },
  backText: { color: palette.ink, fontSize: 14, fontWeight: "600" },
  createForm: { padding: 20, gap: 10, paddingBottom: 40 },
  formLabel: { color: palette.ink, fontSize: 13, fontWeight: "700", marginTop: 4 },
  input: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: palette.ink,
  },
  textArea: { minHeight: 120, paddingTop: 12 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: palette.card,
  },
  categoryChipActive: { backgroundColor: palette.accentDeep, borderColor: palette.accentDeep },
  categoryChipText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  categoryChipTextActive: { color: "#ffffff" },
  submitBtn: {
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  // Detail
  detailHeader: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  detailSubject: { color: palette.ink, fontSize: 18, fontWeight: "800" },
  detailMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  messagesScroll: { flex: 1 },
  messagesList: { padding: 16, gap: 10, paddingBottom: 20 },
  msgBubble: { borderRadius: 14, padding: 12, maxWidth: "85%" as const, gap: 4 },
  msgBubbleUser: { backgroundColor: palette.accentSoft, alignSelf: "flex-end" },
  msgBubbleStaff: { backgroundColor: palette.mist, alignSelf: "flex-start" },
  msgSender: { fontSize: 11, fontWeight: "700", color: palette.slate },
  msgBody: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  msgTime: { color: palette.slate, fontSize: 10, alignSelf: "flex-end" },
  meetingsSection: { marginTop: 12, gap: 8 },
  meetingsTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  meetingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: palette.isDark ? "#2e1065" : "#f5f3ff",
    borderRadius: 12,
    padding: 12,
  },
  meetingBody: { flex: 1, gap: 2 },
  meetingDate: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  meetingNotes: { color: palette.slate, fontSize: 12 },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.card,
  },
  replyInput: {
    flex: 1,
    backgroundColor: palette.mist,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.ink,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: palette.accentDeep,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
}));
