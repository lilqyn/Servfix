import { Platform } from "react-native";

const localApiByPlatform =
  Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_SERVFIX_API_URL?.trim() || localApiByPlatform;
