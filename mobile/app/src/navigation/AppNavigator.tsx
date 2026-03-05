import { NavigationContainer, type LinkingOptions } from "@react-navigation/native";
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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../providers/AuthProvider";
import { BrowseScreen } from "../screens/BrowseScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { OrdersScreen } from "../screens/OrdersScreen";
import { PaymentReturnScreen } from "../screens/PaymentReturnScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ServiceDetailScreen } from "../screens/ServiceDetailScreen";
import { SignInScreen } from "../screens/SignInScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { palette } from "../theme";
import type { PaymentReturnParams } from "../types";

type RootStackParamList = {
  Shell: { tab?: AppTab; refreshOrdersToken?: string } | undefined;
  SignIn: undefined;
  SignUp: undefined;
  ServiceDetail: { serviceId: string };
  PaymentReturn: PaymentReturnParams | undefined;
};

type AppTab = "home" | "browse" | "orders" | "account";

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["servfix://", "https://servfix.app", "https://www.servfix.app"],
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
  const [tab, setTab] = useState<AppTab>(route.params?.tab ?? "home");
  const [ordersRefreshToken, setOrdersRefreshToken] = useState<string | undefined>(
    route.params?.refreshOrdersToken,
  );

  const openSignIn = () => navigation.navigate("SignIn");
  const openService = (serviceId: string) => navigation.navigate("ServiceDetail", { serviceId });

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

  if (tab === "orders") {
    content = (
      <OrdersScreen
        onOpenPaymentStatus={(params) => navigation.navigate("PaymentReturn", params)}
        onOpenSignIn={openSignIn}
        refreshToken={ordersRefreshToken}
      />
    );
  }

  if (tab === "account") {
    content = <ProfileScreen onOpenSignIn={openSignIn} />;
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.shell}>
      <View style={styles.content}>{content}</View>
      <View style={styles.tabBar}>
        {[
          { key: "home", label: "Home", helper: "Start" },
          { key: "browse", label: "Browse", helper: "Discover" },
          { key: "orders", label: "Orders", helper: "Track" },
          { key: "account", label: "Account", helper: user ? "Profile" : "Sign in" },
        ].map((item) => {
          const isActive = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key as AppTab)}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
            >
              <View style={[styles.tabDot, isActive && styles.tabDotActive]} />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{item.label}</Text>
              <Text style={[styles.tabHelper, isActive && styles.tabHelperActive]}>{item.helper}</Text>
            </Pressable>
          );
        })}
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
    <NavigationContainer linking={linking}>
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
  tabBar: {
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 22,
    borderWidth: 1,
    bottom: 0,
    elevation: 4,
    borderTopColor: palette.line,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 14,
    marginTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 10,
    paddingTop: 8,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: 52,
  },
  tabButtonActive: {
    backgroundColor: "#ecfeff",
  },
  tabDot: {
    backgroundColor: "#cbd5e1",
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  tabDotActive: {
    backgroundColor: palette.accent,
  },
  tabLabel: {
    color: palette.slate,
    fontSize: 12,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: palette.ink,
  },
  tabHelper: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "600",
  },
  tabHelperActive: {
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
