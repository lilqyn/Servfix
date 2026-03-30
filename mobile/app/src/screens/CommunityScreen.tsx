import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  Share,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  createCommunityComment,
  createCommunityPost,
  deleteCommunityPost,
  fetchCommunityComments,
  fetchCommunityFeed,
  fetchSuggestedProviders,
  followUser,
  updateFollowNotifications,
  likeCommunityPost,
  saveCommunityPost,
  type FollowedService,
  type SuggestedProvider,
  shareCommunityPost,
  unfollowUser,
  unlikeCommunityPost,
  unsaveCommunityPost,
  uploadCommunityImage,
  uploadCommunityVideo,
} from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { CommunityComment, CommunityMedia, CommunityPost } from "../types";

type FeedScope = "all" | "following";

type Props = {
  onOpenSignIn: () => void;
  onOpenProfile?: (userId: string) => void;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getAuthorName = (author: CommunityPost["author"]) => {
  if (author.providerProfile?.displayName) return author.providerProfile.displayName;
  if (author.username) return `@${author.username}`;
  if (author.email) return author.email;
  if (author.phone) return author.phone;
  return author.role === "provider" ? "Provider" : "User";
};

const getInitials = (name: string) => {
  const cleaned = name.replace(/^@/, "");
  const tokens = cleaned.split(" ").filter(Boolean);
  return `${tokens[0]?.[0] ?? cleaned[0] ?? "U"}${tokens[1]?.[0] ?? ""}`.toUpperCase();
};

function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  const styles = useStyles();
  const initials = getInitials(name);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
      )}
    </View>
  );
}

function MediaPlaceholder() {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.mist, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="image-outline" size={24} color={palette.line} />
    </View>
  );
}

function MediaTile({ uri, style, overlay }: { uri?: string | null; style?: object; overlay?: string }) {
  const isValid = !!uri && (uri.startsWith("http://") || uri.startsWith("https://"));
  return (
    <View style={[{ borderRadius: 10, overflow: "hidden" }, style]}>
      {isValid ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <MediaPlaceholder />
      )}
      {overlay ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", borderRadius: 10 }}>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>{overlay}</Text>
        </View>
      ) : null}
    </View>
  );
}

function AdaptiveImage({ uri }: { uri?: string | null }) {
  const [ratio, setRatio] = useState(4 / 3);
  useEffect(() => {
    let mounted = true;
    if (uri && (uri.startsWith("http://") || uri.startsWith("https://"))) {
      Image.getSize(
        uri,
        (w, h) => {
          if (mounted && w > 0 && h > 0) {
            const natural = w / h;
            setRatio(Math.min(Math.max(natural, 3 / 4), 2));
          }
        },
        () => {},
      );
    }
    return () => { mounted = false; };
  }, [uri]);

  return <MediaTile uri={uri} style={{ width: "100%", aspectRatio: ratio }} />;
}

