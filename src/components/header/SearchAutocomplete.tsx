import { useState, useEffect, useRef, FormEvent, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Tag, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useServices } from "@/hooks/useServices";

type ProviderSuggestion = {
  id: string;
  name: string;
  category: string;
  location: string;
  avatar: string;
  rating: number;
  reviews: number;
};

interface SearchAutocompleteProps {
  onClose?: () => void;
  autoFocus?: boolean;
  className?: string;
}

const SearchAutocomplete = ({ onClose, autoFocus, className }: SearchAutocompleteProps) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: services = [] } = useServices();

  const { categories, providers } = useMemo(() => {
    const categorySet = new Set<string>();
    const providerMap = new Map<string, ProviderSuggestion>();

    services.forEach((service) => {
      if (service.category) {
        categorySet.add(service.category);
      }

      const existing = providerMap.get(service.providerId);
      const candidate: ProviderSuggestion = {
        id: service.providerId,
        name: service.providerName || service.name,
        category: service.category,
        location: service.location,
        avatar: service.avatar,
        rating: service.rating,
        reviews: service.reviews,
      };

      if (
        !existing ||
        candidate.rating > existing.rating ||
        (candidate.rating === existing.rating && candidate.reviews > existing.reviews)
      ) {
        providerMap.set(service.providerId, candidate);
      }
    });

    const sortedCategories = Array.from(categorySet).sort((a, b) => a.localeCompare(b));
    const sortedProviders = Array.from(providerMap.values()).sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return b.reviews - a.reviews;
    });

    return { categories: sortedCategories, providers: sortedProviders };
  }, [services]);

  // Filter categories and providers based on query
  const matchingCategories = query.length >= 1
    ? categories.filter(cat => 
        cat.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 4)
    : [];

  const matchingProviders = query.length >= 1
    ? providers.filter(provider => 
        provider.name.toLowerCase().includes(query.toLowerCase()) ||
        provider.category.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 4)
    : [];

  const hasResults = matchingCategories.length > 0 || matchingProviders.length > 0;
  const totalResults = matchingCategories.length + matchingProviders.length;

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || !hasResults) {
      if (e.key === "Enter") {
        handleSearch();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < totalResults - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : totalResults - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelect(selectedIndex);
        } else {
          handleSearch();
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSearch = () => {
    if (query.trim()) {
      navigate(`/browse?q=${encodeURIComponent(query.trim())}`);
      setQuery("");
      setIsOpen(false);
      onClose?.();
    }
  };

  const handleSelect = (index: number) => {
    if (index < matchingCategories.length) {
      // Selected a category
      const category = matchingCategories[index];
      navigate(`/browse?category=${encodeURIComponent(category)}`);
    } else {
      // Selected a provider
      const providerIndex = index - matchingCategories.length;
      const provider = matchingProviders[providerIndex];
      navigate(`/browse?q=${encodeURIComponent(provider.name)}`);
    }
    setQuery("");
    setIsOpen(false);
    onClose?.();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Open dropdown when typing
  useEffect(() => {
    if (query.length >= 1) {
      setIsOpen(true);
      setSelectedIndex(-1);
    } else {
      setIsOpen(false);
    }
  }, [query]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search services, providers..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length >= 1 && setIsOpen(true)}
            autoFocus={autoFocus}
            className="pl-10 pr-4 h-10 bg-muted/50 border-transparent focus:border-primary"
          />
        </div>
      </form>

      {/* Autocomplete dropdown */}
      {isOpen && hasResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 animate-in fade-in-0 zoom-in-95">
          <ScrollArea className="max-h-80">
            {matchingCategories.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Categories</p>
                {matchingCategories.map((category, index) => (
                  <button
                    key={category}
                    onClick={() => handleSelect(index)}
                    className={cn(
                      "w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors",
                      selectedIndex === index
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    <Tag className="h-4 w-4 text-primary" />
                    <span>{category}</span>
                    <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}

            {matchingProviders.length > 0 && (
              <div className="p-2 border-t border-border">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Providers</p>
                {matchingProviders.map((provider, index) => {
                  const actualIndex = matchingCategories.length + index;
                  return (
                    <button
                      key={provider.id}
                      onClick={() => handleSelect(actualIndex)}
                      className={cn(
                        "w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors",
                        selectedIndex === actualIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <img
                        src={provider.avatar}
                        alt={provider.name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <div className="flex-1 text-left">
                        <p className="font-medium">{provider.name}</p>
                        <p className="text-xs text-muted-foreground">{provider.category} • {provider.location}</p>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search all results option */}
            <div className="p-2 border-t border-border">
              <button
                onClick={handleSearch}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-muted transition-colors text-primary"
              >
                <Search className="h-4 w-4" />
                <span>Search for "{query}"</span>
                <ArrowRight className="h-3 w-3 ml-auto" />
              </button>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default SearchAutocomplete;
