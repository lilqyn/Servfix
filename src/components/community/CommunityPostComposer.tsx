import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { createCommunityPost } from "@/lib/api";
import CommunityMediaPicker, { CommunityMediaDraft } from "@/components/community/CommunityMediaPicker";
import { cn } from "@/lib/utils";

type CommunityPostComposerProps = {
  onPostCreated?: () => Promise<unknown> | void;
  title?: string;
  description?: string;
  submitLabel?: string;
  className?: string;
};

const CommunityPostComposer = ({
  onPostCreated,
  title = "Create a post",
  description = "Posts are public and visible to everyone.",
  submitLabel = "Publish",
  className,
}: CommunityPostComposerProps) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [postContent, setPostContent] = useState("");
  const [postMedia, setPostMedia] = useState<CommunityMediaDraft[]>([]);
  const [isPosting, setIsPosting] = useState(false);

  const handleCreatePost = async () => {
    if (!isAuthenticated) {
      toast("Please sign in to create a post.");
      navigate("/sign-in");
      return;
    }

    const content = postContent.trim();
    const media = postMedia.map((item) => ({ url: item.key, type: item.type }));

    if (!content && media.length === 0) {
      toast("Add some text or media.");
      return;
    }

    setIsPosting(true);
    try {
      await createCommunityPost({
        content: content || undefined,
        media: media.length > 0 ? media : undefined,
      });
      setPostContent("");
      setPostMedia([]);
      if (onPostCreated) {
        await onPostCreated();
      }
    } catch (postError) {
      toast(postError instanceof Error ? postError.message : "Unable to create post.");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Card className={cn("border-border/60", className)}>
      <CardContent className="p-6 space-y-4">
        {(title || description) && (
          <div>
            {title ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : null}
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
        )}
        <Textarea
          value={postContent}
          onChange={(event) => setPostContent(event.target.value)}
          placeholder="Share an update with the community..."
          rows={3}
        />
        <CommunityMediaPicker
          media={postMedia}
          onChange={setPostMedia}
          disabled={isPosting}
        />
        <div className="flex justify-end">
          <Button onClick={handleCreatePost} disabled={isPosting}>
            {isPosting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Posting...
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CommunityPostComposer;
