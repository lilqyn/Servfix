import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Save, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import ServiceBasicInfo from "@/components/service-form/ServiceBasicInfo";
import ServiceImageUpload from "@/components/service-form/ServiceImageUpload";
import ServicePricingTiers from "@/components/service-form/ServicePricingTiers";
import ServiceAvailability from "@/components/service-form/ServiceAvailability";
import ServiceGallery from "@/components/service/ServiceGallery";
import ServiceInfo from "@/components/service/ServiceInfo";
import ServicePricing from "@/components/service/ServicePricing";
import ServiceReviews from "@/components/service/ServiceReviews";
import { apiFetch } from "@/lib/api";
import { useService } from "@/hooks/useService";
import { useAuth } from "@/contexts/AuthContext";
import { FALLBACK_AVATAR, FALLBACK_IMAGE, type ServiceDetailData } from "@/lib/services";
import type { ApiService } from "@/lib/api";

const pricingTierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.number().min(1, "Price must be greater than 0"),
  description: z.string().min(1, "Description is required"),
  deliveryTime: z.string().min(1, "Delivery time is required"),
  features: z.array(z.string()).min(1, "At least one feature is required"),
  popular: z.boolean().default(false),
  pricingType: z.enum(["flat", "per_unit"]).default("flat"),
  unitLabel: z.string().optional(),
});

