import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Bookmark,
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CommunityMediaPicker, {
  CommunityMediaDraft,
} from "@/components/community/CommunityMediaPicker";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  ApiCommunityPost,
  deleteCommunityPost,
  likeCommunityPost,
  saveCommunityPost,
  shareCommunityPost,
  unlikeCommunityPost,
  unsaveCommunityPost,
  updateCommunityPost,
  createReport,
} from "@/lib/api";

type FeedPost = {
  id: string;
  author: {
    id: string;
    username?: string | null;
    name: string;
    handle?: string | null;
    avatar: string;
    verified: boolean;
    isBusiness: boolean;
  };
  content: string;
  media?: {
    type: "image" | "video";
    url: string;
    thumbnail?: string;
  };
  likes: number;
  comments: number;
  shares: number;
  timestamp: string;
  liked: boolean;
  saved: boolean;
};

type CommunityFeedListProps = {
  posts: ApiCommunityPost[];
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onRefresh?: () => Promise<unknown> | void;
  emptyMessage?: string;
  showExploreButton?: boolean;
  onExplore?: () => void;
  className?: string;
};

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop";

const buildPostLink = (postId: string) => `/community?post=${postId}`;

const getShareUrl = (postId: string) => {
  if (typeof window === "undefined") {
    return buildPostLink(postId);
  }
  return `${window.location.origin}${buildPostLink(postId)}`;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
};

const mapPostToFeed = (post: ApiCommunityPost): FeedPost => {
  const author = post.author;
  const providerProfile = author.providerProfile ?? null;
  const name =
    providerProfile?.displayName ??
    (author.username ? `@${author.username}` : null) ??
    author.email ??
    author.phone ??
    (author.role === "provider" ? "Service provider" : "Community member");
  const handle = author.username ? `@${author.username}` : null;
  const verified = providerProfile?.verificationStatus === "verified";
  const isBusiness = author.role === "provider";
  const mediaItem = post.media?.[0];
  const mediaUrl = mediaItem?.signedUrl ?? mediaItem?.url;

  return {
    id: post.id,
    author: {
      id: author.id,
      username: author.username ?? null,
      name,
      handle,
      avatar: author.avatarUrl ?? FALLBACK_AVATAR,
      verified,
      isBusiness,
    },
    content: post.content ?? "",
    media: mediaUrl
      ? {
          type: mediaItem?.type === "video" ? "video" : "image",
          url: mediaUrl,
          thumbnail: mediaItem?.type === "video" ? mediaUrl : undefined,
        }
      : undefined,
    likes: post.counts.likes,
    comments: post.counts.comments,
    shares: post.shareCount,
    timestamp: formatTimestamp(post.createdAt),
    liked: Boolean(post.viewer?.liked),
    saved: Boolean(post.viewer?.saved),
  };
};

const mapPostMediaToDraft = (post: ApiCommunityPost): CommunityMediaDraft[] =>
  post.media.map((media) => ({
    key: media.url,
    previewUrl: media.signedUrl ?? media.url,
    type: media.type === "video" ? "video" : "image",
  }));

