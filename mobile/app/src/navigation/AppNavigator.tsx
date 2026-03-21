import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
  type LinkingOptions,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../providers/AuthProvider";
import { BrowseScreen } from "../screens/BrowseScreen";
import { CommunityScreen } from "../screens/CommunityScreen";
import { ChatScreen } from "../screens/ChatScreen";
import { ForgotPasswordScreen } from "../screens/ForgotPasswordScreen";
import { CreateEditServiceScreen } from "../screens/CreateEditServiceScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { MessagesScreen } from "../screens/MessagesScreen";
import { MyServicesScreen } from "../screens/MyServicesScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { OrderDetailScreen } from "../screens/OrderDetailScreen";
import { OrdersScreen } from "../screens/OrdersScreen";
import { PaymentReturnScreen } from "../screens/PaymentReturnScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ProviderDashboardScreen } from "../screens/ProviderDashboardScreen";
import { ProviderProfileScreen } from "../screens/ProviderProfileScreen";
import { ReviewScreen } from "../screens/ReviewScreen";
import { ServiceDetailScreen } from "../screens/ServiceDetailScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SignInScreen } from "../screens/SignInScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { WalletScreen } from "../screens/WalletScreen";
import { BoostsScreen } from "../screens/BoostsScreen";
import { SubscriptionsScreen } from "../screens/SubscriptionsScreen";
import { SupportScreen } from "../screens/SupportScreen";
import { ReportScreen } from "../screens/ReportScreen";
import { QuotesScreen } from "../screens/QuotesScreen";
import { WishlistScreen } from "../screens/WishlistScreen";
import { CartScreen } from "../screens/CartScreen";
import BlogScreen from "../screens/BlogScreen";
import AcademyScreen from "../screens/AcademyScreen";
import LegalScreen from "../screens/LegalScreen";
import ProviderResourcesScreen from "../screens/ProviderResourcesScreen";
import { BusinessAccountsScreen } from "../screens/BusinessAccountsScreen";
import { CallScreen } from "../screens/CallScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import { createCall, fetchThread, fetchThreads, fetchOrders, fetchNotifications } from "../lib/api";
import * as websocket from "../lib/websocket";
import { createThemedStyles } from "../theme";
import { useTheme } from "../providers/ThemeProvider";
import type { Order, PaymentReturnParams, ReportTargetType, Service } from "../types";

const ONBOARDING_DONE_KEY = "servfix-onboarding-done";

type RootStackParamList = {
  Onboarding: undefined;
  Shell: { tab?: AppTab; refreshOrdersToken?: string } | undefined;
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  ServiceDetail: { serviceId: string };
  OrderDetail: { orderId: string; seedOrder?: Order; threadId?: string };
  PaymentReturn: PaymentReturnParams | undefined;
  Settings: undefined;
  Messages: undefined;
  Chat: { threadId: string; threadTitle?: string };
  ProviderDashboard: undefined;
  MyServices: undefined;
  CreateEditService: { service?: Service } | undefined;
  Wallet: undefined;
  Boosts: undefined;
  Subscriptions: undefined;
  Support: undefined;
  Report: { targetType: ReportTargetType; targetId: string; targetLabel?: string };
  Quotes: { threadId: string };
  ProviderProfile: { userId: string };
  Review: { serviceId: string; serviceTitle: string; orderId: string };
  Wishlist: undefined;
  Cart: undefined;
  Blog: undefined;
  Academy: undefined;
  Legal: { slug: "privacy" | "terms" | "cookies" | "providerAddendum" | "about" };
  ProviderResources: undefined;
  ResetPassword: { token: string };
  BusinessAccounts: undefined;
  Call: {
    callId: string;
    callType: "audio" | "video";
    isIncoming: boolean;
    callerName: string;
    callerAvatar?: string | null;
    callerUserId?: string;
    calleeUserId?: string;
    offerSdp?: string;
  };
};

