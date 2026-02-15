import * as z from "zod";
import type { UserRole } from "@/lib/roles";

const emailSchema = z.string().email();

const TOKEN_KEY = "servfix-token";
const USER_KEY = "servfix-user";
const LEGACY_TOKEN_KEY = "serveghana-token";
const LEGACY_USER_KEY = "serveghana-user";

export const identifierSchema = z
  .string()
  .trim()
  .min(3, "Email or phone is required")
  .refine(
    (value) => {
      if (value.includes("@")) {
        return emailSchema.safeParse(value).success;
      }
      return value.replace(/\D/g, "").length >= 7;
    },
    { message: "Enter a valid email or phone number" },
  );

export type AuthUser = {
  id: string;
  role: UserRole;
  status?: "active" | "suspended" | "deleted";
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  createdAt?: string;
  providerProfile?: unknown;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export function getIdentifierPayload(identifier: string) {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return { email: trimmed };
  }
  return { phone: trimmed };
}

export function persistAuth(response: AuthResponse) {
  localStorage.setItem(TOKEN_KEY, response.token);
  localStorage.setItem(USER_KEY, JSON.stringify(response.user));
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

export function mapAuthErrorMessage(message: string) {
  if (!message) {
    return "Something went wrong. Please try again.";
  }

  switch (message) {
    case "Invalid credentials":
      return "Incorrect email/phone or password.";
    case "Account is not active":
      return "Your account is not active yet.";
    case "Google authentication is not configured":
      return "Google sign-in is not configured yet.";
    case "Invalid Google token":
      return "Google sign-in failed. Please try again.";
    case "Google account email not verified":
      return "Your Google account email is not verified.";
    case "Email already linked to another Google account":
      return "That email is already linked to another Google account.";
    case "Account not found. Please sign up first.":
      return "We couldn’t find an account for that Google profile. Please sign up first.";
    case "Password reset token is invalid or expired":
      return "That reset link is invalid or has expired.";
    case "Username already taken":
      return "That username is already taken.";
    case "Username cannot be a UUID.":
      return "Choose a username that is not a UUID.";
    case "Unique constraint failed":
      return "An account with that email or phone already exists.";
    case "Validation error":
      return "Please check your details and try again.";
    default:
      return message;
  }
}
