export type Review = {
  id: string;
  author: string;
  avatar: string;
  rating: number;
  date: string;
  comment: string;
  images?: string[];
  helpful: number;
};

export type ReviewSummary = {
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: Record<number, number>;
};

export type NewReviewInput = {
  rating: number;
  comment: string;
  images?: string[];
};

export function computeReviewSummary(reviews: Review[]): ReviewSummary {
  const ratingBreakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let total = 0;
  let sum = 0;

  reviews.forEach((review) => {
    const normalized = Math.min(5, Math.max(1, Math.round(review.rating)));
    ratingBreakdown[normalized] = (ratingBreakdown[normalized] ?? 0) + 1;
    sum += review.rating;
    total += 1;
  });

  const averageRating = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;

  return {
    averageRating,
    totalReviews: total,
    ratingBreakdown,
  };
}
