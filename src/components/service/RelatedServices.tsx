import { Star, MapPin, BadgeCheck } from "lucide-react";
import { Link } from "react-router-dom";

const relatedServices = [
  {
    id: "2",
    name: "Grace Catering Services",
    category: "Catering",
    location: "Kumasi, Ghana",
    rating: 4.7,
    reviews: 89,
    price: 400,
    image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=300&fit=crop",
    verified: true,
  },
  {
    id: "3",
    name: "Royal Feast Caterers",
    category: "Catering",
    location: "Tema, Ghana",
    rating: 4.8,
    reviews: 156,
    price: 600,
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop",
    verified: true,
  },
  {
    id: "4",
    name: "Mama's Kitchen Catering",
    category: "Catering",
    location: "Takoradi, Ghana",
    rating: 4.9,
    reviews: 234,
    price: 350,
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop",
    verified: true,
  },
];

interface RelatedServicesProps {
  category: string;
  currentServiceId: string;
}

const RelatedServices = ({ category, currentServiceId }: RelatedServicesProps) => {
  const filteredServices = relatedServices.filter(s => s.id !== currentServiceId);

  if (filteredServices.length === 0) return null;

  return (
    <section className="mt-16 pt-16 border-t border-border/50">
      <h2 className="text-2xl font-display font-bold text-foreground mb-8">
        Similar Services in {category}
      </h2>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map((service) => (
          <Link
            key={service.id}
            to={`/service/${service.id}`}
            className="group bg-card rounded-2xl overflow-hidden border border-border/50 service-card"
          >
            {/* Image */}
            <div className="relative h-40 overflow-hidden">
              <img
                src={service.image}
                alt={service.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {service.verified && (
                <span className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full">
                  <BadgeCheck className="w-3 h-3" />
                  Verified
                </span>
              )}
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {service.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{service.category}</p>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded-lg">
                  <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                  <span className="text-sm font-semibold text-primary">{service.rating}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                <MapPin className="w-3.5 h-3.5" />
                {service.location}
                <span className="mx-1">•</span>
                <span>{service.reviews} reviews</span>
              </div>

              <div className="pt-3 border-t border-border/50">
                <span className="font-semibold text-primary">From GH₵ {service.price}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default RelatedServices;
