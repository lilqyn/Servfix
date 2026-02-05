import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { CartProvider } from "@/contexts/CartContext";
import { MessagesProvider } from "@/contexts/MessagesContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireAuth from "@/components/auth/RequireAuth";
import Index from "./pages/Index";
import ServiceDetail from "./pages/ServiceDetail";
import ProviderDashboard from "./pages/ProviderDashboard";
import ServiceForm from "./pages/ServiceForm";
import Wishlist from "./pages/Wishlist";
import Cart from "./pages/Cart";
import Messages from "./pages/Messages";
import Browse from "./pages/Browse";
import Community from "./pages/Community";
import Profile from "./pages/Profile";
import AccountSettings from "./pages/AccountSettings";
import Notifications from "./pages/Notifications";
import DashboardSettings from "./pages/DashboardSettings";
import Support from "./pages/Support";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminProviders from "./pages/admin/AdminProviders";
import AdminServices from "./pages/admin/AdminServices";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminDisputes from "./pages/admin/AdminDisputes";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminCommunity from "./pages/admin/AdminCommunity";
import AdminReports from "./pages/admin/AdminReports";
import AdminPayouts from "./pages/admin/AdminPayouts";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminSupport from "./pages/admin/AdminSupport";
import AdminSettingsPage from "./pages/admin/AdminSettings";
import AdminHomeContent from "./pages/admin/AdminHomeContent";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import NotFound from "./pages/NotFound";
import PaymentVerify from "./pages/PaymentVerify";
import { ADMIN_ROLES } from "@/lib/roles";

const queryClient = new QueryClient();

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
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/browse" element={<Browse />} />
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
                        <RequireAuth roles={["buyer", "provider", "admin"]}>
                          <Support />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/notifications"
                      element={
                        <RequireAuth roles={["buyer", "provider", "admin"]}>
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
                      <Route path="disputes" element={<AdminDisputes />} />
                      <Route path="reviews" element={<AdminReviews />} />
                      <Route path="community" element={<AdminCommunity />} />
                      <Route path="reports" element={<AdminReports />} />
                      <Route path="support" element={<AdminSupport />} />
                      <Route path="payouts" element={<AdminPayouts />} />
                      <Route path="analytics" element={<AdminAnalytics />} />
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
                        <RequireAuth roles={["buyer", "admin"]} redirectTo="/dashboard">
                          <Wishlist />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/cart"
                      element={
                        <RequireAuth roles={["buyer", "admin"]} redirectTo="/dashboard">
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
                    <Route path="/payment/verify" element={<PaymentVerify />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </NotificationsProvider>
            </MessagesProvider>
          </CartProvider>
        </WishlistProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
