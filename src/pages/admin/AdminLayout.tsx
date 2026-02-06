import { useMemo } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { getRoleLabel } from "@/lib/roles";
import {
  countUnreadNotifications,
  filterNotificationsForRole,
  shouldUseServerUnreadCount,
} from "@/lib/notifications";
import { hasPermission, type Permission } from "@/lib/permissions";
import {
  fetchAdminNavigation,
  type AdminPageKey,
  type BusinessFunctionKey,
  type FeatureFlags,
} from "@/lib/api";

const ADMIN_PAGE_PATHS: Record<AdminPageKey, string> = {
  overview: "/admin",
  users: "/admin/users",
  providers: "/admin/providers",
  services: "/admin/services",
  orders: "/admin/orders",
  disputes: "/admin/disputes",
  reviews: "/admin/reviews",
  community: "/admin/community",
  reports: "/admin/reports",
  support: "/admin/support",
  payouts: "/admin/payouts",
  analytics: "/admin/analytics",
  home: "/admin/home",
  settings: "/admin/settings",
};

const ADMIN_PAGE_REQUIREMENTS: Record<
  AdminPageKey,
  { permission: Permission; functionKey?: BusinessFunctionKey; featureKey?: keyof FeatureFlags }
> = {
  overview: { permission: "admin.access" },
  users: { permission: "users.read", functionKey: "human_resources" },
  providers: { permission: "providers.read" },
  services: { permission: "services.read" },
  orders: { permission: "orders.read" },
  disputes: { permission: "orders.read", functionKey: "customer_service" },
  reviews: {
    permission: "reviews.read",
    functionKey: "customer_service",
    featureKey: "reviews",
  },
  community: {
    permission: "community.read",
    functionKey: "customer_service",
    featureKey: "community",
  },
  reports: { permission: "reports.read", functionKey: "customer_service" },
  support: { permission: "support.read", functionKey: "customer_service" },
  payouts: { permission: "payouts.read", functionKey: "finance" },
  analytics: { permission: "analytics.read", functionKey: "accounting" },
  home: { permission: "settings.read" },
  settings: { permission: "settings.read" },
};

const ADMIN_PAGE_ORDER: AdminPageKey[] = [
  "overview",
  "users",
  "providers",
  "services",
  "orders",
  "disputes",
  "reviews",
  "community",
  "reports",
  "support",
  "payouts",
  "analytics",
  "home",
  "settings",
];

const getAdminPageKeyFromPath = (pathname: string): AdminPageKey | null => {
  if (!pathname.startsWith("/admin")) return null;
  const trimmed = pathname.replace(/^\/admin\/?/, "");
  if (!trimmed) return "overview";
  const segment = trimmed.split("/")[0];
  switch (segment) {
    case "users":
      return "users";
    case "providers":
      return "providers";
    case "services":
      return "services";
    case "orders":
      return "orders";
    case "disputes":
      return "disputes";
    case "reviews":
      return "reviews";
    case "community":
      return "community";
    case "reports":
      return "reports";
    case "support":
      return "support";
    case "payouts":
      return "payouts";
    case "analytics":
      return "analytics";
    case "home":
      return "home";
    case "settings":
      return "settings";
    case "overview":
      return "overview";
    default:
      return null;
  }
};

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { notifications, unreadCount } = useNotifications();

  const { data: navigationData, isLoading: isNavLoading } = useQuery({
    queryKey: ["admin-navigation"],
    queryFn: fetchAdminNavigation,
    enabled: Boolean(user),
  });

  const displayName = useMemo(() => {
    if (!user) {
      return "";
    }
    const providerProfile = user.providerProfile as { displayName?: string | null } | null | undefined;
    return (
      providerProfile?.displayName ??
      user.username ??
      user.email ??
      user.phone ??
      "Admin"
    );
  }, [user]);

  const pageKey = getAdminPageKeyFromPath(location.pathname);
  const role = user?.role ?? null;
  const businessFunctions = navigationData?.businessFunctions;
  const featureFlags = navigationData?.featureFlags;
  const adminAccess = navigationData?.adminAccess;
  const filteredNotifications = useMemo(
    () => filterNotificationsForRole(notifications, role),
    [notifications, role],
  );

  const displayUnreadCount = useMemo(() => {
    if (shouldUseServerUnreadCount(role)) {
      return unreadCount;
    }
    return countUnreadNotifications(filteredNotifications);
  }, [filteredNotifications, unreadCount, role]);

  const canAccessPage = (key: AdminPageKey) => {
    if (!role) return false;
    const requirements = ADMIN_PAGE_REQUIREMENTS[key];
    if (!hasPermission(role, requirements.permission)) return false;

    if (requirements.functionKey && businessFunctions) {
      const config = businessFunctions[requirements.functionKey];
      if (!config?.enabled || !config.roles.includes(role)) return false;
    }

    if (requirements.featureKey && featureFlags) {
      if (!featureFlags[requirements.featureKey]) return false;
    }

    if (adminAccess) {
      const roles = adminAccess[key] ?? [];
      if (!roles.includes(role)) return false;
    }

    return true;
  };

  const allowedPages = ADMIN_PAGE_ORDER.filter((key) => canAccessPage(key));
  const fallbackPath = allowedPages.length > 0 ? ADMIN_PAGE_PATHS[allowedPages[0]] : null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar />

        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border/50 bg-background/95 backdrop-blur px-6 py-4">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <div>
                <h1 className="text-xl font-bold text-foreground">Admin Panel</h1>
                <p className="text-sm text-muted-foreground">
                  {displayName ? `Signed in as ${displayName}` : "Administrative access"}
                  {user?.role ? ` - ${getRoleLabel(user.role)}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => navigate("/notifications")}
              >
                <Bell className="h-5 w-5" />
                {displayUnreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                    {displayUnreadCount}
                  </span>
                )}
              </Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                Back to app
              </Button>
            </div>
          </header>

          <div className="p-6">
            {isNavLoading && (
              <div className="text-sm text-muted-foreground">Loading admin access...</div>
            )}
            {!isNavLoading && pageKey && !canAccessPage(pageKey) && (
              <>
                {fallbackPath && fallbackPath !== location.pathname ? (
                  <Navigate to={fallbackPath} replace />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    You do not have access to this admin page.
                  </div>
                )}
              </>
            )}
            {!isNavLoading && (!pageKey || canAccessPage(pageKey)) && <Outlet />}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
