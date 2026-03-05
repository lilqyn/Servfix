import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  cancelSubscription,
  createSubscriptionCheckout,
  fetchMySubscription,
  fetchSubscriptionPlans,
  type SubscriptionPlan,
} from "@/lib/api";
import { formatCurrencyAmount, type CurrencyCode } from "@/lib/currency";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { toast } from "sonner";

const formatCurrency = (amount: number, currency: CurrencyCode) =>
  formatCurrencyAmount(amount, currency, {
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  });

const ProviderSubscriptions = () => {
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<
    "flutterwave" | "stripe" | "paystack" | "hubtel" | "expresspay"
  >("flutterwave");
  const [paymentMethod, setPaymentMethod] = useState<"mobile_money" | "card">("mobile_money");
  const { data: publicSettings } = usePublicSettings();

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: fetchSubscriptionPlans,
  });

  const {
    data: subscription,
    isLoading: subscriptionLoading,
    refetch: refetchSubscription,
  } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: fetchMySubscription,
  });

  const paymentConfig = publicSettings?.payments;
  const availableProviders = useMemo(
    () =>
      paymentConfig?.enabledProviders ?? [
        "flutterwave",
        "stripe",
        "paystack",
        "hubtel",
        "expresspay",
      ],
    [paymentConfig?.enabledProviders],
  );
  const defaultProvider = paymentConfig?.defaultProvider ?? "flutterwave";
  const safeDefaultProvider = availableProviders.includes(defaultProvider)
    ? defaultProvider
    : availableProviders[0];
  const flutterwaveEnabled = availableProviders.includes("flutterwave");
  const stripeEnabled = availableProviders.includes("stripe");
  const paystackEnabled = availableProviders.includes("paystack");
  const hubtelEnabled = availableProviders.includes("hubtel");
  const expresspayEnabled = availableProviders.includes("expresspay");

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
    if (paymentProvider === "hubtel") {
      setPaymentMethod("mobile_money");
    }
    if (paymentProvider === "expresspay") {
      setPaymentMethod("mobile_money");
    }
  }, [paymentProvider]);

  const paidPlans = plans.filter((plan) => Number(plan.monthlyPrice) > 0);
  const freePlan =
    plans.find((plan) => Number(plan.monthlyPrice) <= 0) ??
    plans.find((plan) => plan.benefits.tier === "free") ??
    null;
  const currentPlan: SubscriptionPlan | null = subscription?.plan ?? freePlan;

  const handleCheckout = async (plan: SubscriptionPlan) => {
    if (availableProviders.length === 0) {
      toast.error("No payment providers are currently available.");
      return;
    }

    setActivePlanId(plan.id);
    try {
      const response = await createSubscriptionCheckout({
        planId: plan.id,
        provider: paymentProvider,
        method:
          paymentProvider === "stripe"
            ? "card"
            : paymentProvider === "hubtel"
              ? "mobile_money"
              : paymentProvider === "expresspay"
                ? "mobile_money"
              : paymentMethod,
      });
      window.location.href = response.checkoutUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start payment.";
      toast.error(message);
    } finally {
      setActivePlanId(null);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await cancelSubscription();
      toast.success("Subscription cancelled.");
      await refetchSubscription();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to cancel subscription.";
      toast.error(message);
    } finally {
      setIsCancelling(false);
    }
  };

  const statusLabel =
    subscription?.status === "active"
      ? "Active"
      : subscription?.status === "past_due"
        ? "Past due"
        : subscription?.status === "cancelled"
          ? "Cancelled"
          : subscription?.status === "expired"
            ? "Expired"
            : "Free";

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Current plan</CardTitle>
          <p className="text-sm text-muted-foreground">
            Plans are optional. Free providers can still earn on SERVFIX.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscriptionLoading ? (
            <div className="text-sm text-muted-foreground">Loading subscription...</div>
          ) : currentPlan ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Plan</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-foreground">{currentPlan.name}</p>
                  <Badge variant={subscription?.status === "active" ? "secondary" : "outline"}>
                    {statusLabel}
                  </Badge>
                </div>
                {subscription?.renewsAt && (
                  <p className="text-xs text-muted-foreground">
                    Renews {format(new Date(subscription.renewsAt), "MMM d, yyyy")}
                  </p>
                )}
              </div>
              {subscription && (
                <Button variant="outline" onClick={handleCancel} disabled={isCancelling}>
                  {isCancelling ? "Cancelling..." : "Cancel subscription"}
                </Button>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No subscription data available.</div>
          )}
        </CardContent>
      </Card>

      {paidPlans.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Payment method</CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose how you want to pay for a plan upgrade.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
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
                {hubtelEnabled && (
                  <button
                    className={`p-4 border-2 rounded-xl text-left transition-colors ${
                      paymentProvider === "hubtel"
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-primary/50"
                    }`}
                    onClick={() => setPaymentProvider("hubtel")}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">H</span>
                      </div>
                      <div>
                        <p className="font-semibold">Hubtel</p>
                        <p className="text-xs text-muted-foreground">Mobile Money</p>
                      </div>
                    </div>
                  </button>
                )}
                {expresspayEnabled && (
                  <button
                    className={`p-4 border-2 rounded-xl text-left transition-colors ${
                      paymentProvider === "expresspay"
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-primary/50"
                    }`}
                    onClick={() => setPaymentProvider("expresspay")}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">E</span>
                      </div>
                      <div>
                        <p className="font-semibold">ExpressPay</p>
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
            {paymentProvider === "hubtel" && hubtelEnabled && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                Hubtel payments use Mobile Money. Make sure your phone number is saved on your account.
              </div>
            )}
            {paymentProvider === "expresspay" && expresspayEnabled && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                ExpressPay supports Mobile Money and card payments. You will choose your preferred
                method at checkout.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Plans</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upgrade to get better placement, analytics, and faster disbursements.
          </p>
        </CardHeader>
        <CardContent>
          {plansLoading ? (
            <div className="text-sm text-muted-foreground">Loading plans...</div>
          ) : plans.length === 0 ? (
            <div className="text-sm text-muted-foreground">No plans available yet.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => {
                const price = Number(plan.monthlyPrice);
                const isCurrent = currentPlan?.id === plan.id;
                const isPaid = price > 0;
                const canDowngradeToFree = !isPaid && Boolean(subscription);
                const features = plan.benefits.features ?? [];
                return (
                  <div
                    key={plan.id}
                    className="rounded-xl border border-border/50 bg-card p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isPaid
                            ? `${formatCurrency(price, plan.currency)} / month`
                            : "Free forever"}
                        </p>
                      </div>
                      {plan.benefits.badgeLabel && (
                        <Badge variant="secondary">{plan.benefits.badgeLabel}</Badge>
                      )}
                    </div>
                    {features.length > 0 && (
                      <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                        {features.map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                    )}
                    <Button
                      variant={isCurrent ? "outline" : "gold"}
                      size="sm"
                      className="w-full"
                      disabled={
                        isCurrent ||
                        activePlanId === plan.id ||
                        (isPaid && availableProviders.length === 0) ||
                        (!isPaid && !subscription)
                      }
                      onClick={() => {
                        if (isPaid) {
                          handleCheckout(plan);
                        } else if (subscription) {
                          handleCancel();
                        }
                      }}
                    >
                      {isCurrent
                        ? "Current plan"
                        : activePlanId === plan.id
                          ? "Processing..."
                          : isPaid
                            ? "Choose plan"
                            : canDowngradeToFree
                              ? "Switch to Free"
                              : "Free plan"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProviderSubscriptions;
