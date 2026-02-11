import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { verifyPayment } from "@/lib/api";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const PaymentVerify = () => {
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your payment...");
  const [purpose, setPurpose] = useState<"orders" | "boost" | "subscription" | "invoice">(
    "orders",
  );
  const hasRequested = useRef(false);

  useEffect(() => {
    if (hasRequested.current) return;
    hasRequested.current = true;

    const provider = searchParams.get("provider");
    if (provider !== "flutterwave" && provider !== "stripe" && provider !== "paystack") {
      setStatus("error");
      setMessage("Missing or invalid payment provider.");
      return;
    }

    const rawPurpose = searchParams.get("purpose");
    const requestedPurpose =
      rawPurpose === "boost" || rawPurpose === "subscription" || rawPurpose === "invoice"
        ? (rawPurpose as "boost" | "subscription" | "invoice")
        : "orders";

    verifyPayment({
      provider,
      transactionId: searchParams.get("transaction_id"),
      txRef: searchParams.get("tx_ref"),
      sessionId: searchParams.get("session_id"),
      reference: searchParams.get("reference") ?? searchParams.get("trxref"),
    })
      .then((result) => {
        const resolvedPurpose = result.purpose ?? requestedPurpose;
        setPurpose(resolvedPurpose);
        if (resolvedPurpose === "orders") {
          clearCart();
        }

        setStatus("success");
        if (resolvedPurpose === "boost") {
          const title = result.boost?.service?.title;
          setMessage(
            title
              ? `Payment confirmed. Your boost for ${title} is now active.`
              : "Payment confirmed. Your boost is now active.",
          );
        } else if (resolvedPurpose === "invoice") {
          setMessage("Payment confirmed. Your business invoice has been paid.");
        } else if (resolvedPurpose === "subscription") {
          const planName = result.subscription?.plan?.name;
          setMessage(
            planName
              ? `Payment confirmed. Your ${planName} plan is now active.`
              : "Payment confirmed. Your subscription is now active.",
          );
        } else {
          const count = result.orders?.length ?? 0;
          const label = count > 1 ? "orders" : "order";
          setMessage(
            count > 0
              ? `Payment confirmed. Your ${count} ${label} ${count > 1 ? "are" : "is"} now in escrow.`
              : "Payment confirmed. Your orders are now in escrow.",
          );
        }
      })
      .catch((error) => {
        const fallback = "Unable to verify payment. Please try again.";
        setStatus("error");
        setPurpose(requestedPurpose);
        setMessage(error instanceof Error ? error.message : fallback);
      });
  }, [searchParams, clearCart]);

  useEffect(() => {
    if (status !== "success") {
      return;
    }

    const timer = window.setTimeout(() => {
      navigate("/", { replace: true });
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [status, navigate]);

  const primaryAction =
    purpose === "boost"
      ? { label: "View Boosts", to: "/dashboard/boosts" }
      : purpose === "subscription"
        ? { label: "Manage Subscription", to: "/dashboard/subscription" }
        : purpose === "invoice"
          ? { label: "Business Accounts", to: "/business" }
          : { label: "Continue Browsing", to: "/" };

  const secondaryAction =
    purpose === "orders"
      ? { label: "View Messages", to: "/messages" }
      : purpose === "invoice"
        ? { label: "Back to Business", to: "/business" }
        : { label: "Back to Dashboard", to: "/dashboard" };

  const errorAction =
    purpose === "boost"
      ? { label: "Back to Boosts", to: "/dashboard/boosts" }
      : purpose === "subscription"
        ? { label: "Back to Subscription", to: "/dashboard/subscription" }
        : purpose === "invoice"
          ? { label: "Back to Business", to: "/business" }
          : { label: "Try Again", to: "/cart" };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-10 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="text-center py-16 bg-card rounded-2xl border border-border/50">
            <div className="w-20 h-20 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              {status === "success" ? (
                <CheckCircle2 className="w-10 h-10 text-secondary" />
              ) : (
                <AlertCircle className="w-10 h-10 text-primary" />
              )}
            </div>
            <h1 className="text-3xl font-display font-bold mb-4">
              {status === "success" ? "Payment Successful" : "Payment Status"}
            </h1>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">{message}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" asChild>
                <Link to={secondaryAction.to}>{secondaryAction.label}</Link>
              </Button>
              <Button variant="gold" asChild>
                <Link to={primaryAction.to}>
                  {status === "success" ? primaryAction.label : "Back to Home"}
                </Link>
              </Button>
              {status === "error" && (
                <Button variant="outline" asChild>
                  <Link to={errorAction.to}>{errorAction.label}</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PaymentVerify;
