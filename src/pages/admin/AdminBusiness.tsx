import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createBusinessInvoice,
  createBusinessJobOrder,
  fetchAdminBusinessAccounts,
  fetchBusinessAccount,
  fetchBusinessInvoices,
  fetchService,
  fetchServices,
} from "@/lib/api";
import { toast } from "sonner";

const AdminBusiness = () => {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [invoiceStart, setInvoiceStart] = useState("");
  const [invoiceEnd, setInvoiceEnd] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedTierId, setSelectedTierId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["admin-business-accounts"],
    queryFn: fetchAdminBusinessAccounts,
  });

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const {
    data: accountDetail,
    isLoading: accountLoading,
    refetch: refetchAccount,
  } = useQuery({
    queryKey: ["admin-business-account", selectedAccountId],
    queryFn: () => fetchBusinessAccount(selectedAccountId),
    enabled: Boolean(selectedAccountId),
  });

  const {
    data: invoices = [],
    isLoading: invoicesLoading,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ["admin-business-invoices", selectedAccountId],
    queryFn: () => fetchBusinessInvoices(selectedAccountId),
    enabled: Boolean(selectedAccountId),
  });

  const { data: services = [] } = useQuery({
    queryKey: ["admin-business-services"],
    queryFn: () => fetchServices(),
  });

  const { data: selectedService } = useQuery({
    queryKey: ["admin-business-service", selectedServiceId],
    queryFn: () => fetchService(selectedServiceId),
    enabled: Boolean(selectedServiceId),
  });

  useEffect(() => {
    setSelectedTierId("");
  }, [selectedServiceId]);

  const tiers = selectedService?.tiers ?? [];
  const openJobs = useMemo(
    () => (accountDetail?.jobs ?? []).filter((job) => job.status === "open"),
    [accountDetail?.jobs],
  );

  const handleIssueInvoice = async () => {
    if (!selectedAccountId) return;
    if (!invoiceStart || !invoiceEnd) {
      toast.error("Select a start and end date for the invoice.");
      return;
    }
    setIsSubmitting(true);
    try {
      await createBusinessInvoice({
        accountId: selectedAccountId,
        periodStart: invoiceStart,
        periodEnd: invoiceEnd,
        status: "issued",
      });
      toast.success("Invoice issued.");
      await refetchInvoices();
      setInvoiceStart("");
      setInvoiceEnd("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to issue invoice.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOrder = async (jobId: string) => {
    if (!selectedAccountId) return;
    if (!selectedServiceId || !selectedTierId) {
      toast.error("Select a service and tier first.");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be a positive number.");
      return;
    }
    setIsSubmitting(true);
    try {
      await createBusinessJobOrder({
        accountId: selectedAccountId,
        jobId,
        serviceId: selectedServiceId,
        tierId: selectedTierId,
        quantity: qty,
      });
      toast.success("Order created for job.");
      await refetchAccount();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create order.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Business Accounts</h2>
        <p className="text-sm text-muted-foreground">
          Monitor corporate accounts, issue invoices, and link jobs to orders.
        </p>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {accountsLoading ? (
            <div className="text-sm text-muted-foreground">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No business accounts found.</div>
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
              {accountDetail && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-foreground">{accountDetail.name}</span>
                    <span className="text-xs text-muted-foreground uppercase">
                      {accountDetail.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Members: {accountDetail.memberCount ?? 0} | Jobs: {accountDetail.jobCount ?? 0}
                  </p>
                  {accountDetail.industry && (
                    <p className="text-xs text-muted-foreground">Industry: {accountDetail.industry}</p>
                  )}
                  {accountDetail.size && (
                    <p className="text-xs text-muted-foreground">Size: {accountDetail.size}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAccountId && (
        <div className="grid gap-6 lg:grid-cols-[2fr,3fr]">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Issue invoice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Period start</Label>
                  <Input
                    type="date"
                    value={invoiceStart}
                    onChange={(event) => setInvoiceStart(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Period end</Label>
                  <Input
                    type="date"
                    value={invoiceEnd}
                    onChange={(event) => setInvoiceEnd(event.target.value)}
                  />
                </div>
              </div>
              <Button variant="gold" onClick={handleIssueInvoice} disabled={isSubmitting}>
                {isSubmitting ? "Issuing..." : "Issue invoice"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Invoices include unpaid business orders in the selected period.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
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
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="rounded-lg border border-border/50 px-3 py-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">Invoice {invoice.id}</p>
                          <p className="text-xs text-muted-foreground uppercase">{invoice.status}</p>
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
                      <p className="text-xs text-muted-foreground mt-2">
                        Period: {new Date(invoice.periodStart).toLocaleDateString()} -{" "}
                        {new Date(invoice.periodEnd).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {selectedAccountId && (
        <div className="grid gap-6 lg:grid-cols-[2fr,3fr]">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Link jobs to orders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Service</Label>
                <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={selectedTierId} onValueChange={setSelectedTierId} disabled={!selectedServiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((tier) => (
                      <SelectItem key={tier.id} value={tier.id}>
                        {tier.name} · {tier.currency} {tier.price}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Select a service and tier before creating an order for a job.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Open jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {accountLoading ? (
                <div className="text-sm text-muted-foreground">Loading jobs...</div>
              ) : openJobs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No open jobs.</div>
              ) : (
                <div className="space-y-3">
                  {openJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg border border-border/50 px-3 py-3 text-sm space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{job.title}</p>
                          <p className="text-xs text-muted-foreground">{job.category}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCreateOrder(job.id)}
                          disabled={isSubmitting || !selectedServiceId || !selectedTierId}
                        >
                          {isSubmitting ? "Creating..." : "Create order"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{job.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdminBusiness;
