import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useServices } from "@/hooks/useServices";
import type { HomeContentPayload } from "@/lib/api";
import { defaultHomeContent } from "@/lib/homeDefaults";
import { resolveHomeIcon } from "@/lib/homeIcons";

type CategoryDefinition = {
  name: string;
  icon: string;
  color: string;
  description: string;
  keywords: string[];
};

type ServiceCategoriesProps = {
  content?: HomeContentPayload["categories"];
};

const ServiceCategories = ({ content }: ServiceCategoriesProps) => {
  const navigate = useNavigate();
  const { data: services = [] } = useServices();
  const categoriesContent = content ?? defaultHomeContent.categories;
  const categoryDefinitions: CategoryDefinition[] = categoriesContent.items ?? [];

  const categoryStats = useMemo(() => {
    const stats = categoryDefinitions.map(() => ({ count: 0, targetCategory: "" }));

    services.forEach((service) => {
      const category = service.category?.toLowerCase().trim();
      if (!category) return;

      const matchIndex = categoryDefinitions.findIndex((definition) => {
        const nameMatch = category.includes(definition.name.toLowerCase());
        const keywordMatch = definition.keywords.some((keyword) => category.includes(keyword));
        return nameMatch || keywordMatch;
      });

      if (matchIndex === -1) return;

      stats[matchIndex].count += 1;
      if (!stats[matchIndex].targetCategory) {
        stats[matchIndex].targetCategory = service.category;
      }
    });

    return stats;
  }, [services, categoryDefinitions]);

  const categories = categoryDefinitions.map((definition, index) => ({
    ...definition,
    count: categoryStats[index]?.count ?? 0,
    targetCategory: categoryStats[index]?.targetCategory || definition.name,
  }));

  const handleCategoryClick = (categoryName: string) => {
    navigate(`/browse?category=${encodeURIComponent(categoryName)}`);
  };

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-1.5 bg-primary/10 text-primary text-sm font-semibold rounded-full mb-4">
            {categoriesContent.badge}
          </span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            {categoriesContent.title}
          </h2>
          <p className="text-lg text-muted-foreground">{categoriesContent.subtitle}</p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 md:gap-6">
          {categories.map((category) => {
            const Icon = resolveHomeIcon(category.icon);
            return (
              <div
                key={category.name}
                onClick={() => handleCategoryClick(category.targetCategory)}
                className="group service-card bg-card rounded-2xl p-6 border border-border/50 cursor-pointer hover:border-primary/30"
              >
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${category.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                  {category.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-2">{category.description}</p>
                <span className="text-sm font-medium text-primary">
                  {category.count} {category.count === 1 ? "provider" : "providers"}
                </span>
              </div>
            );
          })}
        </div>

        {/* View All */}
        <div className="text-center mt-12">
          <Link to={categoriesContent.ctaHref}>
            <Button variant="outline-gold" size="lg" className="group">
              {categoriesContent.ctaLabel}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default ServiceCategories;
