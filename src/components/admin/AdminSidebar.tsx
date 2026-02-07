import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Star,
  MessageSquare,
  Flag,
  Wallet,
  BarChart3,
  Settings,
  AlertTriangle,
  LogOut,
  ShieldCheck,
  Home,
  LifeBuoy,
  FileText,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getRoleLabel, isAdminRole } from "@/lib/roles";
import { hasPermission, type Permission } from "@/lib/permissions";
import {
  fetchAdminNavigation,
  type AdminPageKey,
  type BusinessFunctionKey,
  type FeatureFlags,
} from "@/lib/api";

const AdminSidebar = () => {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { signOut, user } = useAuth();
  const isAdmin = Boolean(user && isAdminRole(user.role));

  const roleLabel = getRoleLabel(user?.role);
  const initials = roleLabel
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "AD";

  const { data: navigationData } = useQuery({
    queryKey: ["admin-navigation"],
    queryFn: fetchAdminNavigation,
    enabled: isAdmin,
  });

  if (!user || !isAdminRole(user.role)) {
    return null;
  }

  const functionAccess = navigationData?.businessFunctions;
  const featureFlags = navigationData?.featureFlags;
  const adminAccess = navigationData?.adminAccess;
  const hasFunctionAccess = (key?: BusinessFunctionKey) => {
    if (!key || !user?.role || !functionAccess) return true;
    const config = functionAccess[key];
    if (!config) return true;
    return config.enabled && config.roles.includes(user.role);
  };

  const hasFeatureAccess = (key?: keyof FeatureFlags) => {
    if (!key || !featureFlags) return true;
    return Boolean(featureFlags[key]);
  };

  const hasPageAccess = (key?: AdminPageKey) => {
    if (!key || !adminAccess || !user?.role) return true;
    const roles = adminAccess[key];
    if (!roles) return true;
    return roles.includes(user.role);
  };

  const menuItems: Array<{
    title: string;
    url: string;
    icon: typeof LayoutDashboard;
    permission: Permission;
    pageKey?: AdminPageKey;
    functionKey?: BusinessFunctionKey;
    featureKey?: keyof FeatureFlags;
  }> = [
    {
      title: "Overview",
      url: "/admin",
      icon: LayoutDashboard,
      permission: "admin.access",
      pageKey: "overview",
    },
    {
      title: "Users",
      url: "/admin/users",
      icon: Users,
      permission: "users.read",
      functionKey: "human_resources",
      pageKey: "users",
    },
    {
      title: "Providers",
      url: "/admin/providers",
      icon: ShieldCheck,
      permission: "providers.read",
      pageKey: "providers",
    },
    {
      title: "Services",
      url: "/admin/services",
      icon: Package,
      permission: "services.read",
      pageKey: "services",
    },
    {
      title: "Orders",
      url: "/admin/orders",
      icon: ShoppingCart,
      permission: "orders.read",
      pageKey: "orders",
    },
    {
      title: "Disputes",
      url: "/admin/disputes",
      icon: AlertTriangle,
      permission: "orders.read",
      functionKey: "customer_service",
      pageKey: "disputes",
    },
    {
      title: "Reviews",
      url: "/admin/reviews",
      icon: Star,
      permission: "reviews.read",
      functionKey: "customer_service",
      featureKey: "reviews",
      pageKey: "reviews",
    },
    {
      title: "Community",
      url: "/admin/community",
      icon: MessageSquare,
      permission: "community.read",
      functionKey: "customer_service",
      featureKey: "community",
      pageKey: "community",
    },
    {
      title: "Reports",
      url: "/admin/reports",
      icon: Flag,
      permission: "reports.read",
      functionKey: "customer_service",
      pageKey: "reports",
    },
    {
      title: "Support",
      url: "/admin/support",
      icon: LifeBuoy,
      permission: "support.read",
      functionKey: "customer_service",
      pageKey: "support",
    },
    {
      title: "Payouts",
      url: "/admin/payouts",
      icon: Wallet,
      permission: "payouts.read",
      functionKey: "finance",
      pageKey: "payouts",
    },
    {
      title: "Analytics",
      url: "/admin/analytics",
      icon: BarChart3,
      permission: "analytics.read",
      functionKey: "accounting",
      pageKey: "analytics",
    },
    {
      title: "Pages",
      url: "/admin/pages",
      icon: FileText,
      permission: "settings.read",
      pageKey: "pages",
    },
    {
      title: "Home Content",
      url: "/admin/home",
      icon: Home,
      permission: "settings.read",
      pageKey: "home",
    },
    {
      title: "Settings",
      url: "/admin/settings",
      icon: Settings,
      permission: "settings.read",
      pageKey: "settings",
    },
  ].filter(
    (item) =>
      hasPermission(user.role, item.permission) &&
      hasFunctionAccess(item.functionKey) &&
      hasFeatureAccess(item.featureKey) &&
      hasPageAccess(item.pageKey),
  );

  const handleLogout = () => {
    signOut();
    navigate("/sign-in");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 ring-2 ring-primary/20">
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">Admin Panel</h3>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/10 text-primary text-xs">
                  {roleLabel}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/admin"}
                      className="flex items-center gap-3 hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Logout">
              <button
                className="flex items-center gap-3 w-full text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                {!isCollapsed && <span>Logout</span>}
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AdminSidebar;
