import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { computeReviewSummary, type NewReviewInput, type Review, type ReviewSummary } from "@/lib/reviews";
import { createServiceReview, fetchServiceReviews } from "@/lib/api";

type UseServiceReviewsOptions = {
  initialReviews?: Review[];
  enabled?: boolean;
};

export function useServiceReviews(
  serviceId: string | null,
  options?: UseServiceReviewsOptions,
): {
  reviews: Review[];
  summary: ReviewSummary;
  addReview: (input: NewReviewInput) => Promise<void>;
} {
  const queryClient = useQueryClient();
  const isEnabled = options?.enabled ?? true;

  const query = useQuery({
    queryKey: ["service-reviews", serviceId],
    queryFn: async () => {
      if (!serviceId) {
        throw new Error("Service ID is required");
      }
      return fetchServiceReviews(serviceId);
    },
    enabled: Boolean(serviceId) && isEnabled,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (input: NewReviewInput) => {
      if (!serviceId) {
        throw new Error("Service ID is required");
      }
      return createServiceReview(serviceId, input);
    },
    onSuccess: (data) => {
      if (!serviceId) {
        return;
      }
      queryClient.setQueryData(["service-reviews", serviceId], data);
    },
  });

  const reviews = query.data?.reviews ?? options?.initialReviews ?? [];
  const summary = useMemo(() => {
    if (query.data?.summary) {
      return query.data.summary;
    }
    return computeReviewSummary(reviews);
  }, [query.data?.summary, reviews]);

  const addReview = async (input: NewReviewInput) => {
    if (!isEnabled) {
      throw new Error("Reviews are currently disabled.");
    }
    await mutation.mutateAsync(input);
  };

  return { reviews, summary, addReview };
}