const CommunityFeedList = ({
  posts,
  isLoading,
  isError,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onRetry,
  onRefresh,
  emptyMessage = "No community posts yet. Be the first to share!",
  showExploreButton = false,
  onExplore,
  className,
}: CommunityFeedListProps) => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const mappedPosts = useMemo(() => posts.map(mapPostToFeed), [posts]);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editMedia, setEditMedia] = useState<CommunityMediaDraft[]>([]);
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  useEffect(() => {
    setFeedPosts(mappedPosts);
  }, [mappedPosts]);

  useEffect(() => {
    if (editingPostId && !posts.some((post) => post.id === editingPostId)) {
      setEditingPostId(null);
      setEditContent("");
      setEditMedia([]);
    }
  }, [editingPostId, posts]);

  const copyPostLink = async (postId: string) => {
    const url = getShareUrl(postId);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied to clipboard." });
        return;
      }
      toast({ title: "Copy is not supported in this browser." });
    } catch (copyError) {
      const message = copyError instanceof Error ? copyError.message : "Unable to copy link.";
      toast({ title: message });
    }
  };

  const toggleLike = async (postId: string) => {
    if (!isAuthenticated) {
      toast({ title: "Please sign in to like posts." });
      navigate("/sign-in?next=/community");
      return;
    }
    const current = feedPosts.find((post) => post.id === postId);
    if (!current) {
      return;
    }
    const nextLiked = !current.liked;
    setFeedPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              liked: nextLiked,
              likes: post.likes + (nextLiked ? 1 : -1),
            }
          : post,
      ),
    );
    try {
      if (nextLiked) {
        await likeCommunityPost(postId);
      } else {
        await unlikeCommunityPost(postId);
      }
    } catch (likeError) {
      const message = likeError instanceof Error ? likeError.message : "Unable to update like.";
      toast({ title: message });
      if (onRefresh) {
        await onRefresh();
      }
    }
  };

  const handleReport = async (postId: string) => {
    if (!isAuthenticated) {
      toast({ title: "Please sign in to report posts." });
      navigate("/sign-in?next=/community");
      return;
    }

    const reason = window.prompt("Why are you reporting this post?");
    if (!reason || reason.trim().length < 3) {
      toast({ title: "Report reason is required." });
      return;
    }

    const details = window.prompt("Add more details (optional):") ?? undefined;

    try {
      await createReport({
        targetType: "community_post",
        targetId: postId,
        reason: reason.trim(),
        details: details?.trim() || undefined,
      });
      toast({ title: "Report submitted. Thank you." });
    } catch (reportError) {
      const message = reportError instanceof Error ? reportError.message : "Unable to submit report.";
      toast({ title: message });
    }
  };

  const toggleSave = async (postId: string) => {
    if (!isAuthenticated) {
      toast({ title: "Please sign in to save posts." });
      navigate("/sign-in?next=/community");
      return;
    }
    const current = feedPosts.find((post) => post.id === postId);
    if (!current) {
      return;
    }
    const nextSaved = !current.saved;
    setFeedPosts((prev) =>
      prev.map((post) =>
        post.id === postId ? { ...post, saved: nextSaved } : post,
      ),
    );
    try {
      if (nextSaved) {
        await saveCommunityPost(postId);
      } else {
        await unsaveCommunityPost(postId);
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to update save.";
      toast({ title: message });
      if (onRefresh) {
        await onRefresh();
      }
    }
  };

  const handleShare = async (postId: string) => {
    const url = getShareUrl(postId);
    setFeedPosts((prev) =>
      prev.map((post) =>
        post.id === postId ? { ...post, shares: post.shares + 1 } : post,
      ),
    );
    try {
      if (navigator?.share) {
        await navigator.share({ url });
      } else {
        await copyPostLink(postId);
      }
      await shareCommunityPost(postId);
    } catch (shareError) {
      const message = shareError instanceof Error ? shareError.message : "Unable to share post.";
      toast({ title: message });
      if (onRefresh) {
        await onRefresh();
      }
    }
  };

  const startEditing = (postId: string) => {
    const current = feedPosts.find((post) => post.id === postId);
    const source = posts.find((post) => post.id === postId);
    setEditingPostId(postId);
    setEditContent(current?.content ?? "");
    setEditMedia(source ? mapPostMediaToDraft(source) : []);
  };

  const cancelEditing = () => {
    setEditingPostId(null);
    setEditContent("");
    setEditMedia([]);
  };

  const handleUpdate = async (postId: string) => {
    if (!isAuthenticated || updatingPostId) {
      return;
    }

    const trimmed = editContent.trim();

    if (!trimmed && editMedia.length === 0) {
      toast({ title: "Add some text or media." });
      return;
    }

    setUpdatingPostId(postId);
    try {
      const mediaPayload = editMedia.map((item) => ({ url: item.key, type: item.type }));
      await updateCommunityPost(postId, { content: trimmed, media: mediaPayload });
      setFeedPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                content: trimmed,
                media:
                  mediaPayload.length > 0
                    ? {
                        type: mediaPayload[0].type,
                        url: editMedia[0].previewUrl,
                      }
                    : undefined,
              }
            : post,
        ),
      );
      setEditingPostId(null);
      setEditMedia([]);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Unable to update post.";
      toast({ title: message });
    } finally {
      setUpdatingPostId(null);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!isAuthenticated || deletingPostId) {
      return;
    }

    const confirmed = window.confirm("Delete this post permanently?");
    if (!confirmed) {
      return;
    }

    setDeletingPostId(postId);
    try {
      await deleteCommunityPost(postId);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete post.";
      toast({ title: message });
    } finally {
      setDeletingPostId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Loading community feed...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-16">
        <h3 className="text-lg font-semibold mb-2">Unable to load posts</h3>
        <p className="text-muted-foreground mb-4">
          {error?.message ?? "Please try again shortly."}
        </p>
        {onRetry ? (
          <Button variant="outline" onClick={() => onRetry()}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      {feedPosts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div className="space-y-6">
          {feedPosts.map((post) => (
            <article key={post.id} className="feed-post">
              {(() => {
                const isOwnPost = user?.id === post.author.id;
                const isEditing = editingPostId === post.id;
                const isUpdating = updatingPostId === post.id;
                const isDeleting = deletingPostId === post.id;

                return (
                  <>
              <div className="flex items-start justify-between p-4">
                <Link
                  to={`/profile/${post.author.username ? post.author.username : post.author.id}`}
                  className="flex items-center gap-3"
                >
                  <img
                    src={post.author.avatar}
                    alt={post.author.name}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-border"
                  />
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">{post.author.name}</span>
                      {post.author.verified && (
                        <BadgeCheck className="w-4 h-4 text-secondary fill-secondary/20" />
                      )}
                      {post.author.isBusiness && (
                        <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-semibold rounded">
                          PRO
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {post.author.handle ? <span>{post.author.handle}</span> : null}
                      {post.author.handle ? <span>-</span> : null}
                      <span>{post.timestamp}</span>
                    </div>
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 hover:bg-muted rounded-full transition-colors">
                      <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwnPost ? (
                      <>
                        <DropdownMenuItem
                          onClick={() => startEditing(post.id)}
                          disabled={isEditing}
                        >
                          Edit post
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(post.id)}
                          disabled={isDeleting}
                        >
                          Delete post
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    ) : null}
                    <DropdownMenuItem onClick={() => navigate(buildPostLink(post.id))}>
                      View post
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copyPostLink(post.id)}>
                      Copy link
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleShare(post.id)}>
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleReport(post.id)}>
                      Report
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {isEditing ? (
                <div className="px-4 pb-3 space-y-3">
                  <Textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    rows={3}
                    placeholder="Update your post..."
                  />
                  <CommunityMediaPicker
                    media={editMedia}
                    onChange={setEditMedia}
                    disabled={isUpdating}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelEditing}
                      disabled={isUpdating}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(post.id)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? "Saving..." : "Save changes"}
                    </Button>
                  </div>
                </div>
              ) : post.content ? (
                <div className="px-4 pb-3">
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {post.content}
                  </p>
                </div>
              ) : null}

              {post.media ? (
                <div className="relative">
                  {post.media.type === "video" ? (
                    <video
                      src={post.media.url}
                      className="w-full object-cover max-h-96"
                      controls
                    />
                  ) : (
                    <img
                      src={post.media.url}
                      alt="Post media"
                      className="w-full object-cover max-h-96"
                    />
                  )}
                </div>
                ) : null}

              {!isEditing && (
                <div className="flex items-center justify-between p-4 border-t border-border/50">
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => toggleLike(post.id)}
                      className="flex items-center gap-2 text-muted-foreground hover:text-destructive transition-colors group"
                    >
                      <Heart
                        className={`w-5 h-5 transition-all ${
                          post.liked ? "fill-destructive text-destructive scale-110" : "group-hover:scale-110"
                        }`}
                      />
                      <span className={`text-sm font-medium ${post.liked ? "text-destructive" : ""}`}>
                        {post.likes}
                      </span>
                    </button>
                    <button
                      onClick={() => navigate(buildPostLink(post.id))}
                      className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group"
                    >
                      <MessageCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-medium">{post.comments}</span>
                    </button>
                    <button
                      onClick={() => handleShare(post.id)}
                      className="flex items-center gap-2 text-muted-foreground hover:text-secondary transition-colors group"
                    >
                      <Share2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-medium">{post.shares}</span>
                    </button>
                  </div>
                  <button
                    onClick={() => toggleSave(post.id)}
                    className="p-2 hover:bg-muted rounded-full transition-colors"
                  >
                    <Bookmark
                      className={`w-5 h-5 transition-colors ${
                        post.saved ? "fill-primary text-primary" : "text-muted-foreground hover:text-primary"
                      }`}
                    />
                  </button>
                </div>
              )}
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      )}

      <div className="text-center mt-10">
        {hasNextPage && onLoadMore ? (
          <Button
            variant="outline"
            size="lg"
            onClick={() => onLoadMore()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More Posts"
            )}
          </Button>
        ) : showExploreButton && onExplore ? (
          <Button variant="outline" size="lg" onClick={() => onExplore()}>
            Explore Community
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default CommunityFeedList;
