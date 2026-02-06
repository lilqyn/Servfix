import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchProviderPayouts,
  updateMyProfile,
  uploadProfileAvatar,
  uploadProfileBanner,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/components/ui/use-toast";
import { getRoleLabel, isProviderRole } from "@/lib/roles";

const PREFERENCES_KEY = "servfix-preferences";
const LEGACY_PREFERENCES_KEY = "serveghana-preferences";

type PreferencesState = {
  emailUpdates: boolean;
  smsUpdates: boolean;
  communityDigest: boolean;
};

const loadPreferences = (): PreferencesState => {
  if (typeof window === "undefined") {
    return { emailUpdates: true, smsUpdates: false, communityDigest: true };
  }
  const raw = localStorage.getItem(PREFERENCES_KEY) ?? localStorage.getItem(LEGACY_PREFERENCES_KEY);
  if (!raw) {
    return { emailUpdates: true, smsUpdates: false, communityDigest: true };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PreferencesState>;
    if (!localStorage.getItem(PREFERENCES_KEY)) {
      localStorage.setItem(PREFERENCES_KEY, raw);
      localStorage.removeItem(LEGACY_PREFERENCES_KEY);
    }
    return {
      emailUpdates: parsed.emailUpdates ?? true,
      smsUpdates: parsed.smsUpdates ?? false,
      communityDigest: parsed.communityDigest ?? true,
    };
  } catch {
    return { emailUpdates: true, smsUpdates: false, communityDigest: true };
  }
};

type AccountSettingsContentProps = {
  showHeader?: boolean;
};

