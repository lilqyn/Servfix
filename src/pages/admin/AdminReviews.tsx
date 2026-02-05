import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { deleteAdminReview, fetchAdminReviews, type AdminReview } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";

const RATING_OPTIONS = [1, 2, 3, 4, 5];

const AdminReviews = () => {
  const { user } = useAuth();
  const [ratingFilter, setRatingFilter] = useState<string>("all");

  const queryParams = useMemo(
    () => ({
      rating: ratingFilter !== "all" ? Number(ratingFilter) : undefined,
    }),
    [ratingFilter],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-reviews", queryParams],
    queryFn: () => fetchAdminReviews(queryParams),
  });

  const canModerate = hasPermission(user?.role ?? null, "reviews.moderate");

  const handleDelete = async (id: string) => {
    if (!canModerate) return;
    const confirmed = window.confirm("Delete this review permanently?");
    if (!confirmed) return;
    try {
      await deleteAdminReview(id);
      toast({ title: "Review deleted." });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete review.";
      toast({ title: message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Reviews</h2>
        <p className="text-sm text-muted-foreground">Moderate service reviews.</p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              {RATING_OPTIONS.map((rating) => (
                <SelectItem key={rating} value={String(rating)}>
                  {rating} stars
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading reviews...</div>
          ) : isError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load reviews."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Review</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.reviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{review.rating} stars</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{review.comment}</div>
                    </TableCell>
                    <TableCell>{review.service.title}</TableCell>
                    <TableCell>
                      {review.author.username ?? review.author.email ?? review.author.phone ?? "-"}
                    </TableCell>
                    <TableCell>
                      {canModerate ? (
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(review.id)}>
                          Delete
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">No actions</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.reviews.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No reviews found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminReviews;
