import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Star, ThumbsUp, MoreHorizontal, ChevronDown, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeReviewSummary, type NewReviewInput, type Review } from "@/lib/reviews";
import { toast } from "sonner";

interface ServiceReviewsProps {
  reviews: Review[];
  ratingBreakdown?: { [key: number]: number };
  totalReviews?: number;
  averageRating?: number;
  canReview?: boolean;
  reviewerName?: string;
  onAddReview?: (input: NewReviewInput) => Promise<void> | void;
}

const ServiceReviews = ({
  reviews,
  ratingBreakdown,
  totalReviews,
  averageRating,
  canReview = false,
  reviewerName,
  onAddReview,
}: ServiceReviewsProps) => {
  const [showAll, setShowAll] = useState(false);
  const [helpfulReviews, setHelpfulReviews] = useState<Set<string>>(new Set());
  const [draftRating, setDraftRating] = useState(0);
  const [draftComment, setDraftComment] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const location = useLocation();

  const computedSummary = useMemo(() => computeReviewSummary(reviews), [reviews]);
  const useComputedSummary = reviews.length > 0;
  const summary = useComputedSummary
    ? computedSummary
    : {
        averageRating: averageRating ?? computedSummary.averageRating,
        totalReviews: totalReviews ?? computedSummary.totalReviews,
        ratingBreakdown: ratingBreakdown ?? computedSummary.ratingBreakdown,
      };

  const displayedReviews = showAll ? reviews : reviews.slice(0, 3);
  const safeTotal = summary.totalReviews > 0 ? summary.totalReviews : 1;

  const toggleHelpful = (reviewId: string) => {
    setHelpfulReviews(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reviewId)) {
        newSet.delete(reviewId);
      } else {
        newSet.add(reviewId);
      }
      return newSet;
    });
  };

  const handleSubmitReview = async () => {
    if (!onAddReview) {
      return;
    }

    if (!canReview) {
      setDraftError("Sign in as a buyer to leave a review.");
      return;
    }

    if (draftRating < 1) {
      setDraftError("Please select a rating.");
      return;
    }

    if (draftComment.trim().length < 20) {
      setDraftError("Review must be at least 20 characters.");
      return;
    }

    try {
      await onAddReview({ rating: draftRating, comment: draftComment.trim() });
      setDraftRating(0);
      setDraftComment("");
      setDraftError(null);
      toast.success("Review submitted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit review.";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-display font-bold text-foreground">Customer Reviews</h2>

      {onAddReview && (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-foreground">Write a review</h3>
            {canReview && reviewerName && (
              <span className="text-sm text-muted-foreground">Reviewing as {reviewerName}</span>
            )}
          </div>

          {canReview ? (
            <div className="space-y-4">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      setDraftRating(star);
                      if (draftError) {
                        setDraftError(null);
                      }
                    }}
                    className="p-1 rounded-full hover:bg-muted transition-colors"
                    aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                    aria-pressed={draftRating === star}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= draftRating
                          ? "fill-primary text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <textarea
                  value={draftComment}
                  onChange={(e) => {
                    setDraftComment(e.target.value);
                    if (draftError) {
                      setDraftError(null);
                    }
                  }}
                  placeholder="Share details about your experience..."
                  rows={4}
                  maxLength={500}
                  className="w-full rounded-xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className={draftError ? "text-destructive" : "text-muted-foreground"}>
                    {draftError ?? "Minimum 20 characters"}
                  </span>
                  <span>{draftComment.length}/500</span>
                </div>
              </div>

              <Button type="button" variant="gold" onClick={handleSubmitReview}>
                Submit Review
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Sign in as a buyer to leave a review.</span>
              <Button
                asChild
                variant="outline"
                className="border-border/60 text-foreground hover:bg-muted"
              >
                <Link to={`/sign-in?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`}>
                  Sign in
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Rating Summary */}
      <div className="flex flex-col sm:flex-row gap-8 p-6 bg-muted/30 rounded-2xl">
        {/* Overall Rating */}
        <div className="text-center sm:text-left">
          <div className="text-5xl font-display font-bold text-foreground mb-2">
            {summary.averageRating}
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-5 h-5 ${
                  star <= Math.round(summary.averageRating)
                    ? "fill-primary text-primary"
                    : "fill-muted text-muted"
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{summary.totalReviews} reviews</p>
        </div>

        {/* Rating Breakdown */}
        <div className="flex-1 space-y-2">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = summary.ratingBreakdown[stars] || 0;
            const percentage = summary.totalReviews > 0 ? (count / safeTotal) * 100 : 0;
            return (
              <div key={stars} className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground w-6">{stars}</span>
                <Star className="w-4 h-4 fill-primary text-primary" />
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-gold rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-6">
        {reviews.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
            No reviews yet. Be the first to share feedback.
          </div>
        )}
        {displayedReviews.map((review) => (
          <div key={review.id} className="pb-6 border-b border-border/50 last:border-0">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <img
                  src={review.avatar}
                  alt={review.author}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div>
                  <h4 className="font-semibold text-foreground">{review.author}</h4>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= review.rating
                              ? "fill-primary text-primary"
                              : "fill-muted text-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">{review.date}</span>
                  </div>
                </div>
              </div>
              <button className="p-2 hover:bg-muted rounded-full transition-colors">
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <p className="text-foreground leading-relaxed mb-4">{review.comment}</p>

            {/* Review Images */}
            {review.images && review.images.length > 0 && (
              <div className="flex gap-2 mb-4">
                {review.images.map((image, index) => (
                  <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden group cursor-pointer">
                    <img
                      src={image}
                      alt={`Review image ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-background opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Helpful Button */}
            <button
              onClick={() => toggleHelpful(review.id)}
              className={`flex items-center gap-2 text-sm transition-colors ${
                helpfulReviews.has(review.id)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ThumbsUp className={`w-4 h-4 ${helpfulReviews.has(review.id) ? "fill-primary" : ""}`} />
              Helpful ({helpfulReviews.has(review.id) ? review.helpful + 1 : review.helpful})
            </button>
          </div>
        ))}
      </div>

      {/* Show More Button */}
      {reviews.length > 3 && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show Less" : `Show All ${reviews.length} Reviews`}
          <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showAll ? "rotate-180" : ""}`} />
        </Button>
      )}
    </div>
  );
};

export default ServiceReviews;