type AppTab = "home" | "browse" | "community" | "messages" | "notifications" | "orders" | "account";

const Stack = createNativeStackNavigator<RootStackParamList>();
export const navRef = createNavigationContainerRef<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["servfix://", "https://servfixgh.com", "https://www.servfixgh.com"],
  config: {
    screens: {
      Shell: "",
      SignIn: "signin",
      SignUp: "signup",
      ServiceDetail: "service/:serviceId",
      PaymentReturn: "payment/verify",
      ResetPassword: "reset-password/:token",
    },
  },
};

function ShellScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, "Shell">) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const [tab, setTabRaw] = useState<AppTab>(route.params?.tab ?? "home");
  const setTab = (t: AppTab) => {
    if (t === "messages") setUnreadMessages(0);
    // Don't clear notification badge on account tab — clear it when entering Notifications screen
    if (t === "orders") {
      setOrderBadge(0);
      lastSeenOrdersRef.current = knownOrderSnapshotRef.current;
    }
    setTabRaw(t);
  };
  const [browseCategory, setBrowseCategory] = useState<string | undefined>(undefined);
  const [ordersRefreshToken, setOrdersRefreshToken] = useState<string | undefined>(
    route.params?.refreshOrdersToken,
  );
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [orderBadge, setOrderBadge] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  // Track order states to detect changes
  const lastSeenOrdersRef = useRef<string>("");
  const knownOrderSnapshotRef = useRef<string>("");

  // Poll unread messages & order changes
  useEffect(() => {
    if (!user) { setUnreadMessages(0); setOrderBadge(0); setUnreadNotifications(0); return; }
    let mounted = true;
    const poll = async () => {
      try {
        const [threads, orders, notifData] = await Promise.all([fetchThreads(), fetchOrders(), fetchNotifications({ limit: 1 })]);
        if (!mounted) return;
        setUnreadMessages(threads.reduce((sum, t) => sum + (t.unreadCount ?? 0), 0));
        setUnreadNotifications(notifData.unreadCount);

        // Build a snapshot of order ids + statuses to detect changes
        const snapshot = orders
          .map((o) => `${o.id}:${o.status}`)
          .sort()
          .join("|");
        knownOrderSnapshotRef.current = snapshot;

        // If user is currently on the orders tab, keep badge at 0 and update lastSeen
        if (tab === "orders") {
          lastSeenOrdersRef.current = snapshot;
          setOrderBadge(0);
          return;
        }

        // Count how many orders have changed since lastSeen
        if (!lastSeenOrdersRef.current) {
          // First load — no badge
          lastSeenOrdersRef.current = snapshot;
          setOrderBadge(0);
          return;
        }

        const seenSet = new Set(lastSeenOrdersRef.current.split("|"));
        const changedCount = orders.filter(
          (o) => !seenSet.has(`${o.id}:${o.status}`),
        ).length;
        setOrderBadge(changedCount);
      } catch {}
    };
    void poll();
    const interval = setInterval(poll, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab]);

  const openSignIn = () => navigation.navigate("SignIn");
  const openService = (serviceId: string) => navigation.navigate("ServiceDetail", { serviceId });
  const openOrder = (order: Order) =>
    navigation.navigate("OrderDetail", { orderId: order.id, seedOrder: order });
  const openOrderById = (orderId: string, threadId?: string) =>
    navigation.navigate("OrderDetail", { orderId, threadId });
  const openNotifications = () => { setUnreadNotifications(0); setTab("notifications"); };

  useEffect(() => {
    if (route.params?.tab) {
      setTab(route.params.tab);
    }
    if (route.params?.refreshOrdersToken) {
      setOrdersRefreshToken(route.params.refreshOrdersToken);
    }
  }, [route.params?.refreshOrdersToken, route.params?.tab]);

  const openBrowseCategory = (category: string) => {
    setBrowseCategory(category);
    setTab("browse");
  };

  let content = (
    <HomeScreen
      onBrowse={() => setTab("browse")}
      onBrowseCategory={openBrowseCategory}
      onOpenService={openService}
      onOpenSignIn={openSignIn}
      onOpenProviderProfile={(userId) => navigation.navigate("ProviderProfile", { userId })}
      user={user}
    />
  );

  if (tab === "browse") {
    content = (
      <BrowseScreen
        initialCategory={browseCategory}
        onOpenService={openService}
      />
    );
  }

  if (tab === "notifications") {
    content = (
      <NotificationsScreen
        onOpenOrder={openOrderById}
        onOpenService={openService}
        onOpenChat={(threadId) => navigation.navigate("Chat", { threadId })}
        onOpenSignIn={openSignIn}
      />
    );
  }

  if (tab === "orders") {
    content = (
      <OrdersScreen
        onOpenPaymentStatus={(params) => navigation.navigate("PaymentReturn", params)}
        onOpenSignIn={openSignIn}
        onOpenOrder={openOrder}
        refreshToken={ordersRefreshToken}
      />
    );
  }

  const isProvider = user?.role === "provider" || user?.role === "admin" || user?.role === "super_admin";

  if (tab === "community") {
    content = (
      <CommunityScreen
        onOpenSignIn={openSignIn}
        onOpenProfile={(userId) => navigation.navigate("ProviderProfile", { userId })}
      />
    );
  }

  if (tab === "messages") {
    content = (
      <MessagesScreen
        onOpenThread={(threadId, threadTitle) => navigation.navigate("Chat", { threadId, threadTitle })}
        onOpenSignIn={openSignIn}
      />
    );
  }

  if (tab === "account") {
    content = (
      <ProfileScreen
        onOpenSignIn={openSignIn}
        onOpenNotifications={openNotifications}
        unreadNotifications={unreadNotifications}
        onOpenSettings={() => navigation.navigate("Settings")}
        onOpenMessages={() => setTab("messages")}
        onOpenProviderDashboard={isProvider ? () => navigation.navigate("ProviderDashboard") : undefined}
        onOpenWallet={isProvider ? () => navigation.navigate("Wallet") : undefined}
        onOpenBoosts={isProvider ? () => navigation.navigate("Boosts") : undefined}
        onOpenSubscriptions={isProvider ? () => navigation.navigate("Subscriptions") : undefined}
        onOpenSupport={() => navigation.navigate("Support")}
        onOpenWishlist={() => navigation.navigate("Wishlist")}
        onOpenCart={() => navigation.navigate("Cart")}
        onOpenBlog={() => navigation.navigate("Blog")}
        onOpenAcademy={() => navigation.navigate("Academy")}
        onOpenLegal={(slug) => navigation.navigate("Legal", { slug })}
        onOpenProviderResources={isProvider ? () => navigation.navigate("ProviderResources") : undefined}
        onOpenBusiness={() => navigation.navigate("BusinessAccounts")}
      />
    );
  }

  type TabDef = {
    key: Exclude<AppTab, "home">;
    label: string;
    tone: string;
    activeBg: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
    iconActive: React.ComponentProps<typeof Ionicons>["name"];
    badge?: number;
  };
  const leftTabs: TabDef[] = [
    { key: "community", label: "Community", tone: "#0369a1", activeBg: "#e0f2fe", icon: "people-outline", iconActive: "people" },
    { key: "orders", label: "Orders", tone: "#ea580c", activeBg: "#fff7ed", icon: "receipt-outline", iconActive: "receipt", badge: orderBadge },
  ];
  const rightTabs: TabDef[] = [
    { key: "messages", label: "Messages", tone: "#7c3aed", activeBg: "#f5f3ff", icon: "chatbubble-outline", iconActive: "chatbubble", badge: unreadMessages },
    { key: "account", label: "Account", tone: palette.ink, activeBg: palette.mist, icon: "person-outline", iconActive: "person", badge: unreadNotifications },
  ];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.shell}>
      <View style={styles.content}>{content}</View>
      <View style={styles.tabWrap}>
        <View style={[styles.tabBar, isCompact && styles.tabBarCompact]}>
          <View style={styles.tabClusterLeft}>
            {leftTabs.map((item) => {
              const isActive = tab === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={[
                    styles.tabButton,
                    isCompact && styles.tabButtonCompact,
                    isActive && { backgroundColor: item.activeBg },
                  ]}
                >
                  <View>
                    <Ionicons
                      color={isActive ? item.tone : palette.slate}
                      name={isActive ? item.iconActive : item.icon}
                      size={22}
                    />
                    {(item.badge ?? 0) > 0 && (
                      <View style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>
                          {item.badge! > 99 ? "99+" : item.badge}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tabLabel,
                      isCompact && styles.tabLabelCompact,
                      isActive && { color: item.tone },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.homeSpacer, isCompact && styles.homeSpacerCompact]} />

          <View style={styles.tabClusterRight}>
            {rightTabs.map((item) => {
              const isActive = tab === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={[
                    styles.tabButton,
                    isCompact && styles.tabButtonCompact,
                    isActive && { backgroundColor: item.activeBg },
                  ]}
                >
                  <View>
                    <Ionicons
                      color={isActive ? item.tone : palette.slate}
                      name={isActive ? item.iconActive : item.icon}
                      size={22}
                    />
                    {(item.badge ?? 0) > 0 && (
                      <View style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>
                          {item.badge! > 99 ? "99+" : item.badge}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tabLabel,
                      isCompact && styles.tabLabelCompact,
                      isActive && { color: item.tone },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => setTab("home")}
          style={styles.homeFab}
        >
          <View style={[styles.homeOrb, tab === "home" && styles.homeOrbActive]}>
            <Ionicons color={palette.canvas} name={tab === "home" ? "home" : "home-outline"} size={26} />
          </View>
          <Text style={[styles.homeLabel, isCompact && styles.homeLabelCompact, tab === "home" && styles.homeLabelActive]}>
            Home
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export function AppNavigator() {
  const styles = useStyles();
  const { palette, isDark } = useTheme();
  const { isBooting, user } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const wsListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_DONE_KEY).then((val) => {
      setShowOnboarding(!val);
      setOnboardingChecked(true);
    }).catch(() => {
      setOnboardingChecked(true);
    });
  }, []);

  // Connect WebSocket when user is authenticated
  useEffect(() => {
    if (user) {
      websocket.connect();
    } else {
      websocket.disconnect();
    }
    return () => {
      websocket.disconnect();
    };
  }, [user]);

  // Listen for incoming calls via WebSocket
  useEffect(() => {
    if (!user) return;

    if (wsListenerRef.current) {
      wsListenerRef.current();
    }

    wsListenerRef.current = websocket.subscribe((msg) => {
      if (msg.type !== "call:offer") return;

      const callId = msg.callId as string | undefined;
      const callerUserId = msg.from as string | undefined;
      const callType = (msg.callType as "audio" | "video") || "audio";
      const offerSdp = msg.sdp as string | undefined;
      const callerName = (msg.callerName as string) || "Incoming call";

      if (!callId || !callerUserId || !offerSdp) return;

      if (navRef.isReady()) {
        navRef.navigate("Call", {
          callId,
          callType,
          isIncoming: true,
          callerName,
          callerUserId,
          offerSdp,
        });
      }
    });

    return () => {
      if (wsListenerRef.current) {
        wsListenerRef.current();
        wsListenerRef.current = null;
      }
    };
  }, [user]);

  if (isBooting || !onboardingChecked) {
    return (
      <SafeAreaView edges={["top"]} style={styles.loadingWrap}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Starting Servfix...</Text>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer
      linking={linking}
      ref={navRef}
      theme={{
        dark: isDark,
        fonts: DefaultTheme.fonts,
        colors: {
          primary: palette.accent,
          background: palette.canvas,
          card: palette.card,
          text: palette.ink,
          border: palette.line,
          notification: palette.danger,
        },
      }}
    >
      <Stack.Navigator
        initialRouteName={showOnboarding ? "Onboarding" : "Shell"}
        screenOptions={{
          contentStyle: { backgroundColor: palette.canvas },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: palette.canvas },
          headerTitleStyle: { color: palette.ink, fontWeight: "700" },
        }}
      >
        <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
          {({ navigation }) => (
            <OnboardingScreen
              onDone={async () => {
                await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "1");
                navigation.replace("Shell");
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          component={ShellScreen}
          name="Shell"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="SignIn" options={{ title: "Sign in" }}>
          {({ navigation }) => (
            <SignInScreen
              onOpenSignUp={() => navigation.navigate("SignUp")}
              onOpenForgotPassword={() => navigation.navigate("ForgotPassword")}
              onSuccess={() => navigation.replace("Shell")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="SignUp" options={{ title: "Create account" }}>
          {({ navigation }) => (
            <SignUpScreen
              onOpenSignIn={() => {
                if (navigation.canGoBack()) { navigation.goBack(); return; }
                navigation.navigate("SignIn");
              }}
              onSuccess={() => navigation.replace("Shell")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="ForgotPassword" options={{ title: "Reset password" }}>
          {({ navigation }) => (
            <ForgotPasswordScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="ServiceDetail" options={{ title: "Service details" }}>
          {({ route, navigation }) => (
            <ServiceDetailScreen
              onOpenOrders={() => navigation.navigate("Shell", { tab: "orders" })}
              onOpenSignIn={() => navigation.navigate("SignIn")}
              onOpenProviderProfile={(userId) => navigation.navigate("ProviderProfile", { userId })}
              onOpenService={(serviceId) => navigation.navigate("ServiceDetail", { serviceId })}
              onReport={(targetType, targetId, targetLabel) => navigation.navigate("Report", { targetType, targetId, targetLabel })}
              onOpenMessages={(threadId, threadTitle) => navigation.navigate("Chat", { threadId, threadTitle })}
              serviceId={route.params.serviceId}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="PaymentReturn" options={{ title: "Payment status" }}>
          {({ route, navigation }) => (
            <PaymentReturnScreen
              onOpenHome={() => navigation.navigate("Shell", { tab: "home" })}
              onOpenOrders={(options) => {
                navigation.navigate("Shell", {
                  tab: "orders",
                  refreshOrdersToken: options?.forceRefresh ? String(Date.now()) : undefined,
                });
              }}
              onOpenSignIn={() => navigation.navigate("SignIn")}
              params={route.params}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="OrderDetail" options={{ title: "Order detail" }}>
          {({ navigation, route }) => (
            <OrderDetailScreen
              orderId={route.params.orderId}
              seedOrder={route.params.seedOrder}
              threadId={route.params.threadId}
              onBack={() => navigation.goBack()}
              onOpenPaymentStatus={(params) => navigation.navigate("PaymentReturn", params)}
              onOpenSignIn={() => navigation.navigate("SignIn")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Settings" options={{ title: "Settings" }}>
          {({ navigation }) => (
            <SettingsScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Messages" options={{ title: "Messages" }}>
          {({ navigation }) => (
            <MessagesScreen
              onOpenThread={(threadId, threadTitle) => navigation.navigate("Chat", { threadId, threadTitle })}
              onOpenSignIn={() => navigation.navigate("SignIn")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Chat" options={{ title: "Chat" }}>
          {({ navigation, route }) => (
            <ChatScreen
              threadId={route.params.threadId}
              threadTitle={route.params.threadTitle}
              onBack={() => navigation.goBack()}
              onOpenQuotes={(threadId) => navigation.navigate("Quotes", { threadId })}
              onStartCall={async (callType) => {
                try {
                  const thread = await fetchThread(route.params.threadId);
                  const callee = thread.participants.find((p) => p.id !== "current-user");
                  if (!callee) return;
                  const call = await createCall({
                    calleeId: callee.id,
                    threadId: route.params.threadId,
                    callType,
                  });
                  navigation.navigate("Call", {
                    callId: call.id,
                    callType,
                    isIncoming: false,
                    callerName: callee.name,
                    callerAvatar: callee.avatar,
                    calleeUserId: callee.id,
                  });
                } catch {
                  // Silently fail — could show alert
                }
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="ProviderDashboard" options={{ title: "Dashboard" }}>
          {({ navigation }) => (
            <ProviderDashboardScreen
              onOpenOrders={() => navigation.navigate("Shell", { tab: "orders" })}
              onOpenMyServices={() => navigation.navigate("MyServices")}
              onOpenWallet={() => navigation.navigate("Wallet")}
              onOpenCreateService={() => navigation.navigate("CreateEditService")}
              onOpenBoosts={() => navigation.navigate("Boosts")}
              onOpenSubscriptions={() => navigation.navigate("Subscriptions")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="MyServices" options={{ title: "My services" }}>
          {({ navigation }) => (
            <MyServicesScreen
              onBack={() => navigation.goBack()}
              onOpenCreateService={() => navigation.navigate("CreateEditService")}
              onOpenEditService={(service) => navigation.navigate("CreateEditService", { service })}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="CreateEditService" options={{ title: "Service" }}>
          {({ navigation, route }) => (
            <CreateEditServiceScreen
              existingService={route.params?.service}
              onBack={() => navigation.goBack()}
              onDone={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Wallet" options={{ title: "Earnings" }}>
          {({ navigation }) => (
            <WalletScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Boosts" options={{ title: "Boost Services" }}>
          {({ navigation }) => (
            <BoostsScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Subscriptions" options={{ title: "Subscription Plans" }}>
          {({ navigation }) => (
            <SubscriptionsScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Support" options={{ title: "Help & Support" }}>
          {({ navigation }) => (
            <SupportScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Report" options={{ title: "Report" }}>
          {({ navigation, route }) => (
            <ReportScreen
              targetType={route.params.targetType}
              targetId={route.params.targetId}
              targetLabel={route.params.targetLabel}
              onBack={() => navigation.goBack()}
              onDone={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Quotes" options={{ title: "Quotes" }}>
          {({ navigation, route }) => (
            <QuotesScreen
              threadId={route.params.threadId}
              userRole={user?.role ?? "buyer"}
              onBack={() => navigation.goBack()}
              onOrderCreated={(orderId) => {
                navigation.navigate("OrderDetail", { orderId });
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="ProviderProfile" options={{ title: "Provider" }}>
          {({ navigation, route }) => (
            <ProviderProfileScreen
              userId={route.params.userId}
              onBack={() => navigation.goBack()}
              onOpenService={(serviceId) => navigation.navigate("ServiceDetail", { serviceId })}
              onOpenMessages={(providerId) => navigation.navigate("Chat", { threadId: providerId, threadTitle: "Message" })}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Review" options={{ title: "Leave a review" }}>
          {({ navigation, route }) => (
            <ReviewScreen
              serviceId={route.params.serviceId}
              serviceTitle={route.params.serviceTitle}
              orderId={route.params.orderId}
              onBack={() => navigation.goBack()}
              onDone={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Wishlist" options={{ title: "Wishlist" }}>
          {({ navigation }) => (
            <WishlistScreen
              onBack={() => navigation.goBack()}
              onOpenService={(serviceId) => navigation.navigate("ServiceDetail", { serviceId })}
              onOpenBrowse={() => navigation.navigate("Shell", { tab: "browse" })}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Cart" options={{ title: "Cart" }}>
          {({ navigation }) => (
            <CartScreen
              onBack={() => navigation.goBack()}
              onOpenBrowse={() => navigation.navigate("Shell", { tab: "browse" })}
              onOpenSignIn={() => navigation.navigate("SignIn")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Blog" options={{ title: "Blog" }}>
          {({ navigation }) => (
            <BlogScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Academy" options={{ title: "Academy" }}>
          {({ navigation }) => (
            <AcademyScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Legal" options={{ title: "" }}>
          {({ navigation, route }) => (
            <LegalScreen
              slug={route.params.slug}
              onBack={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="ProviderResources" options={{ title: "Provider Resources" }}>
          {({ navigation }) => (
            <ProviderResourcesScreen
              onBack={() => navigation.goBack()}
              onOpenDashboard={() => navigation.navigate("ProviderDashboard")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="BusinessAccounts" options={{ title: "Business Accounts" }}>
          {({ navigation }) => (
            <BusinessAccountsScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="ResetPassword" options={{ title: "Reset Password" }}>
          {({ navigation, route }) => (
            <ResetPasswordScreen
              token={route.params.token}
              onBack={() => navigation.goBack()}
              onSuccess={() => navigation.navigate("SignIn")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Call" options={{ headerShown: false, presentation: "fullScreenModal" }}>
          {({ navigation, route }) => (
            <CallScreen
              callId={route.params.callId}
              callType={route.params.callType}
              isIncoming={route.params.isIncoming}
              callerName={route.params.callerName}
              callerAvatar={route.params.callerAvatar}
              callerUserId={route.params.callerUserId}
              calleeUserId={route.params.calleeUserId}
              offerSdp={route.params.offerSdp}
              onEnd={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const useStyles = createThemedStyles((palette) => ({
  shell: {
    backgroundColor: palette.canvas,
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabWrap: {
    marginHorizontal: 14,
    marginTop: 8,
    paddingBottom: 6,
    position: "relative",
  },
  tabBar: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 0,
    flexDirection: "row",
    minHeight: 80,
    paddingHorizontal: 14,
    paddingTop: 14,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  tabBarCompact: {
    minHeight: 74,
    paddingHorizontal: 10,
    paddingTop: 12,
  },
  tabClusterLeft: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  tabClusterRight: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  homeSpacer: {
    width: 86,
  },
  homeSpacerCompact: {
    width: 74,
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  tabButtonCompact: {
    minHeight: 46,
    paddingHorizontal: 4,
  },
  tabButtonSingle: {
    alignSelf: "center",
    maxWidth: 92,
    minWidth: 72,
  },
  tabGlyph: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderRadius: 8,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  tabGlyphText: {
    color: palette.slate,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },
  tabGlyphTextActive: {
    color: palette.canvas,
  },
  tabBadge: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: palette.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: palette.canvas,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
  },
  tabLabel: {
    color: palette.slate,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  tabLabelCompact: {
    fontSize: 9,
    letterSpacing: 0,
  },
  tabHelper: {
    color: palette.slate,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  homeFab: {
    alignItems: "center",
    alignSelf: "center",
    position: "absolute",
    top: -18,
  },
  homeOrb: {
    alignItems: "center",
    backgroundColor: palette.accentDeep,
    borderColor: palette.card,
    borderRadius: 31,
    borderWidth: 3,
    elevation: 0,
    height: 62,
    justifyContent: "center",
    shadowColor: palette.accentDeep,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    width: 62,
  },
  homeOrbActive: {
    backgroundColor: palette.accent,
    shadowColor: palette.accentDeep,
  },
  homeOrbText: {
    color: palette.canvas,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 28,
  },
  homeLabel: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 5,
    textTransform: "uppercase",
  },
  homeLabelCompact: {
    fontSize: 10,
    marginTop: 4,
  },
  homeLabelActive: {
    color: palette.accentDeep,
  },
  homeHint: {
    color: palette.slate,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  homeHintActive: {
    color: palette.accent,
  },
  loadingWrap: {
    alignItems: "center",
    backgroundColor: palette.canvas,
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  loadingText: {
    color: palette.slate,
    fontSize: 14,
  },
}));
