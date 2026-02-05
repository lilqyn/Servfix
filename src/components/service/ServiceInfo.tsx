import { Link } from "react-router-dom";
import { BadgeCheck, MapPin, Clock, Briefcase, Star, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Provider {
  id: string;
  name: string;
  avatar: string;
  username?: string | null;
  verified: boolean;
  topRated: boolean;
  memberSince: string;
  responseTime: string;
  completedJobs: number;
  rating: number;
  reviews: number;
  location: string;
}

interface ServiceInfoProps {
  service: {
    name: string;
    category: string;
    description: string;
    provider: Provider;
    faqs: { question: string; answer: string }[];
  };
}

const ServiceInfo = ({ service }: ServiceInfoProps) => {
  return (
    <div className="space-y-8">
      {/* Title & Provider */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full">
            {service.category}
          </span>
          {service.provider.topRated && (
            <span className="flex items-center gap-1 px-3 py-1 bg-gradient-gold text-primary-foreground text-sm font-medium rounded-full">
              <Star className="w-3.5 h-3.5" />
              Top Rated
            </span>
          )}
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
          {service.name}
        </h1>
        
        {/* Provider Card */}
        <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-xl">
          <Link
            to={`/profile/${service.provider.username ? service.provider.username : service.provider.id}`}
            className="flex items-start gap-4 flex-1"
          >
            <img
              src={service.provider.avatar}
              alt={service.provider.name}
              className="w-16 h-16 rounded-full object-cover ring-2 ring-border"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-foreground">{service.provider.name}</h3>
                {service.provider.verified && (
                  <BadgeCheck className="w-5 h-5 text-secondary fill-secondary/20" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {service.provider.location}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-primary text-primary" />
                  {service.provider.rating} ({service.provider.reviews} reviews)
                </span>
                <span className="flex items-center gap-1">
                  <Briefcase className="w-4 h-4" />
                  {service.provider.completedJobs} jobs completed
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {service.provider.responseTime}
              </p>
            </div>
          </Link>
          <Button variant="outline-gold" size="sm" className="hidden sm:flex gap-2">
            <MessageCircle className="w-4 h-4" />
            Contact
          </Button>
        </div>
      </div>

      {/* Description */}
      <div>
        <h2 className="text-xl font-display font-bold text-foreground mb-4">About This Service</h2>
        <div className="prose prose-gray max-w-none">
          {service.description.split('\n').map((paragraph, index) => {
            if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
              return (
                <h3 key={index} className="text-lg font-semibold text-foreground mt-6 mb-3">
                  {paragraph.replace(/\*\*/g, '')}
                </h3>
              );
            }
            if (paragraph.startsWith('•')) {
              return (
                <li key={index} className="text-muted-foreground ml-4">
                  {paragraph.replace('• ', '')}
                </li>
              );
            }
            if (paragraph.trim()) {
              return (
                <p key={index} className="text-muted-foreground mb-3">
                  {paragraph}
                </p>
              );
            }
            return null;
          })}
        </div>
      </div>

      {/* FAQs */}
      <div>
        <h2 className="text-xl font-display font-bold text-foreground mb-4">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {service.faqs.map((faq, index) => (
            <div key={index} className="p-4 bg-muted/30 rounded-xl">
              <h4 className="font-semibold text-foreground mb-2">{faq.question}</h4>
              <p className="text-muted-foreground text-sm">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ServiceInfo;
