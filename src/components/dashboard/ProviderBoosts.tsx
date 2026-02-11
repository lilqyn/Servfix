import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fetchBoostOptions,
  fetchProviderBoosts,
  fetchProviderPayouts,
  createBoostCheckout,
  purchaseBoost,
  type BoostType,
} from "@/lib/api";
import { useProviderServices } from "@/hooks/useProviderServices";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { toast } from "sonner";

const formatCurrency = (amount: number, currency: "GHS" | "USD" | "EUR") =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(amount);

const formatDuration = (hours: number) => {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
};

const ProviderBoosts = () => {
  const { data: services = [] } = useProviderServices();
  const publishedServices = useMemo(
    () => services.filter((service) => service.status === "published"),
    [services],
  );
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<"wallet" | "gateway">("wallet");
  const [paymentProvider, setPaymentProvider] = useState<"flutterwave" | "stripe" | "paystack">("flutterwave");
  const [paymentMethod, setPaymentMethod] = useState<"mobile_money" | "card">("mobile_money");
  const [activePurchase, setActivePurchase] = useState<string | null>(null);
  const { data: publicSettings } = usePublicSettings();

  const { data: options = [], isLoading: optionsLoading, error: optionsError } = useQuery({
    queryKey: ["boost-options"],
    queryFn: fetchBoostOptions,
  });

  const {
    data: boosts = [],
    isLoading: boostsLoading,
    refetch: refetchBoosts,
  } = useQuery({
    queryKey: ["provider-boosts"],
    queryFn: fetchProviderBoosts,
  });

  const { data: payoutData, refetch: refetchPayouts } = useQuery({
    queryKey: ["provider-payouts"],
    queryFn: fetchProviderPayouts,
  });

  const boostLabelMap = useMemo(
    () => new Map(options.map((option) => [option.type, option.label])),
    [options],
  );

  useEffect(() => {
    if (!selectedServiceId && publishedServices.length > 0) {
      setSelectedServiceId(publishedServices[0].id);
    }
  }, [publishedServices, selectedServiceId]);

  const walletBalance = payoutData?.wallet ? Number(payoutData.wallet.availableBalance) : 0;
  const walletCurrency = payoutData?.wallet?.currency ?? "GHS";
  const selectedService = publishedServices.find((service) => service.id === selectedServiceId);
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

  const handleWalletPurchase = async (type: BoostType) => {
    if (!selectedService) {
      toast.error("Select a published service to boost.");
      return;
    }

    setActivePurchase(type);
    try {
      await purchaseBoost({ serviceId: selectedService.id, type });
      toast.success("Boost activated.");
      await Promise.all([refetchBoosts(), refetchPayouts()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to purchase boost.";
      toast.error(message);
    } finally {
      setActivePurchase(null);
    }
  };

  const handleGatewayPurchase = async (type: BoostType) => {
    if (!selectedService) {
      toast.error("Select a published service to boost.");
      return;
    }

    if (availableProviders.length === 0) {
      toast.error("No payment providers are currently available.");
      return;
    }

    setActivePurchase(type);
    try {
      const response = await createBoostCheckout({
        serviceId: selectedService.id,
        type,
        provider: paymentProvider,
        method: paymentProvider === "stripe" ? "card" : paymentMethod,
      });
      window.location.href = response.checkoutUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start payment.";
      toast.error(message);
    } finally {
      setActivePurchase(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Boost your visibility</CardTitle>
          <p className="text-sm text-muted-foreground">
            Promote a service to get more views and bookings. Pay with your wallet balance or online.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-muted/40 px-4 py-3">
            <span className="text-sm text-muted-foreground">Available balance</span>
            <span className="text-sm font-semibold text-foreground">
              {formatCurrency(walletBalance, walletCurrency)}
            </span>
          </div>

          <div className="space-y-2 max-w-md">
            <span className="text-sm font-medium text-foreground">Payment source</span>
            <Select value={paymentMode} onValueChange={(value) => setPaymentMode(value as "wallet" | "gateway")}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wallet">Wallet balance</SelectItem>
                <SelectItem value="gateway">Pay online</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 max-w-md">
            <span className="text-sm font-medium text-foreground">Choose a service</span>
            <Select
              value={selectedServiceId}
              onValueChange={setSelectedServiceId}
              disabled={publishedServices.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a published service" />
              </SelectTrigger>
              <SelectContent>
                {publishedServices.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {publishedServices.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Publish a service before buying boosts.
              </p>
            )}
          </div>

          {paymentMode === "gateway" && (
            <div className="space-y-4">
              {availableProviders.length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                  No payment providers are currently available.
                </div>
              ) : (
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
              )}

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
                        <p className="text-xs text-muted-foreground">MTN, Vodafone, AirtelTigo</p>
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

          {optionsError ? (
            <div className="text-sm text-destructive">
              {optionsError instanceof Error ? optionsError.message : "Unable to load boost options."}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {options.map((option) => {
                const insufficient = walletBalance < option.price;
                const walletDisabled = paymentMode === "wallet" && insufficient;
                const gatewayDisabled = paymentMode === "gateway" && availableProviders.length === 0;
                const isDisabled =
                  optionsLoading ||
                  !selectedService ||
                  activePurchase === option.type ||
                  walletDisabled ||
                  gatewayDisabled;
                const buttonLabel =
                  paymentMode === "wallet"
                    ? insufficient
                      ? "Insufficient balance"
                      : "Activate boost"
                    : "Pay online";
                return (
                  <div
                    key={option.type}
                    className="rounded-xl border border-border/50 bg-card p-4 space-y-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-primary">
                        {formatCurrency(option.price, option.currency)}
                      </span>
                      <span className="text-muted-foreground"> - {formatDuration(option.durationHours)}</span>
                    </div>
                    <Button
                      variant="gold"
                      size="sm"
                      className="w-full"
                      disabled={isDisabled}
                      onClick={() =>
                        paymentMode === "wallet"
                          ? handleWalletPurchase(option.type)
                          : handleGatewayPurchase(option.type)
                      }
                    >
                      {activePurchase === option.type ? "Processing..." : buttonLabel}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Your boosts</CardTitle>
        </CardHeader>
        <CardContent>
          {boostsLoading ? (
            <div className="text-sm text-muted-foreground">Loading boosts...</div>
          ) : boosts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No boosts purchased yet.</div>
          ) : (
            <div className="space-y-3">
              {boosts.map((boost) => (
                <div
                  key={boost.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {boost.service?.title ?? "Service boost"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(boostLabelMap.get(boost.type) ?? boost.type.replace(/_/g, " "))} - Ends{" "}
                      {format(new Date(boost.endsAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Badge variant={boost.status === "active" ? "secondary" : "outline"}>
                    {boost.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProviderBoosts;
