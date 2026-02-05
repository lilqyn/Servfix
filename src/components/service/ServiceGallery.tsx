import { useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";

interface ServiceGalleryProps {
  images: string[];
  name: string;
}

const ServiceGallery = ({ images, name }: ServiceGalleryProps) => {
  const [selectedImage, setSelectedImage] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const nextImage = () => {
    setSelectedImage((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setSelectedImage((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Main Image */}
        <div className="relative group rounded-2xl overflow-hidden aspect-[16/10] bg-muted">
          <img
            src={images[selectedImage]}
            alt={`${name} - Image ${selectedImage + 1}`}
            className="w-full h-full object-cover"
          />
          
          {/* Navigation Arrows */}
          <button
            onClick={prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-card/80 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-card/80 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Zoom Button */}
          <button
            onClick={() => setIsLightboxOpen(true)}
            className="absolute bottom-4 right-4 p-2 bg-card/80 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          {/* Image Counter */}
          <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-card/80 backdrop-blur-sm rounded-full text-sm font-medium">
            {selectedImage + 1} / {images.length}
          </div>
        </div>

        {/* Thumbnails */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => setSelectedImage(index)}
              className={`relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden transition-all ${
                selectedImage === index 
                  ? "ring-2 ring-primary ring-offset-2" 
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={image}
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {isLightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-foreground/95 flex items-center justify-center"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 text-background hover:bg-background/10 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          
          <button
            onClick={(e) => { e.stopPropagation(); prevImage(); }}
            className="absolute left-4 p-3 text-background hover:bg-background/10 rounded-full transition-colors"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          
          <img
            src={images[selectedImage]}
            alt={`${name} - Image ${selectedImage + 1}`}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          
          <button
            onClick={(e) => { e.stopPropagation(); nextImage(); }}
            className="absolute right-4 p-3 text-background hover:bg-background/10 rounded-full transition-colors"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* Thumbnails in Lightbox */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => { e.stopPropagation(); setSelectedImage(index); }}
                className={`w-2 h-2 rounded-full transition-all ${
                  selectedImage === index ? "bg-background w-6" : "bg-background/50"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default ServiceGallery;
