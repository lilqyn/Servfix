import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Star, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Filters {
  categories: string[];
  locations: string[];
  priceRange: [number, number];
  minRating: number;
  verifiedOnly: boolean;
}

interface FilterSidebarProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  categories: string[];
  locations: string[];
  className?: string;
}

const FilterSidebar = ({ filters, onFiltersChange, categories, locations, className }: FilterSidebarProps) => {
  const [expandedSections, setExpandedSections] = useState({
    categories: true,
    locations: true,
    price: true,
    rating: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleCategoryToggle = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: newCategories });
  };

  const handleLocationToggle = (location: string) => {
    const newLocations = filters.locations.includes(location)
      ? filters.locations.filter((l) => l !== location)
      : [...filters.locations, location];
    onFiltersChange({ ...filters, locations: newLocations });
  };

  const handlePriceChange = (value: number[]) => {
    onFiltersChange({ ...filters, priceRange: [value[0], value[1]] });
  };

  const handleRatingChange = (rating: number) => {
    onFiltersChange({ ...filters, minRating: rating });
  };

  const handleVerifiedChange = (checked: boolean) => {
    onFiltersChange({ ...filters, verifiedOnly: checked });
  };

  const resetFilters = () => {
    onFiltersChange({
      categories: [],
      locations: [],
      priceRange: [0, 5000],
      minRating: 0,
      verifiedOnly: false,
    });
  };

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.locations.length > 0 ||
    filters.priceRange[0] > 0 ||
    filters.priceRange[1] < 5000 ||
    filters.minRating > 0 ||
    filters.verifiedOnly;

  return (
    <aside className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Filters</h2>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1 text-muted-foreground">
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>

      {/* Categories */}
      <div className="border-b border-border pb-6">
        <button
          onClick={() => toggleSection("categories")}
          className="flex items-center justify-between w-full text-left font-medium mb-3"
        >
          Category
          {expandedSections.categories ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {expandedSections.categories && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            )}
            {categories.map((category) => (
              <div key={category} className="flex items-center gap-2">
                <Checkbox
                  id={`cat-${category}`}
                  checked={filters.categories.includes(category)}
                  onCheckedChange={() => handleCategoryToggle(category)}
                />
                <Label htmlFor={`cat-${category}`} className="text-sm cursor-pointer">
                  {category}
                </Label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Locations */}
      <div className="border-b border-border pb-6">
        <button
          onClick={() => toggleSection("locations")}
          className="flex items-center justify-between w-full text-left font-medium mb-3"
        >
          Location
          {expandedSections.locations ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {expandedSections.locations && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {locations.length === 0 && (
              <p className="text-sm text-muted-foreground">No locations yet.</p>
            )}
            {locations.map((location) => (
              <div key={location} className="flex items-center gap-2">
                <Checkbox
                  id={`loc-${location}`}
                  checked={filters.locations.includes(location)}
                  onCheckedChange={() => handleLocationToggle(location)}
                />
                <Label htmlFor={`loc-${location}`} className="text-sm cursor-pointer">
                  {location}
                </Label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Price Range */}
      <div className="border-b border-border pb-6">
        <button
          onClick={() => toggleSection("price")}
          className="flex items-center justify-between w-full text-left font-medium mb-3"
        >
          Price Range
          {expandedSections.price ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {expandedSections.price && (
          <div className="space-y-4">
            <Slider
              value={[filters.priceRange[0], filters.priceRange[1]]}
              onValueChange={handlePriceChange}
              min={0}
              max={5000}
              step={50}
              className="mt-2"
            />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>GH₵ {filters.priceRange[0]}</span>
              <span>GH₵ {filters.priceRange[1]}</span>
            </div>
          </div>
        )}
      </div>

      {/* Rating */}
      <div className="border-b border-border pb-6">
        <button
          onClick={() => toggleSection("rating")}
          className="flex items-center justify-between w-full text-left font-medium mb-3"
        >
          Minimum Rating
          {expandedSections.rating ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {expandedSections.rating && (
          <div className="space-y-2">
            {[4, 3, 2, 1, 0].map((rating) => (
              <button
                key={rating}
                onClick={() => handleRatingChange(rating)}
                className={cn(
                  "flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-sm transition-colors",
                  filters.minRating === rating ? "bg-primary/10 text-primary" : "hover:bg-muted"
                )}
              >
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        "h-4 w-4",
                        star <= rating ? "fill-primary text-primary" : "text-muted-foreground/30"
                      )}
                    />
                  ))}
                </div>
                <span>{rating > 0 ? `${rating}+ stars` : "Any rating"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Verified Only */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="verified-only"
          checked={filters.verifiedOnly}
          onCheckedChange={(checked) => handleVerifiedChange(checked as boolean)}
        />
        <Label htmlFor="verified-only" className="text-sm cursor-pointer">
          Verified providers only
        </Label>
      </div>
    </aside>
  );
};

export default FilterSidebar;
