import { Check, Star, Shield, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { isCoreAdminRole } from "@/lib/roles";

interface Package {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  deliveryTime: string;
  popular: boolean;
  pricingType?: "flat" | "per_unit";
  unitLabel?: string | null;
}

interface Provider {
  rating: number;
  reviews: number;
  completedJobs: number;
}

interface ReviewSummary {
  averageRating: number;
  totalReviews: number;
}

interface ServicePricingProps {
  packages: Package[];
  selectedPackage: string;
  onSelectPackage: (id: string) => void;
  provider: Provider;
  reviewSummary?: ReviewSummary;
  serviceId: string;
  serviceName: string;
  category: string;
  location: string;
  image: string;
  verified: boolean;
  isPreview?: boolean;
}

const ServicePricing = ({
  packages,
  selectedPackage,
  onSelectPackage,
  provider,
  reviewSummary,
  serviceId,
  serviceName,
  category,
  location,
  image,
  verified,
  isPreview = false,
}: ServicePricingProps) => {
  const [isBooking, setIsBooking] = useState(false);
  const selected = packages.find(p => p.id === selectedPackage) || packages[0];
  const unitLabel = selected?.unitLabel?.trim() || "unit";
  const navigate = useNavigate();
  const locationState = useLocation();
  const { addToCart } = useCart();
  const { isAuthenticated, user } = useAuth();
  const ratingValue = reviewSummary?.averageRating ?? provider.rating;
  const reviewsValue = reviewSummary?.totalReviews ?? provider.reviews;

  const getPackageType = (name: string): "basic" | "standard" | "premium" => {
    const lower = name.toLowerCase();
    if (lower.includes("basic")) return "basic";
    if (lower.includes("premium")) return "premium";
    return "standard";
  };

  const handleBook = () => {
    if (isPreview) {
      return;
    }

    if (!selected) {
      toast.error("Select a package to continue.");
      return;
    }

    if (!isAuthenticated) {
      const next = encodeURIComponent(`${locationState.pathname}${locationState.search}`);
      navigate(`/sign-in?next=${next}`);
      return;
    }

    if (user?.role !== "buyer" && !isCoreAdminRole(user?.role)) {
      toast.error("Only buyers can book services.");
      navigate("/dashboard");
      return;
    }

    setIsBooking(true);
    addToCart({
      id: serviceId,
      tierId: selected.id,
      name: serviceName,
      category,
      location,
      rating: provider.rating,
      image,
      verified,
      packageType: getPackageType(selected.name),
      packageName: selected.name,
      price: selected.price,
      pricingType: selected.pricingType ?? "flat",
      unitLabel: selected.unitLabel ?? null,
      quantity: selected.pricingType === "per_unit" ? 1 : undefined,
    });
    toast.success(`${serviceName} added to cart`);
    setIsBooking(false);
    navigate("/cart");
  };

  return (
    <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-md">
      {/* Package Tabs */}
      <div className="flex border-b border-border/50">
        {packages.map((pkg) => (
          <button
            key={pkg.id}
            onClick={() => onSelectPackage(pkg.id)}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors relative ${
              selectedPackage === pkg.id
                ? "text-foreground bg-muted/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            {pkg.name}
            {pkg.popular && (
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-gradient-gold text-primary-foreground text-[10px] font-bold rounded-full">
                POPULAR
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Selected Package Details */}
      <div className="p-6">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <span className="text-3xl font-display font-bold text-foreground">
              GH₵ {selected.price.toLocaleString()}
            </span>
            {selected.pricingType === "per_unit" && (
              <span className="ml-2 text-sm text-muted-foreground">
                per {unitLabel}
              </span>
            )}
          </div>
          <span className="text-sm text-muted-foreground">{selected.description}</span>
        </div>

        <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          {selected.deliveryTime} required
        </p>

        {/* Features */}
        <ul className="space-y-3 mb-6">
          {selected.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3 text-sm">
              <Check className="w-4 h-4 text-secondary mt-0.5 flex-shrink-0" />
              <span className="text-foreground">{feature}</span>
            </li>
          ))}
        </ul>

        {/* Book Button */}
        <Button 
          variant="gold" 
          size="lg" 
          className="w-full mb-4"
          onClick={handleBook}
          disabled={isBooking || isPreview}
        >
          {isBooking ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Processing...
            </span>
          ) : (
            <>
              <Calendar className="w-4 h-4" />
              {isPreview ? "Preview mode" : `Book Now - GH₵ ${selected.price.toLocaleString()}`}
            </>
          )}
        </Button>

        <Button variant="outline" size="lg" className="w-full" disabled={isPreview}>
          Add to Wishlist
        </Button>

        {/* Trust Badges */}
        <div className="mt-6 pt-6 border-t border-border/50">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
            <Shield className="w-4 h-4 text-secondary" />
            <span>Secure escrow payment protection</span>
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-lg font-bold text-foreground">
                <Star className="w-4 h-4 fill-primary text-primary" />
                {ratingValue}
              </div>
              <p className="text-xs text-muted-foreground">Rating</p>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">{reviewsValue}</div>
              <p className="text-xs text-muted-foreground">Reviews</p>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">{provider.completedJobs}</div>
              <p className="text-xs text-muted-foreground">Jobs Done</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServicePricing;
