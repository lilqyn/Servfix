import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { ensureGuestId } from "@/lib/guest";
import CommunityMediaPicker, {
  CommunityMediaDraft,
} from "@/components/community/CommunityMediaPicker";
import {
  ApiCommunityAuthor,
  ApiCommunityPost,
  createCommunityComment,
  deleteCommunityPost,
  fetchCommunityComments,
  followUser,
  likeCommunityPost,
  saveCommunityPost,
  shareCommunityPost,
  unfollowUser,
  unlikeCommunityPost,
  unsaveCommunityPost,
  updateCommunityPost,
} from "@/lib/api";
import {
  Bookmark,
  Heart,
  Loader2,
  MessageCircle,
  Pencil,
  Share2,
  Trash2,
  UserCheck,
  UserPlus,
} from "lucide-react";

const mapPostMediaToDraft = (post: ApiCommunityPost): CommunityMediaDraft[] =>
  post.media.map((media) => ({
    key: media.url,
    previewUrl: media.signedUrl ?? media.url,
    type: media.type === "video" ? "video" : "image",
  }));

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
  return author.role === "provider" ? "Provider" : "User";
};

const getInitials = (name: string) => {
  const cleaned = name.replace(/^@/, "");
  const tokens = cleaned.split(" ").filter(Boolean);
  const first = tokens[0]?.[0] ?? cleaned[0] ?? "U";
  const second = tokens[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
};

type CommunityPostCardProps = {
  post: ApiCommunityPost;
  onRefresh: () => Promise<unknown>;
  showFollow?: boolean;
};

const CommunityPostCard = ({ post, onRefresh, showFollow = true }: CommunityPostCardProps) => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [isLiking, setIsLiking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content ?? "");
  const [editMedia, setEditMedia] = useState<CommunityMediaDraft[]>(
    mapPostMediaToDraft(post),
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const liked = Boolean(post.viewer?.liked);
  const saved = Boolean(post.viewer?.saved);
  const following = Boolean(post.viewer?.following);
  const isOwnPost = user?.id === post.author.id;

  useEffect(() => {
    if (!isEditing) {
      setEditContent(post.content ?? "");
      setEditMedia(mapPostMediaToDraft(post));
    }
  }, [isEditing, post]);

  const commentsQuery = useQuery({
    queryKey: ["community-comments", post.id],
    queryFn: () => fetchCommunityComments(post.id),
    enabled: isCommentsOpen,
    staleTime: 15_000,
  });

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
    toast("Please sign in to continue.");
    navigate("/sign-in");
    return false;
  };

  const handleLike = async () => {
    if (!ensureIdentity(true) || isLiking) {
      return;
    }
    setIsLiking(true);
    try {
      if (liked) {
        await unlikeCommunityPost(post.id);
      } else {
        await likeCommunityPost(post.id);
      }
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update like.");
    } finally {
      setIsLiking(false);
    }
  };

  const handleSave = async () => {
    if (!ensureIdentity() || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      if (saved) {
        await unsaveCommunityPost(post.id);
      } else {
        await saveCommunityPost(post.id);
      }
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update save.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    if (isSharing) {
      return;
    }
    if (!ensureIdentity(true)) {
      return;
    }
    setIsSharing(true);
    try {
      await shareCommunityPost(post.id);
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to share post.");
    } finally {
      setIsSharing(false);
    }
  };

  const handleFollow = async () => {
    if (!ensureIdentity() || isFollowing || isOwnPost) {
      return;
    }
    setIsFollowing(true);
    try {
      if (following) {
        await unfollowUser(post.author.id);
      } else {
        await followUser(post.author.id);
      }
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update follow.");
    } finally {
      setIsFollowing(false);
    }
  };

  const handleCommentSubmit = async () => {
    if (!ensureIdentity(true) || isCommenting) {
      return;
    }
    const content = commentDraft.trim();
    if (!content) {
      toast("Write a comment before posting.");
      return;
    }

    setIsCommenting(true);
    try {
      await createCommunityComment(post.id, content);
      setCommentDraft("");
      await commentsQuery.refetch();
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to post comment.");
    } finally {
      setIsCommenting(false);
    }
  };

  const authorName = getAuthorName(post.author);
  const authorInitials = getInitials(authorName);

  const startEditing = () => {
    setEditContent(post.content ?? "");
    setEditMedia(mapPostMediaToDraft(post));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditContent(post.content ?? "");
    setEditMedia(mapPostMediaToDraft(post));
  };

  const handleUpdate = async () => {
    if (!ensureIdentity() || isUpdating) {
      return;
    }

    const content = editContent.trim();
    const media = editMedia.map((item) => ({ url: item.key, type: item.type }));

    if (!content && media.length === 0) {
      toast("Add some text or media.");
      return;
    }

    setIsUpdating(true);
    try {
      await updateCommunityPost(post.id, {
        content,
        media,
      });
      setIsEditing(false);
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update post.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!ensureIdentity() || isDeleting) {
      return;
    }

    const confirmed = window.confirm("Delete this post permanently?");
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteCommunityPost(post.id);
      await onRefresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to delete post.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <Link
            to={`/profile/${post.author.username ? post.author.username : post.author.id}`}
            className="flex items-center gap-3"
          >
            <Avatar className="h-10 w-10">
              {post.author.avatarUrl ? (
                <AvatarImage src={post.author.avatarUrl} alt={authorName} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {authorInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-foreground">{authorName}</p>
              <p className="text-xs text-muted-foreground">
                {post.author.role === "provider" ? "Service provider" : "Community member"}
                {post.createdAt ? ` Â· ${formatTimestamp(post.createdAt)}` : ""}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {isAuthenticated && isOwnPost ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startEditing}
                  disabled={isEditing}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            ) : isAuthenticated && showFollow ? (
              <Button
                variant={following ? "secondary" : "outline"}
                size="sm"
                onClick={handleFollow}
                disabled={isFollowing}
              >
                {isFollowing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating
                  </>
                ) : following ? (
                  <>
                    <UserCheck className="h-4 w-4" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Follow
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <Textarea
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              placeholder="Update your post..."
              rows={3}
            />
            <CommunityMediaPicker
              media={editMedia}
              onChange={setEditMedia}
              disabled={isUpdating}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={cancelEditing} disabled={isUpdating}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleUpdate} disabled={isUpdating}>
                {isUpdating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {post.content ? (
              <p className="text-sm text-foreground whitespace-pre-line">{post.content}</p>
            ) : null}

            {post.media?.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {post.media.map((media) => (
                  media.type === "video" ? (
                    <video
                      key={media.id}
                      src={media.signedUrl ?? media.url}
                      className="w-full h-48 rounded-lg object-cover border border-border/40"
                      controls
                    />
                  ) : (
                    <img
                      key={media.id}
                      src={media.signedUrl ?? media.url}
                      alt="Community media"
                      className="w-full h-48 rounded-lg object-cover border border-border/40"
                      loading="lazy"
                    />
                  )
                ))}
              </div>
            ) : null}
          </>
        )}

        {!isEditing && (
          <>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLike}
                disabled={isLiking}
                className={cn(liked && "text-primary")}
              >
                <Heart className={cn("h-4 w-4", liked && "fill-primary")} />
                {post.counts.likes}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCommentsOpen((prev) => !prev)}
              >
                <MessageCircle className="h-4 w-4" />
                {post.counts.comments}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className={cn(saved && "text-primary")}
              >
                <Bookmark className={cn("h-4 w-4", saved && "fill-primary")} />
                {post.counts.saves}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleShare}
                disabled={isSharing}
              >
                <Share2 className="h-4 w-4" />
                {post.shareCount}
              </Button>
            </div>

            {isCommentsOpen && (
              <div className="border-t border-border/50 pt-4 space-y-3">
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
                              <AvatarImage src={comment.author.avatarUrl} alt={commentAuthor} />
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
                                {formatTimestamp(comment.createdAt)}
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
                    <p className="text-xs text-muted-foreground">Posting as guest.</p>
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
        )}
      </CardContent>
    </Card>
  );
};

export default CommunityPostCard;