const AccountSettingsContent = ({ showHeader = true }: AccountSettingsContentProps) => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const isProvider = isProviderRole(user?.role);
  const { data: payoutData, isLoading: isLoadingPayouts } = useQuery({
    queryKey: ["provider-payouts"],
    queryFn: fetchProviderPayouts,
    enabled: isProvider,
  });

  const providerProfile = user?.providerProfile as
    | {
        displayName?: string | null;
        bio?: string | null;
        location?: string | null;
        categories?: string[] | null;
        momoNumber?: string | null;
        momoNetwork?: string | null;
      }
    | null
    | undefined;

  const [form, setForm] = useState({
    displayName: providerProfile?.displayName ?? "",
    bio: providerProfile?.bio ?? "",
    location: providerProfile?.location ?? "",
    categories: providerProfile?.categories?.join(", ") ?? "",
    momoNumber: providerProfile?.momoNumber ?? "",
    momoNetwork: providerProfile?.momoNetwork ?? "",
    username: user?.username ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl ?? null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(user?.bannerUrl ?? null);
  const [preferences, setPreferences] = useState<PreferencesState>(() => loadPreferences());
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  useEffect(() => {
    setForm({
      displayName: providerProfile?.displayName ?? "",
      bio: providerProfile?.bio ?? "",
      location: providerProfile?.location ?? "",
      categories: providerProfile?.categories?.join(", ") ?? "",
      momoNumber: providerProfile?.momoNumber ?? "",
      momoNetwork: providerProfile?.momoNetwork ?? "",
      username: user?.username ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
    });
    setAvatarPreview(user?.avatarUrl ?? null);
    setBannerPreview(user?.bannerUrl ?? null);
  }, [providerProfile, user]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
      localStorage.removeItem(LEGACY_PREFERENCES_KEY);
    }
  }, [preferences]);

  const displayName = useMemo(() => {
    if (!user) {
      return "Account";
    }
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
  }, [providerProfile, user]);

  const initials = useMemo(() => {
    const tokens = displayName.split(" ").filter(Boolean);
    const first = tokens[0]?.[0] ?? displayName[0] ?? "A";
    const second = tokens[1]?.[0] ?? "";
    return `${first}${second}`.toUpperCase();
  }, [displayName]);

  const memberSince = useMemo(() => {
    if (!user?.createdAt) {
      return null;
    }
    const date = new Date(user.createdAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }, [user?.createdAt]);

  const formatMoney = (value: number, currency: "GHS" | "USD" | "EUR") =>
    new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    }).format(value);

  const payoutCurrency = payoutData?.wallet?.currency ?? "GHS";
  const availableBalance = payoutData?.wallet
    ? Number(payoutData.wallet.availableBalance || 0)
    : null;
  const pendingBalance = payoutData?.wallet
    ? Number(payoutData.wallet.pendingBalance || 0)
    : null;
  const recentPayouts = payoutData?.requests?.slice(0, 5) ?? [];

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      return;
    }

    if (isProvider && form.displayName.trim().length < 2) {
      toast("Display name should be at least 2 characters.");
      return;
    }

    const payload = {
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      username: form.username.trim(),
      ...(isProvider
        ? {
            displayName: form.displayName.trim(),
            bio: form.bio.trim(),
            location: form.location.trim(),
            categories: form.categories
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            momoNumber: form.momoNumber.trim() || undefined,
            momoNetwork: form.momoNetwork || undefined,
          }
        : {}),
    };

    setIsSaving(true);
    try {
      await updateMyProfile(payload);
      await refreshUser();
      toast("Account settings updated.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploadingAvatar(true);
    try {
      const upload = await uploadProfileAvatar(file);
      await updateMyProfile({ avatarKey: upload.key });
      await refreshUser();
      setAvatarPreview(upload.signedUrl ?? avatarPreview);
      toast("Profile photo updated.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to upload profile photo.");
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const handleBannerChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploadingBanner(true);
    try {
      const upload = await uploadProfileBanner(file);
      await updateMyProfile({ bannerKey: upload.key });
      await refreshUser();
      setBannerPreview(upload.signedUrl ?? bannerPreview);
      toast("Banner updated.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to upload banner.");
    } finally {
      setIsUploadingBanner(false);
      event.target.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploadingAvatar(true);
    try {
      await updateMyProfile({ avatarKey: "" });
      await refreshUser();
      setAvatarPreview(null);
      toast("Profile photo removed.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to remove profile photo.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveBanner = async () => {
    setIsUploadingBanner(true);
    try {
      await updateMyProfile({ bannerKey: "" });
      await refreshUser();
      setBannerPreview(null);
      toast("Banner removed.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to remove banner.");
    } finally {
      setIsUploadingBanner(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      {showHeader ? (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Account settings</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Manage your profile, contact details, notifications, and payout preferences.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">
                {getRoleLabel(user.role)}
                {memberSince ? ` - Member since ${memberSince}` : ""}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
        <aside className="hidden lg:block">
          <Card className="border-border/60">
            <CardContent className="p-4 space-y-2 text-sm">
              <button
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                onClick={() =>
                  document.getElementById("media-section")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Profile media
              </button>
              <button
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                onClick={() =>
                  document.getElementById("profile-section")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Profile details
              </button>
              <button
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                onClick={() =>
                  document.getElementById("contact-section")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Contact info
              </button>
              {isProvider ? (
                <button
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                  onClick={() =>
                    document.getElementById("payout-section")?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Payouts
                </button>
              ) : null}
              <button
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                onClick={() =>
                  document.getElementById("notifications-section")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Notifications
              </button>
              <button
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                onClick={() =>
                  document.getElementById("security-section")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Security
              </button>
              <button
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                onClick={() =>
                  navigate(`/profile/${user.username ? user.username : user.id}`)
                }
              >
                View profile
              </button>
              <button
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                onClick={() => navigate("/support")}
              >
                Help & support
              </button>
            </CardContent>
          </Card>
        </aside>

        <form className="space-y-6" onSubmit={handleSave}>
          <Card id="media-section" className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Profile media</h2>
                <p className="text-sm text-muted-foreground">
                  Upload a photo and banner so people recognize you.
                </p>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/60 bg-muted/20 overflow-hidden">
                  {bannerPreview ? (
                    <img
                      src={bannerPreview}
                      alt="Profile banner"
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                      No banner uploaded.
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Avatar className="h-20 w-20">
                    {avatarPreview ? <AvatarImage src={avatarPreview} alt="Profile avatar" /> : null}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="avatarUpload">Profile photo</Label>
                      <Input
                        id="avatarUpload"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        disabled={isUploadingAvatar}
                      />
                      <p className="text-xs text-muted-foreground">
                        Square image recommended. JPG, PNG, WebP, or HEIC/HEIF up to 10MB.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRemoveAvatar}
                        disabled={!avatarPreview || isUploadingAvatar}
                      >
                        Remove photo
                      </Button>
                      {isUploadingAvatar ? (
                        <span className="text-xs text-muted-foreground">Uploading...</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bannerUpload">Profile banner</Label>
                  <Input
                    id="bannerUpload"
                    type="file"
                    accept="image/*"
                    onChange={handleBannerChange}
                    disabled={isUploadingBanner}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveBanner}
                      disabled={!bannerPreview || isUploadingBanner}
                    >
                      Remove banner
                    </Button>
                    {isUploadingBanner ? (
                      <span className="text-xs text-muted-foreground">Uploading...</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card id="profile-section" className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Profile details</h2>
                <p className="text-sm text-muted-foreground">
                  Update how others see you in the community and search.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={form.username}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, username: event.target.value }))
                  }
                  placeholder="yourname"
                  autoComplete="username"
                />
                <p className="text-xs text-muted-foreground">
                  Use 3-20 characters with letters, numbers, or underscores.
                </p>
              </div>
              {isProvider ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display name</Label>
                    <Input
                      id="displayName"
                      value={form.displayName}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, displayName: event.target.value }))
                      }
                      placeholder="Your business or personal name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={form.bio}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, bio: event.target.value }))
                      }
                      placeholder="Tell clients what you specialize in"
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={form.location}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, location: event.target.value }))
                      }
                      placeholder="City or service area"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categories">Categories</Label>
                    <Input
                      id="categories"
                      value={form.categories}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, categories: event.target.value }))
                      }
                      placeholder="Plumbing, Electrical, Interior design"
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate categories with commas.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  More profile details for buyers are coming soon.
                </p>
              )}
            </CardContent>
          </Card>

          <Card id="contact-section" className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Contact info</h2>
                <p className="text-sm text-muted-foreground">
                  Keep your email and phone up to date for order updates.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder="name@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                    placeholder="+233 ..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {isProvider && (
            <Card id="payout-section" className="border-border/60">
              <CardContent className="p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Payouts</h2>
                  <p className="text-sm text-muted-foreground">
                    Set where you receive provider payouts.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="momoNumber">Mobile money number</Label>
                  <Input
                    id="momoNumber"
                    value={form.momoNumber}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, momoNumber: event.target.value }))
                    }
                    placeholder="+233 20 000 0000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use the number registered with your MoMo account.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="momoNetwork">Mobile money network</Label>
                  <Select
                    value={form.momoNetwork || ""}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, momoNetwork: value }))}
                  >
                    <SelectTrigger id="momoNetwork">
                      <SelectValue placeholder="Select network" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mtn">MTN</SelectItem>
                      <SelectItem value="vodafone">Vodafone</SelectItem>
                      <SelectItem value="airteltigo">AirtelTigo</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Needed to send MoMo payouts correctly.
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
                  <div className="text-sm font-semibold text-foreground">Payout summary</div>
                  {isLoadingPayouts ? (
                    <div className="text-xs text-muted-foreground">Loading payout balances...</div>
                  ) : (
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Available</span>
                        <span className="font-medium">
                          {formatMoney(availableBalance ?? 0, payoutCurrency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Pending</span>
                        <span className="font-medium">
                          {formatMoney(pendingBalance ?? 0, payoutCurrency)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Recent payouts</span>
                    <span className="text-xs text-muted-foreground">Last 5 requests</span>
                  </div>
                  {isLoadingPayouts ? (
                    <div className="text-xs text-muted-foreground">Loading payout requests...</div>
                  ) : recentPayouts.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No payout requests yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {recentPayouts.map((request) => {
                        const createdAt = new Date(request.createdAt);
                        const dateLabel = Number.isNaN(createdAt.getTime())
                          ? ""
                          : createdAt.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            });
                        return (
                          <div
                            key={request.id}
                            className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
                          >
                            <div>
                              <div className="font-medium text-foreground">
                                {formatMoney(Number(request.amount), request.currency)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {request.status.replace("_", " ")}
                                {dateLabel ? ` · ${dateLabel}` : ""}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {request.momoNetwork?.toUpperCase() ?? ""} {request.destinationMomo}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card id="notifications-section" className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
                <p className="text-sm text-muted-foreground">
                  Choose how you want to receive updates.
                </p>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">In-app notifications</p>
                    <p className="text-xs text-muted-foreground">Required for messages and orders.</p>
                  </div>
                  <Switch checked disabled />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Email updates</p>
                    <p className="text-xs text-muted-foreground">Order status and reminders.</p>
                  </div>
                  <Switch
                    checked={preferences.emailUpdates}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, emailUpdates: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">SMS alerts</p>
                    <p className="text-xs text-muted-foreground">Critical order updates only.</p>
                  </div>
                  <Switch
                    checked={preferences.smsUpdates}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, smsUpdates: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Community digest</p>
                    <p className="text-xs text-muted-foreground">Weekly highlights.</p>
                  </div>
                  <Switch
                    checked={preferences.communityDigest}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, communityDigest: checked }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card id="security-section" className="border-border/60">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Security</h2>
                <p className="text-sm text-muted-foreground">
                  Manage your password and account safety.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast("Password reset is not available yet.")}
                >
                  Request password reset
                </Button>
                <span className="text-xs text-muted-foreground">
                  We will add secure password updates soon.
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AccountSettingsContent;
