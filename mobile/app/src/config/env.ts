import { Platform } from "react-native";

const localApiByPlatform =
  Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_SERVFIX_API_URL?.trim();
const isProductionBuild = process.env.NODE_ENV === "production";

const isLocalAddress = (value: string) =>
  /^(http:\/\/)?(10\.0\.2\.2|localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value);

if (isProductionBuild) {
  if (!configuredApiBaseUrl) {
    throw new Error(
      "EXPO_PUBLIC_SERVFIX_API_URL is required for production mobile builds.",
    );
  }

  if (!/^https:\/\//i.test(configuredApiBaseUrl)) {
    throw new Error(
      "EXPO_PUBLIC_SERVFIX_API_URL must use HTTPS for production mobile builds.",
    );
  }

  if (isLocalAddress(configuredApiBaseUrl)) {
    throw new Error(
      "EXPO_PUBLIC_SERVFIX_API_URL cannot point to localhost/10.0.2.2 for production mobile builds.",
    );
  }
}

export const API_BASE_URL = configuredApiBaseUrl || localApiByPlatform;
