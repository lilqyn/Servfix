import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { fetchProviderReviewAnalytics, fetchProviderReviews, replyToProviderReview } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const getInitials = (name: string) => {
  if (!name) return "SG";
  const tokens = name.split(" ").filter(Boolean);
  const first = tokens[0]?.[0] ?? name[0];
  const second = tokens[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
};

const ProviderReviews = () => {
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [trendRange, setTrendRange] = useState("6");
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);

  const ratingValue = ratingFilter === "all" ? undefined : Number(ratingFilter);
  const monthsValue = Number(trendRange);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["provider-reviews", ratingFilter],
    queryFn: ({ pageParam }) =>
      fetchProviderReviews({
        cursor: pageParam as string | undefined,
        limit: 20,
        rating: ratingValue,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ["provider-review-analytics", monthsValue],
    queryFn: () => fetchProviderReviewAnalytics({ months: monthsValue }),
  });

  const summary = analytics?.trend ?? data?.pages?.[0]?.summary;
  const allReviews = data?.pages?.flatMap((page) => page.reviews) ?? [];

  const filteredReviews = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allReviews;
    return allReviews.filter((review) => {
      const haystack = `${review.author} ${review.comment} ${review.service.title}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [allReviews, search]);

  const totalReviews = summary?.totalReviews ?? 0;
  const averageRating = summary?.averageRating ?? 0;
  const ratingBreakdown = summary?.ratingBreakdown ?? { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const safeTotal = totalReviews > 0 ? totalReviews : 1;
  const trendData = analytics?.trend?.months ?? [];
  const nps = analytics?.nps ?? null;
  const topServices = analytics?.topServices ?? [];

  const handleReplyToggle = (reviewId: string, initial?: string | null) => {
    setActiveReplyId((current) => (current === reviewId ? null : reviewId));
    setReplyDrafts((prev) => ({
      ...prev,
      [reviewId]: prev[reviewId] ?? initial ?? "",
    }));
  };

  const handleReplySave = async (reviewId: string) => {
    const reply = (replyDrafts[reviewId] ?? "").trim();
    if (reply.length < 2) {
      toast("Reply must be at least 2 characters.");
      return;
    }
    setSavingReplyId(reviewId);
    try {
      await replyToProviderReview(reviewId, reply);
      toast("Reply saved.");
      setActiveReplyId(null);
      await refetch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save reply.");
    } finally {
      setSavingReplyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Reviews</h2>
          <p className="text-sm text-muted-foreground">
            See feedback from customers across your services.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            refetch();
            refetchAnalytics();
          }}
        >
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <Input
            placeholder="Search by customer, service, or review text..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-full md:w-[220px]">
            <SelectValue placeholder="Filter by rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            <SelectItem value="5">5 stars</SelectItem>
            <SelectItem value="4">4 stars</SelectItem>
            <SelectItem value="3">3 stars</SelectItem>
            <SelectItem value="2">2 stars</SelectItem>
            <SelectItem value="1">1 star</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-4">
          {isLoading ? (
            <div className="rounded-xl border border-border/60 p-6 text-sm text-muted-foreground">
              Loading reviews...
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-border/60 p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load reviews."}{" "}
              <button className="text-primary underline" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
              No reviews found.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-xl border border-border/60 bg-card p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={review.avatar} alt={review.author} />
                        <AvatarFallback>{getInitials(review.author)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold text-foreground">{review.author}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{review.date}</span>
                          <span>•</span>
                          <Link to={`/service/${review.service.id}`} className="text-primary">
                            {review.service.title}
                          </Link>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= review.rating
                              ? "fill-primary text-primary"
                              : "fill-muted text-muted"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <p className="mt-4 text-sm text-foreground leading-relaxed">
                    {review.comment}
                  </p>

                  {review.images && review.images.length > 0 && (
                    <div className="mt-4 flex gap-2 flex-wrap">
                      {review.images.map((image, index) => (
                        <img
                          key={index}
                          src={image}
                          alt={`Review ${index + 1}`}
                          className="h-20 w-20 rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}

                  {review.providerReply ? (
                    <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Your reply</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReplyToggle(review.id, review.providerReply)}
                        >
                          Edit
                        </Button>
                      </div>
                      <p className="mt-2 text-sm text-foreground">{review.providerReply}</p>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      onClick={() => handleReplyToggle(review.id, review.providerReply)}
                    >
                      Reply
                    </Button>
                  )}

                  {activeReplyId === review.id && (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        value={replyDrafts[review.id] ?? ""}
                        onChange={(event) =>
                          setReplyDrafts((prev) => ({
                            ...prev,
                            [review.id]: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="Write a professional response..."
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleReplySave(review.id)}
                          disabled={savingReplyId === review.id}
                        >
                          {savingReplyId === review.id ? "Saving..." : "Save reply"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveReplyId(null)}
                          disabled={savingReplyId === review.id}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">Helpful {review.helpful}</Badge>
                    <Badge variant="secondary">
                      {review.rating} / 5
                    </Badge>
                  </div>
                </div>
              ))}

              {hasNextPage && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Loading more..." : "Load more reviews"}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="w-full lg:w-[360px] space-y-4">
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
            <div className="text-center">
              <div className="text-5xl font-bold text-foreground">{averageRating}</div>
              <div className="mt-2 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-5 w-5 ${
                      star <= Math.round(averageRating)
                        ? "fill-primary text-primary"
                        : "fill-muted text-muted"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {totalReviews} reviews
              </p>
            </div>

            <div className="mt-6 space-y-2">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = ratingBreakdown[stars] || 0;
                const percentage = totalReviews > 0 ? (count / safeTotal) * 100 : 0;
                return (
                  <div key={stars} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6">
                      {stars}
                    </span>
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-gold rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-8 text-right">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">NPS-style score</div>
                <div className="text-3xl font-semibold text-foreground">
                  {nps ? nps.score : 0}
                </div>
              </div>
              <Badge variant="outline">
                {nps ? `${nps.total} total` : "No data"}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                <div className="text-lg font-semibold text-foreground">
                  {nps?.promoters ?? 0}
                </div>
                Promoters
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                <div className="text-lg font-semibold text-foreground">
                  {nps?.passives ?? 0}
                </div>
                Passives
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                <div className="text-lg font-semibold text-foreground">
                  {nps?.detractors ?? 0}
                </div>
                Detractors
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Promoters are 5★, Passives 4★, Detractors 1–3★.
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">Rating trend</div>
                <div className="text-xs text-muted-foreground">
                  Average rating by month
                </div>
              </div>
              <Select value={trendRange} onValueChange={setTrendRange}>
                <SelectTrigger className="h-8 w-[100px] text-xs">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                  <SelectItem value="18">18 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isLoadingAnalytics ? (
              <div className="text-xs text-muted-foreground">Loading trend...</div>
            ) : trendData.length === 0 ? (
              <div className="text-xs text-muted-foreground">No review trend yet.</div>
            ) : (
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis
                      domain={[0, 5]}
                      ticks={[0, 1, 2, 3, 4, 5]}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`${value}★`, "Avg rating"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="averageRating"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <Button variant="ghost" size="sm" className="w-full" onClick={() => refetchAnalytics()}>
              Refresh trend
            </Button>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Top reviewed services</div>
              <div className="text-xs text-muted-foreground">
                Most feedback received
              </div>
            </div>
            {isLoadingAnalytics ? (
              <div className="text-xs text-muted-foreground">Loading services...</div>
            ) : topServices.length === 0 ? (
              <div className="text-xs text-muted-foreground">No reviews yet.</div>
            ) : (
              <div className="space-y-3">
                {topServices.map((service) => (
                  <div
                    key={service.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div>
                      <Link to={`/service/${service.id}`} className="text-sm font-medium text-foreground">
                        {service.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {service.reviewCount} reviews
                      </div>
                    </div>
                    <Badge variant="secondary">{service.averageRating}★</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderReviews;
