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
  user: AuthUser;
};

export type AdminMfaChallengeResponse = {
  mfaRequired: true;
  mfaToken: string;
  delivery: {
    channel: "email";
    destination: string;
  };
  expiresInSeconds: number;
};

export type PhoneOtpChallengeResponse = {
  otpRequired: true;
  challengeToken: string;
  delivery: {
    channel: "provider" | "debug";
    destination: string;
  };
  expiresInSeconds: number;
};

export const isAdminMfaChallengeResponse = (
  value: AuthResponse | AdminMfaChallengeResponse,
): value is AdminMfaChallengeResponse => {
  return "mfaRequired" in value && value.mfaRequired === true;
};

export const isPhoneOtpChallengeResponse = (
  value: AuthResponse | PhoneOtpChallengeResponse,
): value is PhoneOtpChallengeResponse => {
  return "otpRequired" in value && value.otpRequired === true;
};

export function getIdentifierPayload(identifier: string) {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return { email: trimmed };
  }
  return { phone: trimmed };
}

export function persistAuth(response: AuthResponse) {
  localStorage.setItem(USER_KEY, JSON.stringify(response.user));
  localStorage.removeItem(TOKEN_KEY);
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
    case "Enter a valid phone number.":
      return "Enter a valid phone number.";
    case "Invalid or expired phone verification code.":
      return "The verification code is invalid or has expired.";
    case "Phone verification is unavailable right now.":
      return "Phone verification is unavailable right now.";
    case "Too many verification requests. Please try again later.":
      return "Too many verification requests. Please try again later.";
    case "Registration details are required.":
      return "Complete registration details before verifying your phone.";
    case "An account with this phone already exists.":
      return "An account with this phone already exists.";
    case "Invalid or expired admin verification code.":
      return "The verification code is invalid or has expired.";
    case "Admin MFA verification required.":
      return "Admin verification is required to continue.";
    case "Admin MFA email delivery is not configured.":
      return "Admin verification is unavailable. Contact support.";
    case "Admin MFA requires a verified email address.":
      return "Add a verified email to your account before signing in.";
    case "Invitation is invalid or expired.":
      return "This invitation link is invalid or has expired.";
    case "Password is required to activate this staff invitation.":
      return "Set a password to activate this invited account.";
    case "This account cannot be invited.":
      return "This account is not eligible for invitation.";
    case "You cannot delete your account while you have active orders or deposits.":
      return "You still have active orders or deposits, so account deletion is blocked.";
    case "An account deletion request is already pending approval.":
      return "Your account deletion request is already pending admin approval.";
    case "Provider does not qualify for deletion yet.":
      return "Your account cannot be deleted yet due to active provider obligations.";
    case "Self-service deletion is only available for buyer and provider accounts.":
      return "Self-service deletion is only available for buyer and provider accounts.";
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
