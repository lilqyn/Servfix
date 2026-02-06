import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, X, ShoppingCart, Heart, Search, MessageCircle, ChevronDown } from "lucide-react";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCart } from "@/contexts/CartContext";
import { useMessages } from "@/contexts/MessagesContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import SearchAutocomplete from "@/components/header/SearchAutocomplete";
import { useAuth } from "@/contexts/AuthContext";
import NotificationsMenu from "@/components/notifications/NotificationsMenu";
import { isAdminRole, isProviderRole, getRoleLabel } from "@/lib/roles";
import {
  countUnreadNotifications,
  filterNotificationsForRole,
  shouldUseServerUnreadCount,
} from "@/lib/notifications";
import { usePublicSettings } from "@/hooks/usePublicSettings";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { wishlist } = useWishlist();
  const { cart } = useCart();
  const { getUnreadCount } = useMessages();
  const unreadMessages = getUnreadCount();
  const { notifications, unreadCount: unreadNotifications } = useNotifications();
  const { user, isAuthenticated, signOut } = useAuth();
  const { data: publicSettings } = usePublicSettings();
  const baseUrl = import.meta.env.BASE_URL;
  const logoUrl = `${baseUrl}servfix-logo.png`;
  const iconUrl = `${baseUrl}servfix-icon.png`;
  const isProvider = isProviderRole(user?.role);
  const filteredNotifications = useMemo(
    () => filterNotificationsForRole(notifications, user?.role),
    [notifications, user?.role],
  );
  const displayUnreadNotifications = useMemo(() => {
    if (shouldUseServerUnreadCount(user?.role)) {
      return unreadNotifications;
    }
    return countUnreadNotifications(filteredNotifications);
  }, [filteredNotifications, unreadNotifications, user?.role]);
  const isAdmin = isAdminRole(user?.role);
  const communityEnabled = publicSettings?.featureFlags.community ?? true;

  const providerDisplayName = useMemo(() => {
    if (!user) {
      return "";
    }

    if (user.providerProfile && typeof user.providerProfile === "object") {
      const profile = user.providerProfile as { displayName?: string | null };
      return profile.displayName ?? "";
    }

    return "";
  }, [user]);

  const displayName = useMemo(() => {
    if (!user) {
      return "";
    }

    if (providerDisplayName) {
      return providerDisplayName;
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
  }, [providerDisplayName, user]);

  const roleLabel = useMemo(() => {
    if (!user) {
      return "";
    }

    if (user.role === "provider") {
      return "Service provider";
    }

    return getRoleLabel(user.role);
  }, [displayName, user?.role]);

  const handle = useMemo(() => {
    if (!user?.username) {
      return null;
    }
    return `@${user.username}`;
  }, [user?.username]);

  const showHandle =
    Boolean(handle) &&
    displayName.toLowerCase() !== (user?.username ?? "").toLowerCase();

  const profilePath = user
    ? `/profile/${user.username ? user.username : user.id}`
    : "/sign-in";
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

  const initials = useMemo(() => {
    if (!displayName) {
      return "A";
    }

    const tokens = displayName.split(" ").filter(Boolean);
    const first = tokens[0]?.[0] ?? displayName[0];
    const second = tokens[1]?.[0] ?? "";
    return `${first}${second}`.toUpperCase();
  }, [user]);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3" aria-label="SERVFIX home">
            <img
              src={iconUrl}
              alt="SERVFIX icon"
              className="h-11 w-11 md:h-12 md:w-12 rounded-2xl shadow-md"
            />
            <img
              src={logoUrl}
              alt="SERVFIX"
              className="h-8 md:h-10 w-auto"
            />
          </Link>

          {/* Desktop Search Bar with Autocomplete */}
          <div className="hidden lg:flex flex-1 max-w-md mx-8">
            <SearchAutocomplete />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              Home
            </Link>
            <Link to="/browse" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              Browse
            </Link>
            {communityEnabled && (
              <Link
                to="/community"
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                Community
              </Link>
            )}
            {isAuthenticated && isProvider && (
              <Link to="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                Dashboard
              </Link>
            )}
            {isAuthenticated && isAdmin && (
              <Link to="/admin" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                Admin
              </Link>
            )}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2">
            {/* Mobile-ish search toggle for medium screens */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden relative"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              <Search className="w-5 h-5" />
            </Button>
            {isAuthenticated && <NotificationsMenu />}
            <Link to="/messages">
              <Button variant="ghost" size="icon" className="relative">
                <MessageCircle className="w-5 h-5" />
                {unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-secondary text-secondary-foreground text-xs rounded-full flex items-center justify-center font-semibold">
                    {unreadMessages}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/wishlist">
              <Button variant="ghost" size="icon" className="relative">
                <Heart className="w-5 h-5" />
                {wishlist.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center font-semibold">
                    {wishlist.length}
                  </span>
                )}
              </Button>
            </Link>
            <Link to="/cart">
              <Button variant="ghost" size="icon" className="relative">
                <ShoppingCart className="w-5 h-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-semibold">
                    {cart.length}
                  </span>
                )}
              </Button>
            </Link>
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 px-2">
                    <Avatar className="h-8 w-8">
                      {user?.avatarUrl ? (
                        <AvatarImage src={user.avatarUrl} alt={displayName} />
                      ) : null}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden lg:inline text-xs text-muted-foreground max-w-[140px] truncate">
                      {displayName}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Signed in as
                  </DropdownMenuLabel>
                  <div className="px-2 pb-2">
                    <p className="text-sm font-medium text-foreground">{displayName}</p>
                    {showHandle ? (
                      <p className="text-xs text-muted-foreground">{handle}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{roleLabel}</p>
                    {user?.email ? (
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    ) : user?.phone ? (
                      <p className="text-xs text-muted-foreground">{user.phone}</p>
                    ) : null}
                    {memberSince ? (
                      <p className="text-xs text-muted-foreground">Member since {memberSince}</p>
                    ) : null}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(profilePath)}>
                    View profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/account")}>
                    Account settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/support")}>
                    Help & support
                  </DropdownMenuItem>
                  {isProvider && (
                    <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                      Provider dashboard
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate("/admin")}>
                      Admin panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate("/messages")}>
                    Messages
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/wishlist")}>
                    Wishlist
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/cart")}>
                    Cart
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      signOut();
                      navigate("/sign-in");
                    }}
                  >
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button asChild variant="outline-gold" size="sm">
                  <Link to="/sign-in">Sign In</Link>
                </Button>
                <Button asChild variant="gold" size="sm">
                  <Link to="/sign-up">Get Started</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              <Search className="w-5 h-5" />
            </Button>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Expandable Search Bar with Autocomplete */}
        {isSearchOpen && (
          <div className="lg:hidden py-3 border-t border-border/50 animate-slide-up">
            <SearchAutocomplete 
              autoFocus 
              onClose={() => {
                setIsSearchOpen(false);
                setIsMenuOpen(false);
              }} 
            />
          </div>
        )}

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-border/50 animate-slide-up">
            <nav className="flex flex-col gap-2">
              <Link to="/" className="px-4 py-3 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors">
                Home
              </Link>
              <Link to="/browse" className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                Browse Services
              </Link>
              {communityEnabled && (
                <Link
                  to="/community"
                  className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  Community
                </Link>
              )}
              {isAuthenticated && (
                <Link to="/notifications" className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors flex items-center justify-between">
                  Notifications
                  {displayUnreadNotifications > 0 && (
                    <span className="w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-semibold">
                      {displayUnreadNotifications}
                    </span>
                  )}
                </Link>
              )}
              <Link to="/messages" className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors flex items-center justify-between">
                Messages
                {unreadMessages > 0 && (
                  <span className="w-5 h-5 bg-secondary text-secondary-foreground text-xs rounded-full flex items-center justify-center font-semibold">
                    {unreadMessages}
                  </span>
                )}
              </Link>
              {isAuthenticated && user && (
                <>
                  <Link
                    to={`/profile/${user.username ? user.username : user.id}`}
                    className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    My Profile
                  </Link>
                  <Link
                    to="/account"
                    className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    Account Settings
                  </Link>
                  <Link
                    to="/support"
                    className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    Help & Support
                  </Link>
                </>
              )}
              <Link to="/wishlist" className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors flex items-center justify-between">
                Wishlist
                {wishlist.length > 0 && (
                  <span className="w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center font-semibold">
                    {wishlist.length}
                  </span>
                )}
              </Link>
              <Link to="/cart" className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors flex items-center justify-between">
                Cart
                {cart.length > 0 && (
                  <span className="w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-semibold">
                    {cart.length}
                  </span>
                )}
              </Link>
              {isAuthenticated && isProvider && (
                <Link to="/dashboard" className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                  Dashboard
                </Link>
              )}
              {isAuthenticated && isAdmin && (
                <Link to="/admin" className="px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                  Admin panel
                </Link>
              )}
            </nav>
            <div className="flex gap-3 mt-4 px-4">
              {isAuthenticated ? (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    signOut();
                    navigate("/sign-in");
                    setIsMenuOpen(false);
                  }}
                >
                  Log out
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline-gold" className="flex-1">
                    <Link to="/sign-in">Sign In</Link>
                  </Button>
                  <Button asChild variant="gold" className="flex-1">
                    <Link to="/sign-up">Get Started</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
