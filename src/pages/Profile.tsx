import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPosts } from "@/hooks/useUserPosts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/components/ui/use-toast";
import CommunityPostCard from "@/components/community/CommunityPostCard";
import {
  ApiUserGalleryItem,
  ApiUserProfile,
  fetchUserGallery,
  fetchUserProfile,
  followUser,
  unfollowUser,
} from "@/lib/api";
import { CalendarDays, MapPin, Star } from "lucide-react";

const getDisplayName = (user: {
  role: string;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  providerProfile?: { displayName?: string | null } | null;
}) => {
  if (user.providerProfile?.displayName) {
    return user.providerProfile.displayName;
  }
  if (user.username) {
    return user.username;
  }
  if (user.email) {
    return user.email;
  }
  if (user.phone) {
    return user.phone;
  }
  return user.role === "provider" ? "Provider" : "Community member";
};

const getInitials = (name: string) => {
  const tokens = name.split(" ").filter(Boolean);
  const first = tokens[0]?.[0] ?? name[0] ?? "U";
  const second = tokens[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
};

const formatMemberSince = (value?: string) => {
  if (!value) {
    return "Member";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Member";
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
};

const Profile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"timeline" | "gallery">("timeline");
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  const profileQuery = useQuery<ApiUserProfile, Error>({
    queryKey: ["user-profile", id],
    queryFn: () => fetchUserProfile(id ?? ""),
    enabled: Boolean(id),
  });

  const postsQuery = useUserPosts(id ?? "", 10);

  const galleryQuery = useQuery<ApiUserGalleryItem[], Error>({
    queryKey: ["user-gallery", id],
    queryFn: () => fetchUserGallery(id ?? "", { limit: 24 }),
    enabled: Boolean(id),
  });

  const profileUserId = profileQuery.data?.user.id ?? null;

  useEffect(() => {
    if (profileQuery.data?.viewer) {
      setIsFollowing(profileQuery.data.viewer.following);
    }
  }, [profileQuery.data]);

  const posts = useMemo(
    () => postsQuery.data?.pages.flatMap((page) => page.posts) ?? [],
    [postsQuery.data],
  );

  const requireAuth = () => {
    if (isAuthenticated) {
      return true;
    }
    toast("Please sign in to continue.");
    navigate(`/sign-in?next=/profile/${id ?? ""}`);
    return false;
  };

  const handleFollow = async () => {
    if (!profileUserId || !requireAuth() || isUpdatingFollow) {
      return;
    }
    setIsUpdatingFollow(true);
    try {
      if (isFollowing) {
        await unfollowUser(profileUserId);
      } else {
        await followUser(profileUserId);
      }
      setIsFollowing((prev) => !prev);
      await profileQuery.refetch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update follow.");
    } finally {
      setIsUpdatingFollow(false);
    }
  };

  if (profileQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16 text-center text-muted-foreground">
          Loading profile...
        </main>
        <Footer />
      </div>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16 text-center">
          <h2 className="text-lg font-semibold mb-2">Profile not available</h2>
          <p className="text-muted-foreground mb-4">
            {profileQuery.error?.message ?? "Please try again later."}
          </p>
          <Button variant="outline" onClick={() => navigate("/community")}>
            Back to community
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const profile = profileQuery.data;
  const displayName = getDisplayName(profile.user);
  const initials = getInitials(displayName);
  const providerProfile = profile.user.providerProfile ?? undefined;
  const memberSince = formatMemberSince(profile.user.createdAt);
  const username = profile.user.username?.trim() ?? null;
  const handle = username ? `@${username}` : null;
  const showHandle =
    Boolean(handle) && displayName.toLowerCase() !== (username ?? "").toLowerCase();
  const ratingValue = providerProfile?.ratingAvg ? Number(providerProfile.ratingAvg) : 0;
  const ratingCount = providerProfile?.ratingCount ?? 0;
  const ratingDisplay = ratingCount > 0 ? ratingValue.toFixed(1) : "New";
  const isProvider = profile.user.role === "provider";
  const isSelf = profile.viewer?.isSelf ?? false;
  const stats = [
    { label: "Posts", value: profile.stats.posts },
    { label: "Followers", value: profile.stats.followers },
    { label: "Following", value: profile.stats.following },
    ...(isProvider ? [{ label: "Services", value: profile.stats.services }] : []),
  ];
  const statsGridClass = isProvider ? "sm:grid-cols-4" : "sm:grid-cols-3";

  const avatarUrl = profile.user.avatarUrl ?? null;
  const bannerUrl = profile.user.bannerUrl ?? null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-10 space-y-8">
        <Card className="border-border/60 shadow-card overflow-hidden">
          <div className="h-40 w-full bg-muted/30 relative">
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt="Profile banner"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-muted/40 via-muted/10 to-muted/40" />
            )}
          </div>
          <CardContent className="p-6 space-y-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="-mt-16">
                <Avatar className="h-28 w-28 border-4 border-card shadow-lg">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-display font-bold text-foreground">
                    {displayName}
                  </h1>
                  <Badge variant="outline">
                    {isProvider ? "Service provider" : "Community member"}
                  </Badge>
                  {providerProfile?.verificationStatus === "verified" ? (
                    <Badge variant="secondary">Verified</Badge>
                  ) : null}
                </div>
                {showHandle ? (
                  <p className="text-sm text-muted-foreground">{handle}</p>
                ) : null}
                {providerProfile?.bio ? (
                  <p className="text-sm text-muted-foreground">{providerProfile.bio}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  {providerProfile?.location ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {providerProfile.location}
                    </span>
                  ) : null}
                  {isProvider ? (
                    <span className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-primary" />
                      {ratingDisplay}
                      {ratingCount > 0 ? ` (${ratingCount} reviews)` : " (no reviews yet)"}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" />
                    Member since {memberSince}
                  </span>
                </div>
                {providerProfile?.categories?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {providerProfile.categories.map((category) => (
                      <Badge key={category} variant="outline">
                        {category}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              {isSelf ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => navigate("/account")}>
                    Edit profile
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant={isFollowing ? "secondary" : "default"}
                    onClick={handleFollow}
                    disabled={isUpdatingFollow}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </Button>
                </div>
              )}
            </div>

            <div className={`grid grid-cols-2 gap-4 text-center ${statsGridClass}`}>
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border/60 bg-card py-3">
                  <div className="text-lg font-semibold text-foreground">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-2 py-1 shadow-sm w-fit">
          <Button
            variant={activeTab === "timeline" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("timeline")}
          >
            Timeline
          </Button>
          <Button
            variant={activeTab === "gallery" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("gallery")}
          >
            Photos
          </Button>
        </div>

        {activeTab === "timeline" ? (
          <div className="space-y-6">
            {postsQuery.isLoading ? (
              <div className="text-center py-16 text-muted-foreground">Loading timeline...</div>
            ) : posts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                No posts yet.
              </div>
            ) : (
              <>
                {posts.map((post) => (
                  <CommunityPostCard
                    key={post.id}
                    post={post}
                    onRefresh={postsQuery.refetch}
                    showFollow={false}
                  />
                ))}
                {postsQuery.hasNextPage ? (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => postsQuery.fetchNextPage()}
                      disabled={postsQuery.isFetchingNextPage}
                    >
                      {postsQuery.isFetchingNextPage ? "Loading..." : "Load more"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div>
            {galleryQuery.isLoading ? (
              <div className="text-center py-16 text-muted-foreground">Loading photos...</div>
            ) : galleryQuery.data && galleryQuery.data.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {galleryQuery.data.map((media) =>
                  media.type === "video" ? (
                    <video
                      key={media.id}
                      src={media.signedUrl ?? media.url}
                      className="aspect-square w-full rounded-2xl border border-border/60 object-cover"
                      controls
                    />
                  ) : (
                    <img
                      key={media.id}
                      src={media.signedUrl ?? media.url}
                      alt="Profile gallery"
                      className="aspect-square w-full rounded-2xl border border-border/60 object-cover"
                      loading="lazy"
                    />
                  ),
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                No photos yet.
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Profile;
