import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/CartContext";
import { createPaymentCheckout } from "@/lib/api";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import {
  ShoppingCart,
  Trash2,
  ArrowRight,
  Shield,
  Lock,
  Calendar,
  Users,
  MapPin,
  AlertCircle,
  CheckCircle2,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";

const Cart = () => {
  const {
    cart,
    removeFromCart,
    updateCartItem,
    getLineTotal,
    getCartTotal,
    getPlatformFee,
    getEscrowAmount,
  } = useCart();

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "details" | "payment" | "success">("cart");
  const [paymentProvider, setPaymentProvider] = useState<"flutterwave" | "stripe">("flutterwave");
  const [paymentMethod, setPaymentMethod] = useState<"mobile_money" | "card">("mobile_money");
  const { data: publicSettings } = usePublicSettings();

  const paymentConfig = publicSettings?.payments;
  const availableProviders = useMemo(
    () => paymentConfig?.enabledProviders ?? ["flutterwave", "stripe"],
    [paymentConfig?.enabledProviders],
  );
  const defaultProvider = paymentConfig?.defaultProvider ?? "flutterwave";
  const safeDefaultProvider = availableProviders.includes(defaultProvider)
    ? defaultProvider
    : availableProviders[0];
  const flutterwaveEnabled = availableProviders.includes("flutterwave");
  const stripeEnabled = availableProviders.includes("stripe");

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

  const handleRemove = (id: string, name: string) => {
    removeFromCart(id);
    toast.success(`${name} removed from cart`);
  };

  const handleProceedToDetails = () => {
    setCheckoutStep("details");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleProceedToPayment = () => {
    setCheckoutStep("payment");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCompleteOrder = async () => {
    if (availableProviders.length === 0) {
      toast.error("No payment providers are currently available.");
      return;
    }
    const missingTier = cart.filter((item) => !item.tierId);
    if (missingTier.length > 0) {
      toast.error("Select a package for each service before checkout. Open the service page to choose one.");
      setCheckoutStep("cart");
      return;
    }

    setIsCheckingOut(true);

    try {
      const response = await createPaymentCheckout({
        provider: paymentProvider,
        method: paymentProvider === "flutterwave" ? paymentMethod : "card",
        items: cart.map((item) => ({
          serviceId: item.id,
          tierId: item.tierId!,
          quantity: item.pricingType === "per_unit" ? item.quantity ?? item.guestCount ?? 1 : 1,
        })),
      });

      window.location.href = response.checkoutUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start payment";
      toast.error(message);
    } finally {
      setIsCheckingOut(false);
    }
  };

  const formatPrice = (amount: number) => {
    return `GH₵ ${amount.toLocaleString("en-GH")}`;
  };

  // Success State
  if (checkoutStep === "success") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-10 pb-16">
          <div className="container mx-auto px-4 max-w-2xl">
            <div className="text-center py-16 bg-card rounded-2xl border border-border/50">
              <div className="w-20 h-20 bg-secondary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-secondary" />
              </div>
              <h1 className="text-3xl font-display font-bold mb-4">
                Order Placed Successfully!
              </h1>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Your payment is now held in escrow. The service provider has been notified and will contact you shortly.
              </p>
              <div className="bg-muted/50 rounded-xl p-4 mb-8 max-w-sm mx-auto">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="w-4 h-4 text-secondary" />
                  <span>Payment secured in escrow until service completion</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="outline" asChild>
                  <Link to="/messages">View Messages</Link>
                </Button>
                <Button variant="gold" asChild>
                  <Link to="/">
                    Continue Browsing
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-10 pb-16">
        <div className="container mx-auto px-4">
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-4 mb-12">
            {["Cart", "Details", "Payment"].map((step, index) => {
              const stepKey = step.toLowerCase() as "cart" | "details" | "payment";
              const steps = ["cart", "details", "payment"];
              const currentIndex = steps.indexOf(checkoutStep);
              const isActive = currentIndex >= index;
              
              return (
                <div key={step} className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        isActive ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                  {index < 2 && (
                    <div
                      className={`w-12 h-0.5 ${
                        currentIndex > index ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {cart.length === 0 && checkoutStep === "cart" ? (
            <div className="text-center py-20 bg-muted/30 rounded-2xl max-w-2xl mx-auto">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShoppingCart className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-3">
                Your cart is empty
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Add services from the marketplace or your wishlist to get started
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="outline" asChild>
                  <Link to="/wishlist">View Wishlist</Link>
                </Button>
                <Button variant="gold" asChild>
                  <Link to="/">
                    Browse Services
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Cart Items - Step 1 */}
                {checkoutStep === "cart" && (
                  <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
                    <div className="p-6 border-b border-border/50">
                      <h2 className="text-xl font-display font-bold">
                        Cart Items ({cart.length})
                      </h2>
                    </div>
                    <div className="divide-y divide-border/50">
                      {cart.map((item) => (
                        <div key={item.id} className="p-6">
                          <div className="flex gap-4">
                            <Link to={`/service/${item.id}`} className="shrink-0">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-24 h-24 object-cover rounded-xl"
                              />
                            </Link>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <Link
                                    to={`/service/${item.id}`}
                                    className="font-semibold text-lg hover:text-primary transition-colors"
                                  >
                                    {item.name}
                                  </Link>
                                  <p className="text-sm text-muted-foreground">
                                    {item.category}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleRemove(item.id, item.name)}
                                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                                <span className="px-2 py-1 bg-primary/10 text-primary rounded-lg font-medium">
                                  {item.packageName}
                                </span>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <MapPin className="w-3 h-3" />
                                  {item.location}
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                  {item.pricingType === "per_unit" ? (
                                    <>
                                      {formatPrice(item.price)} per {item.unitLabel ?? "unit"}
                                    </>
                                  ) : (
                                    <>{formatPrice(item.price)} flat</>
                                  )}
                                </div>
                                <span className="text-lg font-bold text-primary">
                                  {formatPrice(getLineTotal(item))}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Event Details - Step 2 */}
                {checkoutStep === "details" && (
                  <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
                    <div className="p-6 border-b border-border/50">
                      <h2 className="text-xl font-display font-bold">
                        Event Details
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Provide details for each service booking
                      </p>
                    </div>
                    <div className="divide-y divide-border/50">
                      {cart.map((item) => (
                        <div key={item.id} className="p-6">
                          <div className="flex items-center gap-4 mb-6">
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-16 h-16 object-cover rounded-xl"
                            />
                            <div>
                              <h3 className="font-semibold">{item.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {item.packageName}
                              </p>
                            </div>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Event Date
                              </Label>
                              <Input
                                type="date"
                                value={item.eventDate || ""}
                                onChange={(e) =>
                                  updateCartItem(item.id, { eventDate: e.target.value })
                                }
                                className="border-border/50"
                              />
                            </div>
                            {item.pricingType === "per_unit" && (
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                  <Users className="w-4 h-4" />
                                  {item.unitLabel ? `Number of ${item.unitLabel}` : "Number of Guests/Items"}
                                </Label>
                                <Input
                                  type="number"
                                  placeholder="e.g., 50"
                                  min={1}
                                  value={item.quantity ?? item.guestCount ?? ""}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value);
                                    updateCartItem(item.id, {
                                      quantity: Number.isFinite(value) ? value : undefined,
                                      guestCount: Number.isFinite(value) ? value : undefined,
                                    });
                                  }}
                                  className="border-border/50"
                                />
                              </div>
                            )}
                            <div className="sm:col-span-2 space-y-2">
                              <Label>Special Instructions</Label>
                              <Textarea
                                placeholder="Any specific requirements or preferences..."
                                value={item.notes || ""}
                                onChange={(e) =>
                                  updateCartItem(item.id, { notes: e.target.value })
                                }
                                className="border-border/50"
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payment - Step 3 */}
                {checkoutStep === "payment" && (
                  <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
                    <div className="p-6 border-b border-border/50">
                      <h2 className="text-xl font-display font-bold">
                        Payment Details
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Choose a payment provider. You will be redirected to complete payment.
                      </p>
                    </div>
                    <div className="p-6 space-y-6">
                      {/* Payment Provider Selection */}
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
                                    <p className="text-xs text-muted-foreground">
                                      Mobile Money + Card
                                    </p>
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
                                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                                  </div>
                                  <div>
                                    <p className="font-semibold">Stripe</p>
                                    <p className="text-xs text-muted-foreground">
                                      Card payments
                                    </p>
                                  </div>
                                </div>
                              </button>
                            )}
                          </div>
                        )}

                        {paymentProvider === "flutterwave" && flutterwaveEnabled && (
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
                                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="font-semibold">Card Payment</p>
                                  <p className="text-xs text-muted-foreground">
                                    Visa, Mastercard
                                  </p>
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

                      {/* Escrow Notice */}
                      <div className="bg-secondary/10 rounded-xl p-4">
                        <div className="flex gap-3">
                          <Shield className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-secondary">
                              Escrow Payment Protection
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Your payment will be held securely until the service is completed
                              and you confirm satisfaction. The provider will be notified of
                              the pending payment.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Order Summary Sidebar */}
              <div className="lg:col-span-1">
                <div className="bg-card rounded-2xl border border-border/50 p-6 sticky top-24">
                  <h3 className="text-lg font-display font-bold mb-4">
                    Order Summary
                  </h3>

                  {/* Items Summary */}
                  <div className="space-y-3 mb-4">
                    {cart.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground truncate max-w-[60%]">
                          {item.name}
                        </span>
                        <span className="font-medium">{formatPrice(getLineTotal(item))}</span>
                      </div>
                    ))}
                  </div>

                  <Separator className="my-4" />

                  {/* Totals */}
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">{formatPrice(getCartTotal())}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Platform fee (included)</span>
                      <span className="font-medium">{formatPrice(getPlatformFee())}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="font-semibold">Total</span>
                      <span className="text-xl font-bold text-primary">
                        {formatPrice(getCartTotal())}
                      </span>
                    </div>
                  </div>

                  {/* Escrow Info */}
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Lock className="w-4 h-4 text-secondary" />
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {formatPrice(getEscrowAmount())}
                        </span>{" "}
                        held in escrow
                      </span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="mt-6">
                    {checkoutStep === "cart" && (
                      <Button
                        variant="gold"
                        size="lg"
                        className="w-full"
                        onClick={handleProceedToDetails}
                      >
                        Proceed to Details
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                    {checkoutStep === "details" && (
                      <Button
                        variant="gold"
                        size="lg"
                        className="w-full"
                        onClick={handleProceedToPayment}
                      >
                        Proceed to Payment
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                    {checkoutStep === "payment" && (
                      <Button
                        variant="gold"
                        size="lg"
                        className="w-full"
                        onClick={handleCompleteOrder}
                        disabled={isCheckingOut}
                      >
                        {isCheckingOut ? (
                          "Processing..."
                        ) : (
                          <>
                            Complete Order
                            <Lock className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Trust Badges */}
                  <div className="mt-6 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Shield className="w-4 h-4 text-secondary" />
                      <span>Secure escrow payment</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                      <AlertCircle className="w-4 h-4 text-primary" />
                      <span>Money-back guarantee</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Cart;
