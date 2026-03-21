import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { createService, updateService, uploadServiceImage } from "../lib/api";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { Service, ServiceCreateInput } from "../types";

// ─── Constants ───────────────────────────────────────────────────────────────

type Props = {
  existingService?: Service | null;
  onDone: (service: Service) => void;
  onBack: () => void;
};

const SERVICE_CATEGORIES = [
  "Catering & Food",
  "Photography & Video",
  "Decorations & Styling",
  "Music & Entertainment",
  "Venues & Spaces",
  "Fashion & Beauty",
  "Event Planning",
  "Equipment Rentals",
  "Cleaning",
  "Plumbing",
  "Electrical",
  "Painting",
  "Carpentry",
  "Moving",
  "Gardening",
  "AC & Cooling",
  "IT & Tech",
  "Design",
  "Security",
  "Tutoring",
  "Other",
];

const CITY_SUGGESTIONS = ["Accra", "Kumasi", "Tamale", "Cape Coast", "Takoradi"];

const DAYS_OF_WEEK = [
  { id: "monday", label: "Mon" },
  { id: "tuesday", label: "Tue" },
  { id: "wednesday", label: "Wed" },
  { id: "thursday", label: "Thu" },
  { id: "friday", label: "Fri" },
  { id: "saturday", label: "Sat" },
  { id: "sunday", label: "Sun" },
];

const PRICING_MODELS: { key: "fixed" | "negotiable" | "market"; label: string }[] = [
  { key: "fixed", label: "Fixed price" },
  { key: "negotiable", label: "Negotiable range" },
  { key: "market", label: "Market-based range" },
];

const CURRENCIES: ("GHS" | "USD" | "EUR")[] = ["GHS", "USD", "EUR"];

const MAX_IMAGES = 5;

type TierForm = {
  name: "basic" | "standard" | "premium";
  label: string;
  price: string;
  priceMax: string;
  priceNote: string;
  pricingModel: "fixed" | "negotiable" | "market";
  pricingType: "flat" | "per_unit";
  unitLabel: string;
  deliveryDays: string;
  revisionCount: string;
  description: string;
  features: string[];
  popular: boolean;
};

const makeTier = (
  name: "basic" | "standard" | "premium",
  label: string,
  popular = false,
): TierForm => ({
  name,
  label,
  price: "",
  priceMax: "",
  priceNote: "",
  pricingModel: "fixed",
  pricingType: "flat",
  unitLabel: "",
  deliveryDays: "1",
  revisionCount: "1",
  description: "",
  features: [""],
  popular,
});

