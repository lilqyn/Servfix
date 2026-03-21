import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

const notificationHandlerSet = (() => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
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
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "General",
      importance: Notifications.AndroidImportance.MAX,
    });
  } catch {
    // Notification channels are not supported in Expo Go
  }
};

const getProjectId = () => {
  const easProjectId =
    (Constants as typeof Constants & { easConfig?: { projectId?: string | null } }).easConfig
      ?.projectId ?? null;

  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    easProjectId ??
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

  // Remote push notifications are not supported in Expo Go since SDK 53.
  const executionEnv = (Constants as typeof Constants & { executionEnvironment?: string }).executionEnvironment;
  const appOwnership = (Constants as typeof Constants & { appOwnership?: string }).appOwnership;
  if (executionEnv === "storeClient" || appOwnership === "expo") {
    return { granted: false };
  }

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
