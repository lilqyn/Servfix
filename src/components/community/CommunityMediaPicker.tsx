import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Image as ImageIcon, Video, X } from "lucide-react";
import { uploadCommunityImage, uploadCommunityVideo } from "@/lib/api";

export const MAX_COMMUNITY_MEDIA = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

const isSupportedImage = (file: File) => {
  if (SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    return true;
  }
  const name = file.name.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
};

const isSupportedVideo = (file: File) => {
  if (SUPPORTED_VIDEO_TYPES.includes(file.type)) {
    return true;
  }
  const name = file.name.toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.some((extension) => name.endsWith(extension));
};

export type CommunityMediaDraft = {
  key: string;
  previewUrl: string;
  type: "image" | "video";
};

type CommunityMediaPickerProps = {
  media: CommunityMediaDraft[];
  onChange: (next: CommunityMediaDraft[]) => void;
  disabled?: boolean;
};

const CommunityMediaPicker = ({ media, onChange, disabled }: CommunityMediaPickerProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const remainingSlots = Math.max(0, MAX_COMMUNITY_MEDIA - media.length);
    if (remainingSlots === 0) {
      toast({ title: "You can upload up to 6 items per post." });
      return;
    }

    const fileList = Array.from(files).slice(0, remainingSlots);
    setIsUploading(true);

    try {
      const uploaded: CommunityMediaDraft[] = [];
      for (const file of fileList) {
        if (isSupportedImage(file)) {
          if (file.size > MAX_IMAGE_BYTES) {
            toast({ title: "Image must be 10MB or less." });
            continue;
          }

          try {
            const result = await uploadCommunityImage(file);
            uploaded.push({
              key: result.key,
              previewUrl: result.signedUrl ?? result.key,
              type: "image",
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unable to upload image.";
            toast({ title: message });
          }
          continue;
        }

        if (isSupportedVideo(file)) {
          if (file.size > MAX_VIDEO_BYTES) {
            toast({ title: "Video must be 25MB or less." });
            continue;
          }

          try {
            const result = await uploadCommunityVideo(file);
            uploaded.push({
              key: result.key,
              previewUrl: result.signedUrl ?? result.key,
              type: "video",
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unable to upload video.";
            toast({ title: message });
          }
          continue;
        }

        toast({
          title:
            "Only JPG, PNG, WebP, HEIC/HEIF images or MP4, WebM, MOV videos are supported.",
        });
      }

      if (uploaded.length > 0) {
        onChange([...media, ...uploaded]);
      }
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || isUploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (disabled || isUploading) return;
            fileInputRef.current?.click();
          }}
          disabled={disabled || isUploading}
          className="gap-2"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <ImageIcon className="h-4 w-4" />
              <Video className="h-4 w-4" />
            </>
          )}
          Upload media
        </Button>
        <span className="text-xs text-muted-foreground">
          Images up to 10MB, videos up to 25MB. Max 6 items.
        </span>
      </div>

      {media.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {media.map((item, index) => (
            <div
              key={`${item.key}-${index}`}
              className="relative overflow-hidden rounded-lg border border-border/50"
            >
              {item.type === "video" ? (
                <video
                  src={item.previewUrl}
                  className="h-28 w-full object-cover"
                  controls
                />
              ) : (
                <img
                  src={item.previewUrl}
                  alt="Community upload preview"
                  className="h-28 w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => onChange(media.filter((_, i) => i !== index))}
                className="absolute top-2 right-2 rounded-full bg-background/80 p-1 text-foreground shadow"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommunityMediaPicker;