// ─── Reusable Field ──────────────────────────────────────────────────────────

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const fieldStyles = useFieldStyles();
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      {children}
      {hint ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useFieldStyles = createThemedStyles((palette) => ({
  wrap: { gap: 6 },
  label: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  hint: { color: palette.slate, fontSize: 12 },
}));

// ─── Tabs ────────────────────────────────────────────────────────────────────

type TabKey = "basic" | "images" | "pricing" | "availability";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "basic", label: "Info", icon: "document-text-outline" },
  { key: "images", label: "Images", icon: "images-outline" },
  { key: "pricing", label: "Pricing", icon: "pricetag-outline" },
  { key: "availability", label: "Schedule", icon: "calendar-outline" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function CreateEditServiceScreen({ existingService, onDone, onBack }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const isEditing = Boolean(existingService);
  const [activeTab, setActiveTab] = useState<TabKey>("basic");

  // Basic info
  const [title, setTitle] = useState(existingService?.title ?? "");
  const [description, setDescription] = useState(existingService?.description ?? "");
  const [category, setCategory] = useState(existingService?.category ?? "");
  const [tags, setTags] = useState<string[]>(existingService?.tags ?? []);
  const [tagInput, setTagInput] = useState("");

  // Location
  const [city, setCity] = useState(existingService?.locationCity ?? "");
  const [isRemote, setIsRemote] = useState(existingService?.isRemote ?? false);

  // Images
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Currency
  const [currency, setCurrency] = useState<"GHS" | "USD" | "EUR">(
    (existingService?.tiers[0]?.currency as "GHS" | "USD" | "EUR") ?? "GHS",
  );

  // Tiers
  const buildTiersFromExisting = (): TierForm[] => {
    if (!existingService?.tiers.length) {
      return [
        makeTier("basic", "Basic"),
        makeTier("standard", "Standard", true),
        makeTier("premium", "Premium"),
      ];
    }
    const tierNames: ("basic" | "standard" | "premium")[] = ["basic", "standard", "premium"];
    const labels = ["Basic", "Standard", "Premium"];
    return tierNames.map((name, i) => {
      const existing = existingService.tiers.find((t) => t.name === name);
      if (!existing) return makeTier(name, labels[i], name === "standard");
      return {
        name,
        label: labels[i],
        price: String(existing.price),
        priceMax: existing.priceMax ? String(existing.priceMax) : "",
        priceNote: existing.priceNote ?? "",
        pricingModel: existing.pricingModel ?? "fixed",
        pricingType: existing.pricingType ?? "flat",
        unitLabel: existing.unitLabel ?? "",
        deliveryDays: String(existing.deliveryDays),
        revisionCount: String(existing.revisionCount),
        description: "",
        features: [""],
        popular: name === "standard",
      };
    });
  };

  const [tiers, setTiers] = useState<TierForm[]>(buildTiersFromExisting);

  // Availability
  const [availDays, setAvailDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [advanceBooking, setAdvanceBooking] = useState("3");
  const [maxBookings, setMaxBookings] = useState("2");

  // Publish
  const [publishNow, setPublishNow] = useState(!isEditing);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill images from existing service
  useEffect(() => {
    if (existingService?.media?.length) {
      const urls = existingService.media
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => m.signedUrl || m.url);
      setImageUris(urls);
      setImageKeys(urls);
    }
  }, [existingService]);

  // ─── Image Picking ───────────────────────────────────────────────────────

  const pickImages = async () => {
    if (imageUris.length >= MAX_IMAGES) {
      Alert.alert("Limit reached", `You can upload up to ${MAX_IMAGES} images.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - imageUris.length,
      quality: 0.8,
    });

    if (result.canceled || !result.assets.length) return;

    setUploadingImage(true);
    setError(null);

    try {
      for (const asset of result.assets) {
        const { key } = await uploadServiceImage(asset.uri);
        setImageKeys((prev) => [...prev, key]);
        setImageUris((prev) => [...prev, asset.uri]);
      }
    } catch {
      setError("Failed to upload image. Please try again.");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = (index: number) => {
    setImageKeys((prev) => prev.filter((_, i) => i !== index));
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Tags ────────────────────────────────────────────────────────────────

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t) && tags.length < 10) {
      setTags((prev) => [...prev, t]);
      setTagInput("");
    }
  };

  const removeTag = (index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Tier helpers ────────────────────────────────────────────────────────

  const updateTier = (index: number, patch: Partial<TierForm>) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const addFeature = (tierIdx: number) => {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIdx ? { ...t, features: [...t.features, ""] } : t,
      ),
    );
  };

  const updateFeature = (tierIdx: number, featIdx: number, value: string) => {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIdx
          ? { ...t, features: t.features.map((f, fi) => (fi === featIdx ? value : f)) }
          : t,
      ),
    );
  };

  const removeFeature = (tierIdx: number, featIdx: number) => {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIdx
          ? { ...t, features: t.features.filter((_, fi) => fi !== featIdx) }
          : t,
      ),
    );
  };

  const setPopularTier = (tierIdx: number) => {
    setTiers((prev) => prev.map((t, i) => ({ ...t, popular: i === tierIdx })));
  };

  // ─── Availability helpers ────────────────────────────────────────────────

  const toggleDay = (dayId: string) => {
    setAvailDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId],
    );
  };

  // ─── Validation ──────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!title.trim() || title.trim().length < 3) return "Title must be at least 3 characters.";
    if (!description.trim() || description.trim().length < 20)
      return "Description must be at least 20 characters.";
    if (!category) return "Select a category.";
    if (imageKeys.length === 0) return "Upload at least one image.";

    for (const tier of tiers) {
      const price = parseFloat(tier.price);
      if (!tier.price || isNaN(price) || price <= 0) {
        return `Enter a valid price for ${tier.label} tier.`;
      }
      if (tier.pricingModel !== "fixed") {
        const max = parseFloat(tier.priceMax);
        if (!tier.priceMax || isNaN(max) || max <= price) {
          return `Max price must be greater than base price for ${tier.label} tier.`;
        }
      }
      const days = parseInt(tier.deliveryDays, 10);
      if (!tier.deliveryDays || isNaN(days) || days < 1) {
        return `Enter valid delivery days for ${tier.label} tier.`;
      }
      const features = tier.features.filter((f) => f.trim());
      if (features.length === 0) {
        return `Add at least one feature for ${tier.label} tier.`;
      }
    }

    if (availDays.length === 0) return "Select at least one working day.";
    if (!startTime || !endTime) return "Set working hours.";

    return null;
  };

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    const payload: ServiceCreateInput = {
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      tags: tags.filter((t) => t.trim()),
      status: publishNow ? "published" : "draft",
      images: imageKeys,
      location: {
        city: city.trim() || undefined,
        isRemote,
      },
      availability: {
        days: availDays,
        startTime,
        endTime,
        advanceBooking: parseInt(advanceBooking, 10) || 3,
        maxBookingsPerDay: parseInt(maxBookings, 10) || 2,
      },
      tiers: tiers.map((tier) => ({
        name: tier.name,
        price: parseFloat(tier.price),
        currency,
        deliveryDays: parseInt(tier.deliveryDays, 10),
        revisionCount: parseInt(tier.revisionCount, 10) || 0,
        pricingType: tier.pricingType,
        pricingModel: tier.pricingModel,
        priceMax:
          tier.pricingModel !== "fixed" && tier.priceMax
            ? parseFloat(tier.priceMax)
            : undefined,
        priceNote: tier.priceNote.trim() || undefined,
        unitLabel: tier.pricingType === "per_unit" ? tier.unitLabel.trim() || undefined : undefined,
        description: tier.description.trim() || undefined,
        features: tier.features.filter((f) => f.trim()),
      })),
    };

    try {
      let result: Service;
      if (isEditing && existingService) {
        result = await updateService(existingService.id, payload);
      } else {
        result = await createService(payload);
      }
      onDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save service.");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Tab content renderers ─────────────────────────────────────────────

  const renderBasicInfo = () => (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Service details</Text>

        <Field label="Title">
          <TextInput
            editable={!isLoading}
            onChangeText={(t) => { setTitle(t); setError(null); }}
            placeholder="e.g. Professional House Cleaning"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={title}
          />
        </Field>

        <Field label="Description" hint="Min 20 characters. Describe what you offer, what's included, and your process.">
          <TextInput
            editable={!isLoading}
            multiline
            onChangeText={(t) => { setDescription(t); setError(null); }}
            placeholder="Tell buyers what makes your service great..."
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.textarea]}
            value={description}
          />
        </Field>

        <Field label="Category">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <View style={styles.chipRow}>
              {SERVICE_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => { setCategory(cat); setError(null); }}
                  style={[styles.chip, category === cat && styles.chipActive]}
                >
                  <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Field>

        <Field label="Tags" hint="Help buyers find your service. Press + to add.">
          <View style={styles.tagInputRow}>
            <TextInput
              editable={!isLoading}
              onChangeText={setTagInput}
              onSubmitEditing={addTag}
              placeholder="e.g. deep cleaning, office"
              placeholderTextColor="#94a3b8"
              style={[styles.input, { flex: 1 }]}
              value={tagInput}
            />
            <Pressable onPress={addTag} style={styles.tagAddButton}>
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagList}>
              {tags.map((tag, i) => (
                <View key={tag} style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>{tag}</Text>
                  <Pressable onPress={() => removeTag(i)} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={palette.slate} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </Field>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>

        <Field label="City / Area">
          <TextInput
            editable={!isLoading}
            onChangeText={setCity}
            placeholder="e.g. Accra, East Legon"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={city}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {CITY_SUGGESTIONS.map((c) => (
                <Pressable key={c} onPress={() => setCity(c)} style={[styles.chipSmall, city === c && styles.chipActive]}>
                  <Text style={[styles.chipSmallText, city === c && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Field>

        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchLabel}>Remote / Online</Text>
            <Text style={styles.switchHint}>Service can be delivered remotely</Text>
          </View>
          <Switch
            onValueChange={setIsRemote}
            thumbColor={isRemote ? palette.accentDeep : "#f4f3f4"}
            trackColor={{ false: "#d1d5db", true: palette.accentSoft }}
            value={isRemote}
          />
        </View>
      </View>
    </View>
  );

  const renderImages = () => (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Service images</Text>
        <Text style={styles.sectionHint}>
          Upload up to {MAX_IMAGES} images. First image is the main thumbnail. Supported: JPG, PNG, WebP.
        </Text>

        <View style={styles.imageGrid}>
          {imageUris.map((uri, i) => (
            <View key={`img-${i}`} style={styles.imageThumb}>
              <Image source={{ uri }} style={styles.imageThumbImg} />
              {i === 0 && (
                <View style={styles.mainBadge}>
                  <Text style={styles.mainBadgeText}>Main</Text>
                </View>
              )}
              <Pressable
                onPress={() => removeImage(i)}
                style={styles.imageRemove}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={22} color="#ef4444" />
              </Pressable>
            </View>
          ))}

          {imageUris.length < MAX_IMAGES && (
            <Pressable
              onPress={pickImages}
              disabled={uploadingImage}
              style={styles.imageAddButton}
            >
              {uploadingImage ? (
                <ActivityIndicator color={palette.accentDeep} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={28} color={palette.accentDeep} />
                  <Text style={styles.imageAddText}>Add</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );

  const renderPricing = () => (
    <View style={styles.tabContent}>
      {/* Currency selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Currency</Text>
        <View style={styles.chipRow}>
          {CURRENCIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCurrency(c)}
              style={[styles.chip, currency === c && styles.chipActive]}
            >
              <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Tiers */}
      {tiers.map((tier, ti) => (
        <View
          key={tier.name}
          style={[
            styles.section,
            tier.popular && styles.sectionPopular,
          ]}
        >
          <View style={styles.tierHeader}>
            <Text style={styles.sectionTitle}>{tier.label} tier</Text>
            {tier.popular ? (
              <View style={styles.popularBadge}>
                <Ionicons name="star" size={12} color="#d97706" />
                <Text style={styles.popularBadgeText}>Popular</Text>
              </View>
            ) : (
              <Pressable onPress={() => setPopularTier(ti)}>
                <Text style={styles.setPopularText}>Set popular</Text>
              </Pressable>
            )}
          </View>

          <Field label="Short description">
            <TextInput
              editable={!isLoading}
              onChangeText={(t) => updateTier(ti, { description: t })}
              placeholder={`e.g. Perfect for ${tier.name === "basic" ? "small" : tier.name === "standard" ? "medium" : "large"} projects`}
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={tier.description}
            />
          </Field>

          {/* Pricing model */}
          <Field label="Pricing model">
            <View style={styles.chipRow}>
              {PRICING_MODELS.map((pm) => (
                <Pressable
                  key={pm.key}
                  onPress={() => updateTier(ti, { pricingModel: pm.key })}
                  style={[styles.chipSmall, tier.pricingModel === pm.key && styles.chipActive]}
                >
                  <Text style={[styles.chipSmallText, tier.pricingModel === pm.key && styles.chipTextActive]}>
                    {pm.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          {/* Price */}
          <View style={styles.rowFields}>
            <View style={styles.rowField}>
              <Field label={tier.pricingModel === "fixed" ? `Price (${currency})` : `Min price (${currency})`}>
                <TextInput
                  editable={!isLoading}
                  keyboardType="decimal-pad"
                  onChangeText={(t) => { updateTier(ti, { price: t.replace(/[^0-9.]/g, "") }); setError(null); }}
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={tier.price}
                />
              </Field>
            </View>
            {tier.pricingModel !== "fixed" && (
              <View style={styles.rowField}>
                <Field label={`Max price (${currency})`}>
                  <TextInput
                    editable={!isLoading}
                    keyboardType="decimal-pad"
                    onChangeText={(t) => updateTier(ti, { priceMax: t.replace(/[^0-9.]/g, "") })}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                    value={tier.priceMax}
                  />
                </Field>
              </View>
            )}
          </View>

          {tier.pricingModel !== "fixed" && (
            <Field label="Price note" hint="Optional note about pricing">
              <TextInput
                editable={!isLoading}
                onChangeText={(t) => updateTier(ti, { priceNote: t })}
                placeholder="e.g. Depends on project scope"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={tier.priceNote}
              />
            </Field>
          )}

          {/* Pricing type */}
          <Field label="Pricing type">
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => updateTier(ti, { pricingType: "flat" })}
                style={[styles.chipSmall, tier.pricingType === "flat" && styles.chipActive]}
              >
                <Text style={[styles.chipSmallText, tier.pricingType === "flat" && styles.chipTextActive]}>Flat price</Text>
              </Pressable>
              <Pressable
                onPress={() => updateTier(ti, { pricingType: "per_unit" })}
                style={[styles.chipSmall, tier.pricingType === "per_unit" && styles.chipActive]}
              >
                <Text style={[styles.chipSmallText, tier.pricingType === "per_unit" && styles.chipTextActive]}>Per guest/item</Text>
              </Pressable>
            </View>
          </Field>

          {tier.pricingType === "per_unit" && (
            <Field label="Unit label" hint="e.g. plate, guest, item">
              <TextInput
                editable={!isLoading}
                onChangeText={(t) => updateTier(ti, { unitLabel: t })}
                placeholder="e.g. plate"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={tier.unitLabel}
              />
            </Field>
          )}

          {/* Delivery & revisions */}
          <View style={styles.rowFields}>
            <View style={styles.rowField}>
              <Field label="Delivery days">
                <TextInput
                  editable={!isLoading}
                  keyboardType="number-pad"
                  onChangeText={(t) => updateTier(ti, { deliveryDays: t.replace(/[^0-9]/g, "") })}
                  placeholder="1"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={tier.deliveryDays}
                />
              </Field>
            </View>
            <View style={styles.rowField}>
              <Field label="Revisions">
                <TextInput
                  editable={!isLoading}
                  keyboardType="number-pad"
                  onChangeText={(t) => updateTier(ti, { revisionCount: t.replace(/[^0-9]/g, "") })}
                  placeholder="1"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={tier.revisionCount}
                />
              </Field>
            </View>
          </View>

          {/* Features */}
          <Field label="What's included">
            {tier.features.map((feat, fi) => (
              <View key={`feat-${fi}`} style={styles.featureRow}>
                <TextInput
                  editable={!isLoading}
                  onChangeText={(t) => updateFeature(ti, fi, t)}
                  placeholder={`Feature ${fi + 1}`}
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, { flex: 1 }]}
                  value={feat}
                />
                {tier.features.length > 1 && (
                  <Pressable onPress={() => removeFeature(ti, fi)} hitSlop={8}>
                    <Ionicons name="remove-circle-outline" size={22} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable onPress={() => addFeature(ti)} style={styles.addFeatureButton}>
              <Ionicons name="add-circle-outline" size={18} color={palette.accentDeep} />
              <Text style={styles.addFeatureText}>Add feature</Text>
            </Pressable>
          </Field>
        </View>
      ))}
    </View>
  );

  const renderAvailability = () => (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Working days</Text>
        <Text style={styles.sectionHint}>Select the days you're available</Text>

        <View style={styles.daysRow}>
          {DAYS_OF_WEEK.map((day) => (
            <Pressable
              key={day.id}
              onPress={() => toggleDay(day.id)}
              style={[styles.dayChip, availDays.includes(day.id) && styles.dayChipActive]}
            >
              <Text style={[styles.dayChipText, availDays.includes(day.id) && styles.dayChipTextActive]}>
                {day.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.presetRow}>
          <Pressable
            onPress={() => setAvailDays(["monday", "tuesday", "wednesday", "thursday", "friday"])}
          >
            <Text style={styles.presetText}>Weekdays</Text>
          </Pressable>
          <Text style={styles.presetDot}>•</Text>
          <Pressable onPress={() => setAvailDays(["saturday", "sunday"])}>
            <Text style={styles.presetText}>Weekends</Text>
          </Pressable>
          <Text style={styles.presetDot}>•</Text>
          <Pressable onPress={() => setAvailDays(DAYS_OF_WEEK.map((d) => d.id))}>
            <Text style={styles.presetText}>All days</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Working hours</Text>
        <View style={styles.rowFields}>
          <View style={styles.rowField}>
            <Field label="Start time">
              <TextInput
                editable={!isLoading}
                onChangeText={setStartTime}
                placeholder="09:00"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={startTime}
              />
            </Field>
          </View>
          <View style={styles.rowField}>
            <Field label="End time">
              <TextInput
                editable={!isLoading}
                onChangeText={setEndTime}
                placeholder="18:00"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={endTime}
              />
            </Field>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Booking settings</Text>
        <View style={styles.rowFields}>
          <View style={styles.rowField}>
            <Field label="Min notice (days)" hint="How far in advance must buyers book?">
              <TextInput
                editable={!isLoading}
                keyboardType="number-pad"
                onChangeText={(t) => setAdvanceBooking(t.replace(/[^0-9]/g, ""))}
                placeholder="3"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={advanceBooking}
              />
            </Field>
          </View>
          <View style={styles.rowField}>
            <Field label="Max bookings/day" hint="Limit daily bookings for quality">
              <TextInput
                editable={!isLoading}
                keyboardType="number-pad"
                onChangeText={(t) => setMaxBookings(t.replace(/[^0-9]/g, ""))}
                placeholder="2"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={maxBookings}
              />
            </Field>
          </View>
        </View>
      </View>

      <View style={[styles.section, styles.tipsSection]}>
        <Text style={styles.sectionTitle}>Tips</Text>
        <Text style={styles.tipText}>• Weekends are typically busiest for event services</Text>
        <Text style={styles.tipText}>• Set realistic minimum notice to prepare properly</Text>
        <Text style={styles.tipText}>• Consider travel time between bookings</Text>
        <Text style={styles.tipText}>• You can pause bookings anytime from your dashboard</Text>
      </View>
    </View>
  );

  // ─── Main render ───────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={palette.accentDeep} />
        </Pressable>
        <Text style={styles.headerTitle}>{isEditing ? "Edit Service" : "New Service"}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Ionicons
              name={tab.icon}
              size={18}
              color={activeTab === tab.key ? palette.accentDeep : palette.slate}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === "basic" && renderBasicInfo()}
        {activeTab === "images" && renderImages()}
        {activeTab === "pricing" && renderPricing()}
        {activeTab === "availability" && renderAvailability()}

        {/* Publish toggle + submit (always visible) */}
        <View style={styles.footerSection}>
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Publish immediately</Text>
              <Text style={styles.switchHint}>
                {publishNow ? "Service will be live and visible to buyers" : "Service will be saved as draft"}
              </Text>
            </View>
            <Switch
              onValueChange={setPublishNow}
              thumbColor={publishNow ? palette.accentDeep : "#f4f3f4"}
              trackColor={{ false: "#d1d5db", true: palette.accentSoft }}
              value={publishNow}
            />
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={isLoading}
            onPress={() => void handleSubmit()}
            style={[styles.submitButton, isLoading && styles.buttonDisabled]}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isEditing ? "Save changes" : publishNow ? "Publish service" : "Save as draft"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles((palette) => ({
  root: { backgroundColor: palette.canvas, flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 54 : 12,
    paddingBottom: 12,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  headerTitle: {
    color: palette.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  tabBar: {
    backgroundColor: palette.card,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 8,
  },
  tab: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: palette.accentDeep,
  },
  tabText: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "600",
  },
  tabTextActive: {
    color: palette.accentDeep,
    fontWeight: "800",
  },
  scrollContent: {
    paddingBottom: 60,
  },
  tabContent: {
    gap: 16,
    padding: 16,
  },
  section: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
    padding: 18,
  },
  sectionPopular: {
    borderColor: "#f59e0b",
    borderWidth: 2,
  },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  sectionHint: { color: palette.slate, fontSize: 13, marginTop: -8 },
  input: {
    backgroundColor: "#f8fafc",
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textarea: { minHeight: 100, textAlignVertical: "top" },
  chipScroll: { marginHorizontal: -2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 2 },
  chip: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  chipText: { color: palette.slate, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: palette.accentDeep, fontWeight: "800" },
  chipSmall: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipSmallText: { color: palette.slate, fontSize: 12, fontWeight: "600" },
  tagInputRow: { flexDirection: "row", gap: 8 },
  tagAddButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  tagList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  tagBadge: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagBadgeText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  switchInfo: { flex: 1, gap: 2 },
  switchLabel: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  switchHint: { color: palette.slate, fontSize: 12 },
  rowFields: { flexDirection: "row", gap: 12 },
  rowField: { flex: 1 },
  // Images
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imageThumb: {
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    height: 100,
    overflow: "hidden",
    width: 100,
  },
  imageThumbImg: { height: "100%", width: "100%" },
  mainBadge: {
    backgroundColor: palette.accentDeep,
    borderRadius: 6,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: "absolute",
    top: 4,
  },
  mainBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  imageRemove: {
    position: "absolute",
    right: 2,
    top: 2,
  },
  imageAddButton: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: palette.accentDeep,
    borderRadius: 14,
    borderStyle: "dashed",
    borderWidth: 2,
    gap: 4,
    height: 100,
    justifyContent: "center",
    width: 100,
  },
  imageAddText: { color: palette.accentDeep, fontSize: 12, fontWeight: "700" },
  // Tier header
  tierHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  popularBadge: {
    alignItems: "center",
    backgroundColor: "#fef3c7",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  popularBadgeText: { color: "#92400e", fontSize: 12, fontWeight: "700" },
  setPopularText: { color: palette.accentDeep, fontSize: 12, fontWeight: "700" },
  // Features
  featureRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  addFeatureButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  addFeatureText: { color: palette.accentDeep, fontSize: 13, fontWeight: "700" },
  // Availability
  daysRow: {
    flexDirection: "row",
    gap: 6,
  },
  dayChip: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    flex: 1,
    paddingVertical: 12,
  },
  dayChipActive: {
    backgroundColor: palette.accentDeep,
  },
  dayChipText: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
  },
  dayChipTextActive: {
    color: "#fff",
  },
  presetRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  presetText: { color: palette.accentDeep, fontSize: 13, fontWeight: "600" },
  presetDot: { color: palette.slate },
  tipsSection: {
    backgroundColor: "#f8fafc",
  },
  tipText: { color: palette.slate, fontSize: 13, lineHeight: 20 },
  // Footer
  footerSection: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  errorCard: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  submitButton: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 52,
  },
  submitButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  buttonDisabled: { opacity: 0.55 },
}));
