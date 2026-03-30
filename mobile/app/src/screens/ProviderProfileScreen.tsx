import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchUserFullProfile,
  fetchProviderServices,
  fetchServiceReviews,
  fetchUserPosts,
  fetchUserGallery,
  followUser,
  unfollowUser,
} from "../lib/api";
import type { UserFullProfile, UserPost, UserGalleryItem } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { createThemedStyles } from "../theme";
import type { Review, Service } from "../types";

type Props = {
  userId: string;
  onOpenService: (serviceId: string) => void;
  onOpenMessages: (providerId: string) => void;
  onBack: () => void;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const GALLERY_SPACING = 3;
const GALLERY_COL = 3;
// container = screen - marginHorizontal(20*2) - borderWidth(1*2) - padding(GALLERY_SPACING*2)
const GALLERY_CONTAINER = SCREEN_WIDTH - 40 - 2 - GALLERY_SPACING * 2;
const GALLERY_ITEM_SIZE = Math.floor((GALLERY_CONTAINER - GALLERY_SPACING * (GALLERY_COL - 1)) / GALLERY_COL);

const formatRating = (value: string | number | null | undefined) => {
  if (value == null) return null;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? num.toFixed(1) : null;
};

const formatDate = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const StarRow = ({ rating }: { rating: number }) => {
  const ss = useStarStyles();
  return (
    <View style={ss.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text key={star} style={[ss.star, star <= rating && ss.starFilled]}>
          ★
        </Text>
      ))}
    </View>
  );
};

const useStarStyles = createThemedStyles((palette) => ({
  row: { flexDirection: "row", gap: 2 },
  star: { color: palette.line, fontSize: 16 },
  starFilled: { color: "#f59e0b" },
}));

type ContentTab = "posts" | "gallery";

