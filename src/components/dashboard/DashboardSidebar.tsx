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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Home,
  Package,
  ShoppingCart,
  Wallet,
  ArrowUpRight,
  MessageSquare,
  Settings,
  HelpCircle,
  LogOut,
  Star,
  Bell,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProviderServices } from "@/hooks/useProviderServices";
import { useOrders } from "@/hooks/useOrders";
import { useMessages } from "@/contexts/MessagesContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import type { ApiOrderStatus } from "@/lib/api";
import { usePublicSettings } from "@/hooks/usePublicSettings";

const ORDER_BADGE_STATUSES: ApiOrderStatus[] = [
  "created",
  "paid_to_escrow",
  "accepted",
  "in_progress",
];

const DashboardSidebar = () => {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { signOut, user } = useAuth();
  const { data: services = [] } = useProviderServices();
  const { data: orders = [] } = useOrders();
  const { getUnreadCount } = useMessages();
  const unreadMessages = getUnreadCount();
  const { unreadCount } = useNotifications();
  const { data: publicSettings } = usePublicSettings();
  const reviewsEnabled = publicSettings?.featureFlags.reviews ?? true;
  const communityEnabled = publicSettings?.featureFlags.community ?? true;

  const serviceCount = services.length;
  const orderCount = orders.filter((order) => ORDER_BADGE_STATUSES.includes(order.status)).length;

  const providerProfile = user?.providerProfile as
    | {
        displayName?: string | null;
        ratingAvg?: string | null;
        verificationStatus?: string | null;
      }
    | null
    | undefined;

  const displayName =
    providerProfile?.displayName ??
    user?.username ??
    user?.email ??
    user?.phone ??
    (user?.role === "provider" ? "Provider" : "Account");

  const ratingAvg = providerProfile?.ratingAvg ? Number(providerProfile.ratingAvg) : 0;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "SG";

  const mainMenuItems = [
    { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
    { title: "Services", url: "/dashboard/services", icon: Package, badge: serviceCount > 0 ? `${serviceCount}` : undefined },
    { title: "Orders", url: "/dashboard/orders", icon: ShoppingCart, badge: orderCount > 0 ? `${orderCount}` : undefined },
    { title: "Earnings", url: "/dashboard/earnings", icon: Wallet },
    { title: "Payouts", url: "/dashboard/payouts", icon: ArrowUpRight },
    { title: "Messages", url: "/messages", icon: MessageSquare, badge: unreadMessages > 0 ? `${unreadMessages}` : undefined },
    ...(reviewsEnabled ? [{ title: "Reviews", url: "/dashboard/reviews", icon: Star }] : []),
    ...(communityEnabled ? [{ title: "Community", url: "/community", icon: Users }] : []),
    { title: "Home", url: "/", icon: Home },
  ];

  const settingsMenuItems = [
    { title: "Notifications", url: "/notifications", icon: Bell, badge: unreadCount > 0 ? `${unreadCount}` : undefined },
    { title: "Settings", url: "/dashboard/settings", icon: Settings },
    { title: "Help & Support", url: "/support", icon: HelpCircle },
  ];

  const handleLogout = () => {
    signOut();
    navigate("/sign-in");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 ring-2 ring-primary/20">
            <AvatarImage src={user?.avatarUrl ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">{displayName}</h3>
              <div className="flex items-center gap-1">
                {providerProfile?.verificationStatus === "verified" && (
                  <Badge className="bg-secondary/20 text-secondary text-xs px-1.5">
                    Verified
                  </Badge>
                )}
                {ratingAvg > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    {ratingAvg.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-3 hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1">{item.title}</span>
                          {item.badge && (
                            <Badge variant="secondary" className="text-xs h-5 px-1.5">
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1">{item.title}</span>
                          {item.badge && (
                            <Badge variant="secondary" className="text-xs h-5 px-1.5">
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
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

export default DashboardSidebar;
