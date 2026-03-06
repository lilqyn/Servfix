import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

const notificationHandlerSet = (() => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  return true;
})();

const ensureAndroidChannel = async () => {
  if (Platform.OS !== "android") {
    return;
  }
  await Notifications.setNotificationChannelAsync("default", {
    name: "General",
    importance: Notifications.AndroidImportance.MAX,
  });
};

const getProjectId = () => {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    // @ts-expect-error easConfig is available at runtime
    Constants?.easConfig?.projectId ??
    null
  );
};

export async function registerForPushNotifications(): Promise<{
  granted: boolean;
  token?: string;
  projectId?: string | null;
}> {
  void notificationHandlerSet;
  await ensureAndroidChannel();

  if (!Device.isDevice) {
    return { granted: false };
  }

  const permissions = await Notifications.getPermissionsAsync();
  let finalStatus = permissions.status;

  if (finalStatus !== "granted") {
    const request = await Notifications.requestPermissionsAsync();
    finalStatus = request.status;
  }

  if (finalStatus !== "granted") {
    return { granted: false };
  }

  const projectId = getProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  return {
    granted: true,
    token: tokenResponse.data,
    projectId,
  };
}
