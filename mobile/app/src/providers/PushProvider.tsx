import { useEffect, useRef, type PropsWithChildren } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications } from "../lib/push";
import { registerPushToken } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { navRef } from "../navigation/AppNavigator";

const TOKEN_CACHE_KEY = "servfix_push_token_v1";

export function PushProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const lastTokenRef = useRef<string | null>(null);
  const responseSubRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!user?.id) {
      lastTokenRef.current = null;
      return;
    }

    let isMounted = true;

    const syncToken = async () => {
      const result = await registerForPushNotifications();
      if (!isMounted || !result.granted || !result.token) {
        return;
      }

      const cacheKey = `${user.id}:${result.token}`;
      const cached = await AsyncStorage.getItem(TOKEN_CACHE_KEY);
      if (cached === cacheKey) {
        lastTokenRef.current = result.token;
        return;
      }

      try {
        await registerPushToken({
          token: result.token,
          platform: Platform.OS,
          projectId: result.projectId ?? undefined,
        });
        await AsyncStorage.setItem(TOKEN_CACHE_KEY, cacheKey);
        lastTokenRef.current = result.token;
      } catch {
        // Ignore network errors; retry on next app open.
      }
    };

    void syncToken();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const navigateFromNotification = (data: Record<string, unknown> | null | undefined) => {
      const orderId =
        data && typeof data.orderId === "string" && data.orderId.trim().length > 0
          ? data.orderId
          : null;
      const threadId =
        data && typeof data.threadId === "string" && data.threadId.trim().length > 0
          ? data.threadId
          : null;

      if (!navRef.isReady()) {
        setTimeout(() => navigateFromNotification(data), 300);
        return;
      }

      if (orderId) {
        navRef.navigate("OrderDetail", { orderId, threadId: threadId ?? undefined });
        return;
      }

      navRef.navigate("Shell", { tab: "notifications" });
    };

    const attachListeners = async () => {
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastResponse?.notification?.request?.content?.data) {
        navigateFromNotification(
          lastResponse.notification.request.content.data as Record<string, unknown>,
        );
      }

      responseSubRef.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          navigateFromNotification(
            response.notification.request.content.data as Record<string, unknown>,
          );
        },
      );
    };

    void attachListeners();

    return () => {
      if (responseSubRef.current) {
        responseSubRef.current.remove();
        responseSubRef.current = null;
      }
    };
  }, []);

  return children;
}
