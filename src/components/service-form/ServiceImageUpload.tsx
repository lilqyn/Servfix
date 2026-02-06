import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon, GripVertical, Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import type { ServiceFormData } from "@/pages/ServiceForm";
import { uploadServiceImage } from "@/lib/api";

interface ServiceImageUploadProps {
  form: UseFormReturn<ServiceFormData>;
}

const MAX_IMAGES = 5;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

const isSupportedImage = (file: File) => {
  if (SUPPORTED_TYPES.includes(file.type)) {
    return true;
  }
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension));
};

const ServiceImageUpload = ({ form }: ServiceImageUploadProps) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const images = form.watch("images") || [];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = Math.max(0, MAX_IMAGES - images.length);
    if (remainingSlots === 0) {
      toast("You can upload up to 5 images.");
      return;
    }

    const fileList = Array.from(files).slice(0, remainingSlots);

    setIsUploading(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of fileList) {
        if (!isSupportedImage(file)) {
          toast("Only JPG, PNG, WebP, or HEIC/HEIF images are supported.");
          continue;
        }

        if (file.size > MAX_UPLOAD_BYTES) {
          toast("Image must be 10MB or less.");
          continue;
        }

        try {
          const uploadResult = await uploadServiceImage(file);
          const displayUrl = uploadResult.signedUrl ?? uploadResult.key;

          uploadedUrls.push(displayUrl);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unable to upload an image.";
          toast(message);
        }
      }

      if (uploadedUrls.length > 0) {
        form.setValue("images", [...images, ...uploadedUrls], { shouldValidate: true });
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    form.setValue("images", newImages, { shouldValidate: true });
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newImages = [...images];
    const draggedImage = newImages[draggedIndex];
    newImages.splice(draggedIndex, 1);
    newImages.splice(index, 0, draggedImage);
    form.setValue("images", newImages, { shouldValidate: true });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Service Images</CardTitle>
        <CardDescription>
          Upload high-quality images of your service. The first image will be your main display image.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormField
          control={form.control}
          name="images"
          render={() => (
            <FormItem>
              <div className="space-y-4">
                {/* Upload Area */}
                <div
                  onClick={() => {
                    if (!isUploading) {
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`border-2 border-dashed border-border rounded-xl p-8 text-center transition-colors ${
                    isUploading
                      ? "cursor-not-allowed opacity-70"
                      : "cursor-pointer hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={isUploading}
                  />
                  {isUploading ? (
                    <Loader2 className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-spin" />
                  ) : (
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  )}
                  <p className="text-lg font-medium text-foreground mb-1">
                    {isUploading ? "Uploading images..." : "Drop images here or click to upload"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    JPG, PNG, WebP, or HEIC/HEIF. Converted to WebP on upload (<=3MB). Max 10MB per
                    image. Up to 5 images.
                  </p>
                </div>

                {/* Image Grid */}
                {images.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {images.map((image, index) => (
                      <div
                        key={index}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`relative group aspect-square rounded-xl overflow-hidden border border-border/50 ${
                          draggedIndex === index ? "opacity-50" : ""
                        }`}
                      >
                        <img
                          src={image}
                          alt={`Service image ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        
                        {/* Overlay */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleRemoveImage(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Main Image Badge */}
                        {index === 0 && (
                          <div className="absolute top-2 left-2 px-2 py-1 bg-primary text-primary-foreground text-xs font-medium rounded">
                            Main Image
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add More Placeholder */}
                    {images.length < MAX_IMAGES && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!isUploading) {
                            fileInputRef.current?.click();
                          }
                        }}
                        className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors flex flex-col items-center justify-center gap-2"
                        disabled={isUploading}
                      >
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Add More</span>
                      </button>
                    )}
                  </div>
                )}

                <p className="text-sm text-muted-foreground">
                  Drag images to reorder. The first image will be shown as the main thumbnail.
                </p>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
};

export default ServiceImageUpload;
