import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filters } from "./FilterSidebar";

interface ActiveFiltersProps {
  filters: Filters;
  onRemoveFilter: (type: string, value?: string) => void;
  onClearAll: () => void;
}

const ActiveFilters = ({ filters, onRemoveFilter, onClearAll }: ActiveFiltersProps) => {
  const activeFilters: { type: string; label: string; value?: string }[] = [];

  filters.categories.forEach((cat) => {
    activeFilters.push({ type: "category", label: cat, value: cat });
  });

  filters.locations.forEach((loc) => {
    activeFilters.push({ type: "location", label: loc, value: loc });
  });

  if (filters.priceRange[0] > 0 || filters.priceRange[1] < 5000) {
    activeFilters.push({
      type: "price",
      label: `GH₵ ${filters.priceRange[0]} - GH₵ ${filters.priceRange[1]}`,
    });
  }

  if (filters.minRating > 0) {
    activeFilters.push({
      type: "rating",
      label: `${filters.minRating}+ stars`,
    });
  }

  if (filters.verifiedOnly) {
    activeFilters.push({ type: "verified", label: "Verified only" });
  }

  if (activeFilters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-sm text-muted-foreground">Active filters:</span>
      {activeFilters.map((filter, index) => (
        <Badge
          key={`${filter.type}-${filter.value || index}`}
          variant="secondary"
          className="gap-1 pr-1"
        >
          {filter.label}
          <button
            onClick={() => onRemoveFilter(filter.type, filter.value)}
            className="ml-1 p-0.5 rounded-full hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" onClick={onClearAll} className="text-muted-foreground">
        Clear all
      </Button>
    </div>
  );
};

export default ActiveFilters;
