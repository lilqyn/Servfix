import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import {
  addBusinessMember,
  createBusinessInvoiceCheckout,
  createBusinessAccount,
  createBusinessJob,
  fetchBusinessAccount,
  fetchBusinessInvoices,
  fetchMyBusinessAccounts,
  type BusinessAccount,
} from "@/lib/api";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { toast } from "sonner";

const Business = () => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [accountName, setAccountName] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [memberIdentifier, setMemberIdentifier] = useState("");
  const [memberRole, setMemberRole] = useState<"admin" | "member">("member");
  const [jobTitle, setJobTitle] = useState("");
  const [jobCategory, setJobCategory] = useState("");
  const [jobBudget, setJobBudget] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [paymentProvider, setPaymentProvider] = useState<"flutterwave" | "stripe" | "paystack">("flutterwave");
  const [paymentMethod, setPaymentMethod] = useState<"mobile_money" | "card">("mobile_money");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  const { data: publicSettings } = usePublicSettings();

  const {
    data: accounts = [],
    isLoading: accountsLoading,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: ["business-accounts"],
    queryFn: fetchMyBusinessAccounts,
  });

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
    if (accounts.length === 0) {
      setSelectedAccountId("");
    }
  }, [accounts, selectedAccountId]);

  const {
    data: accountDetail,
    isLoading: accountLoading,
    refetch: refetchAccount,
  } = useQuery({
    queryKey: ["business-account", selectedAccountId],
    queryFn: () => fetchBusinessAccount(selectedAccountId),
    enabled: Boolean(selectedAccountId),
  });

  const {
    data: invoices = [],
    isLoading: invoicesLoading,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ["business-invoices", selectedAccountId],
    queryFn: () => fetchBusinessInvoices(selectedAccountId),
    enabled: Boolean(selectedAccountId),
  });

  const paymentConfig = publicSettings?.payments;
  const availableProviders = useMemo(
    () => paymentConfig?.enabledProviders ?? ["flutterwave", "stripe", "paystack"],
    [paymentConfig?.enabledProviders],
  );
  const defaultProvider = paymentConfig?.defaultProvider ?? "flutterwave";
  const safeDefaultProvider = availableProviders.includes(defaultProvider)
    ? defaultProvider
    : availableProviders[0];
  const flutterwaveEnabled = availableProviders.includes("flutterwave");
  const stripeEnabled = availableProviders.includes("stripe");
  const paystackEnabled = availableProviders.includes("paystack");

  useEffect(() => {
    if (availableProviders.length === 0) {
      return;
    }
    if (!availableProviders.includes(paymentProvider)) {
      setPaymentProvider(safeDefaultProvider);
    }
  }, [availableProviders, paymentProvider, safeDefaultProvider]);

  useEffect(() => {
    if (paymentProvider === "stripe") {
      setPaymentMethod("card");
    }
  }, [paymentProvider]);

  const selectedAccount = useMemo<BusinessAccount | null>(() => {
    if (!selectedAccountId) return null;
    return accountDetail ?? accounts.find((account) => account.id === selectedAccountId) ?? null;
  }, [accountDetail, accounts, selectedAccountId]);

  const handleCreateAccount = async () => {
    if (!accountName.trim()) {
      toast.error("Enter a business name.");
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await createBusinessAccount({
        name: accountName.trim(),
        industry: industry.trim() || undefined,
        size: size.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Business account created.");
      setAccountName("");
      setIndustry("");
      setSize("");
      setNotes("");
      await refetchAccounts();
      setSelectedAccountId(created.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create account.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedAccountId) return;
    if (!memberIdentifier.trim()) {
      toast.error("Enter a member email, phone, username, or user id.");
      return;
    }
    setIsSubmitting(true);
    try {
      await addBusinessMember({
        accountId: selectedAccountId,
        identifier: memberIdentifier.trim(),
        role: memberRole,
      });
      toast.success("Member added.");
      setMemberIdentifier("");
      await refetchAccount();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add member.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateJob = async () => {
    if (!selectedAccountId) return;
    if (!jobTitle.trim() || !jobCategory.trim() || !jobDescription.trim()) {
      toast.error("Provide a title, category, and description.");
      return;
    }
    const budgetValue = jobBudget ? Number(jobBudget) : undefined;
    if (jobBudget && (!Number.isFinite(budgetValue) || budgetValue < 0)) {
      toast.error("Budget must be a valid number.");
      return;
    }
    setIsSubmitting(true);
    try {
      await createBusinessJob({
        accountId: selectedAccountId,
        title: jobTitle.trim(),
        category: jobCategory.trim(),
        description: jobDescription.trim(),
        budget: budgetValue,
        currency: "GHS",
      });
      toast.success("Job request created.");
      setJobTitle("");
      setJobCategory("");
      setJobBudget("");
      setJobDescription("");
      await refetchAccount();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create job.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    if (availableProviders.length === 0) {
      toast.error("No payment providers are currently available.");
      return;
    }
    setPayingInvoiceId(invoiceId);
    try {
      const response = await createBusinessInvoiceCheckout({
        invoiceId,
        provider: paymentProvider,
        method: paymentProvider === "stripe" ? "card" : paymentMethod,
      });
      window.location.href = response.checkoutUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start payment.";
      toast.error(message);
    } finally {
      setPayingInvoiceId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-10 pb-16">
        <div className="container mx-auto px-4 space-y-8">
          <div>
            <h1 className="text-3xl font-display font-bold mb-2">Business accounts</h1>
            <p className="text-muted-foreground">
              Manage corporate teams, post jobs, and track account activity.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr,3fr]">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Create a business account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Business name</Label>
                  <Input
                    value={accountName}
                    onChange={(event) => setAccountName(event.target.value)}
                    placeholder="Acme Events Ltd"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input
                      value={industry}
                      onChange={(event) => setIndustry(event.target.value)}
                      placeholder="Hospitality, Real estate"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company size</Label>
                    <Input
                      value={size}
                      onChange={(event) => setSize(event.target.value)}
                      placeholder="1-10, 11-50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Add any internal notes for this account."
                    rows={3}
                  />
                </div>
                <Button variant="gold" onClick={handleCreateAccount} disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create account"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Your business accounts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {accountsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading accounts...</div>
                ) : accounts.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No business accounts yet.</div>
                ) : (
                  <div className="space-y-3">
                    <Label>Select account</Label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedAccount && (
                      <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold text-foreground">{selectedAccount.name}</span>
                          <span className="text-xs text-muted-foreground uppercase">
                            {selectedAccount.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Members: {selectedAccount.memberCount ?? 0} | Jobs: {selectedAccount.jobCount ?? 0}
                        </p>
                        {selectedAccount.industry && (
                          <p className="text-xs text-muted-foreground">Industry: {selectedAccount.industry}</p>
                        )}
                        {selectedAccount.size && (
                          <p className="text-xs text-muted-foreground">Size: {selectedAccount.size}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {selectedAccountId && (
            <div className="grid gap-6 lg:grid-cols-[2fr,3fr]">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Team members</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <Label>Add member</Label>
                    <Input
                      value={memberIdentifier}
                      onChange={(event) => setMemberIdentifier(event.target.value)}
                      placeholder="email, phone, username, or user id"
                    />
                    <Select value={memberRole} onValueChange={(value) => setMemberRole(value as "admin" | "member")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={handleAddMember} disabled={isSubmitting}>
                      {isSubmitting ? "Adding..." : "Add member"}
                    </Button>
                  </div>

                  {accountLoading ? (
                    <div className="text-sm text-muted-foreground">Loading members...</div>
                  ) : accountDetail?.members && accountDetail.members.length > 0 ? (
                    <div className="space-y-2">
                      {accountDetail.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {member.user.username ?? member.user.email ?? member.user.phone ?? member.user.id}
                            </p>
                            <p className="text-xs text-muted-foreground">{member.role}</p>
                          </div>
                          <span className="text-xs text-muted-foreground uppercase">{member.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No members yet.</div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Job requests</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <Label>New job request</Label>
                    <Input
                      value={jobTitle}
                      onChange={(event) => setJobTitle(event.target.value)}
                      placeholder="Office cleaning for 3 floors"
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        value={jobCategory}
                        onChange={(event) => setJobCategory(event.target.value)}
                        placeholder="Category"
                      />
                      <Input
                        value={jobBudget}
                        onChange={(event) => setJobBudget(event.target.value)}
                        placeholder="Budget (optional)"
                      />
                    </div>
                    <Textarea
                      value={jobDescription}
                      onChange={(event) => setJobDescription(event.target.value)}
                      placeholder="Describe the scope, deadlines, and requirements."
                      rows={3}
                    />
                    <Button variant="gold" onClick={handleCreateJob} disabled={isSubmitting}>
                      {isSubmitting ? "Posting..." : "Post job request"}
                    </Button>
                  </div>

                  {accountLoading ? (
                    <div className="text-sm text-muted-foreground">Loading jobs...</div>
                  ) : accountDetail?.jobs && accountDetail.jobs.length > 0 ? (
                    <div className="space-y-2">
                      {accountDetail.jobs.map((job) => (
                        <div
                          key={job.id}
                          className="rounded-lg border border-border/50 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-foreground">{job.title}</p>
                            <span className="text-xs text-muted-foreground uppercase">
                              {job.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{job.category}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{job.description}</p>
                          {job.budget && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Budget: {job.currency} {job.budget}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No jobs posted yet.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {selectedAccountId && (
            <div className="grid gap-6 lg:grid-cols-[2fr,3fr]">
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Invoice payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {availableProviders.length === 0 ? (
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                      No payment providers are currently available.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        {flutterwaveEnabled && (
                          <button
                            className={`p-4 border-2 rounded-xl text-left transition-colors ${
                              paymentProvider === "flutterwave"
                                ? "border-primary bg-primary/5"
                                : "border-border/50 hover:border-primary/50"
                            }`}
                            onClick={() => setPaymentProvider("flutterwave")}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                <span className="text-lg font-bold text-primary">F</span>
                              </div>
                              <div>
                                <p className="font-semibold">Flutterwave</p>
                                <p className="text-xs text-muted-foreground">Mobile Money + Card</p>
                              </div>
                            </div>
                          </button>
                        )}
                        {stripeEnabled && (
                          <button
                            className={`p-4 border-2 rounded-xl text-left transition-colors ${
                              paymentProvider === "stripe"
                                ? "border-primary bg-primary/5"
                                : "border-border/50 hover:border-primary/50"
                            }`}
                            onClick={() => setPaymentProvider("stripe")}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                                <span className="text-lg font-bold text-muted-foreground">S</span>
                              </div>
                              <div>
                                <p className="font-semibold">Stripe</p>
                                <p className="text-xs text-muted-foreground">Card payments</p>
                              </div>
                            </div>
                          </button>
                        )}
                        {paystackEnabled && (
                          <button
                            className={`p-4 border-2 rounded-xl text-left transition-colors ${
                              paymentProvider === "paystack"
                                ? "border-primary bg-primary/5"
                                : "border-border/50 hover:border-primary/50"
                            }`}
                            onClick={() => setPaymentProvider("paystack")}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                                <span className="text-lg font-bold text-muted-foreground">P</span>
                              </div>
                              <div>
                                <p className="font-semibold">Paystack</p>
                                <p className="text-xs text-muted-foreground">Mobile Money + Card</p>
                              </div>
                            </div>
                          </button>
                        )}
                      </div>
                      {(paymentProvider === "flutterwave" || paymentProvider === "paystack") &&
                        (paymentProvider === "flutterwave" ? flutterwaveEnabled : paystackEnabled) && (
                          <div className="grid sm:grid-cols-2 gap-4">
                          <button
                            className={`p-4 border-2 rounded-xl text-left transition-colors ${
                              paymentMethod === "mobile_money"
                                ? "border-primary bg-primary/5"
                                : "border-border/50 hover:border-primary/50"
                            }`}
                            onClick={() => setPaymentMethod("mobile_money")}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                <span className="text-lg font-bold text-primary">M</span>
                              </div>
                              <div>
                                <p className="font-semibold">Mobile Money</p>
                                <p className="text-xs text-muted-foreground">
                                  MTN, Vodafone, AirtelTigo
                                </p>
                              </div>
                            </div>
                          </button>
                          <button
                            className={`p-4 border-2 rounded-xl text-left transition-colors ${
                              paymentMethod === "card"
                                ? "border-primary bg-primary/5"
                                : "border-border/50 hover:border-primary/50"
                            }`}
                            onClick={() => setPaymentMethod("card")}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                                <span className="text-lg font-bold text-muted-foreground">C</span>
                              </div>
                              <div>
                                <p className="font-semibold">Card Payment</p>
                                <p className="text-xs text-muted-foreground">Visa, Mastercard</p>
                              </div>
                            </div>
                          </button>
                        </div>
                        )}
                      {paymentProvider === "stripe" && stripeEnabled && (
                        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                          Stripe supports card payments only. You will be redirected to complete payment.
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Invoices</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {invoicesLoading ? (
                    <div className="text-sm text-muted-foreground">Loading invoices...</div>
                  ) : invoices.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No invoices yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {invoices.map((invoice) => {
                        const isPayable = invoice.status === "issued";
                        return (
                          <div
                            key={invoice.id}
                            className="rounded-lg border border-border/50 px-3 py-3 text-sm space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-medium text-foreground">Invoice {invoice.id}</p>
                                <p className="text-xs text-muted-foreground uppercase">
                                  {invoice.status}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-foreground">
                                  {invoice.currency} {invoice.total}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Orders: {invoice.orderCount ?? 0}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground">
                                Period: {new Date(invoice.periodStart).toLocaleDateString()} -{" "}
                                {new Date(invoice.periodEnd).toLocaleDateString()}
                              </p>
                              {isPayable && (
                                <Button
                                  size="sm"
                                  variant="gold"
                                  onClick={() => handlePayInvoice(invoice.id)}
                                  disabled={payingInvoiceId === invoice.id}
                                >
                                  {payingInvoiceId === invoice.id ? "Processing..." : "Pay invoice"}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Business;
