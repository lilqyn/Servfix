import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchBar from "@/components/browse/SearchBar";
import FilterSidebar, { Filters } from "@/components/browse/FilterSidebar";
import ServiceCard from "@/components/browse/ServiceCard";
import ActiveFilters from "@/components/browse/ActiveFilters";
import SortSelect, { SortOption } from "@/components/browse/SortSelect";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SlidersHorizontal, Grid3X3, List } from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { cn } from "@/lib/utils";

const defaultFilters: Filters = {
  categories: [],
  locations: [],
  priceRange: [0, 5000],
  minRating: 0,
  verifiedOnly: false,
};

const Browse = () => {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get("category");
  const initialQuery = searchParams.get("q");
  
  const [searchQuery, setSearchQuery] = useState(initialQuery || "");
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultFilters,
    categories: initialCategory ? [initialCategory] : [],
  }));
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Sync URL query param with search state
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q !== searchQuery) {
      setSearchQuery(q);
    }
  }, [searchParams]);

  const { data: services = [], isLoading, isError, error } = useServices();

  const availableCategories = useMemo(() => {
    const set = new Set(
      services.map((service) => service.category).filter(Boolean),
    );
    if (initialCategory) {
      set.add(initialCategory);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [services, initialCategory]);

  const availableLocations = useMemo(() => {
    const set = new Set(
      services.map((service) => service.location).filter(Boolean),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [services]);

  const filteredAndSortedServices = useMemo(() => {
    let result = [...services];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query) ||
          p.location.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (filters.categories.length > 0) {
      result = result.filter((p) => filters.categories.includes(p.category));
    }

    // Location filter
    if (filters.locations.length > 0) {
      result = result.filter((p) => filters.locations.includes(p.location));
    }

    // Price filter
    result = result.filter(
      (p) => p.price >= filters.priceRange[0] && p.price <= filters.priceRange[1]
    );

    // Rating filter
    if (filters.minRating > 0) {
      result = result.filter((p) => p.rating >= filters.minRating);
    }

    // Verified filter
    if (filters.verifiedOnly) {
      result = result.filter((p) => p.verified);
    }

    // Sorting
    switch (sortBy) {
      case "rating-high":
        result.sort((a, b) => b.rating - a.rating);
        break;
      case "price-low":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price-high":
        result.sort((a, b) => b.price - a.price);
        break;
      case "reviews":
        result.sort((a, b) => b.reviews - a.reviews);
        break;
      default:
        // Relevance - prioritize top-rated and verified
        result.sort((a, b) => {
          const aScore = (a.topRated ? 2 : 0) + (a.verified ? 1 : 0) + a.rating / 5;
          const bScore = (b.topRated ? 2 : 0) + (b.verified ? 1 : 0) + b.rating / 5;
          return bScore - aScore;
        });
    }

    return result;
  }, [searchQuery, filters, sortBy, services]);

  const handleRemoveFilter = (type: string, value?: string) => {
    switch (type) {
      case "category":
        setFilters((prev) => ({
          ...prev,
          categories: prev.categories.filter((c) => c !== value),
        }));
        break;
      case "location":
        setFilters((prev) => ({
          ...prev,
          locations: prev.locations.filter((l) => l !== value),
        }));
        break;
      case "price":
        setFilters((prev) => ({ ...prev, priceRange: [0, 5000] }));
        break;
      case "rating":
        setFilters((prev) => ({ ...prev, minRating: 0 }));
        break;
      case "verified":
        setFilters((prev) => ({ ...prev, verifiedOnly: false }));
        break;
    }
  };

  const handleClearAllFilters = () => {
    setFilters(defaultFilters);
    setSearchQuery("");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">Browse Services</h1>
          <p className="text-muted-foreground">
            Find the perfect service provider for your needs
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>

        <div className="flex gap-8">
          {/* Desktop Filter Sidebar */}
          <FilterSidebar
            filters={filters}
            onFiltersChange={setFilters}
            categories={availableCategories}
            locations={availableLocations}
            className="hidden lg:block w-64 shrink-0"
          />

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                {/* Mobile Filter Button */}
                <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="lg:hidden gap-2">
                      <SlidersHorizontal className="h-4 w-4" />
                      Filters
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Filters</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6">
                      <FilterSidebar
                        filters={filters}
                        onFiltersChange={setFilters}
                        categories={availableCategories}
                        locations={availableLocations}
                      />
                    </div>
                  </SheetContent>
                </Sheet>

                <span className="text-sm text-muted-foreground">
                  {filteredAndSortedServices.length} service
                  {filteredAndSortedServices.length !== 1 ? "s" : ""} found
                </span>
              </div>

              <div className="flex items-center gap-3">
                <SortSelect value={sortBy} onChange={setSortBy} />
                <div className="hidden sm:flex items-center border border-border rounded-lg p-1">
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Active Filters */}
            <ActiveFilters
              filters={filters}
              onRemoveFilter={handleRemoveFilter}
              onClearAll={handleClearAllFilters}
            />

            {/* Results Grid/List */}
            {isLoading ? (
              <div className="text-center py-16 text-muted-foreground">
                Loading services...
              </div>
            ) : isError ? (
              <div className="text-center py-16">
                <h3 className="text-lg font-semibold mb-2">Unable to load services</h3>
                <p className="text-muted-foreground mb-4">
                  {error?.message ?? "Please try again shortly."}
                </p>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            ) : filteredAndSortedServices.length > 0 ? (
              <div
                className={cn(
                  viewMode === "grid"
                    ? "grid sm:grid-cols-2 xl:grid-cols-3 gap-6"
                    : "space-y-4"
                )}
              >
                {filteredAndSortedServices.map((service) => (
                  <ServiceCard key={service.id} service={service} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <SlidersHorizontal className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No services found</h3>
                <p className="text-muted-foreground mb-4">
                  Try adjusting your filters or search query
                </p>
                <Button variant="outline" onClick={handleClearAllFilters}>
                  Clear all filters
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Browse;
