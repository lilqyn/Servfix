import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortOption = "relevance" | "rating-high" | "price-low" | "price-high" | "reviews";

interface SortSelectProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

const SortSelect = ({ value, onChange }: SortSelectProps) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Sort by" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="relevance">Relevance</SelectItem>
        <SelectItem value="rating-high">Highest Rated</SelectItem>
        <SelectItem value="price-low">Price: Low to High</SelectItem>
        <SelectItem value="price-high">Price: High to Low</SelectItem>
        <SelectItem value="reviews">Most Reviews</SelectItem>
      </SelectContent>
    </Select>
  );
};

export default SortSelect;
