import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import AccountSettingsContent from "@/components/settings/AccountSettingsContent";

const DashboardSettings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar />

        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border/50 bg-background/95 backdrop-blur px-6 py-4">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <div>
                <h1 className="text-xl font-bold text-foreground">Settings</h1>
                <p className="text-sm text-muted-foreground">
                  {displayName ? `Manage settings for ${displayName}` : "Manage your settings"}
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
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  navigate(`/profile/${user?.username ? user.username : user?.id ?? ""}`)
                }
                disabled={!user}
              >
                View profile
              </Button>
            </div>
          </header>

          <div className="p-6">
            <AccountSettingsContent showHeader={false} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default DashboardSettings;
