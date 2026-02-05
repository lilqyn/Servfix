import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardStats from "@/components/dashboard/DashboardStats";
import ServicesList from "@/components/dashboard/ServicesList";
import OrdersList from "@/components/dashboard/OrdersList";
import EarningsOverview from "@/components/dashboard/EarningsOverview";
import ProviderPayouts from "@/components/dashboard/ProviderPayouts";
import ProviderReviews from "@/components/dashboard/ProviderReviews";
import { Button } from "@/components/ui/button";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import CommunityPostComposer from "@/components/community/CommunityPostComposer";
import { usePublicSettings } from "@/hooks/usePublicSettings";

const ProviderDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { data: publicSettings } = usePublicSettings();
  const reviewsEnabled = publicSettings?.featureFlags.reviews ?? true;
  const communityEnabled = publicSettings?.featureFlags.community ?? true;

  const displayName = useMemo(() => {
    if (!user) {
      return "";
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

  const activeTab = useMemo(() => {
    const raw = location.pathname.replace("/dashboard", "");
    const segment = raw.split("/").filter(Boolean)[0] ?? "";
    const allowed = new Set([
      "overview",
      "services",
      "orders",
      "earnings",
      "payouts",
      ...(reviewsEnabled ? ["reviews"] : []),
    ]);
    if (!segment) {
      return "overview";
    }
    return allowed.has(segment) ? segment : "overview";
  }, [location.pathname, reviewsEnabled]);

  useEffect(() => {
    if (!reviewsEnabled && location.pathname.includes("/dashboard/reviews")) {
      navigate("/dashboard", { replace: true });
    }
  }, [location.pathname, navigate, reviewsEnabled]);

  const handleTabChange = (value: string) => {
    if (value === "overview") {
      navigate("/dashboard");
    } else {
      navigate(`/dashboard/${value}`);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar />
        
        <main className="flex-1 overflow-auto">
          {/* Top Header */}
          <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border/50 bg-background/95 backdrop-blur px-6 py-4">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <div>
                <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  {displayName ? `Welcome back, ${displayName}!` : "Welcome back!"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders, services..."
                  className="pl-9 w-[250px]"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => navigate("/notifications")}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </div>
          </header>

          {/* Dashboard Content */}
          <div className="p-6 space-y-6">
            <DashboardStats />

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="services">Services</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="earnings">Earnings</TabsTrigger>
                <TabsTrigger value="payouts">Payouts</TabsTrigger>
                {reviewsEnabled && <TabsTrigger value="reviews">Reviews</TabsTrigger>}
              </TabsList>

              <TabsContent value="overview" className="mt-6 space-y-6">
                {communityEnabled && (
                  <CommunityPostComposer
                    title="Post to the community"
                    description="Share updates or offers with buyers and other providers."
                  />
                )}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <OrdersList />
                  <ServicesList />
                </div>
              </TabsContent>

              <TabsContent value="services" className="mt-6">
                <ServicesList />
              </TabsContent>

              <TabsContent value="orders" className="mt-6">
                <OrdersList />
              </TabsContent>

              <TabsContent value="earnings" className="mt-6">
                <EarningsOverview />
              </TabsContent>

              <TabsContent value="payouts" className="mt-6">
                <ProviderPayouts />
              </TabsContent>

              {reviewsEnabled && (
                <TabsContent value="reviews" className="mt-6">
                  <ProviderReviews />
                </TabsContent>
              )}
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default ProviderDashboard;
