import type { ApiService } from "./api";

export type ServiceSummary = {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  category: string;
  location: string;
  rating: number;
  reviews: number;
  avatar: string;
  price: number;
  priceDisplay: string;
  image: string;
  verified: boolean;
  topRated: boolean;
};

export type ServiceDetailPackage = {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  deliveryTime: string;
  popular: boolean;
  pricingType?: "flat" | "per_unit";
  unitLabel?: string | null;
};

export type ServiceDetailProvider = {
  id: string;
  name: string;
  avatar: string;
  username?: string | null;
  verified: boolean;
  topRated: boolean;
  memberSince: string;
  responseTime: string;
  completedJobs: number;
  rating: number;
  reviews: number;
  location: string;
};

export type ServiceDetailData = {
  id: string;
  name: string;
  category: string;
  description: string;
  images: string[];
  packages: ServiceDetailPackage[];
  provider: ServiceDetailProvider;
  reviews: {
    id: string;
    author: string;
    avatar: string;
    rating: number;
    date: string;
    comment: string;
    images?: string[];
    helpful: number;
  }[];
  ratingBreakdown: Record<number, number>;
  faqs: { question: string; answer: string }[];
};

export const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=600&h=400&fit=crop";
export const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop";

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatPrice(
  amount: number,
  currency: "GHS" | "USD" | "EUR",
  pricingType?: "flat" | "per_unit",
  unitLabel?: string | null,
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Contact for pricing";
  }

  const formatted = new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(amount);

  if (pricingType === "per_unit") {
    const label = unitLabel?.trim() || "unit";
    return `From ${formatted} / ${label}`;
  }

  return `From ${formatted}`;
}

function formatLocation(primary?: string | null, fallback?: string | null) {
  const base = primary?.trim() || fallback?.trim();
  if (!base) {
    return "Ghana";
  }

  if (base.toLowerCase().includes("ghana")) {
    return base;
  }

  return `${base}, Ghana`;
}

export function mapServiceToSummary(service: ApiService): ServiceSummary {
  const providerProfile = service.provider.providerProfile ?? null;
  const rating = providerProfile ? toNumber(providerProfile.ratingAvg) : 0;
  const reviews = providerProfile?.ratingCount ?? 0;
  const verified = providerProfile?.verificationStatus === "verified";
  const topRated = rating >= 4.8 && reviews >= 10;

  const tiersWithPrice = service.tiers.map((tier) => ({
    tier,
    price: toNumber(tier.price),
  }));
  const sortedByPrice = tiersWithPrice.sort((a, b) => a.price - b.price);
  const cheapest = sortedByPrice[0]?.tier;
  const minPrice = sortedByPrice[0]?.price ?? 0;
  const currency = cheapest?.currency ?? "GHS";

  const name = providerProfile?.displayName ?? service.title;
  const providerName =
    providerProfile?.displayName ??
    (service.provider.username ? `@${service.provider.username}` : null) ??
    "Provider";
  const location = formatLocation(service.locationCity, providerProfile?.location ?? null);

  return {
    id: service.id,
    name,
    providerId: service.provider.id,
    providerName,
    category: service.category,
    location,
    rating: Math.round(rating * 10) / 10,
    reviews,
    avatar: service.provider.avatarUrl ?? FALLBACK_AVATAR,
    price: minPrice,
    priceDisplay: formatPrice(minPrice, currency, cheapest?.pricingType, cheapest?.unitLabel ?? null),
    image:
      service.coverMedia?.signedUrl ??
      service.coverMedia?.url ??
      service.media[0]?.signedUrl ??
      service.media[0]?.url ??
      FALLBACK_IMAGE,
    verified,
    topRated,
  };
}

function formatTierName(name: ApiService["tiers"][number]["name"]) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatDeliveryDays(days: number) {
  if (!Number.isFinite(days) || days <= 0) {
    return "Flexible";
  }

  return `${days} day${days === 1 ? "" : "s"}`;
}

export function mapServiceToDetail(service: ApiService): ServiceDetailData {
  const providerProfile = service.provider.providerProfile ?? null;
  const rating = providerProfile ? toNumber(providerProfile.ratingAvg) : 0;
  const reviews = providerProfile?.ratingCount ?? 0;
  const verified = providerProfile?.verificationStatus === "verified";
  const topRated = rating >= 4.8 && reviews >= 10;

  const providerName =
    providerProfile?.displayName ??
    (service.provider.username ? `@${service.provider.username}` : null) ??
    "Service Provider";
  const providerLocation = formatLocation(service.locationCity, providerProfile?.location ?? null);
  const memberSince = service.createdAt
    ? new Date(service.createdAt).getFullYear().toString()
    : "2024";

  const sortedMedia = [...service.media].sort((a, b) => a.sortOrder - b.sortOrder);
  const imageCandidates = [
    service.coverMedia?.signedUrl ?? service.coverMedia?.url,
    ...sortedMedia.map((media) => media.signedUrl ?? media.url),
  ].filter(Boolean) as string[];

  const uniqueImages = imageCandidates.filter((url, index, list) => list.indexOf(url) === index);
  const images = uniqueImages.length > 0 ? uniqueImages : [FALLBACK_IMAGE];

  const packages: ServiceDetailPackage[] =
    service.tiers.length > 0
      ? service.tiers.map((tier) => {
          const deliveryTime = formatDeliveryDays(tier.deliveryDays);
          const revisionsLabel =
            tier.revisionCount === 0
              ? "No revisions"
              : `${tier.revisionCount} revision${tier.revisionCount === 1 ? "" : "s"}`;
          const tierName = formatTierName(tier.name);

          return {
            id: tier.id,
            name: tierName,
            price: toNumber(tier.price),
            description: `${tierName} package`,
            features: [`Delivery in ${deliveryTime}`, revisionsLabel],
            deliveryTime,
            popular: tier.name === "standard",
            pricingType: tier.pricingType ?? "flat",
            unitLabel: tier.unitLabel ?? null,
          };
        })
      : [
          {
            id: "basic",
            name: "Basic",
            price: 0,
            description: "Custom quote required",
            features: ["Flexible delivery", "Custom scope"],
            deliveryTime: "Flexible",
            popular: false,
            pricingType: "flat",
            unitLabel: null,
          },
        ];

  return {
    id: service.id,
    name: service.title,
    category: service.category,
    description: service.description,
    images,
    packages,
    provider: {
      id: service.provider.id,
      name: providerName,
      avatar: service.provider.avatarUrl ?? FALLBACK_AVATAR,
      username: service.provider.username ?? null,
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
}
