import { Star, MapPin, Heart, Shield, BadgeCheck, MessageCircle } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useWishlist, WishlistItem } from "@/contexts/WishlistContext";
import { useMessages } from "@/contexts/MessagesContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ServiceSummary } from "@/lib/services";

interface ServiceCardProps {
  service: ServiceSummary;
}

const ServiceCard = ({ service }: ServiceCardProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { startConversation } = useMessages();
  const { isAuthenticated } = useAuth();

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isInWishlist(service.id)) {
      removeFromWishlist(service.id);
      toast.success(`${service.name} removed from wishlist`);
    } else {
      addToWishlist({
        id: service.id,
        name: service.name,
        category: service.category,
        location: service.location,
        rating: service.rating,
        reviews: service.reviews,
        price: service.priceDisplay,
        image: service.image,
        verified: service.verified,
        topRated: service.topRated,
      } as WishlistItem);
      toast.success(`${service.name} added to wishlist!`);
    }
  };

  const handleContactProvider = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      const next = encodeURIComponent(`${location.pathname}${location.search}`);
      navigate(`/sign-in?next=${next}`);
      return;
    }

    try {
      const conversationId = await startConversation(
        service.providerId,
        service.providerName,
        service.avatar,
        service.id,
        service.name
      );

      toast.success(`Starting conversation with ${service.providerName}`);
      navigate("/messages", { state: { activeConversationId: conversationId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start conversation.";
      toast.error(message);
    }
  };

  return (
    <Link
      to={`/service/${service.id}`}
      className="group bg-card rounded-2xl overflow-hidden border border-border/50 service-card block"
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden">
        <img
          src={service.image}
          alt={service.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {service.verified && (
            <span className="flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full">
              <BadgeCheck className="w-3 h-3" />
              Verified
            </span>
          )}
          {service.topRated && (
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
                  onClick={handleContactProvider}
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
            onClick={handleWishlistToggle}
            className="p-2 bg-card/80 backdrop-blur-sm rounded-full hover:bg-card transition-colors group/heart"
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                isInWishlist(service.id)
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
              {service.name}
            </h3>
            <p className="text-sm text-muted-foreground">{service.category}</p>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded-lg">
            <Star className="w-4 h-4 fill-primary text-primary" />
            <span className="text-sm font-semibold text-primary">{service.rating}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
          <MapPin className="w-4 h-4" />
          {service.location}
          <span className="mx-2">•</span>
          <span>{service.reviews} reviews</span>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-1">
            <Shield className="w-4 h-4 text-secondary" />
            <span className="text-xs text-muted-foreground">Secure Payment</span>
          </div>
          <span className="font-semibold text-primary">{service.priceDisplay}</span>
        </div>
      </div>
    </Link>
  );
};

export default ServiceCard;