function PostMedia({ media, layout }: { media: CommunityMedia[]; layout: "grid" | "carousel" }) {
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = screenWidth - 32 - 32; // page padding + card padding

  const getUrl = (m: CommunityMedia) => m.signedUrl ?? m.url;
  const count = media.length;
  const extra = count > 4 ? count - 4 : 0;

  // ── Carousel layout ──
  if (layout === "carousel" && count > 1) {
    const slideW = contentWidth * 0.85;
    const slideH = slideW * 0.75;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={slideW + 8}
        contentContainerStyle={{ gap: 8 }}
      >
        {media.map((m) => (
          <MediaTile key={m.id} uri={getUrl(m)} style={{ width: slideW, height: slideH }} />
        ))}
      </ScrollView>
    );
  }

  // ── Single image — adaptive aspect ratio ──
  if (count === 1) {
    return <AdaptiveImage uri={getUrl(media[0])} />;
  }

  // ── 2 images — side by side, equal ──
  if (count === 2) {
    const halfW = (contentWidth - 6) / 2;
    const h = halfW * 1.1;
    return (
      <View style={{ flexDirection: "row", gap: 6 }}>
        <MediaTile uri={getUrl(media[0])} style={{ width: halfW, height: h }} />
        <MediaTile uri={getUrl(media[1])} style={{ width: halfW, height: h }} />
      </View>
    );
  }

  // ── 3 images — 1 large left, 2 stacked right ──
  if (count === 3) {
    const leftW = contentWidth * 0.58;
    const rightW = contentWidth - leftW - 6;
    const totalH = contentWidth * 0.7;
    const halfH = (totalH - 6) / 2;
    return (
      <View style={{ flexDirection: "row", gap: 6 }}>
        <MediaTile uri={getUrl(media[0])} style={{ width: leftW, height: totalH }} />
        <View style={{ gap: 6 }}>
          <MediaTile uri={getUrl(media[1])} style={{ width: rightW, height: halfH }} />
          <MediaTile uri={getUrl(media[2])} style={{ width: rightW, height: halfH }} />
        </View>
      </View>
    );
  }

  // ── 4+ images — 1 large top, 3 below (last with +N overlay) ──
  const topH = contentWidth * 0.55;
  const bottomW = (contentWidth - 12) / 3;
  const bottomH = bottomW * 0.85;
  return (
    <View style={{ gap: 6 }}>
      <MediaTile uri={getUrl(media[0])} style={{ width: "100%", height: topH }} />
      <View style={{ flexDirection: "row", gap: 6 }}>
        <MediaTile uri={getUrl(media[1])} style={{ width: bottomW, height: bottomH }} />
        <MediaTile uri={getUrl(media[2])} style={{ width: bottomW, height: bottomH }} />
        <MediaTile
          uri={getUrl(media[3])}
          style={{ width: bottomW, height: bottomH }}
          overlay={extra > 0 ? `+${extra}` : undefined}
        />
      </View>
    </View>
  );
}

