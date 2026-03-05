import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Calendar, Users, MapPin, MessageSquare, Send, AlertCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useMessages } from "@/contexts/MessagesContext";
import { useAuth } from "@/contexts/useAuth";

const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";

type SelectedPlace = {
  address: string;
  placeId?: string;
  lat?: number;
  lng?: number;
};

type GoogleMapsPlace = {
  formatted_address?: string;
  name?: string;
  place_id?: string;
  geometry?: {
    location?: {
      lat?: () => number;
      lng?: () => number;
    };
  };
};

type GoogleMapsAutocomplete = {
  addListener: (event: "place_changed", handler: () => void) => { remove: () => void };
  getPlace: () => GoogleMapsPlace;
};

type GoogleMapsNamespace = {
  maps?: {
    places?: {
      Autocomplete: new (
        input: HTMLInputElement,
        options?: { fields?: string[] },
      ) => GoogleMapsAutocomplete;
    };
  };
};

const getGoogleMaps = () =>
  (window as Window & { google?: GoogleMapsNamespace }).google;

interface ServiceInquiryFormProps {
  serviceName: string;
  providerName: string;
  providerId: string;
  providerAvatar: string;
  serviceId: string;
}

const ServiceInquiryForm = ({ 
  serviceName, 
  providerName, 
  providerId, 
  providerAvatar, 
  serviceId 
}: ServiceInquiryFormProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { startConversation, sendMessage } = useMessages();
  const { isAuthenticated } = useAuth();
  const locationInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<GoogleMapsAutocomplete | null>(null);
  const [formData, setFormData] = useState({
    eventDate: "",
    quantityType: "guests",
    quantityCount: "",
    location: "",
    message: "",
  });
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [placesStatus, setPlacesStatus] = useState<"idle" | "loading" | "ready" | "error">(
    googleMapsApiKey ? "loading" : "idle",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (!googleMapsApiKey) {
      return;
    }

    let cancelled = false;
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps="places"]',
    );

    if (existingScript) {
      if (getGoogleMaps()?.maps?.places) {
        setPlacesStatus("ready");
        return;
      }
      const handleLoad = () => {
        if (!cancelled) {
          setPlacesStatus("ready");
        }
      };
      const handleError = () => {
        if (!cancelled) {
          setPlacesStatus("error");
        }
      };
      existingScript.addEventListener("load", handleLoad);
      existingScript.addEventListener("error", handleError);
      return () => {
        cancelled = true;
        existingScript.removeEventListener("load", handleLoad);
        existingScript.removeEventListener("error", handleError);
      };
    }

    setPlacesStatus("loading");
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      googleMapsApiKey,
    )}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "places";
    script.onload = () => {
      if (!cancelled) {
        setPlacesStatus("ready");
      }
    };
    script.onerror = () => {
      if (!cancelled) {
        setPlacesStatus("error");
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (placesStatus !== "ready") {
      return;
    }
    const input = locationInputRef.current;
    if (!input) {
      return;
    }
    if (autocompleteRef.current) {
      return;
    }
    const googleMaps = getGoogleMaps();
    if (!googleMaps?.maps?.places) {
      return;
    }

    const autocomplete = new googleMaps.maps.places.Autocomplete(input, {
      fields: ["formatted_address", "place_id", "geometry", "name"],
    });
    autocompleteRef.current = autocomplete;

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const address = place?.formatted_address || place?.name || "";
      if (!address) {
        return;
      }
      const lat = place?.geometry?.location?.lat?.();
      const lng = place?.geometry?.location?.lng?.();
      const latValue = typeof lat === "number" && Number.isFinite(lat) ? lat : undefined;
      const lngValue = typeof lng === "number" && Number.isFinite(lng) ? lng : undefined;
      setSelectedPlace({
        address,
        placeId: place?.place_id,
        lat: latValue,
        lng: lngValue,
      });
      setFormData((prev) => ({ ...prev, location: address }));
      setErrors((prev) => ({ ...prev, location: "" }));
    });

    return () => {
      if (listener && typeof listener.remove === "function") {
        listener.remove();
      }
    };
  }, [placesStatus]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    
    if (!formData.eventDate) {
      newErrors.eventDate = "Please select a date";
    } else {
      const selectedDate = new Date(formData.eventDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        newErrors.eventDate = "Date cannot be in the past";
      }
    }
    
    if (!formData.quantityCount) {
      newErrors.quantityCount = "Please enter a quantity";
    } else if (parseInt(formData.quantityCount) < 1) {
      newErrors.quantityCount = "Quantity must be at least 1";
    }
    
    const hasPlacesKey = Boolean(googleMapsApiKey);
    if (!formData.location.trim()) {
      newErrors.location = "Please enter a location";
    } else if (hasPlacesKey && placesStatus === "loading") {
      newErrors.location = "Address search is still loading. Please wait.";
    } else if (hasPlacesKey && placesStatus === "ready" && !selectedPlace) {
      newErrors.location = "Select an address from the suggestions for accuracy.";
    } else if (hasPlacesKey && placesStatus === "error" && formData.location.trim().length < 5) {
      newErrors.location = "Location must be at least 5 characters";
    } else if (!hasPlacesKey && formData.location.trim().length < 5) {
      newErrors.location = "Location must be at least 5 characters";
    }
    
    if (!formData.message.trim()) {
      newErrors.message = "Please describe your requirements";
    } else if (formData.message.trim().length < 20) {
      newErrors.message = "Message must be at least 20 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    if (!isAuthenticated) {
      const next = encodeURIComponent(`${location.pathname}${location.search}`);
      navigate(`/sign-in?next=${next}`);
      return;
    }

    setIsSubmitting(true);

    try {
      // Start a new conversation with the provider
      const conversationId = await startConversation(
        providerId,
        providerName,
        providerAvatar,
        serviceId,
        serviceName
      );
      
      const quantityLabel = formData.quantityType === "items" ? "Items" : "Guests";
      const locationLines = [
        `Location: ${selectedPlace?.address ?? formData.location}`,
        selectedPlace?.placeId ? `Place ID: ${selectedPlace.placeId}` : null,
        selectedPlace?.lat != null && selectedPlace?.lng != null
          ? `Coordinates: ${selectedPlace.lat.toFixed(6)}, ${selectedPlace.lng.toFixed(6)}`
          : null,
      ].filter(Boolean);

      const inquiryMessage = `New Inquiry for ${serviceName}

Event Date: ${new Date(formData.eventDate).toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
Number of ${quantityLabel}: ${formData.quantityCount}
${locationLines.join("\n")}

${formData.message}`;
      
      // Send the inquiry as the first message
      await sendMessage(conversationId, inquiryMessage);
      
      setIsSubmitting(false);
      setFormData({
        eventDate: "",
        quantityType: "guests",
        quantityCount: "",
        location: "",
        message: "",
      });
      setSelectedPlace(null);
      
      toast.success("Inquiry sent successfully!", {
        description: "Redirecting you to the conversation...",
      });
      
      // Navigate to the messages page with the new conversation active
      navigate("/messages", { state: { activeConversationId: conversationId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send inquiry.";
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleLocationChange = (value: string) => {
    setFormData(prev => ({ ...prev, location: value }));
    if (selectedPlace) {
      setSelectedPlace(null);
    }
    if (errors.location) {
      setErrors(prev => ({ ...prev, location: "" }));
    }
  };

  return (
    <div id="service-inquiry" className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-foreground">Send Inquiry</h3>
      </div>
      
      <p className="text-sm text-muted-foreground mb-6">
        Get a custom quote from {providerName}. They typically respond within 2 hours.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Event Date */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Event Date
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              value={formData.eventDate}
              onChange={(e) => handleChange("eventDate", e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
                errors.eventDate ? "border-destructive" : "border-input"
              }`}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          {errors.eventDate && (
            <p className="mt-1 text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.eventDate}
            </p>
          )}
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Quantity
          </label>
          <div className="grid gap-2 sm:grid-cols-[150px,1fr]">
            <Select
              value={formData.quantityType}
              onValueChange={(value) => handleChange("quantityType", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guests">Guests</SelectItem>
                <SelectItem value="items">Items</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              {formData.quantityType === "items" ? (
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              ) : (
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              )}
              <input
                type="number"
                value={formData.quantityCount}
                onChange={(e) => handleChange("quantityCount", e.target.value)}
                placeholder={formData.quantityType === "items" ? "e.g., 200" : "e.g., 50"}
                min="1"
                className={`w-full pl-10 pr-4 py-2.5 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
                  errors.quantityCount ? "border-destructive" : "border-input"
                }`}
              />
            </div>
          </div>
          {errors.quantityCount && (
            <p className="mt-1 text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.quantityCount}
            </p>
          )}
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Event Location
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              ref={locationInputRef}
              value={formData.location}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder="e.g., East Legon, Accra"
              maxLength={100}
              className={`w-full pl-10 pr-4 py-2.5 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
                errors.location ? "border-destructive" : "border-input"
              }`}
            />
          </div>
          {errors.location && (
            <p className="mt-1 text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.location}
            </p>
          )}
          {!errors.location && googleMapsApiKey && placesStatus === "ready" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Select an address from the suggestions for an exact location.
            </p>
          )}
          {!errors.location && googleMapsApiKey && placesStatus === "loading" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Loading address suggestions...
            </p>
          )}
          {!errors.location && googleMapsApiKey && placesStatus === "error" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Address search is unavailable right now. Enter the full address.
            </p>
          )}
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Your Requirements
          </label>
          <textarea
            value={formData.message}
            onChange={(e) => handleChange("message", e.target.value)}
            placeholder="Describe your event and specific requirements..."
            rows={4}
            maxLength={500}
            className={`w-full px-4 py-2.5 bg-background border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
              errors.message ? "border-destructive" : "border-input"
            }`}
          />
          <div className="flex justify-between mt-1">
            {errors.message ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.message}
              </p>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted-foreground">
              {formData.message.length}/500
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <Button 
          type="submit" 
          variant="green" 
          size="lg" 
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-secondary-foreground/30 border-t-secondary-foreground rounded-full animate-spin" />
              Sending...
            </span>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send Inquiry
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          All communication stays within SERVFIX for your safety.
        </p>
      </form>
    </div>
  );
};

export default ServiceInquiryForm;

