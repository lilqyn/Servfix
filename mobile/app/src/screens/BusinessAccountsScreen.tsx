import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addBusinessMember,
  createBusinessAccount,
  createBusinessInvoiceCheckout,
  createBusinessJob,
  fetchBusinessAccount,
  fetchBusinessAccounts,
  fetchBusinessInvoices,
  type BusinessAccount,
  type BusinessAccountDetail,
  type BusinessInvoice,
} from "../lib/api";
import { formatCurrency } from "../lib/format";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { CheckoutProvider } from "../types";

type Props = {
  onBack: () => void;
};

type Tab = "overview" | "members" | "jobs" | "invoices";

const INDUSTRIES = [
  "Technology", "Healthcare", "Education", "Finance", "Retail",
  "Manufacturing", "Construction", "Hospitality", "Real Estate", "Other",
];
const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const CATEGORIES = [
  "Cleaning", "Plumbing", "Electrical", "Catering", "Events",
  "IT Support", "Security", "Transport", "Landscaping", "Other",
];

export function BusinessAccountsScreen({ onBack }: Props) {
  const s = useStyles();
  const { palette } = useTheme();
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BusinessAccountDetail | null>(null);
  const [invoices, setInvoices] = useState<BusinessInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);

  // Create account form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createIndustry, setCreateIndustry] = useState("");
  const [createSize, setCreateSize] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberIdentifier, setMemberIdentifier] = useState("");
  const [memberRole, setMemberRole] = useState<"member" | "admin">("member");
  const [addingMember, setAddingMember] = useState(false);

  // Create job form
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobCategory, setJobCategory] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobBudget, setJobBudget] = useState("");
  const [creatingJob, setCreatingJob] = useState(false);

  // Invoice payment
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const accs = await fetchBusinessAccounts();
      setAccounts(Array.isArray(accs) ? accs : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const [d, inv] = await Promise.all([
        fetchBusinessAccount(id),
        fetchBusinessInvoices(id),
      ]);
      setDetail(d);
      setInvoices(Array.isArray(inv) ? inv : []);
    } catch {
      setDetail(null);
      setInvoices([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const acc = await createBusinessAccount({
        name: createName.trim(),
        industry: createIndustry || "Other",
        size: createSize || "1-10",
        notes: createNotes.trim() || undefined,
      });
      setAccounts((p) => [acc, ...p]);
      setSelectedId(acc.id);
      setShowCreate(false);
      setCreateName("");
      setCreateIndustry("");
      setCreateSize("");
      setCreateNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedId || !memberIdentifier.trim()) return;
    setAddingMember(true);
    try {
      await addBusinessMember(selectedId, {
        identifier: memberIdentifier.trim(),
        role: memberRole,
      });
      setMemberIdentifier("");
      setShowAddMember(false);
      void loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  };

  const handleCreateJob = async () => {
    if (!selectedId || !jobTitle.trim() || !jobDescription.trim()) return;
    setCreatingJob(true);
    try {
      await createBusinessJob(selectedId, {
        title: jobTitle.trim(),
        category: jobCategory || "Other",
        description: jobDescription.trim(),
        budget: parseFloat(jobBudget) || 0,
      });
      setJobTitle("");
      setJobCategory("");
      setJobDescription("");
      setJobBudget("");
      setShowCreateJob(false);
      void loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create job");
    } finally {
      setCreatingJob(false);
    }
  };

  const handlePayInvoice = async (invoice: BusinessInvoice) => {
    setPayingInvoiceId(invoice.id);
    try {
      const provider: CheckoutProvider = "flutterwave";
      const checkout = await createBusinessInvoiceCheckout({
        invoiceId: invoice.id,
        provider,
        method: "mobile_money",
      });
      await Linking.openURL(checkout.checkoutUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start payment");
    } finally {
      setPayingInvoiceId(null);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.stateWrap}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={s.stateText}>Loading business accounts...</Text>
      </View>
    );
  }

  // ── No account selected — show list + create ───────────────────────────────
  if (!selectedId) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.heading}>Business Accounts</Text>
        <Text style={s.subheading}>Manage your corporate team accounts, post job requests, and handle invoices.</Text>

        {error && (
          <View style={s.errorCard}>
            <Text style={s.errorText}>{error}</Text>
            <Pressable onPress={() => setError(null)}><Ionicons name="close" size={16} color={palette.danger} /></Pressable>
          </View>
        )}

        {/* Create account */}
        <Pressable style={s.createToggle} onPress={() => setShowCreate((v) => !v)}>
          <Ionicons name="add-circle-outline" size={20} color={palette.accentDeep} />
          <Text style={s.createToggleText}>Create business account</Text>
          <Ionicons name={showCreate ? "chevron-up" : "chevron-down"} size={16} color={palette.slate} />
        </Pressable>

        {showCreate && (
          <View style={s.formCard}>
            <Text style={s.formLabel}>Business name *</Text>
            <TextInput style={s.input} placeholder="Company name" placeholderTextColor={palette.slate} value={createName} onChangeText={setCreateName} />

            <Text style={s.formLabel}>Industry</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.chipRow}>
                {INDUSTRIES.map((ind) => (
                  <Pressable key={ind} onPress={() => setCreateIndustry(ind)} style={[s.chip, createIndustry === ind && s.chipActive]}>
                    <Text style={[s.chipText, createIndustry === ind && s.chipTextActive]}>{ind}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={s.formLabel}>Company size</Text>
            <View style={s.chipRow}>
              {SIZES.map((sz) => (
                <Pressable key={sz} onPress={() => setCreateSize(sz)} style={[s.chip, createSize === sz && s.chipActive]}>
                  <Text style={[s.chipText, createSize === sz && s.chipTextActive]}>{sz}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.formLabel}>Notes (optional)</Text>
            <TextInput style={[s.input, s.textarea]} placeholder="Internal notes..." placeholderTextColor={palette.slate} multiline value={createNotes} onChangeText={setCreateNotes} />

            <Pressable style={[s.primaryBtn, creating && s.btnDisabled]} disabled={creating || !createName.trim()} onPress={() => void handleCreate()}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Create account</Text>}
            </Pressable>
          </View>
        )}

        {/* Account list */}
        {accounts.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="business-outline" size={40} color={palette.line} />
            <Text style={s.emptyTitle}>No business accounts</Text>
            <Text style={s.emptyBody}>Create one above to get started with team management and job posting.</Text>
          </View>
        ) : (
          accounts.map((acc) => (
            <Pressable key={acc.id} style={s.accountCard} onPress={() => setSelectedId(acc.id)}>
              <View style={s.accountIcon}>
                <Ionicons name="business" size={22} color={palette.accentDeep} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.accountName}>{acc.name}</Text>
                <Text style={s.accountMeta}>{acc.industry} · {acc.size} · {acc.memberCount} members</Text>
              </View>
              <View style={[s.statusBadge, acc.status === "active" && s.statusActive]}>
                <Text style={[s.statusText, acc.status === "active" && s.statusActiveText]}>{acc.status}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.slate} />
            </Pressable>
          ))
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Account detail ─────────────────────────────────────────────────────────
  const selectedAccount = accounts.find((a) => a.id === selectedId);
  const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
    { key: "overview", label: "Overview", icon: "eye-outline" },
    { key: "members", label: "Team", icon: "people-outline" },
    { key: "jobs", label: "Jobs", icon: "briefcase-outline" },
    { key: "invoices", label: "Invoices", icon: "receipt-outline" },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={s.page}>
      {/* Back to list */}
      <Pressable style={s.backRow} onPress={() => { setSelectedId(null); setTab("overview"); }}>
        <Ionicons name="arrow-back" size={18} color={palette.accentDeep} />
        <Text style={s.backText}>All accounts</Text>
      </Pressable>

      <Text style={s.heading}>{selectedAccount?.name ?? "Account"}</Text>

      {error && (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => setError(null)}><Ionicons name="close" size={16} color={palette.danger} /></Pressable>
        </View>
      )}

      {/* Tab bar */}
      <View style={s.tabBar}>
        {tabs.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tabBtn, tab === t.key && s.tabBtnActive]}>
            <Ionicons name={t.icon} size={16} color={tab === t.key ? palette.accentDeep : palette.slate} />
            <Text style={[s.tabBtnText, tab === t.key && s.tabBtnTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {detailLoading ? (
        <View style={s.stateWrap}><ActivityIndicator color={palette.accent} /></View>
      ) : (
        <>
          {/* Overview tab */}
          {tab === "overview" && detail && (
            <View style={s.overviewGrid}>
              <View style={s.statCard}>
                <Ionicons name="people" size={22} color="#7c3aed" />
                <Text style={s.statValue}>{detail.memberCount}</Text>
                <Text style={s.statLabel}>Members</Text>
              </View>
              <View style={s.statCard}>
                <Ionicons name="briefcase" size={22} color="#ea580c" />
                <Text style={s.statValue}>{detail.jobCount}</Text>
                <Text style={s.statLabel}>Jobs</Text>
              </View>
              <View style={s.statCard}>
                <Ionicons name="receipt" size={22} color={palette.accent} />
                <Text style={s.statValue}>{invoices.length}</Text>
                <Text style={s.statLabel}>Invoices</Text>
              </View>
              <View style={s.statCard}>
                <Ionicons name="ellipse" size={22} color={detail.status === "active" ? palette.accent : palette.slate} />
                <Text style={s.statValue}>{detail.status}</Text>
                <Text style={s.statLabel}>Status</Text>
              </View>
              <View style={[s.detailRow, { marginTop: 8 }]}>
                <Text style={s.detailLabel}>Industry</Text>
                <Text style={s.detailValue}>{detail.industry || "—"}</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>Size</Text>
                <Text style={s.detailValue}>{detail.size || "—"}</Text>
              </View>
            </View>
          )}

          {/* Members tab */}
          {tab === "members" && (
            <View style={s.tabContent}>
              <Pressable style={s.createToggle} onPress={() => setShowAddMember((v) => !v)}>
                <Ionicons name="person-add-outline" size={18} color={palette.accentDeep} />
                <Text style={s.createToggleText}>Add team member</Text>
              </Pressable>

              {showAddMember && (
                <View style={s.formCard}>
                  <Text style={s.formLabel}>Email, phone, or username</Text>
                  <TextInput style={s.input} placeholder="member@company.com" placeholderTextColor={palette.slate} value={memberIdentifier} onChangeText={setMemberIdentifier} />
                  <Text style={s.formLabel}>Role</Text>
                  <View style={s.chipRow}>
                    {(["member", "admin"] as const).map((r) => (
                      <Pressable key={r} onPress={() => setMemberRole(r)} style={[s.chip, memberRole === r && s.chipActive]}>
                        <Text style={[s.chipText, memberRole === r && s.chipTextActive]}>{r}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable style={[s.primaryBtn, addingMember && s.btnDisabled]} disabled={addingMember || !memberIdentifier.trim()} onPress={() => void handleAddMember()}>
                    {addingMember ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Add member</Text>}
                  </Pressable>
                </View>
              )}

              {detail?.members && detail.members.length > 0 ? (
                detail.members.map((m) => (
                  <View key={m.id} style={s.memberCard}>
                    {m.user.avatarUrl ? (
                      <Image source={{ uri: m.user.avatarUrl }} style={s.memberAvatar} />
                    ) : (
                      <View style={[s.memberAvatar, s.memberAvatarPlaceholder]}>
                        <Ionicons name="person" size={16} color={palette.slate} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.memberName}>{m.user.email ?? m.user.username ?? "User"}</Text>
                      <Text style={s.memberMeta}>{m.role} · {m.status}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyBody}>No team members yet.</Text>
                </View>
              )}
            </View>
          )}

          {/* Jobs tab */}
          {tab === "jobs" && (
            <View style={s.tabContent}>
              <Pressable style={s.createToggle} onPress={() => setShowCreateJob((v) => !v)}>
                <Ionicons name="add-circle-outline" size={18} color={palette.accentDeep} />
                <Text style={s.createToggleText}>Post job request</Text>
              </Pressable>

              {showCreateJob && (
                <View style={s.formCard}>
                  <Text style={s.formLabel}>Title *</Text>
                  <TextInput style={s.input} placeholder="Job title" placeholderTextColor={palette.slate} value={jobTitle} onChangeText={setJobTitle} />

                  <Text style={s.formLabel}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={s.chipRow}>
                      {CATEGORIES.map((cat) => (
                        <Pressable key={cat} onPress={() => setJobCategory(cat)} style={[s.chip, jobCategory === cat && s.chipActive]}>
                          <Text style={[s.chipText, jobCategory === cat && s.chipTextActive]}>{cat}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={s.formLabel}>Description *</Text>
                  <TextInput style={[s.input, s.textarea]} placeholder="Job description..." placeholderTextColor={palette.slate} multiline value={jobDescription} onChangeText={setJobDescription} />

                  <Text style={s.formLabel}>Budget (GHS)</Text>
                  <TextInput style={s.input} placeholder="0.00" placeholderTextColor={palette.slate} keyboardType="numeric" value={jobBudget} onChangeText={setJobBudget} />

                  <Pressable style={[s.primaryBtn, creatingJob && s.btnDisabled]} disabled={creatingJob || !jobTitle.trim() || !jobDescription.trim()} onPress={() => void handleCreateJob()}>
                    {creatingJob ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Post job</Text>}
                  </Pressable>
                </View>
              )}

              {detail?.jobs && detail.jobs.length > 0 ? (
                detail.jobs.map((job) => (
                  <View key={job.id} style={s.jobCard}>
                    <View style={s.jobHeader}>
                      <Text style={s.jobTitle}>{job.title}</Text>
                      <View style={[s.statusBadge, job.status === "open" && s.statusActive]}>
                        <Text style={[s.statusText, job.status === "open" && s.statusActiveText]}>{job.status}</Text>
                      </View>
                    </View>
                    <Text style={s.jobMeta}>{job.category} · {formatCurrency(job.budget, job.currency)}</Text>
                    <Text style={s.jobDesc} numberOfLines={3}>{job.description}</Text>
                  </View>
                ))
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyBody}>No job requests yet.</Text>
                </View>
              )}
            </View>
          )}

          {/* Invoices tab */}
          {tab === "invoices" && (
            <View style={s.tabContent}>
              {invoices.length > 0 ? (
                invoices.map((inv) => (
                  <View key={inv.id} style={s.invoiceCard}>
                    <View style={s.invoiceHeader}>
                      <Text style={s.invoiceId}>Invoice #{inv.id.slice(0, 8)}</Text>
                      <View style={[s.statusBadge, inv.status === "paid" && s.statusActive]}>
                        <Text style={[s.statusText, inv.status === "paid" && s.statusActiveText]}>{inv.status}</Text>
                      </View>
                    </View>
                    <Text style={s.invoiceAmount}>{formatCurrency(inv.amount, inv.currency)}</Text>
                    {inv.description && <Text style={s.invoiceDesc}>{inv.description}</Text>}
                    <Text style={s.invoiceDate}>{new Date(inv.createdAt).toLocaleDateString()}</Text>
                    {inv.status === "issued" && (
                      <Pressable
                        style={[s.payBtn, payingInvoiceId === inv.id && s.btnDisabled]}
                        disabled={payingInvoiceId === inv.id}
                        onPress={() => void handlePayInvoice(inv)}
                      >
                        {payingInvoiceId === inv.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="card-outline" size={14} color="#fff" />
                            <Text style={s.payBtnText}>Pay invoice</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                ))
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyBody}>No invoices yet.</Text>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  page: { gap: 14, padding: 20, paddingBottom: 100 },
  stateWrap: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 20 },
  stateText: { color: palette.slate, fontSize: 14 },
  heading: { color: palette.ink, fontSize: 22, fontWeight: "800" },
  subheading: { color: palette.slate, fontSize: 14, lineHeight: 20 },

  // Error
  errorCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: palette.dangerSoft, borderRadius: 12, padding: 12,
  },
  errorText: { color: palette.danger, fontSize: 13, fontWeight: "600", flex: 1 },

  // Create toggle
  createToggle: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: palette.accentSoft, borderRadius: 14, padding: 14,
  },
  createToggleText: { color: palette.accentDeep, fontSize: 14, fontWeight: "700", flex: 1 },

  // Form
  formCard: {
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 18,
    borderWidth: 1, gap: 10, padding: 16,
  },
  formLabel: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  input: {
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 12,
    borderWidth: 1, color: palette.ink, fontSize: 14,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: palette.mist, borderColor: palette.line, borderRadius: 20,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7,
  },
  chipActive: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
  chipText: { color: palette.slate, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: palette.accentDeep, fontWeight: "700" },
  primaryBtn: {
    alignItems: "center", backgroundColor: palette.accentDeep, borderRadius: 14,
    flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 48, paddingHorizontal: 14,
  },
  primaryBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },

  // Empty
  emptyCard: {
    alignItems: "center", backgroundColor: palette.card, borderColor: palette.line,
    borderRadius: 18, borderWidth: 1, gap: 8, padding: 30,
  },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: "700" },
  emptyBody: { color: palette.slate, fontSize: 14, textAlign: "center" },

  // Account card
  accountCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16,
    borderWidth: 1, padding: 14,
  },
  accountIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: palette.accentSoft, alignItems: "center", justifyContent: "center",
  },
  accountName: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  accountMeta: { color: palette.slate, fontSize: 12 },

  // Status badge
  statusBadge: {
    backgroundColor: palette.mist, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  statusActive: { backgroundColor: palette.accentSoft },
  statusText: { color: palette.slate, fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  statusActiveText: { color: palette.accent },

  // Back row
  backRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { color: palette.accentDeep, fontSize: 14, fontWeight: "700" },

  // Tab bar
  tabBar: {
    flexDirection: "row", backgroundColor: palette.mist, borderRadius: 14,
    padding: 3, gap: 2,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, borderRadius: 12, paddingVertical: 10,
  },
  tabBtnActive: {
    backgroundColor: palette.card,
    shadowColor: palette.shadow, shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  tabBtnText: { color: palette.slate, fontSize: 12, fontWeight: "600" },
  tabBtnTextActive: { color: palette.accentDeep, fontWeight: "700" },

  tabContent: { gap: 12 },

  // Overview
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "47%", alignItems: "center", gap: 4,
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16,
    borderWidth: 1, paddingVertical: 16,
  },
  statValue: { color: palette.ink, fontSize: 20, fontWeight: "800" },
  statLabel: { color: palette.slate, fontSize: 12, fontWeight: "600" },
  detailRow: {
    flexDirection: "row", justifyContent: "space-between", width: "100%",
    paddingHorizontal: 4,
  },
  detailLabel: { color: palette.slate, fontSize: 13, fontWeight: "600" },
  detailValue: { color: palette.ink, fontSize: 13, fontWeight: "700" },

  // Member card
  memberCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14,
    borderWidth: 1, padding: 12,
  },
  memberAvatar: { width: 40, height: 40, borderRadius: 20 },
  memberAvatarPlaceholder: { backgroundColor: palette.mist, alignItems: "center", justifyContent: "center" },
  memberName: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  memberMeta: { color: palette.slate, fontSize: 12, textTransform: "capitalize" },

  // Job card
  jobCard: {
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16,
    borderWidth: 1, gap: 6, padding: 14,
  },
  jobHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  jobTitle: { color: palette.ink, fontSize: 15, fontWeight: "700", flex: 1 },
  jobMeta: { color: palette.slate, fontSize: 12 },
  jobDesc: { color: palette.slate, fontSize: 13, lineHeight: 19 },

  // Invoice card
  invoiceCard: {
    backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16,
    borderWidth: 1, gap: 6, padding: 14,
  },
  invoiceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  invoiceId: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  invoiceAmount: { color: palette.accent, fontSize: 20, fontWeight: "800" },
  invoiceDesc: { color: palette.slate, fontSize: 13 },
  invoiceDate: { color: palette.slate, fontSize: 11 },
  payBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: palette.accentDeep, borderRadius: 12,
    paddingVertical: 10, marginTop: 4,
  },
  payBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
}));