function PostCard({
  post,
  userId,
  onRefresh,
  onSignIn,
  followedIds,
  onToggleFollow,
  onOpenProfile,
}: {
  post: CommunityPost;
  userId?: string;
  onRefresh: () => void;
  onSignIn: () => void;
  followedIds: Set<string>;
  onToggleFollow: (authorId: string, nowFollowing: boolean) => void;
  onOpenProfile?: (userId: string) => void;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  const authorName = getAuthorName(post.author);
  const isOwn = userId === post.author.id;
  const liked = Boolean(post.viewer?.liked);
  const saved = Boolean(post.viewer?.saved);
  const isFollowing = followedIds.has(post.author.id);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const data = await fetchCommunityComments(post.id);
      setComments(data);
    } catch {
      // ignore
    } finally {
      setCommentsLoading(false);
    }
  }, [post.id]);

  const toggleComments = () => {
    if (!commentsOpen) {
      void loadComments();
    }
    setCommentsOpen((prev) => !prev);
  };

  const handleLike = async () => {
    if (!userId) { onSignIn(); return; }
    if (isLiking) return;
    setIsLiking(true);
    try {
      if (liked) await unlikeCommunityPost(post.id);
      else await likeCommunityPost(post.id);
      onRefresh();
    } catch { /* ignore */ } finally {
      setIsLiking(false);
    }
  };

  const handleSave = async () => {
    if (!userId) { onSignIn(); return; }
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (saved) await unsaveCommunityPost(post.id);
      else await saveCommunityPost(post.id);
      onRefresh();
    } catch { /* ignore */ } finally {
      setIsSaving(false);
    }
  };

  const handleComment = async () => {
    if (!userId) { onSignIn(); return; }
    const content = commentDraft.trim();
    if (!content || isCommenting) return;
    setIsCommenting(true);
    try {
      await createCommunityComment(post.id, content);
      setCommentDraft("");
      void loadComments();
      onRefresh();
    } catch { /* ignore */ } finally {
      setIsCommenting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete post?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCommunityPost(post.id);
            onRefresh();
          } catch { /* ignore */ }
        },
      },
    ]);
  };

  const handleFollow = async () => {
    if (!userId) { onSignIn(); return; }
    if (isTogglingFollow) return;
    setIsTogglingFollow(true);
    try {
      if (isFollowing) {
        await unfollowUser(post.author.id);
        onToggleFollow(post.author.id, false);
      } else {
        await followUser(post.author.id);
        onToggleFollow(post.author.id, true);
      }
    } catch { /* ignore */ } finally {
      setIsTogglingFollow(false);
    }
  };

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const message = post.content
        ? `${post.content.slice(0, 200)}${post.content.length > 200 ? "..." : ""}`
        : "Check out this post on Servfix!";
      await Share.share({ message });
      // Increment server-side share count after native share dialog
      await shareCommunityPost(post.id);
      onRefresh();
    } catch { /* ignore */ } finally {
      setIsSharing(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Pressable onPress={() => onOpenProfile?.(post.author.id)}>
          <Avatar url={post.author.avatarUrl} name={authorName} />
        </Pressable>
        <View style={styles.cardHeaderText}>
          <View style={styles.authorNameRow}>
            <Pressable onPress={() => onOpenProfile?.(post.author.id)}>
              <Text style={styles.authorName}>{authorName}</Text>
            </Pressable>
            {!isOwn && userId ? (
              <>
                <Pressable
                  onPress={() => void handleFollow()}
                  disabled={isTogglingFollow}
                  style={[
                    styles.followBtn,
                    isFollowing && styles.followBtnActive,
                  ]}
                >
                  {isTogglingFollow ? (
                    <ActivityIndicator size={10} color={isFollowing ? "#fff" : palette.accentDeep} />
                  ) : (
                    <Text
                      style={[
                        styles.followBtnText,
                        isFollowing && styles.followBtnTextActive,
                      ]}
                    >
                      {isFollowing ? "Following" : "Follow"}
                    </Text>
                  )}
                </Pressable>
                {isFollowing && (
                  <Pressable
                    onPress={() => {
                      Alert.alert(
                        "Notifications",
                        `Manage notifications for ${authorName}`,
                        [
                          { text: "Turn off post alerts", onPress: () => updateFollowNotifications(post.author.id, { notifyPosts: false }).catch(() => {}) },
                          { text: "Turn off service alerts", onPress: () => updateFollowNotifications(post.author.id, { notifyServices: false }).catch(() => {}) },
                          { text: "Turn on all alerts", onPress: () => updateFollowNotifications(post.author.id, { notifyPosts: true, notifyServices: true }).catch(() => {}) },
                          { text: "Cancel", style: "cancel" },
                        ],
                      );
                    }}
                    style={styles.bellBtn}
                  >
                    <Ionicons name="notifications-outline" size={14} color="#fff" />
                  </Pressable>
                )}
              </>
            ) : null}
          </View>
          <Text style={styles.authorMeta}>
            {post.author.role === "provider" ? "Service provider" : "Community member"}
            {post.createdAt ? ` · ${formatTimestamp(post.createdAt)}` : ""}
          </Text>
        </View>
        {isOwn ? (
          <Pressable onPress={handleDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>Delete</Text>
          </Pressable>
        ) : null}
      </View>

      {post.content ? (
        <Text style={styles.postContent}>{post.content}</Text>
      ) : null}

      {post.media?.length > 0 ? (
        <PostMedia media={post.media} layout={post.mediaLayout} />
      ) : null}

      <View style={styles.actions}>
        <Pressable onPress={() => void handleLike()} style={styles.actionBtn} disabled={isLiking}>
          <Text style={[styles.actionIcon, liked && styles.actionIconActive]}>
            {liked ? "♥" : "♡"}
          </Text>
          <Text style={[styles.actionCount, liked && styles.actionCountActive]}>
            {post.counts.likes}
          </Text>
        </Pressable>

        <Pressable onPress={toggleComments} style={styles.actionBtn}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{post.counts.comments}</Text>
        </Pressable>

        <Pressable onPress={() => void handleSave()} style={styles.actionBtn} disabled={isSaving}>
          <Text style={[styles.actionIcon, saved && styles.actionIconActive]}>
            {saved ? "🔖" : "🏷️"}
          </Text>
          <Text style={[styles.actionCount, saved && styles.actionCountActive]}>
            {post.counts.saves}
          </Text>
        </Pressable>

        <Pressable onPress={() => void handleShare()} style={styles.actionBtn} disabled={isSharing}>
          <Ionicons name="share-social-outline" size={18} color={palette.slate} />
          <Text style={styles.actionCount}>
            {post.shareCount > 0 ? post.shareCount : ""}
          </Text>
        </Pressable>
      </View>

      {commentsOpen ? (
        <View style={styles.commentsSection}>
          {commentsLoading ? (
            <ActivityIndicator size="small" color={palette.accent} style={{ marginVertical: 8 }} />
          ) : comments.length === 0 ? (
            <Text style={styles.noComments}>No comments yet.</Text>
          ) : (
            comments.map((c) => {
              const cName = getAuthorName(c.author);
              return (
                <View key={c.id} style={styles.commentRow}>
                  <Avatar url={c.author.avatarUrl} name={cName} size={28} />
                  <View style={styles.commentBody}>
                    <View style={styles.commentHeaderRow}>
                      <Text style={styles.commentAuthor}>{cName}</Text>
                      {c.createdAt ? (
                        <Text style={styles.commentTime}>{formatTimestamp(c.createdAt)}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.commentText}>{c.content}</Text>
                  </View>
                </View>
              );
            })
          )}

          <View style={styles.commentInput}>
            <TextInput
              value={commentDraft}
              onChangeText={setCommentDraft}
              placeholder="Write a comment..."
              placeholderTextColor={palette.slate}
              style={styles.commentTextInput}
              multiline
            />
            <Pressable
              onPress={() => void handleComment()}
              disabled={isCommenting || !commentDraft.trim()}
              style={[styles.commentSend, (!commentDraft.trim() || isCommenting) && styles.commentSendDisabled]}
            >
              {isCommenting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.commentSendText}>Post</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

type MediaDraft = {
  uri: string;
  type: "image" | "video";
  mimeType: string;
};

function Composer({ userId, onSignIn, onPosted }: { userId?: string; onSignIn: () => void; onPosted: () => void }) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [draft, setDraft] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mediaDrafts, setMediaDrafts] = useState<MediaDraft[]>([]);
  const [mediaLayout, setMediaLayout] = useState<"grid" | "carousel">("grid");

  const pickMedia = async (kind: "images" | "videos") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow access to your media library to attach photos and videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind,
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (!result.canceled) {
      const items: MediaDraft[] = result.assets.map((asset) => ({
        uri: asset.uri,
        type: asset.type === "video" ? "video" : "image",
        mimeType: asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg"),
      }));
      setMediaDrafts((prev) => [...prev, ...items].slice(0, 6));
      setExpanded(true);
    }
  };

  const removeMedia = (index: number) => {
    setMediaDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const reset = () => {
    setDraft("");
    setMediaDrafts([]);
    setMediaLayout("grid");
    setExpanded(false);
  };

  const handlePost = async () => {
    if (!userId) { onSignIn(); return; }
    const content = draft.trim();
    if (!content && mediaDrafts.length === 0) return;
    if (isPosting) return;
    setIsPosting(true);
    try {
      const uploadedMedia: { url: string; type: string }[] = [];
      for (const item of mediaDrafts) {
        const res = item.type === "video"
          ? await uploadCommunityVideo(item.uri, item.mimeType)
          : await uploadCommunityImage(item.uri, item.mimeType);
        uploadedMedia.push({ url: res.url, type: item.type });
      }
      await createCommunityPost({
        content: content || undefined,
        media: uploadedMedia.length > 0 ? uploadedMedia : undefined,
        mediaLayout: uploadedMedia.length > 1 ? mediaLayout : undefined,
      });
      reset();
      onPosted();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Unable to post.");
    } finally {
      setIsPosting(false);
    }
  };

  const canPost = draft.trim().length > 0 || mediaDrafts.length > 0;

  return (
    <View style={styles.composer}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onFocus={() => setExpanded(true)}
        placeholder="Share something with the community..."
        placeholderTextColor={palette.slate}
        style={[styles.composerInput, expanded && styles.composerInputExpanded]}
        multiline
      />

      {mediaDrafts.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaPreviews} contentContainerStyle={styles.mediaPreviewsContent}>
          {mediaDrafts.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={styles.mediaPreviewItem}>
              <Image source={{ uri: item.uri }} style={styles.mediaPreviewImage} resizeMode="cover" />
              {item.type === "video" ? (
                <View style={styles.videoIndicator}>
                  <Text style={styles.videoIndicatorText}>▶</Text>
                </View>
              ) : null}
              <Pressable onPress={() => removeMedia(index)} style={styles.mediaRemoveBtn}>
                <Text style={styles.mediaRemoveText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {mediaDrafts.length > 1 ? (
        <View style={styles.layoutToggle}>
          <Text style={styles.layoutLabel}>Layout</Text>
          <Pressable
            onPress={() => setMediaLayout("grid")}
            style={[styles.layoutBtn, mediaLayout === "grid" && styles.layoutBtnActive]}
          >
            <Text style={[styles.layoutBtnText, mediaLayout === "grid" && styles.layoutBtnTextActive]}>Grid</Text>
          </Pressable>
          <Pressable
            onPress={() => setMediaLayout("carousel")}
            style={[styles.layoutBtn, mediaLayout === "carousel" && styles.layoutBtnActive]}
          >
            <Text style={[styles.layoutBtnText, mediaLayout === "carousel" && styles.layoutBtnTextActive]}>Slider</Text>
          </Pressable>
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.composerActions}>
          <Pressable onPress={() => void pickMedia("images")} style={styles.mediaPickBtn} disabled={isPosting}>
            <Text style={styles.mediaPickIcon}>📷</Text>
          </Pressable>
          <Pressable onPress={() => void pickMedia("videos")} style={styles.mediaPickBtn} disabled={isPosting}>
            <Text style={styles.mediaPickIcon}>🎥</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={reset} style={styles.composerCancel} disabled={isPosting}>
            <Text style={styles.composerCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void handlePost()}
            disabled={isPosting || !canPost}
            style={[styles.composerPost, (!canPost || isPosting) && styles.composerPostDisabled]}
          >
            {isPosting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.composerPostText}>Publish</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function CommunityScreen({ onOpenSignIn, onOpenProfile }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [followedServices, setFollowedServices] = useState<FollowedService[]>([]);
  const [suggestedProviders, setSuggestedProviders] = useState<SuggestedProvider[]>([]);
  const [scope, setScope] = useState<FeedScope>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  // Sync followedIds from post viewer data whenever posts change
  useEffect(() => {
    const ids = new Set<string>();
    for (const p of posts) {
      if (p.viewer?.following) {
        ids.add(p.author.id);
      }
    }
    setFollowedIds((prev) => {
      // Merge: keep locally toggled state, add server state
      const merged = new Set(prev);
      for (const id of ids) merged.add(id);
      return merged;
    });
  }, [posts]);

  const handleToggleFollow = useCallback((authorId: string, nowFollowing: boolean) => {
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (nowFollowing) next.add(authorId);
      else next.delete(authorId);
      return next;
    });
  }, []);

  const loadFeed = useCallback(
    async (mode: "initial" | "refresh" | "more" = "initial") => {
      if (mode === "refresh") setIsRefreshing(true);
      else if (mode === "initial") setIsLoading(true);
      else setIsFetchingMore(true);

      try {
        const result = await fetchCommunityFeed({
          limit: 10,
          scope,
          cursor: mode === "more" ? (cursor ?? undefined) : undefined,
        });
        if (mode === "more") {
          setPosts((prev) => [...prev, ...result.posts]);
        } else {
          setPosts(result.posts);
          if (result.followedServices) setFollowedServices(result.followedServices);
        }
        setCursor(result.nextCursor ?? null);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load community feed.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsFetchingMore(false);
      }
    },
    [scope, cursor],
  );

  useEffect(() => {
    if (!isFocused) return;
    const mode = hasLoadedRef.current ? "refresh" : "initial";
    hasLoadedRef.current = true;
    void loadFeed(mode);
    if (!hasLoadedRef.current || suggestedProviders.length === 0) {
      fetchSuggestedProviders(8).then((r) => setSuggestedProviders(r.providers)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, scope]);

  const refresh = useCallback(() => void loadFeed("refresh"), [loadFeed]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={palette.accent} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Community</Text>
        <View style={styles.scopeBar}>
          <Pressable
            onPress={() => setScope("all")}
            style={[styles.scopeChip, scope === "all" && styles.scopeChipActive]}
          >
            <Text style={[styles.scopeText, scope === "all" && styles.scopeTextActive]}>For you</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!user) { onOpenSignIn(); return; }
              setScope("following");
            }}
            style={[styles.scopeChip, scope === "following" && styles.scopeChipActive]}
          >
            <Text style={[styles.scopeText, scope === "following" && styles.scopeTextActive]}>Following</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl onRefresh={refresh} refreshing={isRefreshing} tintColor={palette.accent} />
        }
        ListHeaderComponent={
          <>
            <Composer userId={user?.id} onSignIn={onOpenSignIn} onPosted={refresh} />
            {scope === "all" && suggestedProviders.length > 0 && (
              <View style={styles.servicesSection}>
                <Text style={styles.servicesSectionTitle}>Suggested providers</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 4 }}>
                  {suggestedProviders.map((p) => (
                    <Pressable key={p.id} style={styles.suggestedCard} onPress={() => onOpenProfile?.(p.id)}>
                      {p.avatarUrl ? (
                        <Image source={{ uri: p.avatarUrl }} style={styles.suggestedAvatar} />
                      ) : (
                        <View style={[styles.suggestedAvatar, { backgroundColor: palette.mist, alignItems: "center", justifyContent: "center" }]}>
                          <Ionicons name="person" size={24} color={palette.slate} />
                        </View>
                      )}
                      <Text style={styles.suggestedName} numberOfLines={1}>{p.displayName || p.username || "Provider"}</Text>
                      {p.ratingAvg && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                          <Ionicons name="star" size={10} color="#f59e0b" />
                          <Text style={styles.suggestedRating}>{parseFloat(p.ratingAvg).toFixed(1)}</Text>
                        </View>
                      )}
                      {p.verified && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                          <Ionicons name="checkmark-circle" size={10} color={palette.info} />
                          <Text style={[styles.suggestedRating, { color: palette.info }]}>Verified</Text>
                        </View>
                      )}
                      {p.mutualFollowers > 0 && (
                        <Text style={[styles.suggestedRating, { color: palette.accentDeep }]}>
                          {p.mutualFollowers} mutual
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {scope === "following" && followedServices.length > 0 && (
              <View style={styles.servicesSection}>
                <Text style={styles.servicesSectionTitle}>New from providers you follow</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 4 }}>
                  {followedServices.map((svc) => (
                    <Pressable key={svc.id} style={styles.serviceCard} onPress={() => onOpenProfile?.(svc.provider.id)}>
                      {svc.imageUrl ? (
                        <Image source={{ uri: svc.imageUrl }} style={styles.serviceCardImage} />
                      ) : (
                        <View style={[styles.serviceCardImage, { backgroundColor: palette.mist, alignItems: "center", justifyContent: "center" }]}>
                          <Ionicons name="briefcase-outline" size={24} color={palette.slate} />
                        </View>
                      )}
                      <Text style={styles.serviceCardTitle} numberOfLines={2}>{svc.title}</Text>
                      {svc.price && (
                        <Text style={styles.serviceCardPrice}>{svc.currency} {svc.price}</Text>
                      )}
                      <Text style={styles.serviceCardProvider} numberOfLines={1}>
                        {svc.provider.displayName || svc.provider.username || "Provider"}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          error ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Could not load feed</Text>
              <Text style={styles.emptyBody}>{error}</Text>
              <Pressable onPress={() => void loadFeed()} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🌐</Text>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyBody}>Be the first to share something!</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            userId={user?.id}
            onRefresh={refresh}
            onSignIn={onOpenSignIn}
            followedIds={followedIds}
            onToggleFollow={handleToggleFollow}
            onOpenProfile={onOpenProfile}
          />
        )}
        onEndReached={() => {
          if (cursor && !isFetchingMore) void loadFeed("more");
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isFetchingMore ? (
            <ActivityIndicator color={palette.accent} style={{ marginVertical: 16 }} />
          ) : null
        }
      />
    </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((palette) => ({
  page: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 4,
    gap: 12,
  },
  title: {
    color: palette.accentDeep,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  scopeBar: {
    backgroundColor: palette.mist,
    borderRadius: 12,
    flexDirection: "row",
    padding: 3,
    alignSelf: "flex-start",
  },
  scopeChip: {
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  scopeChipActive: {
    backgroundColor: palette.card,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  scopeText: { color: palette.slate, fontSize: 13, fontWeight: "600" },
  scopeTextActive: { color: palette.accentDeep, fontWeight: "700" },
  listContent: { gap: 12, padding: 16, paddingBottom: 140 },
  // Followed services carousel
  servicesSection: { gap: 8, marginBottom: 4 },
  servicesSectionTitle: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  serviceCard: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    width: 140,
    overflow: "hidden",
  },
  serviceCardImage: { width: 140, height: 90, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  serviceCardTitle: { color: palette.ink, fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingTop: 6 },
  serviceCardPrice: { color: palette.accentDeep, fontSize: 12, fontWeight: "700", paddingHorizontal: 8, marginTop: 2 },
  serviceCardProvider: { color: palette.slate, fontSize: 11, paddingHorizontal: 8, paddingBottom: 8, marginTop: 2 },
  suggestedCard: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    width: 100,
    alignItems: "center",
    padding: 10,
    gap: 4,
  },
  suggestedAvatar: { width: 48, height: 48, borderRadius: 24 },
  suggestedName: { color: palette.ink, fontSize: 11, fontWeight: "600", textAlign: "center" },
  suggestedRating: { color: palette.slate, fontSize: 10 },
  // Composer
  composer: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  composerInput: {
    color: palette.ink,
    fontSize: 14,
    minHeight: 40,
  },
  composerInputExpanded: { minHeight: 80 },
  composerActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  composerCancel: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.line,
  },
  composerCancelText: { color: palette.slate, fontSize: 13, fontWeight: "600" },
  composerPost: {
    backgroundColor: palette.accentDeep,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  composerPostDisabled: { opacity: 0.5 },
  composerPostText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  // Post card
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardHeaderText: { flex: 1, gap: 2 },
  avatar: {
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { color: palette.accent, fontWeight: "700" },
  authorNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  authorName: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  followBtn: {
    borderWidth: 1,
    borderColor: palette.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  followBtnActive: {
    backgroundColor: palette.accentDeep,
    borderColor: palette.accentDeep,
  },
  followBtnText: {
    color: palette.accentDeep,
    fontSize: 11,
    fontWeight: "700",
  },
  followBtnTextActive: {
    color: "#fff",
  },
  bellBtn: {
    backgroundColor: palette.accentDeep,
    borderRadius: 10,
    padding: 4,
  },
  authorMeta: { color: palette.slate, fontSize: 12 },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  deleteBtnText: { color: palette.danger, fontSize: 12, fontWeight: "600" },
  postContent: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  // Actions
  actions: { flexDirection: "row", gap: 16 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionIcon: { fontSize: 18, color: palette.slate },
  actionIconActive: { color: palette.accent },
  actionCount: { color: palette.slate, fontSize: 13, fontWeight: "600" },
  actionCountActive: { color: palette.accent },
  // Comments
  commentsSection: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 10,
  },
  noComments: { color: palette.slate, fontSize: 13 },
  commentRow: { flexDirection: "row", gap: 8 },
  commentBody: { flex: 1, gap: 2 },
  commentHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentAuthor: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  commentTime: { color: palette.slate, fontSize: 11 },
  commentText: { color: palette.ink, fontSize: 13, lineHeight: 18 },
  commentInput: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  commentTextInput: {
    flex: 1,
    backgroundColor: palette.inputBg,
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 80,
  },
  commentSend: {
    backgroundColor: palette.accentDeep,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
  },
  commentSendDisabled: { opacity: 0.45 },
  commentSendText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  // Empty
  emptyCard: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 40,
    marginTop: 8,
  },
  emptyIcon: { fontSize: 38 },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: "700" },
  emptyBody: { color: palette.slate, fontSize: 14, textAlign: "center" },
  retryBtn: {
    backgroundColor: palette.accentDeep,
    borderRadius: 10,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  retryBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  // Composer media
  mediaPreviews: { marginTop: 4 },
  mediaPreviewsContent: { gap: 8, paddingRight: 4 },
  mediaPreviewItem: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  mediaPreviewImage: { width: "100%", height: "100%" },
  videoIndicator: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  videoIndicatorText: { color: "#fff", fontSize: 10 },
  mediaRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaRemoveText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  layoutToggle: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  layoutLabel: { color: palette.slate, fontSize: 12, marginRight: 2 },
  layoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
  },
  layoutBtnActive: { borderColor: palette.accentDeep, backgroundColor: palette.accentSoft },
  layoutBtnText: { color: palette.slate, fontSize: 12, fontWeight: "600" },
  layoutBtnTextActive: { color: palette.accentDeep },
  mediaPickBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
  },
  mediaPickIcon: { fontSize: 16 },
}));
