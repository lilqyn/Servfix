import {
  NavigationContainer,
  createNavigationContainerRef,
  type LinkingOptions,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../providers/AuthProvider";
import { BrowseScreen } from "../screens/BrowseScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { OrdersScreen } from "../screens/OrdersScreen";
import { PaymentReturnScreen } from "../screens/PaymentReturnScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ServiceDetailScreen } from "../screens/ServiceDetailScreen";
import { SignInScreen } from "../screens/SignInScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { OrderDetailScreen } from "../screens/OrderDetailScreen";
import { palette } from "../theme";
import type { Order, PaymentReturnParams } from "../types";

type RootStackParamList = {
  Shell: { tab?: AppTab; refreshOrdersToken?: string } | undefined;
  SignIn: undefined;
  SignUp: undefined;
  ServiceDetail: { serviceId: string };
  OrderDetail: { orderId: string; seedOrder?: Order; threadId?: string };
  PaymentReturn: PaymentReturnParams | undefined;
};

type AppTab = "home" | "browse" | "notifications" | "orders" | "account";

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
    },
  },
};

function ShellScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, "Shell">) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const [tab, setTab] = useState<AppTab>(route.params?.tab ?? "home");
  const [ordersRefreshToken, setOrdersRefreshToken] = useState<string | undefined>(
    route.params?.refreshOrdersToken,
  );

  const openSignIn = () => navigation.navigate("SignIn");
  const openService = (serviceId: string) => navigation.navigate("ServiceDetail", { serviceId });
  const openOrder = (order: Order) =>
    navigation.navigate("OrderDetail", { orderId: order.id, seedOrder: order });
  const openOrderById = (orderId: string, threadId?: string) =>
    navigation.navigate("OrderDetail", { orderId, threadId });
  const openNotifications = () => setTab("notifications");

  useEffect(() => {
    if (route.params?.tab) {
      setTab(route.params.tab);
    }
    if (route.params?.refreshOrdersToken) {
      setOrdersRefreshToken(route.params.refreshOrdersToken);
    }
  }, [route.params?.refreshOrdersToken, route.params?.tab]);

  let content = (
    <HomeScreen onBrowse={() => setTab("browse")} onOpenSignIn={openSignIn} user={user} />
  );

  if (tab === "browse") {
    content = <BrowseScreen onOpenService={openService} />;
  }

  if (tab === "notifications") {
    content = <NotificationsScreen onOpenOrder={openOrderById} onOpenSignIn={openSignIn} />;
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

  if (tab === "account") {
    content = (
      <ProfileScreen onOpenSignIn={openSignIn} onOpenNotifications={openNotifications} />
    );
  }

  const leftTabs: Array<{
    key: Exclude<AppTab, "home">;
    label: string;
    helper: string;
    tone: string;
    activeBg: string;
    glyph: string;
  }> = [
    { key: "browse", label: "Browse", helper: "Discover", tone: "#15803d", activeBg: "#ecfdf3", glyph: "B" },
    {
      key: "notifications",
      label: "Alerts",
      helper: "Updates",
      tone: "#0369a1",
      activeBg: "#e0f2fe",
      glyph: "N",
    },
    { key: "orders", label: "Orders", helper: "Track", tone: "#ea580c", activeBg: "#fff7ed", glyph: "O" },
  ];
  const rightTabs: Array<{
    key: Exclude<AppTab, "home">;
    label: string;
    helper: string;
    tone: string;
    activeBg: string;
    glyph: string;
  }> = [
    {
      key: "account",
      label: "Account",
      helper: user ? "Profile" : "Sign in",
      tone: "#111111",
      activeBg: "#f3f4f6",
      glyph: "A",
    },
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
                  <View
                    style={[
                      styles.tabGlyph,
                      { borderColor: item.tone },
                      isActive && { backgroundColor: item.tone },
                    ]}
                  >
                    <Text style={[styles.tabGlyphText, isActive && styles.tabGlyphTextActive]}>
                      {item.glyph}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.tabLabel,
                      isCompact && styles.tabLabelCompact,
                      isActive && { color: item.tone },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {!isCompact ? (
                    <Text style={[styles.tabHelper, isActive && { color: item.tone }]}>
                      {item.helper}
                    </Text>
                  ) : null}
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
                    styles.tabButtonSingle,
                    isCompact && styles.tabButtonCompact,
                    isActive && { backgroundColor: item.activeBg },
                  ]}
                >
                  <View
                    style={[
                      styles.tabGlyph,
                      { borderColor: item.tone },
                      isActive && { backgroundColor: item.tone },
                    ]}
                  >
                    <Text style={[styles.tabGlyphText, isActive && styles.tabGlyphTextActive]}>
                      {item.glyph}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.tabLabel,
                      isCompact && styles.tabLabelCompact,
                      isActive && { color: item.tone },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {!isCompact ? (
                    <Text style={[styles.tabHelper, isActive && { color: item.tone }]}>
                      {item.helper}
                    </Text>
                  ) : null}
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
            <Text style={styles.homeOrbText}>H</Text>
          </View>
          <Text style={[styles.homeLabel, isCompact && styles.homeLabelCompact, tab === "home" && styles.homeLabelActive]}>
            Home
          </Text>
          {!isCompact ? (
            <Text style={[styles.homeHint, tab === "home" && styles.homeHintActive]}>Start</Text>
          ) : null}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export function AppNavigator() {
  const { isBooting } = useAuth();

  if (isBooting) {
    return (
      <SafeAreaView edges={["top"]} style={styles.loadingWrap}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.loadingText}>Starting Servfix...</Text>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer linking={linking} ref={navRef}>
      <Stack.Navigator
        screenOptions={{
          contentStyle: { backgroundColor: palette.canvas },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: palette.canvas },
          headerTitleStyle: { color: palette.ink, fontWeight: "700" },
        }}
      >
        <Stack.Screen
          component={ShellScreen}
          name="Shell"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="SignIn" options={{ title: "Sign in" }}>
          {({ navigation }) => (
            <SignInScreen
              onOpenSignUp={() => navigation.navigate("SignUp")}
              onSuccess={() => navigation.replace("Shell")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="SignUp" options={{ title: "Create account" }}>
          {({ navigation }) => (
            <SignUpScreen
              onOpenSignIn={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                  return;
                }
                navigation.navigate("SignIn");
              }}
              onSuccess={() => navigation.replace("Shell")}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="ServiceDetail" options={{ title: "Service details" }}>
          {({ route, navigation }) => (
            <ServiceDetailScreen
              onOpenOrders={() => navigation.navigate("Shell", { tab: "orders" })}
              onOpenSignIn={() => navigation.navigate("SignIn")}
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 0,
    flexDirection: "row",
    minHeight: 80,
    paddingHorizontal: 14,
    paddingTop: 14,
    shadowColor: "#111111",
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
    justifyContent: "flex-end",
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
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  tabGlyphText: {
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },
  tabGlyphTextActive: {
    color: "#ffffff",
  },
  tabLabel: {
    color: "#4b5563",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tabLabelCompact: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  tabHelper: {
    color: "#6b7280",
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
    borderColor: "#ffffff",
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
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 28,
  },
  homeLabel: {
    color: "#374151",
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
    color: "#6b7280",
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
});
