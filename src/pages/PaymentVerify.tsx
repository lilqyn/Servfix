import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { verifyPayment } from "@/lib/api";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const PaymentVerify = () => {
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your payment...");
  const hasRequested = useRef(false);

  useEffect(() => {
    if (hasRequested.current) return;
    hasRequested.current = true;

    const provider = searchParams.get("provider");
    if (provider !== "flutterwave" && provider !== "stripe") {
      setStatus("error");
      setMessage("Missing or invalid payment provider.");
      return;
    }

    verifyPayment({
      provider,
      transactionId: searchParams.get("transaction_id"),
      txRef: searchParams.get("tx_ref"),
      sessionId: searchParams.get("session_id"),
    })
      .then(() => {
        setStatus("success");
        setMessage("Payment confirmed. Your orders are now in escrow.");
        clearCart();
      })
      .catch((error) => {
        const fallback = "Unable to verify payment. Please try again.";
        setStatus("error");
        setMessage(error instanceof Error ? error.message : fallback);
      });
  }, [searchParams, clearCart]);

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
                <Link to="/messages">View Messages</Link>
              </Button>
              <Button variant="gold" asChild>
                <Link to="/">{status === "success" ? "Continue Browsing" : "Back to Home"}</Link>
              </Button>
              {status === "error" && (
                <Button variant="outline" asChild>
                  <Link to="/cart">Try Again</Link>
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
