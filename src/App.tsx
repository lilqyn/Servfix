import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { CartProvider } from "@/contexts/CartContext";
import { MessagesProvider } from "@/contexts/MessagesContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireAuth from "@/components/auth/RequireAuth";
import { ADMIN_ROLES } from "@/lib/roles";
import ScrollToTop from "@/components/ScrollToTop";
import InstallPrompt from "@/components/pwa/InstallPrompt";

const Index = lazy(() => import("./pages/Index"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail"));
const ProviderDashboard = lazy(() => import("./pages/ProviderDashboard"));
const ServiceForm = lazy(() => import("./pages/ServiceForm"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Cart = lazy(() => import("./pages/Cart"));
const Messages = lazy(() => import("./pages/Messages"));
const Browse = lazy(() => import("./pages/Browse"));
const Community = lazy(() => import("./pages/Community"));
const Profile = lazy(() => import("./pages/Profile"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const Notifications = lazy(() => import("./pages/Notifications"));
const DashboardSettings = lazy(() => import("./pages/DashboardSettings"));
const Support = lazy(() => import("./pages/Support"));
const Business = lazy(() => import("./pages/Business"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminProviders = lazy(() => import("./pages/admin/AdminProviders"));
const AdminServices = lazy(() => import("./pages/admin/AdminServices"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminDisputes = lazy(() => import("./pages/admin/AdminDisputes"));
const AdminBusiness = lazy(() => import("./pages/admin/AdminBusiness"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews"));
const AdminCommunity = lazy(() => import("./pages/admin/AdminCommunity"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminPayouts = lazy(() => import("./pages/admin/AdminPayouts"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminSupport = lazy(() => import("./pages/admin/AdminSupport"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettings"));
const AdminHomeContent = lazy(() => import("./pages/admin/AdminHomeContent"));
const AdminPages = lazy(() => import("./pages/admin/AdminPages"));
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const StaffInviteAccept = lazy(() => import("./pages/StaffInviteAccept"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PaymentVerify = lazy(() => import("./pages/PaymentVerify"));
const Cookies = lazy(() => import("./pages/Cookies"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const ProviderAddendum = lazy(() => import("./pages/ProviderAddendum"));
const ProviderResources = lazy(() => import("./pages/ProviderResources"));
const About = lazy(() => import("./pages/About"));
const Blog = lazy(() => import("./pages/Blog"));
const Academy = lazy(() => import("./pages/Academy"));

const queryClient = new QueryClient();

const RouteLoader = () => (
  <div className="flex min-h-[35vh] items-center justify-center text-sm text-muted-foreground">
    Loading...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <WishlistProvider>
          <CartProvider>
            <MessagesProvider>
              <NotificationsProvider>
                <Toaster />
                <Sonner />
                <HashRouter>
                  <ScrollToTop />
                  <InstallPrompt />
                  <Suspense fallback={<RouteLoader />}>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/browse" element={<Browse />} />
                      <Route path="/about" element={<About />} />
                      <Route path="/blog" element={<Blog />} />
                      <Route path="/academy" element={<Academy />} />
                      <Route
                        path="/provider-resources"
                        element={
                          <RequireAuth roles={["provider"]} redirectTo="/browse">
                            <ProviderResources />
                          </RequireAuth>
                        }
                      />
                      <Route path="/community" element={<Community />} />
                      <Route path="/profile/:id" element={<Profile />} />
                      <Route
                        path="/account"
                        element={
                          <RequireAuth roles={["buyer", "provider", "admin"]}>
                            <AccountSettings />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/support"
                        element={
                          <RequireAuth roles={["buyer", "provider", ...ADMIN_ROLES]}>
                            <Support />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/business"
                        element={
                          <RequireAuth roles={["buyer", "admin"]} redirectTo="/dashboard">
                            <Business />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/notifications"
                        element={
                          <RequireAuth roles={["buyer", "provider", ...ADMIN_ROLES]}>
                            <Notifications />
                          </RequireAuth>
                        }
                      />
                      <Route path="/service/:id" element={<ServiceDetail />} />
                      <Route
                        path="/dashboard/*"
                        element={
                          <RequireAuth roles={["provider", "admin"]}>
                            <ProviderDashboard />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/dashboard/settings"
                        element={
                          <RequireAuth roles={["provider", "admin"]}>
                            <DashboardSettings />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/admin"
                        element={
                          <RequireAuth roles={ADMIN_ROLES}>
                            <AdminLayout />
                          </RequireAuth>
                        }
                      >
                        <Route index element={<AdminOverview />} />
                        <Route path="users" element={<AdminUsers />} />
                        <Route path="providers" element={<AdminProviders />} />
                        <Route path="services" element={<AdminServices />} />
                        <Route path="orders" element={<AdminOrders />} />
                        <Route path="business" element={<AdminBusiness />} />
                        <Route path="disputes" element={<AdminDisputes />} />
                        <Route path="reviews" element={<AdminReviews />} />
                        <Route path="community" element={<AdminCommunity />} />
                        <Route path="reports" element={<AdminReports />} />
                        <Route path="support" element={<AdminSupport />} />
                        <Route path="payouts" element={<AdminPayouts />} />
                        <Route path="analytics" element={<AdminAnalytics />} />
                        <Route path="pages" element={<AdminPages />} />
                        <Route path="home" element={<AdminHomeContent />} />
                        <Route path="settings" element={<AdminSettingsPage />} />
                        <Route path="settings/:section" element={<AdminSettingsPage />} />
                      </Route>
                      <Route
                        path="/dashboard/services/new"
                        element={
                          <RequireAuth roles={["provider", "admin"]}>
                            <ServiceForm />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/dashboard/services/:id/edit"
                        element={
                          <RequireAuth roles={["provider", "admin"]}>
                            <ServiceForm />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/wishlist"
                        element={
                          <RequireAuth
                            roles={["buyer", "provider", "admin"]}
                            redirectTo="/dashboard"
                          >
                            <Wishlist />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/cart"
                        element={
                          <RequireAuth
                            roles={["buyer", "provider", "admin"]}
                            redirectTo="/dashboard"
                          >
                            <Cart />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/messages"
                        element={
                          <RequireAuth
                            roles={["buyer", "provider", "admin"]}
                            redirectTo="/dashboard"
                          >
                            <Messages />
                          </RequireAuth>
                        }
                      />
                      <Route path="/sign-in" element={<SignIn />} />
                      <Route path="/sign-up" element={<SignUp />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/staff-invite" element={<StaffInviteAccept />} />
                      <Route path="/payment/verify" element={<PaymentVerify />} />
                      <Route path="/cookies" element={<Cookies />} />
                      <Route path="/privacy" element={<Privacy />} />
                      <Route path="/terms" element={<Terms />} />
                      <Route path="/provider-addendum" element={<ProviderAddendum />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </HashRouter>
              </NotificationsProvider>
            </MessagesProvider>
          </CartProvider>
        </WishlistProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
