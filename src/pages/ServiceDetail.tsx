import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ServiceGallery from "@/components/service/ServiceGallery";
import ServiceInfo from "@/components/service/ServiceInfo";
import ServicePricing from "@/components/service/ServicePricing";
import ServiceReviews from "@/components/service/ServiceReviews";
import ServiceInquiryForm from "@/components/service/ServiceInquiryForm";
import RelatedServices from "@/components/service/RelatedServices";
import { Button } from "@/components/ui/button";
import { Share2, Heart } from "lucide-react";
import { useService } from "@/hooks/useService";
import { useServiceReviews } from "@/hooks/useServiceReviews";
import { mapServiceToDetail } from "@/lib/services";
import { useAuth } from "@/contexts/AuthContext";
import { isCoreAdminRole } from "@/lib/roles";
import { usePublicSettings } from "@/hooks/usePublicSettings";

const ServiceDetail = () => {
  const { id } = useParams();
  const [selectedPackage, setSelectedPackage] = useState<string>("");
  const [isSaved, setIsSaved] = useState(false);
  const { data: apiService, isLoading, isError, error } = useService(id);
  const { user, isAuthenticated } = useAuth();
  const { data: publicSettings } = usePublicSettings();
  const reviewsEnabled = publicSettings?.featureFlags.reviews ?? true;

  const serviceData = useMemo(() => {
    if (!apiService) {
      return null;
    }
    return mapServiceToDetail(apiService);
  }, [apiService]);

  const reviewerName = useMemo(() => {
    if (!user) {
      return null;
    }

    const providerProfile = user.providerProfile as { displayName?: string | null } | null | undefined;
    return (
      providerProfile?.displayName ||
      (user.username ? `@${user.username}` : null) ||
      user.email ||
      user.phone ||
      "User"
    );
  }, [user]);

  const { reviews, summary, addReview } = useServiceReviews(serviceData?.id ?? null, {
    initialReviews: serviceData?.reviews ?? [],
    enabled: reviewsEnabled,
  });

  const canReview = Boolean(
    reviewsEnabled &&
      isAuthenticated &&
      user &&
      (user.role === "buyer" || isCoreAdminRole(user.role)),
  );

  const summaryToDisplay = useMemo(() => {
    if (summary.totalReviews > 0) {
      return summary;
    }
    if (!serviceData) {
      return summary;
    }
    return {
      averageRating: serviceData.provider.rating,
      totalReviews: serviceData.provider.reviews,
      ratingBreakdown: summary.ratingBreakdown,
    };
  }, [serviceData, summary]);

  useEffect(() => {
    if (!serviceData || serviceData.packages.length === 0) {
      return;
    }

    const preferred =
      serviceData.packages.find((pkg) => pkg.popular)?.id ?? serviceData.packages[0].id;
    setSelectedPackage(preferred);
  }, [serviceData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-10 pb-20">
          <div className="container mx-auto px-4">
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-8 text-center text-muted-foreground">
              Loading service details...
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !serviceData) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-10 pb-20">
          <div className="container mx-auto px-4">
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-8 text-center">
              <h1 className="text-2xl font-display font-bold text-foreground mb-2">
                Service not found
              </h1>
              <p className="text-muted-foreground mb-6">
                {error?.message ?? "We couldn't load this service. Please try again."}
              </p>
              <Button asChild variant="gold">
                <Link to="/browse">Back to browse</Link>
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-10">
        {/* Breadcrumb */}
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
                Home
              </Link>
              <span className="text-muted-foreground">/</span>
              <Link to="/browse" className="text-muted-foreground hover:text-foreground transition-colors">
                Services
              </Link>
              <span className="text-muted-foreground">/</span>
              <Link
                to={`/browse?category=${encodeURIComponent(serviceData.category)}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {serviceData.category}
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground font-medium">{serviceData.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="gap-2">
                <Share2 className="w-4 h-4" />
                Share
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2"
                onClick={() => setIsSaved(!isSaved)}
              >
                <Heart className={`w-4 h-4 ${isSaved ? "fill-destructive text-destructive" : ""}`} />
                {isSaved ? "Saved" : "Save"}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 pb-20">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column - Gallery & Info */}
            <div className="lg:col-span-2 space-y-8">
              <ServiceGallery images={serviceData.images} name={serviceData.name} />
              <ServiceInfo service={serviceData} />
              {reviewsEnabled && (
                <ServiceReviews
                  reviews={reviews}
                  ratingBreakdown={summaryToDisplay.ratingBreakdown}
                  totalReviews={summaryToDisplay.totalReviews}
                  averageRating={summaryToDisplay.averageRating}
                  canReview={canReview}
                  reviewerName={reviewerName ?? undefined}
                  onAddReview={addReview}
                />
              )}
            </div>

            {/* Right Column - Pricing & Booking */}
            <div className="space-y-6">
              <div className="sticky top-24">
                <ServicePricing 
                  packages={serviceData.packages}
                  selectedPackage={selectedPackage || serviceData.packages[0]?.id}
                  onSelectPackage={setSelectedPackage}
                  provider={serviceData.provider}
                  reviewSummary={summaryToDisplay}
                  serviceId={serviceData.id}
                  serviceName={serviceData.name}
                  category={serviceData.category}
                  location={serviceData.provider.location}
                  image={serviceData.images[0]}
                  verified={serviceData.provider.verified}
                />
                <div className="mt-6">
                  <ServiceInquiryForm 
                    serviceName={serviceData.name}
                    providerName={serviceData.provider.name}
                    providerId={serviceData.provider.id}
                    providerAvatar={serviceData.provider.avatar}
                    serviceId={serviceData.id}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Related Services */}
          <RelatedServices category={serviceData.category} currentServiceId={serviceData.id} />
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ServiceDetail;