const serviceFormSchema = z.object({
  name: z.string().min(3, "Service name must be at least 3 characters"),
  category: z.string().min(1, "Please select a category"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  tags: z.array(z.string()).optional(),
  images: z
    .array(z.string())
    .min(1, "At least one image is required")
    .max(5, "You can upload up to 5 images"),
  pricingTiers: z.array(pricingTierSchema).min(1, "At least one pricing tier is required"),
  availability: z.object({
    days: z.array(z.string()).min(1, "Select at least one day"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    advanceBooking: z.number().min(1, "Advance booking days is required"),
    maxBookingsPerDay: z.number().min(1, "Max bookings per day is required"),
  }),
  location: z.object({
    city: z.string().min(1, "City is required"),
    areas: z.array(z.string()).optional(),
    isRemote: z.boolean().default(false),
  }),
});

export type ServiceFormData = z.infer<typeof serviceFormSchema>;

const MAX_SERVICE_IMAGES = 5;

const defaultValues: Partial<ServiceFormData> = {
  name: "",
  category: "",
  description: "",
  tags: [],
  images: [],
  pricingTiers: [
    {
      name: "Basic",
      price: 0,
      description: "",
      deliveryTime: "",
      features: [""],
      popular: false,
      pricingType: "flat",
      unitLabel: "",
    },
    {
      name: "Standard",
      price: 0,
      description: "",
      deliveryTime: "",
      features: [""],
      popular: true,
      pricingType: "flat",
      unitLabel: "",
    },
    {
      name: "Premium",
      price: 0,
      description: "",
      deliveryTime: "",
      features: [""],
      popular: false,
      pricingType: "flat",
      unitLabel: "",
    },
  ],
  availability: {
    days: [],
    startTime: "09:00",
    endTime: "18:00",
    advanceBooking: 3,
    maxBookingsPerDay: 2,
  },
  location: {
    city: "",
    areas: [],
    isRemote: false,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  catering: "Catering & Food",
  photography: "Photography & Video",
  decorations: "Decorations & Styling",
  music: "Music & Entertainment",
  venues: "Venues & Spaces",
  fashion: "Fashion & Beauty",
  planning: "Event Planning",
  rentals: "Equipment Rentals",
};

const CITY_LABELS: Record<string, string> = {
  accra: "Accra",
  kumasi: "Kumasi",
  tamale: "Tamale",
  "cape-coast": "Cape Coast",
  takoradi: "Takoradi",
};

const CATEGORY_VALUE_BY_LABEL = Object.entries(CATEGORY_LABELS).reduce<Record<string, string>>(
  (acc, [value, label]) => {
    acc[label.toLowerCase()] = value;
    return acc;
  },
  {},
);

const CITY_VALUE_BY_LABEL: Record<string, string> = {
  accra: "accra",
  kumasi: "kumasi",
  tamale: "tamale",
  "cape coast": "cape-coast",
  "cape-coast": "cape-coast",
  takoradi: "takoradi",
};

const DEFAULT_AVAILABILITY: ServiceFormData["availability"] = {
  days: [],
  startTime: "09:00",
  endTime: "18:00",
  advanceBooking: 3,
  maxBookingsPerDay: 2,
};

const formatTierName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

const parseDeliveryDays = (input: string) => {
  const lower = input.toLowerCase();
  const matches = input.match(/\d+/g);
  const numbers = matches ? matches.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : [];

  let days = numbers.length > 0 ? Math.max(...numbers) : 0;

  if (lower.includes("week")) {
    days = days > 0 ? days * 7 : 7;
  }

  if (lower.includes("month")) {
    days = days > 0 ? days * 30 : 30;
  }

  if (!Number.isFinite(days) || days <= 0) {
    return 3;
  }

  return Math.min(days, 365);
};

const mapTierName = (name: string, index: number): "basic" | "standard" | "premium" => {
  const lower = name.trim().toLowerCase();
  if (lower.includes("basic")) return "basic";
  if (lower.includes("standard")) return "standard";
  if (lower.includes("premium")) return "premium";

  if (index === 0) return "basic";
  if (index === 1) return "standard";
  return "premium";
};

const mapCategoryToValue = (category: string) => {
  const normalized = category.trim().toLowerCase();
  if (CATEGORY_LABELS[normalized]) {
    return normalized;
  }
  if (CATEGORY_VALUE_BY_LABEL[normalized]) {
    return CATEGORY_VALUE_BY_LABEL[normalized];
  }
  return category;
};

const mapLocationToCity = (location?: string | null) => {
  if (!location) {
    return "";
  }

  const raw = location.split(",")[0]?.trim();
  if (!raw) {
    return "";
  }

  const normalized = raw.toLowerCase();
  return CITY_LABELS[normalized] ?? CITY_VALUE_BY_LABEL[normalized] ?? raw;
};

const buildPricingTiers = (tiers: ApiService["tiers"]): ServiceFormData["pricingTiers"] => {
  const order: Array<"basic" | "standard" | "premium"> = ["basic", "standard", "premium"];
  const tierMap = new Map(tiers.map((tier) => [tier.name, tier]));

  return order.map((name) => {
    const tier = tierMap.get(name);
    const label = formatTierName(name);
    if (!tier) {
      return {
        name: label,
        price: 0,
        description: "",
        deliveryTime: "",
        features: [""],
        popular: name === "standard",
      };
    }

    return {
      name: label,
      price: Number(tier.price),
      description: `${label} package`,
      deliveryTime: `${tier.deliveryDays} days`,
      features: [""],
      popular: name === "standard",
      pricingType: tier.pricingType ?? "flat",
      unitLabel: tier.unitLabel ?? "",
    };
  });
};

const mapServiceToForm = (service: ApiService): ServiceFormData => {
  const providerProfile = service.provider.providerProfile ?? null;
  const sortedMedia = [...service.media].sort((a, b) => a.sortOrder - b.sortOrder);
  const imageCandidates = [
    service.coverMedia?.signedUrl ?? service.coverMedia?.url,
    ...sortedMedia.map((media) => media.signedUrl ?? media.url),
  ].filter(Boolean) as string[];
  const images = imageCandidates
    .filter((url, index, list) => list.indexOf(url) === index)
    .slice(0, MAX_SERVICE_IMAGES);
  const availabilityDays = service.availabilityDays ?? [];
  const availabilityStartTime = service.availabilityStartTime ?? DEFAULT_AVAILABILITY.startTime;
  const availabilityEndTime = service.availabilityEndTime ?? DEFAULT_AVAILABILITY.endTime;
  const advanceBookingDays = service.advanceBookingDays ?? DEFAULT_AVAILABILITY.advanceBooking;
  const maxBookingsPerDay = service.maxBookingsPerDay ?? DEFAULT_AVAILABILITY.maxBookingsPerDay;
  const locationCity = service.locationCity ?? providerProfile?.location ?? "";

  return {
    name: service.title,
    category: mapCategoryToValue(service.category),
    description: service.description,
    tags: service.tags ?? [],
    images,
    pricingTiers: buildPricingTiers(service.tiers),
    availability: {
      days: availabilityDays,
      startTime: availabilityStartTime,
      endTime: availabilityEndTime,
      advanceBooking: advanceBookingDays,
      maxBookingsPerDay: maxBookingsPerDay,
    },
    location: {
      city: mapLocationToCity(locationCity),
      areas: service.locationAreas ?? [],
      isRemote: service.isRemote ?? false,
    },
  };
};

const buildServicePayload = (data: ServiceFormData, status: "draft" | "published") => {
  const categoryLabel = CATEGORY_LABELS[data.category] ?? data.category;
  const cityLabel = data.location?.city ? CITY_LABELS[data.location.city] ?? data.location.city : "";
  const images = (data.images ?? []).map((image) => image.trim()).filter(Boolean);

  const locationPayload =
    cityLabel || (data.location?.areas?.length ?? 0) > 0 || data.location?.isRemote
      ? {
          ...(cityLabel ? { city: cityLabel } : {}),
          areas: data.location?.areas ?? [],
          isRemote: data.location?.isRemote ?? false,
        }
      : undefined;

  const availabilityPayload = {
    days: data.availability.days,
    startTime: data.availability.startTime,
    endTime: data.availability.endTime,
    advanceBooking: data.availability.advanceBooking,
    maxBookingsPerDay: data.availability.maxBookingsPerDay,
  };

  return {
    title: data.name.trim(),
    description: data.description.trim(),
    category: categoryLabel,
    tags: (data.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    status,
    images,
    location: locationPayload,
    availability: availabilityPayload,
    tiers: data.pricingTiers.map((tier, index) => ({
      name: mapTierName(tier.name, index),
      price: Number(tier.price),
      currency: "GHS" as const,
      deliveryDays: parseDeliveryDays(tier.deliveryTime),
      revisionCount: 0,
      pricingType: tier.pricingType ?? "flat",
      unitLabel:
        tier.pricingType === "per_unit"
          ? tier.unitLabel?.trim() || "unit"
          : undefined,
    })),
  };
};

const ServiceForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const [activeTab, setActiveTab] = useState("basic");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [hasPrefilled, setHasPrefilled] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<ServiceDetailData | null>(null);
  const [previewSelectedPackage, setPreviewSelectedPackage] = useState<string>("");
  const {
    data: serviceData,
    isLoading: isLoadingService,
    isError: isServiceError,
    error: serviceError,
  } = useService(id);
  const { user } = useAuth();

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues,
    mode: "onChange",
  });

  useEffect(() => {
    if (!isEditing || !serviceData || hasPrefilled) {
      return;
    }

    form.reset(mapServiceToForm(serviceData));
    setHasPrefilled(true);
  }, [form, hasPrefilled, isEditing, serviceData]);

  const previewProviderName = useMemo(() => {
    if (!user) {
      return "Service Provider";
    }

    const providerProfile = user.providerProfile as { displayName?: string | null } | null | undefined;

    if (providerProfile?.displayName) {
      return providerProfile.displayName;
    }

    if (user.username) {
      return user.username;
    }

    if (user.email) {
      return user.email;
    }

    if (user.phone) {
      return user.phone;
    }

    return user.role === "provider" ? "Provider" : "Account";
  }, [user]);

  const buildPreviewData = (data: ServiceFormData): ServiceDetailData => {
    const providerProfile = user?.providerProfile as
      | {
          displayName?: string | null;
          location?: string | null;
          verificationStatus?: string | null;
          ratingAvg?: string | null;
          ratingCount?: number | null;
        }
      | null
      | undefined;

    const rating = providerProfile?.ratingAvg ? Number(providerProfile.ratingAvg) : 0;
    const reviews = providerProfile?.ratingCount ?? 0;
    const verified = providerProfile?.verificationStatus === "verified";
    const topRated = rating >= 4.8 && reviews >= 10;
    const memberSince = user?.createdAt
      ? new Date(user.createdAt).getFullYear().toString()
      : "2024";

    const images = (data.images ?? [])
      .map((image) => image.trim())
      .filter(Boolean);
    const previewImages = images.length > 0 ? images : [FALLBACK_IMAGE];

    const categoryLabel = CATEGORY_LABELS[data.category] ?? data.category ?? "Service";
    const cityLabel = data.location?.city ? CITY_LABELS[data.location.city] ?? data.location.city : "";
    const baseLocation = data.location?.isRemote
      ? cityLabel
        ? `${cityLabel} (Remote)`
        : "Remote"
      : cityLabel || providerProfile?.location || "Ghana";
    const providerLocation = baseLocation
      ? baseLocation.toLowerCase().includes("ghana") || baseLocation.toLowerCase().includes("remote")
        ? baseLocation
        : `${baseLocation}, Ghana`
      : "Ghana";

    const packages =
      data.pricingTiers?.length > 0
        ? data.pricingTiers.map((tier, index) => {
            const name = tier.name?.trim() || `Package ${index + 1}`;
            const features =
              tier.features?.map((feature) => feature.trim()).filter(Boolean) ?? [];

            return {
              id: `${name.toLowerCase().replace(/\s+/g, "-")}-${index}`,
              name,
              price: Number.isFinite(tier.price) ? Number(tier.price) : 0,
              description: tier.description?.trim() || `${name} package`,
              features: features.length > 0 ? features : ["Custom scope"],
              deliveryTime: tier.deliveryTime?.trim() || "Flexible",
              popular: tier.popular ?? index === 1,
              pricingType: tier.pricingType ?? "flat",
              unitLabel: tier.unitLabel ?? null,
            };
          })
        : [
            {
              id: "basic-preview",
              name: "Basic",
              price: 0,
              description: "Custom quote required",
              features: ["Flexible delivery", "Custom scope"],
              deliveryTime: "Flexible",
              popular: false,
            },
          ];

    return {
      id: id ?? "preview",
      name: data.name?.trim() || "Untitled service",
      category: categoryLabel,
      description: data.description?.trim() || "Add a description to preview how it will appear.",
      images: previewImages,
      packages,
      provider: {
        id: user?.id ?? "preview-provider",
        name: previewProviderName,
        avatar: FALLBACK_AVATAR,
        verified,
        topRated,
        memberSince,
        responseTime: "Typically responds within 2 hours",
        completedJobs: Math.max(0, reviews),
        rating: Math.round(rating * 10) / 10,
        reviews,
        location: providerLocation,
      },
      reviews: [],
      ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      faqs: [],
    };
  };

  const handlePreview = () => {
    const preview = buildPreviewData(form.getValues());
    const preferred =
      preview.packages.find((pkg) => pkg.popular)?.id ?? preview.packages[0]?.id ?? "";
    setPreviewData(preview);
    setPreviewSelectedPackage(preferred);
    setIsPreviewOpen(true);
  };

  const onSubmit = async (data: ServiceFormData) => {
    try {
      const payload = buildServicePayload(data, "published");
      const endpoint = isEditing ? `/api/services/${id}` : "/api/services";
      const method = isEditing ? "PUT" : "POST";
      await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      toast.success(isEditing ? "Service updated successfully!" : "Service published successfully!");
      navigate("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to publish service.";
      toast.error(message);
    }
  };

  const handleSaveDraft = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error("Please fix the form errors before saving a draft.");
      return;
    }

    setIsSavingDraft(true);
    try {
      const payload = buildServicePayload(form.getValues(), "draft");
      const endpoint = isEditing ? `/api/services/${id}` : "/api/services";
      const method = isEditing ? "PUT" : "POST";
      await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      toast.success(isEditing ? "Draft updated successfully!" : "Draft saved successfully!");
      navigate("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save draft.";
      toast.error(message);
    } finally {
      setIsSavingDraft(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/dashboard")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {isEditing ? "Edit Service" : "Create New Service"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isEditing ? "Update your service details" : "Add a new service to your offerings"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isSavingDraft || form.formState.isSubmitting || (isEditing && !hasPrefilled)}
              >
                {isSavingDraft ? "Saving Draft..." : "Save Draft"}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={handlePreview}
                disabled={form.formState.isSubmitting || (isEditing && !hasPrefilled)}
                type="button"
              >
                <Eye className="h-4 w-4" />
                Preview
              </Button>
              <Button
                variant="gold"
                className="gap-2"
                onClick={form.handleSubmit(onSubmit)}
                disabled={form.formState.isSubmitting || (isEditing && !hasPrefilled)}
              >
                <Save className="h-4 w-4" />
                {form.formState.isSubmitting
                  ? "Publishing..."
                  : isEditing && serviceData?.status === "published"
                    ? "Update Service"
                    : "Publish Service"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {isEditing && isLoadingService && (
        <div className="border-b border-border/50 bg-muted/20">
          <div className="container mx-auto px-4 py-3 text-sm text-muted-foreground">
            Loading service details...
          </div>
        </div>
      )}

      {isEditing && isServiceError && (
        <div className="border-b border-destructive/30 bg-destructive/5">
          <div className="container mx-auto px-4 py-3 text-sm text-destructive">
            {serviceError?.message ?? "Unable to load service details."}
          </div>
        </div>
      )}

      {/* Form Content */}
      <div className="container mx-auto px-4 py-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full max-w-2xl grid-cols-4">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="images">Images</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                <TabsTrigger value="availability">Availability</TabsTrigger>
              </TabsList>

              <div className="mt-8">
                <TabsContent value="basic">
                  <ServiceBasicInfo form={form} />
                </TabsContent>

                <TabsContent value="images">
                  <ServiceImageUpload form={form} />
                </TabsContent>

                <TabsContent value="pricing">
                  <ServicePricingTiers form={form} />
                </TabsContent>

                <TabsContent value="availability">
                  <ServiceAvailability form={form} />
                </TabsContent>
              </div>
            </Tabs>
          </form>
        </Form>
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden">
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b border-border/50 px-6 py-4">
              <DialogTitle>Service Preview</DialogTitle>
              <p className="text-sm text-muted-foreground">
                This is a preview of how your service will appear to buyers.
              </p>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-6 py-6">
              {previewData ? (
                <div className="grid lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    <ServiceGallery images={previewData.images} name={previewData.name} />
                    <ServiceInfo service={previewData} />
                    <ServiceReviews
                      reviews={previewData.reviews}
                      ratingBreakdown={previewData.ratingBreakdown}
                      totalReviews={previewData.provider.reviews}
                      averageRating={previewData.provider.rating}
                    />
                  </div>
                  <div className="space-y-6">
                    <ServicePricing
                      packages={previewData.packages}
                      selectedPackage={previewSelectedPackage || previewData.packages[0]?.id}
                      onSelectPackage={setPreviewSelectedPackage}
                      provider={previewData.provider}
                      reviewSummary={{
                        averageRating: previewData.provider.rating,
                        totalReviews: previewData.provider.reviews,
                      }}
                      serviceId={previewData.id}
                      serviceName={previewData.name}
                      category={previewData.category}
                      location={previewData.provider.location}
                      image={previewData.images[0]}
                      verified={previewData.provider.verified}
                      isPreview
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
                  Complete the form to preview your service.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServiceForm;
