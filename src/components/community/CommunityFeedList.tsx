import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import CommunityMediaPicker, {
  CommunityMediaDraft,
} from "@/components/community/CommunityMediaPicker";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ensureGuestId } from "@/lib/guest";
import {
  ApiCommunityAuthor,
  ApiCommunityPost,
  createCommunityComment,
  fetchCommunityComments,
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
  media?: Array<{
    id: string;
    type: "image" | "video";
    url: string;
  }>;
  mediaLayout?: "grid" | "carousel";
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
  focusedPostId?: string | null;
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

const formatCommentTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
};

const getAuthorName = (author: ApiCommunityAuthor) => {
  if (author.providerProfile?.displayName) {
    return author.providerProfile.displayName;
  }
  if (author.username) {
    return `@${author.username}`;
  }
  if (author.email) {
    return author.email;
  }
  if (author.phone) {
    return author.phone;
  }
  return author.role === "provider" ? "Service provider" : "Community member";
};

const getInitials = (name: string) => {
  const cleaned = name.replace(/^@/, "");
  const tokens = cleaned.split(" ").filter(Boolean);
  const first = tokens[0]?.[0] ?? cleaned[0] ?? "U";
  const second = tokens[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
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
  const mediaItems = post.media.map((media) => ({
    id: media.id,
    type: media.type === "video" ? "video" : "image",
    url: media.signedUrl ?? media.url,
  }));

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
    media: mediaItems.length > 0 ? mediaItems : undefined,
    mediaLayout: post.mediaLayout ?? "grid",
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
  focusedPostId,
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
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [hasFocusedPost, setHasFocusedPost] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);

  useEffect(() => {
    setHasFocusedPost(false);
  }, [focusedPostId]);

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

  useEffect(() => {
    if (!focusedPostId || hasFocusedPost) {
      return;
    }
    const exists = feedPosts.some((post) => post.id === focusedPostId);
    if (!exists) {
      return;
    }
    setHasFocusedPost(true);
    setOpenCommentsPostId(focusedPostId);
    setCommentDraft("");
    if (typeof document !== "undefined") {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(`community-post-${focusedPostId}`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [focusedPostId, feedPosts, hasFocusedPost]);

  const commentsQuery = useQuery({
    queryKey: ["community-comments", openCommentsPostId],
    queryFn: () => fetchCommunityComments(openCommentsPostId!),
    enabled: Boolean(openCommentsPostId),
    staleTime: 15_000,
  });

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

  const ensureIdentity = (allowGuest = false) => {
    if (isAuthenticated) {
      return true;
    }
    if (allowGuest) {
      const guestId = ensureGuestId();
      if (guestId) {
        return true;
      }
    }
    toast({ title: "Please sign in to continue." });
    navigate("/sign-in?next=/community");
    return false;
  };

  const toggleLike = async (postId: string) => {
    if (!isAuthenticated) {
      const guestId = ensureGuestId();
      if (!guestId) {
        toast({ title: "Please sign in to like posts." });
        navigate("/sign-in?next=/community");
        return;
      }
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
    setReportPostId(postId);
    setReportReason("");
    setReportDetails("");
    setReportError(null);
    setReportDialogOpen(true);
  };

  const handleReportSubmit = async () => {
    if (!reportPostId || reportSubmitting) {
      return;
    }

    const reason = reportReason.trim();
    const details = reportDetails.trim();

    if (reason.length < 3) {
      setReportError("Report reason is required.");
      return;
    }

    setReportSubmitting(true);
    setReportError(null);
    try {
      await createReport({
        targetType: "community_post",
        targetId: reportPostId,
        reason,
        details: details.length > 0 ? details : undefined,
      });
      toast({ title: "Report submitted. Thank you." });
      setReportDialogOpen(false);
      setReportPostId(null);
    } catch (reportError) {
      const message = reportError instanceof Error ? reportError.message : "Unable to submit report.";
      setReportError(message);
    } finally {
      setReportSubmitting(false);
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
    if (!isAuthenticated) {
      ensureGuestId();
    }
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

  const toggleComments = (postId: string) => {
    setOpenCommentsPostId((current) => (current === postId ? null : postId));
    setCommentDraft("");
  };

  const handleCommentSubmit = async () => {
    if (!openCommentsPostId || !ensureIdentity(true) || isCommenting) {
      return;
    }
    const content = commentDraft.trim();
    if (!content) {
      toast({ title: "Write a comment before posting." });
      return;
    }

    setIsCommenting(true);
    try {
      await createCommunityComment(openCommentsPostId, content);
      setCommentDraft("");
      await commentsQuery.refetch();
      setFeedPosts((prev) =>
        prev.map((post) =>
          post.id === openCommentsPostId
            ? { ...post, comments: post.comments + 1 }
            : post,
        ),
      );
      if (onRefresh) {
        await onRefresh();
      }
    } catch (commentError) {
      const message =
        commentError instanceof Error ? commentError.message : "Unable to post comment.";
      toast({ title: message });
    } finally {
      setIsCommenting(false);
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

  const handleDelete = (postId: string) => {
    if (!isAuthenticated || deletingPostId) {
      return;
    }
    setDeletePostId(postId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletePostId || deletingPostId) {
      return;
    }

    setDeletingPostId(deletePostId);
    try {
      await deleteCommunityPost(deletePostId);
      if (onRefresh) {
        await onRefresh();
      }
      setDeleteDialogOpen(false);
      setDeletePostId(null);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete post.";
      toast({ title: message });
    } finally {
      setDeletingPostId(null);
    }
  };

  const renderMediaItem = (media: NonNullable<FeedPost["media"]>[number]) => (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/40 bg-muted/20">
      {media.type === "video" ? (
        <video
          src={media.url}
          className="h-full w-full object-cover"
          controls
        />
      ) : (
        <img
          src={media.url}
          alt="Post media"
          className="h-full w-full object-cover"
          loading="lazy"
        />
      )}
    </div>
  );

  const renderPostMedia = (post: FeedPost) => {
    if (!post.media || post.media.length === 0) {
      return null;
    }

    const layout = post.mediaLayout ?? "grid";

    if (post.media.length > 1 && layout === "carousel") {
      return (
        <Carousel className="w-full">
          <CarouselContent>
            {post.media.map((media) => (
              <CarouselItem key={media.id}>{renderMediaItem(media)}</CarouselItem>
            ))}
          </CarouselContent>
          <CarouselDots />
          <CarouselPrevious className="-left-4" />
          <CarouselNext className="-right-4" />
        </Carousel>
      );
    }

    const gridClass = post.media.length > 1 ? "sm:grid-cols-2" : "grid-cols-1";

    return (
      <div className={`grid gap-3 ${gridClass}`}>
        {post.media.map((media) => (
          <div key={media.id}>{renderMediaItem(media)}</div>
        ))}
      </div>
    );
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
            <article key={post.id} id={`community-post-${post.id}`} className="feed-post">
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
                    <DropdownMenuItem onClick={() => toggleComments(post.id)}>
                      View comments
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

              {renderPostMedia(post)}

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
                      onClick={() => toggleComments(post.id)}
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
              {!isEditing && openCommentsPostId === post.id && (
                <div className="border-t border-border/50 px-4 py-4 space-y-3">
                  {commentsQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading comments...</div>
                  ) : commentsQuery.data && commentsQuery.data.length > 0 ? (
                    <div className="space-y-3">
                      {commentsQuery.data.map((comment) => {
                        const commentAuthor = getAuthorName(comment.author);
                        return (
                          <div key={comment.id} className="flex gap-3">
                            <Avatar className="h-8 w-8">
                              {comment.author.avatarUrl ? (
                                <AvatarImage
                                  src={comment.author.avatarUrl}
                                  alt={commentAuthor}
                                />
                              ) : null}
                              <AvatarFallback className="bg-muted text-xs font-semibold">
                                {getInitials(commentAuthor)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                  {commentAuthor}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {formatCommentTimestamp(comment.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-foreground whitespace-pre-line">
                                {comment.content}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No comments yet.</div>
                  )}

                  <div className="space-y-2">
                    {!isAuthenticated ? (
                      <p className="text-xs text-muted-foreground">
                        Posting as guest. Guests can leave up to 2 comments per post.{" "}
                        <Link to="/sign-up" className="underline">
                          Register
                        </Link>{" "}
                        to comment more.
                      </p>
                    ) : null}
                    <Textarea
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      placeholder="Write a comment..."
                      rows={2}
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCommentSubmit}
                        disabled={isCommenting}
                      >
                        {isCommenting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Posting...
                          </>
                        ) : (
                          "Post comment"
                        )}
                      </Button>
                    </div>
                  </div>
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

      <Dialog
        open={reportDialogOpen}
        onOpenChange={(open) => {
          setReportDialogOpen(open);
          if (!open) {
            setReportPostId(null);
            setReportReason("");
            setReportDetails("");
            setReportError(null);
            setReportSubmitting(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Post</DialogTitle>
            <DialogDescription>
              Tell us why you are reporting this post. The report goes to the admin team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="report-reason" className="text-sm font-medium text-foreground">
                Reason
              </label>
              <Textarea
                id="report-reason"
                rows={3}
                value={reportReason}
                onChange={(event) => {
                  setReportReason(event.target.value);
                  if (reportError) {
                    setReportError(null);
                  }
                }}
                placeholder="Explain what is wrong with this post."
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="report-details" className="text-sm font-medium text-foreground">
                Details (optional)
              </label>
              <Textarea
                id="report-details"
                rows={3}
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                placeholder="Add any extra context that helps us review."
              />
            </div>
            {reportError && <p className="text-sm text-destructive">{reportError}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReportDialogOpen(false)}
              disabled={reportSubmitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleReportSubmit} disabled={reportSubmitting}>
              {reportSubmitting ? "Sending..." : "Send Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setDeletePostId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This post will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPostId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingPostId !== null}
            >
              {deletingPostId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CommunityFeedList;
