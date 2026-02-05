import { useMemo } from "react";
import { Star, MapPin, Heart, Shield, BadgeCheck, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useWishlist, WishlistItem } from "@/contexts/WishlistContext";
import { useMessages } from "@/contexts/MessagesContext";
import { useAuth } from "@/contexts/AuthContext";
import { useServices } from "@/hooks/useServices";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type FeaturedProvider = {
  id: string;
  providerUserId: string;
  name: string;
  category: string;
  location: string;
  rating: number;
  reviews: number;
  avatar: string;
  price: string;
  image: string;
  verified: boolean;
  topRated: boolean;
  serviceName: string;
};

const FeaturedProviders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { startConversation } = useMessages();
  const { isAuthenticated } = useAuth();
  const { data: services = [], isLoading, isError } = useServices();

  const providers = useMemo<FeaturedProvider[]>(() => {
    return [...services]
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.reviews - a.reviews;
      })
      .slice(0, 6)
      .map((service) => ({
        id: service.id,
        providerUserId: service.providerId,
        name: service.providerName || service.name,
        category: service.category,
        location: service.location,
        rating: service.rating,
        reviews: service.reviews,
        avatar: service.avatar,
        price: service.priceDisplay,
        image: service.image,
        verified: service.verified,
        topRated: service.topRated,
        serviceName: service.name,
      }));
  }, [services]);

  const handleWishlistToggle = (e: React.MouseEvent, provider: FeaturedProvider) => {
    e.preventDefault();
    e.stopPropagation();

    if (isInWishlist(provider.id)) {
      removeFromWishlist(provider.id);
      toast.success(`${provider.name} removed from wishlist`);
    } else {
      addToWishlist({
        id: provider.id,
        name: provider.name,
        category: provider.category,
        location: provider.location,
        rating: provider.rating,
        reviews: provider.reviews,
        price: provider.price,
        image: provider.image,
        verified: provider.verified,
        topRated: provider.topRated,
      } as WishlistItem);
      toast.success(`${provider.name} added to wishlist!`);
    }
  };

  const handleContactProvider = async (e: React.MouseEvent, provider: FeaturedProvider) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isAuthenticated) {
      const next = encodeURIComponent(`${location.pathname}${location.search}`);
      navigate(`/sign-in?next=${next}`);
      return;
    }

    try {
      const conversationId = await startConversation(
        provider.providerUserId,
        provider.name,
        provider.avatar,
        provider.id,
        provider.serviceName
      );
      
      toast.success(`Starting conversation with ${provider.name}`);
      navigate("/messages", { state: { activeConversationId: conversationId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start conversation.";
      toast.error(message);
    }
  };

  return (
    <section className="py-20 bg-muted/30 kente-pattern">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <span className="inline-block px-4 py-1.5 bg-secondary/10 text-secondary text-sm font-semibold rounded-full mb-4">
              Top Rated
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-2">
              Featured Service Providers
            </h2>
            <p className="text-lg text-muted-foreground">
              Handpicked professionals with excellent track records
            </p>
          </div>
          <Link to="/browse">
            <Button variant="green" className="self-start md:self-auto">
              View All Providers
            </Button>
          </Link>
        </div>

        {/* Providers Grid */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">
            Loading featured providers...
          </div>
        ) : isError ? (
          <div className="text-center text-destructive py-12">
            Unable to load featured providers.
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            No featured providers yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {providers.map((provider) => (
              <Link
                to={`/service/${provider.id}`}
                key={provider.id}
                className="group bg-card rounded-2xl overflow-hidden border border-border/50 service-card block"
              >
                {/* Image */}
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={provider.image}
                    alt={provider.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex gap-2">
                    {provider.verified && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full">
                        <BadgeCheck className="w-3 h-3" />
                        Verified
                      </span>
                    )}
                    {provider.topRated && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-gradient-gold text-primary-foreground text-xs font-medium rounded-full">
                        <Star className="w-3 h-3" />
                        Top Rated
                      </span>
                    )}
                  </div>
                  {/* Action Buttons */}
                  <div className="absolute top-3 right-3 flex gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => handleContactProvider(e, provider)}
                            className="p-2 bg-secondary text-secondary-foreground backdrop-blur-sm rounded-full hover:bg-secondary/90 transition-colors shadow-md"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Contact Provider</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <button
                      onClick={(e) => handleWishlistToggle(e, provider)}
                      className="p-2 bg-card/80 backdrop-blur-sm rounded-full hover:bg-card transition-colors group/heart"
                    >
                      <Heart
                        className={`w-4 h-4 transition-colors ${
                          isInWishlist(provider.id)
                            ? "text-destructive fill-destructive"
                            : "text-muted-foreground group-hover/heart:text-destructive group-hover/heart:fill-destructive"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                        {provider.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{provider.category}</p>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded-lg">
                      <Star className="w-4 h-4 fill-primary text-primary" />
                      <span className="text-sm font-semibold text-primary">{provider.rating}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
                    <MapPin className="w-4 h-4" />
                    {provider.location}
                    <span className="mx-2">•</span>
                    <span>{provider.reviews} reviews</span>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border/50">
                    <div className="flex items-center gap-1">
                      <Shield className="w-4 h-4 text-secondary" />
                      <span className="text-xs text-muted-foreground">Secure Payment</span>
                    </div>
                    <span className="font-semibold text-primary">{provider.price}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default FeaturedProviders;
