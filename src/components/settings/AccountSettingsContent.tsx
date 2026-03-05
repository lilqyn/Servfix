import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/useAuth";
import {
  approveOrderCompletion,
  createOrderPaymentCheckout,
  fetchOrderProgressReports,
  fetchOrderPayments,
  fetchMyAccountDeletionRequest,
  fetchOrders,
  fetchProviderPayouts,
  openOrderDispute,
  requestMyAccountDeletion,
  type ApiOrder,
  type OrderProgressReport,
  uploadDisputeImage,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { getRoleLabel, isProviderRole } from "@/lib/roles";
import { formatCurrencyAmount, type CurrencyCode } from "@/lib/currency";
import { usePublicSettings } from "@/hooks/usePublicSettings";

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

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const isSupportedDisputeImage = (file: File) => {
  if (SUPPORTED_DISPUTE_IMAGE_TYPES.includes(file.type)) {
    return true;
  }
  const name = file.name.toLowerCase();
  return SUPPORTED_DISPUTE_IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
};

const BUYER_REVIEW_STATUSES: ApiOrder["status"][] = [
  "delivery_submitted",
  "delivered",
  "dispute_open",
  "disputed",
];
const MAX_DISPUTE_EVIDENCE = 8;
const MAX_DISPUTE_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_DISPUTE_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const SUPPORTED_DISPUTE_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

type DisputeEvidenceDraft = {
  key: string;
  url: string;
};

type AccountSettingsContentProps = {
  showHeader?: boolean;
};

const AccountSettingsContent = ({ showHeader = true }: AccountSettingsContentProps) => {
  const navigate = useNavigate();
  const { user, refreshUser, signOut } = useAuth();
  const isProvider = isProviderRole(user?.role);
  const isBuyer = user?.role === "buyer";
  const { data: publicSettings } = usePublicSettings();
  const { data: payoutData, isLoading: isLoadingPayouts } = useQuery({
    queryKey: ["provider-payouts"],
    queryFn: fetchProviderPayouts,
    enabled: isProvider,
  });
  const {
    data: buyerOrders = [],
    isLoading: isLoadingBuyerOrders,
    error: buyerOrdersError,
    refetch: refetchBuyerOrders,
  } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    enabled: isBuyer,
  });
  const {
    data: accountDeletionRequestData,
    isLoading: isLoadingAccountDeletionRequest,
    refetch: refetchAccountDeletionRequest,
  } = useQuery({
    queryKey: ["account-deletion-request"],
    queryFn: fetchMyAccountDeletionRequest,
    enabled: Boolean(user),
  });
  const paymentConfig = publicSettings?.payments;
  const enabledProviders =
    paymentConfig?.enabledProviders ?? [
      "flutterwave",
      "stripe",
      "paystack",
      "hubtel",
      "expresspay",
    ];
  const defaultProvider = paymentConfig?.defaultProvider ?? "flutterwave";
  const paymentProvider = enabledProviders.length
    ? enabledProviders.includes(defaultProvider)
      ? defaultProvider
      : enabledProviders[0]
    : "flutterwave";
  const paymentMethod = paymentProvider === "stripe" ? "card" : "mobile_money";

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
  const profileLocation = isProvider
    ? providerProfile?.location ?? ""
    : user?.location ?? "";

  const [form, setForm] = useState({
    displayName: providerProfile?.displayName ?? "",
    bio: providerProfile?.bio ?? "",
    location: profileLocation,
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
  const [payingOrderPaymentId, setPayingOrderPaymentId] = useState<string | null>(null);
  const [isDisputeDialogOpen, setIsDisputeDialogOpen] = useState(false);
  const [selectedDisputeOrder, setSelectedDisputeOrder] = useState<ApiOrder | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDetails, setDisputeDetails] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState<DisputeEvidenceDraft[]>([]);
  const [isUploadingDisputeEvidence, setIsUploadingDisputeEvidence] = useState(false);
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);
  const [expandedProgressOrderIds, setExpandedProgressOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const disputeEvidenceInputRef = useRef<HTMLInputElement>(null);

  const buyerReviewOrders = useMemo(() => {
    if (!isBuyer) {
      return [];
    }
    return buyerOrders.filter((order) => BUYER_REVIEW_STATUSES.includes(order.status));
  }, [buyerOrders, isBuyer]);

  const buyerOrdersWithPartialPayments = useMemo(() => {
    if (!isBuyer) {
      return [];
    }
    return buyerOrders.filter((order) => {
      const gross = toNumber(order.amountGross);
      const paid = toNumber(order.amountPaid);
      return paid > 0 && paid < gross;
    });
  }, [buyerOrders, isBuyer]);

  const buyerOrderPaymentQueries = useQueries({
    queries: buyerOrdersWithPartialPayments.map((order) => ({
      queryKey: ["order-payments", order.id],
      queryFn: () => fetchOrderPayments(order.id),
      enabled: isBuyer,
      staleTime: 15_000,
    })),
  });

  const buyerProgressReportQueries = useQueries({
    queries: buyerReviewOrders.map((order) => ({
      queryKey: ["order-progress-reports", order.id],
      queryFn: () => fetchOrderProgressReports(order.id),
      enabled: isBuyer,
      staleTime: 15_000,
    })),
  });

  const buyerProgressReportsByOrderId = useMemo(() => {
    const map = new Map<string, OrderProgressReport[]>();
    buyerReviewOrders.forEach((order, index) => {
      const reports = buyerProgressReportQueries[index]?.data ?? [];
      map.set(order.id, reports);
    });
    return map;
  }, [buyerProgressReportQueries, buyerReviewOrders]);

  const buyerBalanceDueItems = useMemo(() => {
    return buyerOrdersWithPartialPayments.flatMap((order, index) => {
      const pendingBalancePayment = buyerOrderPaymentQueries[index]?.data?.find(
        (payment) => payment.stage === "balance" && payment.status === "pending",
      );
      if (!pendingBalancePayment) {
        return [];
      }
      return [
        {
          orderId: order.id,
          serviceTitle: order.service?.title ?? "Service",
          orderUpdatedAt: order.updatedAt,
          paymentId: pendingBalancePayment.id,
          amount: toNumber(pendingBalancePayment.amount),
          currency: pendingBalancePayment.currency,
        },
      ];
    });
  }, [buyerOrderPaymentQueries, buyerOrdersWithPartialPayments]);

  const isLoadingBuyerBalanceDue =
    isBuyer &&
    (isLoadingBuyerOrders || buyerOrderPaymentQueries.some((query) => query.isLoading));
  const buyerBalanceDueError =
    buyerOrdersError ?? buyerOrderPaymentQueries.find((query) => query.error)?.error;

  useEffect(() => {
    setForm({
      displayName: providerProfile?.displayName ?? "",
      bio: providerProfile?.bio ?? "",
      location: isProvider ? providerProfile?.location ?? "" : user?.location ?? "",
      categories: providerProfile?.categories?.join(", ") ?? "",
      momoNumber: providerProfile?.momoNumber ?? "",
      momoNetwork: providerProfile?.momoNetwork ?? "",
      username: user?.username ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
    });
    setAvatarPreview(user?.avatarUrl ?? null);
    setBannerPreview(user?.bannerUrl ?? null);
  }, [isProvider, providerProfile, user]);

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

  const accountDeletionRequest = accountDeletionRequestData?.request ?? null;
  const supportsSelfDeletion = user?.role === "buyer" || user?.role === "provider";
  const isDeletionPending = accountDeletionRequest?.status === "pending";

  const formatMoney = (value: number, currency: CurrencyCode) =>
    formatCurrencyAmount(value, currency, {
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    });
  const formatMoneyExact = (value: number, currency: CurrencyCode) =>
    formatCurrencyAmount(value, currency, {
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const payoutCurrency = payoutData?.earnings?.currency ?? "GHS";
  const payableAmount = payoutData?.earnings
    ? Number(payoutData.earnings.payable || 0)
    : null;
  const pendingReleaseAmount = payoutData?.earnings
    ? Number(payoutData.earnings.pending_release || 0)
    : null;
  const recentPayouts = payoutData?.disbursement_requests?.slice(0, 5) ?? [];

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
      location: form.location.trim() || undefined,
      ...(isProvider
        ? {
            displayName: form.displayName.trim(),
            bio: form.bio.trim(),
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

  const closeDeletionDialog = () => {
    setIsDeleteDialogOpen(false);
    setDeletionReason("");
    setDeleteConfirmationText("");
  };

  const handleAccountDeletion = async () => {
    if (!user || !supportsSelfDeletion) {
      return;
    }

    if (user.role === "buyer" && deleteConfirmationText.trim().toUpperCase() !== "DELETE") {
      toast('Type "DELETE" to confirm account deletion.');
      return;
    }

    setIsSubmittingDeletion(true);
    try {
      const response = await requestMyAccountDeletion(deletionReason.trim() || undefined);

      if (response.status === "deleted") {
        toast("Account deleted.");
        closeDeletionDialog();
        signOut();
        navigate("/");
        return;
      }

      toast("Deletion request submitted for admin approval.");
      closeDeletionDialog();
      await refetchAccountDeletionRequest();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to process account deletion.");
    } finally {
      setIsSubmittingDeletion(false);
    }
  };

  const handlePayBalance = async (orderPaymentId: string) => {
    if (enabledProviders.length === 0) {
      toast("No payment providers are currently available.");
      return;
    }
    setPayingOrderPaymentId(orderPaymentId);
    try {
      const checkout = await createOrderPaymentCheckout({
        orderPaymentId,
        provider: paymentProvider,
        method: paymentMethod,
      });
      window.location.href = checkout.checkoutUrl;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to start payable amount payment.");
    } finally {
      setPayingOrderPaymentId(null);
    }
  };

  const handleDisputeEvidenceSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      return;
    }

    const remainingSlots = Math.max(0, MAX_DISPUTE_EVIDENCE - disputeEvidence.length);
    if (remainingSlots === 0) {
      toast(`You can upload up to ${MAX_DISPUTE_EVIDENCE} photos.`);
      event.target.value = "";
      return;
    }

    const fileList = Array.from(files).slice(0, remainingSlots);
    setIsUploadingDisputeEvidence(true);

    try {
      const uploaded: DisputeEvidenceDraft[] = [];

      for (const file of fileList) {
        if (!isSupportedDisputeImage(file)) {
          toast("Only JPG, PNG, WebP, or HEIC/HEIF images are supported.");
          continue;
        }

        if (file.size > MAX_DISPUTE_IMAGE_BYTES) {
          toast("Each evidence photo must be 10MB or less.");
          continue;
        }

        try {
          const result = await uploadDisputeImage(file);
          const evidenceUrl = result.signedUrl;

          if (!evidenceUrl) {
            toast("Unable to attach image evidence right now.");
            continue;
          }

          uploaded.push({
            key: result.key,
            url: evidenceUrl,
          });
        } catch (error) {
          toast(error instanceof Error ? error.message : "Unable to upload evidence photo.");
        }
      }

      if (uploaded.length > 0) {
        setDisputeEvidence((prev) => [...prev, ...uploaded]);
      }
    } finally {
      setIsUploadingDisputeEvidence(false);
      event.target.value = "";
    }
  };

  const removeDisputeEvidence = (index: number) => {
    setDisputeEvidence((prev) => prev.filter((_, i) => i !== index));
  };

  const canOpenDispute = (order: ApiOrder) => {
    if (!["delivery_submitted", "delivered"].includes(order.status)) {
      return false;
    }
    if (!order.reviewDeadlineAt) {
      return false;
    }
    const deadline = new Date(order.reviewDeadlineAt);
    return !Number.isNaN(deadline.getTime()) && deadline.getTime() > Date.now();
  };

  const canApproveCompletion = (order: ApiOrder) =>
    ["delivery_submitted", "delivered"].includes(order.status);

  const closeDisputeDialog = () => {
    if (isSubmittingDispute || isUploadingDisputeEvidence) {
      return;
    }
    setIsDisputeDialogOpen(false);
    setSelectedDisputeOrder(null);
    setDisputeReason("");
    setDisputeDetails("");
    setDisputeEvidence([]);
    if (disputeEvidenceInputRef.current) {
      disputeEvidenceInputRef.current.value = "";
    }
  };

  const startDispute = (order: ApiOrder) => {
    setSelectedDisputeOrder(order);
    setDisputeReason("");
    setDisputeDetails("");
    setDisputeEvidence([]);
    if (disputeEvidenceInputRef.current) {
      disputeEvidenceInputRef.current.value = "";
    }
    setIsDisputeDialogOpen(true);
  };

  const approveCompletion = async (orderId: string) => {
    setApprovingOrderId(orderId);
    try {
      await approveOrderCompletion(orderId);
      toast("Order completion accepted. Earnings are now payable.");
      await refetchBuyerOrders();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to approve completion.");
    } finally {
      setApprovingOrderId(null);
    }
  };

  const toggleProgressTimeline = (orderId: string) => {
    setExpandedProgressOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const submitDispute = async () => {
    if (!selectedDisputeOrder) {
      return;
    }

    const reason = disputeReason.trim();
    const details = disputeDetails.trim();
    if (reason.length < 5) {
      toast("Please provide a dispute reason of at least 5 characters.");
      return;
    }

    setIsSubmittingDispute(true);
    try {
      await openOrderDispute(selectedDisputeOrder.id, {
        reason,
        details: details || undefined,
        evidence: disputeEvidence.length > 0 ? disputeEvidence.map((item) => item.url) : undefined,
      });
      toast("Dispute opened. Our team will review and follow up.");
      setIsDisputeDialogOpen(false);
      setSelectedDisputeOrder(null);
      setDisputeReason("");
      setDisputeDetails("");
      setDisputeEvidence([]);
      if (disputeEvidenceInputRef.current) {
        disputeEvidenceInputRef.current.value = "";
      }
      await refetchBuyerOrders();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to open dispute.");
    } finally {
      setIsSubmittingDispute(false);
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
              Manage your profile, contact details, notifications, and disbursement preferences.
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
              {isBuyer ? (
                <button
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                  onClick={() =>
                    document.getElementById("order-reviews-section")?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Order reviews
                </button>
              ) : null}
              {isBuyer ? (
                <button
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                  onClick={() =>
                    document.getElementById("payments-section")?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Payments due
                </button>
              ) : null}
              {isProvider ? (
                <button
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted"
                  onClick={() =>
                    document.getElementById("payout-section")?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Disbursements
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
                  <p className="text-xs text-muted-foreground">
                    We use your location to show nearby providers first.
                  </p>
                </div>
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

          {isBuyer ? (
            <>
              <Card id="order-reviews-section" className="border-border/60">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Order reviews & disputes</h2>
                    <p className="text-sm text-muted-foreground">
                      Open a dispute during the buyer review window if delivered work does not match expectations.
                    </p>
                  </div>
                  {isLoadingBuyerOrders ? (
                    <div className="text-sm text-muted-foreground">Loading order reviews...</div>
                  ) : buyerOrdersError ? (
                    <div className="text-sm text-destructive">
                      {buyerOrdersError instanceof Error
                        ? buyerOrdersError.message
                        : "Unable to load buyer order reviews."}
                    </div>
                  ) : buyerReviewOrders.length === 0 ? (
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                      No orders are currently in buyer review.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {buyerReviewOrders.map((order, index) => {
                        const reviewDeadline = order.reviewDeadlineAt
                          ? new Date(order.reviewDeadlineAt)
                          : null;
                        const hasReviewDeadline = Boolean(
                          reviewDeadline && !Number.isNaN(reviewDeadline.getTime()),
                        );
                        const reviewDeadlineLabel = hasReviewDeadline
                          ? reviewDeadline.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Unavailable";
                        const canApprove = canApproveCompletion(order);
                        const disputeAllowed = canOpenDispute(order);
                        const statusLabel = order.status.replace(/_/g, " ");
                        const isApproving = approvingOrderId === order.id;
                        const progressQuery = buyerProgressReportQueries[index];
                        const isLoadingProgress = Boolean(progressQuery?.isLoading);
                        const reports = buyerProgressReportsByOrderId.get(order.id) ?? [];
                        const isProgressExpanded = expandedProgressOrderIds.has(order.id);
                        const latestReport = reports[0] ?? null;
                        const latestReportDate = latestReport?.createdAt
                          ? new Date(latestReport.createdAt)
                          : null;
                        const latestReportDateLabel =
                          latestReportDate && !Number.isNaN(latestReportDate.getTime())
                            ? latestReportDate.toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : "Unknown";

                        return (
                          <div
                            key={order.id}
                            className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 space-y-2">
                              <p className="text-sm font-medium text-foreground">
                                {order.service?.title ?? "Service"}
                              </p>
                              <p className="text-xs text-muted-foreground capitalize">
                                Status: {statusLabel}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Review deadline: {reviewDeadlineLabel}
                              </p>
                              {isLoadingProgress ? (
                                <p className="text-xs text-muted-foreground">Loading progress updates...</p>
                              ) : latestReport ? (
                                <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground">
                                  <p className="font-medium text-foreground">
                                    Latest progress: {latestReport.title}
                                  </p>
                                  <p>
                                    {latestReport.percentComplete}% complete - {latestReportDateLabel}
                                  </p>
                                  {latestReport.body ? (
                                    <p className="mt-1 break-words">{latestReport.body}</p>
                                  ) : null}
                                  {reports.length > 1 ? (
                                    <button
                                      type="button"
                                      className="mt-1 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                                      onClick={() => toggleProgressTimeline(order.id)}
                                    >
                                      {isProgressExpanded
                                        ? "Hide full progress"
                                        : `View all updates (${reports.length})`}
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No progress updates yet.</p>
                              )}
                              {isProgressExpanded && reports.length > 1 ? (
                                <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground">
                                  <p className="mb-1 font-medium text-foreground">Progress timeline</p>
                                  <div className="space-y-2">
                                    {reports.map((report) => {
                                      const reportDate = new Date(report.createdAt);
                                      const reportDateLabel = Number.isNaN(reportDate.getTime())
                                        ? "Unknown"
                                        : reportDate.toLocaleString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                            hour: "numeric",
                                            minute: "2-digit",
                                          });

                                      return (
                                        <div
                                          key={report.id}
                                          className="rounded border border-border/60 bg-background/70 p-2"
                                        >
                                          <p className="font-medium text-foreground">{report.title}</p>
                                          <p>
                                            {report.percentComplete}% complete - {reportDateLabel}
                                          </p>
                                          {report.body ? (
                                            <p className="mt-1 break-words">{report.body}</p>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            {["dispute_open", "disputed"].includes(order.status) ? (
                              <span className="text-xs text-muted-foreground">Dispute in review</span>
                            ) : canApprove || disputeAllowed ? (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {canApprove ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="gold"
                                    disabled={isApproving}
                                    onClick={() => void approveCompletion(order.id)}
                                  >
                                    {isApproving ? "Accepting..." : "Accept completion"}
                                  </Button>
                                ) : null}
                                {disputeAllowed ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isApproving}
                                    onClick={() => startDispute(order)}
                                  >
                                    Open dispute
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Review window closed</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Review window closed</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card id="payments-section" className="border-border/60">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Payments due</h2>
                    <p className="text-sm text-muted-foreground">
                      When a provider requests your remaining payable amount, it appears here with the exact
                      amount.
                    </p>
                  </div>
                  {isLoadingBuyerBalanceDue ? (
                    <div className="text-sm text-muted-foreground">Checking outstanding payable amounts...</div>
                  ) : buyerBalanceDueError ? (
                    <div className="text-sm text-destructive">
                      {buyerBalanceDueError instanceof Error
                        ? buyerBalanceDueError.message
                        : "Unable to load payable amount payments."}
                    </div>
                  ) : buyerBalanceDueItems.length === 0 ? (
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                      No payable amount payments are due right now.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {buyerBalanceDueItems.map((item) => {
                        const updatedAt = new Date(item.orderUpdatedAt);
                        const dateLabel = Number.isNaN(updatedAt.getTime())
                          ? null
                          : updatedAt.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            });
                        const isPaying = payingOrderPaymentId === item.paymentId;
                        return (
                          <div
                            key={item.paymentId}
                            className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">{item.serviceTitle}</p>
                              <p className="text-xs text-muted-foreground">
                                Remaining payable amount: {formatMoneyExact(item.amount, item.currency)}
                              </p>
                              {dateLabel ? (
                                <p className="text-xs text-muted-foreground">Updated {dateLabel}</p>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="gold"
                              disabled={isPaying}
                              onClick={() => void handlePayBalance(item.paymentId)}
                            >
                              {isPaying ? "Starting checkout..." : "Pay amount"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}

          {isProvider && (
            <Card id="payout-section" className="border-border/60">
              <CardContent className="p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Disbursements</h2>
                  <p className="text-sm text-muted-foreground">
                    Set where you receive provider disbursements.
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
                    Needed to send MoMo disbursements correctly.
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
                  <div className="text-sm font-semibold text-foreground">Earnings ledger summary</div>
                  {isLoadingPayouts ? (
                    <div className="text-xs text-muted-foreground">Loading earnings ledger...</div>
                  ) : (
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Payable amount</span>
                        <span className="font-medium">
                          {formatMoney(payableAmount ?? 0, payoutCurrency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Pending release</span>
                        <span className="font-medium">
                          {formatMoney(pendingReleaseAmount ?? 0, payoutCurrency)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Recent disbursements</span>
                    <span className="text-xs text-muted-foreground">Last 5 requests</span>
                  </div>
                  {isLoadingPayouts ? (
                    <div className="text-xs text-muted-foreground">Loading disbursement requests...</div>
                  ) : recentPayouts.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No disbursement requests yet.</div>
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
                  onClick={() => navigate("/forgot-password")}
                >
                  Request password reset
                </Button>
                <span className="text-xs text-muted-foreground">
                  We will add secure password updates soon.
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Danger zone</h2>
                <p className="text-sm text-muted-foreground">
                  Account deletion is permanent and cannot be undone.
                </p>
              </div>

              {isLoadingAccountDeletionRequest ? (
                <p className="text-sm text-muted-foreground">Checking account deletion status...</p>
              ) : isDeletionPending ? (
                <div className="space-y-2 rounded-lg border border-border/60 bg-background/70 p-4 text-sm">
                  <p className="font-medium text-foreground">
                    Your deletion request is pending admin approval.
                  </p>
                  <p className="text-muted-foreground">
                    Requested:{" "}
                    {accountDeletionRequest?.requestedAt
                      ? new Date(accountDeletionRequest.requestedAt).toLocaleString()
                      : "-"}
                  </p>
                  {accountDeletionRequest?.reason && (
                    <p className="text-muted-foreground">Reason: {accountDeletionRequest.reason}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {user?.role === "buyer"
                    ? "Buyers can delete immediately only when there are no active orders or deposits."
                    : user?.role === "provider"
                      ? "Provider deletion requires admin approval after eligibility checks."
                      : "Self-service deletion is available for buyer and provider accounts only."}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!supportsSelfDeletion || isDeletionPending}
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  {user?.role === "provider" ? "Request account deletion" : "Delete account"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>

        <Dialog
          open={isDeleteDialogOpen}
          onOpenChange={(open) => {
            if (open) {
              setIsDeleteDialogOpen(true);
              return;
            }
            closeDeletionDialog();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {user?.role === "provider" ? "Request account deletion" : "Delete account"}
              </DialogTitle>
              <DialogDescription>
                {user?.role === "provider"
                  ? "Your request will be reviewed by admin before deletion."
                  : "This action permanently removes your access."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {user?.role === "buyer" && (
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm-text">Type DELETE to confirm</Label>
                  <Input
                    id="delete-confirm-text"
                    value={deleteConfirmationText}
                    onChange={(event) => setDeleteConfirmationText(event.target.value)}
                    placeholder="DELETE"
                    disabled={isSubmittingDeletion}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="delete-reason">
                  {user?.role === "provider" ? "Reason for deletion request (optional)" : "Reason (optional)"}
                </Label>
                <Textarea
                  id="delete-reason"
                  value={deletionReason}
                  onChange={(event) => setDeletionReason(event.target.value)}
                  placeholder="Tell us why you want to delete this account"
                  maxLength={500}
                  rows={4}
                  disabled={isSubmittingDeletion}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={closeDeletionDialog} disabled={isSubmittingDeletion}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  void handleAccountDeletion();
                }}
                disabled={isSubmittingDeletion}
              >
                {isSubmittingDeletion
                  ? "Submitting..."
                  : user?.role === "provider"
                    ? "Submit request"
                    : "Delete now"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isDisputeDialogOpen}
          onOpenChange={(open) => {
            if (open) {
              setIsDisputeDialogOpen(true);
              return;
            }
            closeDisputeDialog();
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Open dispute</DialogTitle>
              <DialogDescription>
                Share what went wrong and our support team will investigate the order.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Order: {selectedDisputeOrder?.service?.title ?? "Service"}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dispute-reason">Reason</Label>
                <Input
                  id="dispute-reason"
                  value={disputeReason}
                  onChange={(event) => setDisputeReason(event.target.value)}
                  placeholder="Brief summary of the issue"
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dispute-details">Details (optional)</Label>
                <Textarea
                  id="dispute-details"
                  value={disputeDetails}
                  onChange={(event) => setDisputeDetails(event.target.value)}
                  placeholder="Add more context so the team can review quickly"
                  maxLength={2000}
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dispute-evidence">Evidence photos (optional)</Label>
                <input
                  ref={disputeEvidenceInputRef}
                  id="dispute-evidence"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
                  multiple
                  className="hidden"
                  onChange={handleDisputeEvidenceSelect}
                  disabled={isUploadingDisputeEvidence || isSubmittingDispute}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => disputeEvidenceInputRef.current?.click()}
                    disabled={
                      isUploadingDisputeEvidence ||
                      isSubmittingDispute ||
                      disputeEvidence.length >= MAX_DISPUTE_EVIDENCE
                    }
                  >
                    {isUploadingDisputeEvidence ? "Uploading..." : "Upload photos"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {disputeEvidence.length}/{MAX_DISPUTE_EVIDENCE}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, WebP, or HEIC/HEIF. Max 10MB per photo.
                </p>
                {disputeEvidence.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {disputeEvidence.map((item, index) => (
                      <div key={`${item.key}-${index}`} className="space-y-1">
                        <img
                          src={item.url}
                          alt={`Evidence ${index + 1}`}
                          className="h-20 w-full rounded-md border border-border/60 object-cover"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => removeDisputeEvidence(index)}
                          disabled={isSubmittingDispute || isUploadingDisputeEvidence}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDisputeDialog}
                disabled={isSubmittingDispute || isUploadingDisputeEvidence}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitDispute}
                disabled={isSubmittingDispute || isUploadingDisputeEvidence}
              >
                {isSubmittingDispute ? "Submitting..." : "Submit dispute"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AccountSettingsContent;