export function ProviderProfileScreen({ userId, onOpenService, onOpenMessages, onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const [fullProfile, setFullProfile] = useState<UserFullProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [gallery, setGallery] = useState<UserGalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ContentTab>("posts");
  const [isFollowing, setIsFollowing] = useState(false);
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const [profileData, servicesData] = await Promise.all([
          fetchUserFullProfile(userId),
          fetchProviderServices(userId),
        ]);
        setFullProfile(profileData);
        setServices(servicesData);
        setIsFollowing(profileData.viewer?.following ?? false);

        // Load posts
        setPostsLoading(true);
        fetchUserPosts(userId, { limit: 20 })
          .then((res) => setPosts(res.posts))
          .catch(() => setPosts([]))
          .finally(() => setPostsLoading(false));

        // Load gallery
        setGalleryLoading(true);
        fetchUserGallery(userId, { limit: 30 })
          .then((res) => setGallery(res.media))
          .catch(() => setGallery([]))
          .finally(() => setGalleryLoading(false));

        if (servicesData.length > 0) {
          const firstServiceReviews = await fetchServiceReviews(servicesData[0].id).catch(() => []);
          setReviews(firstServiceReviews);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load provider profile.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleFollowToggle = async () => {
    if (isUpdatingFollow) return;
    setIsUpdatingFollow(true);
    try {
      if (isFollowing) {
        await unfollowUser(userId);
        setIsFollowing(false);
        if (fullProfile) {
          setFullProfile({
            ...fullProfile,
            stats: {
              ...fullProfile.stats,
              followers: Math.max(0, fullProfile.stats.followers - 1),
            },
          });
        }
      } else {
        await followUser(userId);
        setIsFollowing(true);
        if (fullProfile) {
          setFullProfile({
            ...fullProfile,
            stats: {
              ...fullProfile.stats,
              followers: fullProfile.stats.followers + 1,
            },
          });
        }
      }
    } catch {
      // Revert on error
      setIsFollowing((prev) => prev);
    } finally {
      setIsUpdatingFollow(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (error || !fullProfile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Could not load profile</Text>
        <Text style={styles.errorBody}>{error ?? "Profile unavailable."}</Text>
        <Pressable onPress={() => void load()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const profile = fullProfile.user;
  const stats = fullProfile.stats;
  const displayName =
    profile.providerProfile?.displayName || profile.username || "Provider";
  const ratingAvg = formatRating(profile.providerProfile?.ratingAvg);
  const ratingCount = profile.providerProfile?.ratingCount ?? 0;
  const bio = profile.providerProfile?.bio;
  const location = profile.providerProfile?.location || profile.location;
  const categories = profile.providerProfile?.categories ?? [];
  const isVerified = profile.providerProfile?.verificationStatus === "verified";
  const isSelf = fullProfile.viewer?.isSelf ?? (user?.id === userId);
  const isProvider = profile.role === "provider";
  const bannerUrl = profile.bannerUrl ?? null;

  const statItems = [
    { label: "Posts", value: stats.posts, icon: "document-text-outline" as const },
    { label: "Followers", value: stats.followers, icon: "people-outline" as const },
    { label: "Following", value: stats.following, icon: "person-add-outline" as const },
    ...(isProvider
      ? [{ label: "Services", value: stats.services, icon: "briefcase-outline" as const }]
      : []),
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl onRefresh={() => void load("refresh")} refreshing={isRefreshing} tintColor={palette.accent} />
      }
    >
      {/* Back button */}
      <Pressable onPress={onBack} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color={palette.accentDeep} />
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>

      {/* Banner */}
      <View style={styles.bannerWrap}>
        {bannerUrl ? (
          <Image source={{ uri: bannerUrl }} style={styles.bannerImage} resizeMode="cover" />
        ) : (
          <View style={styles.bannerPlaceholder}>
            <View style={styles.bannerGradientLeft} />
            <View style={styles.bannerGradientRight} />
          </View>
        )}
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        {/* Avatar overlapping banner */}
        <View style={styles.avatarWrap}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {isVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={14} color="#ffffff" />
            </View>
          ) : null}
        </View>

        <Text style={styles.displayName}>{displayName}</Text>
        {profile.username ? (
          <Text style={styles.username}>@{profile.username}</Text>
        ) : null}
        {location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={palette.slate} />
            <Text style={styles.location}>{location}</Text>
          </View>
        ) : null}

        {ratingAvg ? (
          <View style={styles.ratingRow}>
            <StarRow rating={Math.round(parseFloat(ratingAvg))} />
            <Text style={styles.ratingText}>
              {ratingAvg} ({ratingCount} {ratingCount === 1 ? "review" : "reviews"})
            </Text>
          </View>
        ) : null}

        {isVerified ? (
          <View style={styles.verifiedPill}>
            <Ionicons name="shield-checkmark" size={14} color={palette.accentDeep} />
            <Text style={styles.verifiedPillText}>Verified provider</Text>
          </View>
        ) : null}

        {/* Follow / Unfollow button */}
        {!isSelf ? (
          <View style={styles.actionRow}>
            <Pressable
              onPress={handleFollowToggle}
              disabled={isUpdatingFollow}
              style={[
                styles.followButton,
                isFollowing && styles.followButtonFollowing,
              ]}
            >
              {isUpdatingFollow ? (
                <ActivityIndicator size="small" color={isFollowing ? palette.accentDeep : "#ffffff"} />
              ) : (
                <>
                  <Ionicons
                    name={isFollowing ? "checkmark-circle" : "person-add"}
                    size={16}
                    color={isFollowing ? palette.accentDeep : "#ffffff"}
                  />
                  <Text
                    style={[
                      styles.followButtonText,
                      isFollowing && styles.followButtonTextFollowing,
                    ]}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable onPress={() => onOpenMessages(userId)} style={styles.messageButton}>
              <Ionicons name="chatbubble-outline" size={16} color="#ffffff" />
              <Text style={styles.messageButtonText}>Message</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {statItems.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Ionicons name={stat.icon} size={18} color={palette.accent} style={{ marginBottom: 4 }} />
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Bio */}
      {bio ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bioText}>{bio}</Text>
        </View>
      ) : null}

      {/* Categories */}
      {categories.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Specialties</Text>
          <View style={styles.tagRow}>
            {categories.map((cat) => (
              <View key={cat} style={styles.tag}>
                <Text style={styles.tagText}>{cat}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Tab Switcher: Posts | Gallery */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab("posts")}
          style={[styles.tabItem, activeTab === "posts" && styles.tabItemActive]}
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={activeTab === "posts" ? palette.accentDeep : palette.slate}
          />
          <Text style={[styles.tabText, activeTab === "posts" && styles.tabTextActive]}>
            Posts
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("gallery")}
          style={[styles.tabItem, activeTab === "gallery" && styles.tabItemActive]}
        >
          <Ionicons
            name="images-outline"
            size={18}
            color={activeTab === "gallery" ? palette.accentDeep : palette.slate}
          />
          <Text style={[styles.tabText, activeTab === "gallery" && styles.tabTextActive]}>
            Gallery
          </Text>
        </Pressable>
      </View>

      {/* Posts Tab */}
      {activeTab === "posts" ? (
        <View style={styles.section}>
          {postsLoading ? (
            <View style={styles.tabLoading}>
              <ActivityIndicator color={palette.accent} size="small" />
              <Text style={styles.loadingText}>Loading posts...</Text>
            </View>
          ) : posts.length === 0 ? (
            <View style={styles.tabEmpty}>
              <Ionicons name="document-text-outline" size={40} color={palette.line} />
              <Text style={styles.emptyText}>No posts yet.</Text>
            </View>
          ) : (
            posts.map((post) => (
              <View key={post.id} style={styles.postCard}>
                <Text style={styles.postContent} numberOfLines={6}>
                  {post.content}
                </Text>
                {post.media.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.postMediaScroll}
                  >
                    {post.media.map((m, i) => (
                      <Image
                        key={`${post.id}-media-${i}`}
                        source={{ uri: m.signedUrl ?? m.url }}
                        style={styles.postMediaThumb}
                        resizeMode="cover"
                      />
                    ))}
                  </ScrollView>
                ) : null}
                <View style={styles.postFooter}>
                  <View style={styles.postStat}>
                    <Ionicons name="heart-outline" size={14} color={palette.slate} />
                    <Text style={styles.postStatText}>{post.likeCount}</Text>
                  </View>
                  <View style={styles.postStat}>
                    <Ionicons name="chatbubble-outline" size={14} color={palette.slate} />
                    <Text style={styles.postStatText}>{post.commentCount}</Text>
                  </View>
                  <Text style={styles.postDate}>{formatDate(post.createdAt)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      ) : null}

      {/* Gallery Tab */}
      {activeTab === "gallery" ? (
        <View style={styles.gallerySection}>
          {galleryLoading ? (
            <View style={styles.tabLoading}>
              <ActivityIndicator color={palette.accent} size="small" />
              <Text style={styles.loadingText}>Loading gallery...</Text>
            </View>
          ) : gallery.length === 0 ? (
            <View style={styles.tabEmpty}>
              <Ionicons name="images-outline" size={40} color={palette.line} />
              <Text style={styles.emptyText}>No photos yet.</Text>
            </View>
          ) : (
            <View style={styles.galleryGrid}>
              {gallery.map((item, index) => (
                <Pressable key={`gallery-${index}`} style={styles.galleryItemWrap}>
                  <Image
                    source={{ uri: item.signedUrl ?? item.url }}
                    style={styles.galleryItem}
                    resizeMode="cover"
                  />
                  {item.type === "video" && (
                    <View style={styles.videoOverlay}>
                      <View style={styles.playBtnCircle}>
                        <Ionicons name="play" size={18} color="#ffffff" />
                      </View>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {/* Services */}
      {services.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services ({services.length})</Text>
          {services.map((service) => {
            const lowestTier = service.tiers.reduce<typeof service.tiers[0] | null>(
              (acc, tier) => {
                if (!acc) return tier;
                return parseFloat(tier.price) < parseFloat(acc.price) ? tier : acc;
              },
              null,
            );
            return (
              <Pressable key={service.id} onPress={() => onOpenService(service.id)} style={styles.serviceCard}>
                {service.coverMedia?.url || service.media[0]?.url ? (
                  <Image
                    source={{ uri: service.coverMedia?.url ?? service.media[0].url }}
                    style={styles.serviceThumb}
                  />
                ) : (
                  <View style={[styles.serviceThumb, styles.serviceThumbFallback]}>
                    <Text style={styles.serviceThumbText}>{service.category.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.serviceInfo}>
                  <Text numberOfLines={2} style={styles.serviceTitle}>
                    {service.title}
                  </Text>
                  <Text style={styles.serviceCategory}>{service.category}</Text>
                  {lowestTier ? (
                    <Text style={styles.servicePrice}>
                      From {lowestTier.currency} {lowestTier.price}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Reviews */}
      {reviews.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent reviews</Text>
          {reviews.slice(0, 5).map((review) => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewAuthor}>{review.author.name}</Text>
                <StarRow rating={review.rating} />
              </View>
              {review.formattedDate ? (
                <Text style={styles.reviewDate}>{review.formattedDate}</Text>
              ) : null}
              <Text style={styles.reviewComment}>{review.comment}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  centered: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { color: palette.slate, fontSize: 14 },
  errorTitle: { color: palette.danger, fontSize: 17, fontWeight: "700" },
  errorBody: { color: palette.slate, fontSize: 14, textAlign: "center" },
  retryButton: {
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  content: { gap: 16, paddingBottom: 80 },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  backButtonText: { color: palette.accentDeep, fontSize: 15, fontWeight: "700" },

  // Banner
  bannerWrap: {
    height: 160,
    overflow: "hidden",
    width: "100%",
  },
  bannerImage: {
    height: "100%",
    width: "100%",
  },
  bannerPlaceholder: {
    backgroundColor: palette.accentSoft,
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  bannerGradientLeft: {
    backgroundColor: palette.accentSoft,
    flex: 1,
    opacity: 0.8,
  },
  bannerGradientRight: {
    backgroundColor: palette.mist,
    flex: 1,
    opacity: 0.6,
  },

  // Hero
  hero: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: 20,
    marginTop: -44,
    padding: 24,
    paddingTop: 54,
  },
  avatarWrap: {
    position: "absolute",
    top: -44,
  },
  avatar: {
    borderColor: palette.card,
    borderRadius: 44,
    borderWidth: 3,
    height: 88,
    width: 88,
  },
  avatarFallback: {
    alignItems: "center",
    backgroundColor: palette.accentSoft,
    borderColor: palette.card,
    borderRadius: 44,
    borderWidth: 3,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  avatarFallbackText: {
    color: palette.accentDeep,
    fontSize: 34,
    fontWeight: "900",
  },
  verifiedBadge: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 2,
    bottom: 0,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    width: 24,
  },
  displayName: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  username: { color: palette.slate, fontSize: 14 },
  locationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  location: { color: palette.slate, fontSize: 14 },
  ratingRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  ratingText: { color: palette.slate, fontSize: 13 },
  verifiedPill: {
    alignItems: "center",
    backgroundColor: palette.accentSoft,
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  verifiedPillText: {
    color: palette.accentDeep,
    fontSize: 12,
    fontWeight: "700",
  },

  // Action row
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  followButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    minWidth: 110,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  followButtonFollowing: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accentDeep,
    borderWidth: 1,
  },
  followButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  followButtonTextFollowing: {
    color: palette.accentDeep,
  },
  messageButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  messageButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },

  // Stats grid
  statsGrid: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 20,
  },
  statCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 14,
  },
  statValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    color: palette.slate,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },

  // Tab bar
  tabBar: {
    backgroundColor: palette.mist,
    borderRadius: 16,
    flexDirection: "row",
    marginHorizontal: 20,
    padding: 4,
  },
  tabItem: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 10,
  },
  tabItemActive: {
    backgroundColor: palette.card,
    elevation: 2,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  tabText: {
    color: palette.slate,
    fontSize: 13,
    fontWeight: "700",
  },
  tabTextActive: {
    color: palette.accentDeep,
  },

  // Tab content
  tabLoading: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 32,
  },
  tabEmpty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 32,
  },
  emptyText: {
    color: palette.slate,
    fontSize: 14,
  },

  // Posts
  postCard: {
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  postContent: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  postMediaScroll: {
    marginTop: 4,
  },
  postMediaThumb: {
    borderRadius: 10,
    height: 100,
    marginRight: 8,
    width: 100,
  },
  postFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
  },
  postStat: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  postStatText: {
    color: palette.slate,
    fontSize: 12,
  },
  postDate: {
    color: palette.slate,
    fontSize: 11,
    marginLeft: "auto",
  },

  // Gallery
  gallerySection: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 20,
    padding: GALLERY_SPACING,
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GALLERY_SPACING,
  },
  galleryItemWrap: {
    borderRadius: 10,
    overflow: "hidden",
    width: GALLERY_ITEM_SIZE,
    height: GALLERY_ITEM_SIZE,
    backgroundColor: palette.mist,
  },
  galleryItem: {
    height: "100%",
    width: "100%",
  },
  videoOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  playBtnCircle: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },

  // Sections
  section: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: 20,
    padding: 18,
  },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  bioText: { color: palette.slate, fontSize: 14, lineHeight: 21 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    backgroundColor: palette.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: { color: palette.accentDeep, fontSize: 12, fontWeight: "700" },
  serviceCard: {
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    overflow: "hidden",
    padding: 10,
  },
  serviceThumb: {
    borderRadius: 10,
    height: 70,
    width: 70,
  },
  serviceThumbFallback: {
    alignItems: "center",
    backgroundColor: palette.mist,
    justifyContent: "center",
  },
  serviceThumbText: { color: palette.slate, fontSize: 24, fontWeight: "800" },
  serviceInfo: { flex: 1, gap: 4, justifyContent: "center" },
  serviceTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  serviceCategory: { color: palette.slate, fontSize: 12 },
  servicePrice: { color: palette.accent, fontSize: 13, fontWeight: "700" },
  reviewCard: {
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  reviewHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
  reviewAuthor: { color: palette.ink, flex: 1, fontSize: 14, fontWeight: "700" },
  reviewDate: { color: palette.slate, fontSize: 11 },
  reviewComment: { color: palette.slate, fontSize: 13, lineHeight: 19 },
}));
