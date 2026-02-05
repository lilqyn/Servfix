import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Calendar, Users, MapPin, MessageSquare, Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMessages } from "@/contexts/MessagesContext";
import { useAuth } from "@/contexts/AuthContext";

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
  const [formData, setFormData] = useState({
    eventDate: "",
    guestCount: "",
    location: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

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
    
    if (!formData.guestCount) {
      newErrors.guestCount = "Please enter guest count";
    } else if (parseInt(formData.guestCount) < 1) {
      newErrors.guestCount = "Guest count must be at least 1";
    }
    
    if (!formData.location.trim()) {
      newErrors.location = "Please enter a location";
    } else if (formData.location.trim().length < 5) {
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
      
      // Format the inquiry message
      const inquiryMessage = `📋 **New Inquiry for ${serviceName}**

📅 Event Date: ${new Date(formData.eventDate).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
👥 Number of Guests: ${formData.guestCount}
📍 Location: ${formData.location}

${formData.message}`;
      
      // Send the inquiry as the first message
      await sendMessage(conversationId, inquiryMessage);
      
      setIsSubmitting(false);
      setFormData({ eventDate: "", guestCount: "", location: "", message: "" });
      
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

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
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

        {/* Guest Count */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Number of Guests
          </label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="number"
              value={formData.guestCount}
              onChange={(e) => handleChange("guestCount", e.target.value)}
              placeholder="e.g., 50"
              min="1"
              className={`w-full pl-10 pr-4 py-2.5 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
                errors.guestCount ? "border-destructive" : "border-input"
              }`}
            />
          </div>
          {errors.guestCount && (
            <p className="mt-1 text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.guestCount}
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
              value={formData.location}
              onChange={(e) => handleChange("location", e.target.value)}
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
