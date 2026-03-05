import { Router, type Request, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "../db.js";
import { env } from "../config.js";
import { asyncHandler } from "../utils/async-handler.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { authRequired } from "../middleware/auth.js";
import {
  ACCESS_TOKEN_TTL_MS,
  clearAuthCookies,
  createAccessToken,
  createRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  getRefreshTokenMetadata,
  getRefreshTokenExpiry,
  getRefreshTokenFromRequest,
  getSessionMetadata,
  hashRefreshToken,
  setAuthCookies,
} from "../auth/session.js";
import { signS3Key } from "../utils/s3.js";
import { sendEmail } from "../utils/email.js";
import { ADMIN_ROLES } from "../utils/permissions.js";
import { getPlatformSettings } from "../utils/platform-settings.js";

export const authRouter = Router();

const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
const appUrlBase = env.APP_URL.trim().replace(/\/+$/, "");
const passwordResetBase = appUrlBase.split("#")[0].replace(/\/+$/, "");
const PASSWORD_RESET_TTL_MINUTES = 60;
const ADMIN_MFA_CODE_LENGTH = 6;
const ADMIN_MFA_TTL_MINUTES = 10;
const PHONE_OTP_CODE_LENGTH = 6;
const PHONE_OTP_TTL_MINUTES = 10;
const PHONE_OTP_MAX_ATTEMPTS = 5;
const PHONE_OTP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PHONE_OTP_RATE_LIMIT_MAX_REQUESTS = 5;
const STAFF_INVITE_TOKEN_MIN_LENGTH = 20;
const isProduction = process.env.NODE_ENV === "production";
const ACCESS_TOKEN_TTL_SECONDS = Math.floor(ACCESS_TOKEN_TTL_MS / 1000);
const REFRESH_TOKEN_TTL_SECONDS = Math.floor(REFRESH_TOKEN_TTL_MS / 1000);
const SESSION_EXPIRED_ERROR = "Session expired";
const ADMIN_MFA_VERIFICATION_REQUIRED_ERROR = "Admin MFA verification required.";
const MOBILE_ADMIN_BLOCKED_ERROR = "Admins must use the web app.";

const publicUserSelect = {
  id: true,
  email: true,
  phone: true,
  username: true,
  location: true,
  role: true,
  status: true,
  createdAt: true,
  avatarKey: true,
  bannerKey: true,
  providerProfile: true,
} satisfies Prisma.UserSelect;

type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

const isAdminRole = (role: PublicUser["role"]) => ADMIN_ROLES.includes(role);

const isAdminMfaRequired = async (role: PublicUser["role"]) => {
  if (!isAdminRole(role)) {
    return false;
  }
  const { settings } = await getPlatformSettings();
  return settings.securityControls.requireMfaForAdmins;
};

const resolveMediaUrl = async (key?: string | null) => {
  if (!key) {
    return null;
  }
  if (key.startsWith("http")) {
    return key;
  }
  const signed = await signS3Key(key);
  return signed ?? null;
};

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUsername = (username: string) => username.trim().toLowerCase();

const isUsernameValid = (username: string) => /^[a-z0-9_]{3,20}$/.test(username);

const assertUsernameAvailable = async (username: string) => {
  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Username already taken");
  }
};

const ensureUsername = async (input?: string | null) => {
  if (input) {
    const normalized = normalizeUsername(input);
    if (!isUsernameValid(normalized)) {
      throw new Error(
        "Username must be 3-20 characters and use only letters, numbers, or underscores.",
      );
    }
    if (uuidRegex.test(normalized)) {
      throw new Error("Username cannot be a UUID.");
    }
    await assertUsernameAvailable(normalized);
    return normalized;
  }

  return undefined;
};

const sanitizeUsernameBase = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");

const generateUsername = async (seed: string) => {
  const base = sanitizeUsernameBase(seed) || "user";
  const maxLength = 20;

  for (let i = 0; i < 50; i += 1) {
    const suffix = i === 0 ? "" : String(i);
    const raw = `${base}${suffix}`;
    const candidate = raw.slice(0, maxLength);
    if (!isUsernameValid(candidate)) {
      continue;
    }
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  const fallbackBase = "user";
  for (let i = 0; i < 50; i += 1) {
    const suffix = Math.floor(Math.random() * 10000);
    const candidate = `${fallbackBase}${suffix}`.slice(0, maxLength);
    if (!isUsernameValid(candidate)) {
      continue;
    }
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a username.");
};

const withMedia = async <T extends { avatarKey?: string | null; bannerKey?: string | null }>(
  user: T,
) => {
  const avatarUrl = await resolveMediaUrl(user.avatarKey);
  const bannerUrl = await resolveMediaUrl(user.bannerKey);
  const { avatarKey: _avatarKey, bannerKey: _bannerKey, ...rest } = user;
  return { ...rest, avatarUrl, bannerUrl };
};

const createIssuedAuthTokens = (
  user: { id: string; role: PublicUser["role"] },
  options: { adminMfaVerified?: boolean } = {},
) => {
  const adminMfaVerified = options.adminMfaVerified === true;
  const refreshToken = createRefreshToken({ adminMfaVerified });
  const accessToken = createAccessToken({
    sub: user.id,
    role: user.role,
    ...(adminMfaVerified ? { mfa: true } : {}),
  });

  return {
    accessToken,
    refreshToken,
    adminMfaVerified,
  };
};

const createAuthSessionData = (
  req: Pick<Request, "headers" | "ip" | "get">,
  userId: string,
  refreshTokenHash: string,
) => ({
  userId,
  refreshTokenHash,
  expiresAt: getRefreshTokenExpiry(),
  ...getSessionMetadata(req),
});

const createPersistedAuthTokens = async (
  req: Pick<Request, "headers" | "ip" | "get">,
  user: { id: string; role: PublicUser["role"] },
  options: { adminMfaVerified?: boolean } = {},
) => {
  const issued = createIssuedAuthTokens(user, options);

  await prisma.authSession.create({
    data: createAuthSessionData(req, user.id, hashRefreshToken(issued.refreshToken)),
  });

  return issued;
};

const rotatePersistedAuthTokens = async (
  req: Pick<Request, "headers" | "ip" | "get">,
  session: { id: string },
  user: { id: string; role: PublicUser["role"] },
  options: { adminMfaVerified?: boolean } = {},
) => {
  const issued = createIssuedAuthTokens(user, options);
  const now = new Date();

  await prisma.$transaction([
    prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: now },
    }),
    prisma.authSession.create({
      data: createAuthSessionData(req, user.id, hashRefreshToken(issued.refreshToken)),
    }),
  ]);

  return issued;
};

const resolveRefreshSession = async (refreshToken: string) => {
  const refreshTokenMetadata = getRefreshTokenMetadata(refreshToken);
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  const session = await prisma.authSession.findUnique({
    where: { refreshTokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= now) {
    if (session && !session.revokedAt) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
    }
    throw new Error(SESSION_EXPIRED_ERROR);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: publicUserSelect,
  });

  if (!user || user.status !== "active") {
    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });
    throw new Error(SESSION_EXPIRED_ERROR);
  }

  if (await isAdminMfaRequired(user.role)) {
    if (!refreshTokenMetadata.adminMfaVerified) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      throw new Error(ADMIN_MFA_VERIFICATION_REQUIRED_ERROR);
    }
  }

  return {
    session,
    user,
    adminMfaVerified: refreshTokenMetadata.adminMfaVerified,
  };
};

const isKnownRefreshError = (error: unknown): error is Error =>
  error instanceof Error &&
  (error.message === SESSION_EXPIRED_ERROR ||
    error.message === ADMIN_MFA_VERIFICATION_REQUIRED_ERROR);

const isMobileAllowedRole = (role: PublicUser["role"]) => !isAdminRole(role);

const formatMobileAuthResponse = async (
  user: PublicUser,
  issued: { accessToken: string; refreshToken: string },
) => {
  return {
    user: await withMedia(user),
    accessToken: issued.accessToken,
    refreshToken: issued.refreshToken,
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshExpiresInSeconds: REFRESH_TOKEN_TTL_SECONDS,
  };
};

const toMobileAuthResponse = async (
  req: Pick<Request, "headers" | "ip" | "get">,
  user: PublicUser,
  options: { adminMfaVerified?: boolean } = {},
) => formatMobileAuthResponse(user, await createPersistedAuthTokens(req, user, options));

const issueAuthSession = async (
  req: Request,
  res: Response,
  user: { id: string; role: PublicUser["role"] },
  options: { adminMfaVerified?: boolean } = {},
) => {
  const issued = await createPersistedAuthTokens(req, user, options);
  setAuthCookies(res, issued);
};

const createPasswordResetToken = () => randomBytes(32).toString("base64url");

const hashPasswordResetToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const hashStaffInviteToken = (token: string) =>
  createHash("sha256").update(`staff-invite:${token}`).digest("hex");

const createAdminMfaCode = () =>
  String(randomInt(0, 10 ** ADMIN_MFA_CODE_LENGTH)).padStart(ADMIN_MFA_CODE_LENGTH, "0");

const hashAdminMfaToken = (token: string, code: string) =>
  createHash("sha256").update(`admin-mfa:${token}:${code}`).digest("hex");

const normalizeAuthPhone = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const stripped = trimmed.replace(/[^\d+]/g, "");
  const hasExplicitPlus = stripped.startsWith("+");
  let digits = stripped.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Convert common Ghana local format (0XXXXXXXXX) to +233XXXXXXXXX.
  if (!hasExplicitPlus && digits.length === 10 && digits.startsWith("0")) {
    digits = `233${digits.slice(1)}`;
  }

  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return null;
  }

  return `+${digits}`;
};

const maskPhoneNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) {
    return phone;
  }
  const visibleSuffix = digits.slice(-4);
  return `${"*".repeat(Math.max(2, digits.length - 4))}${visibleSuffix}`;
};

const createPhoneOtpCode = () =>
  String(randomInt(0, 10 ** PHONE_OTP_CODE_LENGTH)).padStart(PHONE_OTP_CODE_LENGTH, "0");

const hashPhoneOtpToken = (token: string) => createHash("sha256").update(`phone-otp-token:${token}`).digest("hex");

const hashPhoneOtpCode = (token: string, code: string) =>
  createHash("sha256").update(`phone-otp-code:${token}:${code}`).digest("hex");

const timingSafeEqualString = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const sendPhoneOtpMessage = async (params: { phone: string; code: string; mode: "login" | "register" }) => {
  const { settings } = await getPlatformSettings();
  const sms = settings.integrations.sms;
  const senderId = sms.senderId?.trim() || "SERVFIX";
  const text = `Your Servfix verification code is ${params.code}. It expires in ${PHONE_OTP_TTL_MINUTES} minutes.`;

  if (sms.provider === "disabled") {
    if (!isProduction) {
      console.info(
        `[servfix:phone-otp:debug] to=${params.phone} mode=${params.mode} code=${params.code}`,
      );
      return { sent: true as const, channel: "debug" as const };
    }
    return {
      sent: false as const,
      reason: "Phone verification is unavailable right now.",
    };
  }

  if (sms.provider === "custom") {
    const endpoint = sms.apiKey?.trim();
    if (!endpoint) {
      return {
        sent: false as const,
        reason: "Phone verification is unavailable right now.",
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: params.phone,
          senderId,
          message: text,
          context: { purpose: "phone_auth", mode: params.mode },
        }),
      });
      if (!response.ok) {
        throw new Error(`Custom SMS endpoint failed with status ${response.status}.`);
      }
      return { sent: true as const, channel: "provider" as const };
    } catch {
      if (!isProduction) {
        console.info(
          `[servfix:phone-otp:debug] custom-provider-fallback to=${params.phone} mode=${params.mode} code=${params.code}`,
        );
        return { sent: true as const, channel: "debug" as const };
      }
      return {
        sent: false as const,
        reason: "Phone verification is unavailable right now.",
      };
    }
  }

  if (!isProduction) {
    console.info(
      `[servfix:phone-otp:debug] unsupported-provider=${sms.provider} to=${params.phone} mode=${params.mode} code=${params.code}`,
    );
    return { sent: true as const, channel: "debug" as const };
  }

  return {
    sent: false as const,
    reason: "Phone verification is unavailable right now.",
  };
};

const maskEmailAddress = (email: string) => {
  const [localPart, domain = ""] = email.split("@");
  if (!localPart || !domain) {
    return email;
  }
  const visibleLocal = localPart.length <= 2 ? localPart[0] ?? "*" : localPart.slice(0, 2);
  return `${visibleLocal}${"*".repeat(Math.max(1, localPart.length - visibleLocal.length))}@${domain}`;
};

const createAdminMfaChallenge = async (params: { user: PublicUser }) => {
  const recipient = params.user.email?.trim();
  if (!recipient) {
    throw new Error("Admin MFA requires a verified email address.");
  }

  const mfaToken = createPasswordResetToken();
  const code = createAdminMfaCode();
  const tokenHash = hashAdminMfaToken(mfaToken, code);
  const expiresAt = new Date(Date.now() + ADMIN_MFA_TTL_MINUTES * 60_000);

  await prisma.passwordResetToken.create({
    data: {
      userId: params.user.id,
      tokenHash,
      expiresAt,
    },
  });

  const subject = "Servfix admin verification code";
  const text = [
    "Your Servfix admin verification code is:",
    "",
    code,
    "",
    `This code expires in ${ADMIN_MFA_TTL_MINUTES} minutes.`,
    "If you did not request this login, ignore this email and reset your password.",
  ].join("\n");

  try {
    const result = await sendEmail({
      to: recipient,
      subject,
      text,
      tag: "admin_mfa",
      metadata: { userId: params.user.id },
    });

    if (!result.sent) {
      throw new Error("Admin MFA email delivery is not configured.");
    }
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    throw error;
  }

  return {
    mfaRequired: true as const,
    mfaToken,
    delivery: {
      channel: "email" as const,
      destination: maskEmailAddress(recipient),
    },
    expiresInSeconds: ADMIN_MFA_TTL_MINUTES * 60,
  };
};

const buildPasswordResetUrl = (token: string) =>
  `${passwordResetBase}/#/reset-password?token=${encodeURIComponent(token)}`;

const staffInvitationSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
} satisfies Prisma.StaffInvitationSelect;

type StaffInvitationCandidate = Prisma.StaffInvitationGetPayload<{
  select: typeof staffInvitationSelect;
}>;

const resolveActiveStaffInvitation = async (
  token: string,
  now: Date,
): Promise<StaffInvitationCandidate | null> => {
  const invitation = await prisma.staffInvitation.findUnique({
    where: { tokenHash: hashStaffInviteToken(token) },
    select: staffInvitationSelect,
  });

  if (!invitation) {
    return null;
  }

  if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now) {
    return null;
  }

  if (!isAdminRole(invitation.role)) {
    return null;
  }

  return invitation;
};

const registerSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  username: z.string().trim().min(3).max(20).optional(),
  password: z.string().min(8),
  role: z.enum(["buyer", "provider"]),
  displayName: z.string().min(2).max(80).optional(),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const normalizedPhone = data.phone ? normalizeAuthPhone(data.phone) : null;

    if (data.phone && !normalizedPhone) {
      return res.status(400).json({ error: "Enter a valid phone number." });
    }

    if (!data.email && !normalizedPhone) {
      return res.status(400).json({ error: "Email or phone is required" });
    }

    let normalizedUsername: string | undefined;
    if (data.username) {
      const rawUsername = data.username.trim();
      const normalized = rawUsername.toLowerCase();
      const isValid = /^[a-z0-9_]{3,20}$/.test(normalized);
      if (!isValid) {
        return res.status(400).json({
          error: "Username must be 3-20 characters and use only letters, numbers, or underscores.",
        });
      }
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          normalized,
        );
      if (isUuid) {
        return res.status(400).json({ error: "Username cannot be a UUID." });
      }
      const existing = await prisma.user.findUnique({
        where: { username: normalized },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }
      normalizedUsername = normalized;
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        phone: normalizedPhone ?? undefined,
        ...(normalizedUsername ? { username: normalizedUsername } : {}),
        passwordHash,
        role: data.role,
        providerProfile:
          data.role === "provider"
            ? {
                create: {
                  displayName: data.displayName ?? "Provider",
                  categories: [],
                },
              }
            : undefined,
      },
      select: publicUserSelect,
    });

    await issueAuthSession(req, res, user);
    res.status(201).json({ user: await withMedia(user) });
  }),
);

authRouter.post(
  "/mobile/register",
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const normalizedPhone = data.phone ? normalizeAuthPhone(data.phone) : null;

    if (data.phone && !normalizedPhone) {
      return res.status(400).json({ error: "Enter a valid phone number." });
    }

    if (!data.email && !normalizedPhone) {
      return res.status(400).json({ error: "Email or phone is required" });
    }

    let normalizedUsername: string | undefined;
    if (data.username) {
      const rawUsername = data.username.trim();
      const normalized = rawUsername.toLowerCase();
      const isValid = /^[a-z0-9_]{3,20}$/.test(normalized);
      if (!isValid) {
        return res.status(400).json({
          error: "Username must be 3-20 characters and use only letters, numbers, or underscores.",
        });
      }
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          normalized,
        );
      if (isUuid) {
        return res.status(400).json({ error: "Username cannot be a UUID." });
      }
      const existing = await prisma.user.findUnique({
        where: { username: normalized },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }
      normalizedUsername = normalized;
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        phone: normalizedPhone ?? undefined,
        ...(normalizedUsername ? { username: normalizedUsername } : {}),
        passwordHash,
        role: data.role,
        providerProfile:
          data.role === "provider"
            ? {
                create: {
                  displayName: data.displayName ?? "Provider",
                  categories: [],
                },
              }
            : undefined,
      },
      select: publicUserSelect,
    });

    return res.status(201).json(await toMobileAuthResponse(req, user));
  }),
);

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  password: z.string().min(8),
});

const adminMfaVerifySchema = z.object({
  mfaToken: z.string().min(20),
  code: z.string().regex(/^\d{6}$/),
});

const mobileRefreshSchema = z.object({
  refreshToken: z.string().min(20),
});

const mobileLogoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

const phoneOtpModeSchema = z.enum(["login", "register"]);

const phoneOtpRequestSchema = z.object({
  phone: z.string().min(7),
  mode: phoneOtpModeSchema,
});

const phoneRegisterPayloadSchema = z.object({
  username: z.string().trim().min(3).max(20).optional(),
  password: z.string().min(8),
  role: z.enum(["buyer", "provider"]),
  displayName: z.string().trim().min(2).max(80).optional(),
});

const phoneOtpVerifySchema = z.object({
  mode: phoneOtpModeSchema,
  challengeToken: z.string().min(20),
  code: z.string().regex(/^\d{6}$/),
  register: phoneRegisterPayloadSchema.optional(),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
});

const staffInviteQuerySchema = z.object({
  token: z.string().min(STAFF_INVITE_TOKEN_MIN_LENGTH),
});

const staffInviteAcceptSchema = z.object({
  token: z.string().min(STAFF_INVITE_TOKEN_MIN_LENGTH),
  username: z.string().trim().min(3).max(20).optional(),
  password: z.string().min(8).optional(),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1),
  mode: z.enum(["login", "register"]),
  role: z.enum(["buyer", "provider"]).optional(),
  username: z.string().trim().min(3).max(20).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
});

const authenticatePasswordLogin = async (data: z.infer<typeof loginSchema>) => {
  const normalizedPhone = data.phone ? normalizeAuthPhone(data.phone) : null;

  if (data.phone && !normalizedPhone) {
    throw new Error("Enter a valid phone number.");
  }

  if (!data.email && !normalizedPhone) {
    throw new Error("Email or phone is required");
  }

  const or: Array<{ email?: string; phone?: string }> = [];
  if (data.email) {
    or.push({ email: data.email });
  }
  if (data.phone) {
    or.push({ phone: normalizedPhone! });
  }

  const user = await prisma.user.findFirst({
    where: { OR: or },
    select: { ...publicUserSelect, passwordHash: true },
  });

  if (!user || !user.passwordHash) {
    throw new Error("Invalid credentials");
  }

  if (user.status !== "active") {
    throw new Error("Account is not active");
  }

  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) {
    throw new Error("Invalid credentials");
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
};

const verifyAdminMfaChallenge = async (data: z.infer<typeof adminMfaVerifySchema>) => {
  const now = new Date();
  const tokenHash = hashAdminMfaToken(data.mfaToken, data.code);

  const challenge = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, userId: true },
  });

  if (!challenge) {
    throw new Error("Invalid or expired admin verification code.");
  }

  const markedUsed = await prisma.passwordResetToken.updateMany({
    where: {
      id: challenge.id,
      usedAt: null,
    },
    data: { usedAt: now },
  });

  if (markedUsed.count === 0) {
    throw new Error("Invalid or expired admin verification code.");
  }

  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: publicUserSelect,
  });

  if (!user || user.status !== "active" || !isAdminRole(user.role)) {
    throw new Error("Invalid verification challenge.");
  }

  return user;
};

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    let safeUser: PublicUser;
    try {
      safeUser = await authenticatePasswordLogin(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid credentials";
      const status =
        message === "Account is not active"
          ? 403
          : message === "Enter a valid phone number." || message === "Email or phone is required"
            ? 400
            : 401;
      return res.status(status).json({ error: message });
    }

    if (await isAdminMfaRequired(safeUser.role)) {
      const challenge = await createAdminMfaChallenge({ user: safeUser });
      return res.status(202).json(challenge);
    }

    await issueAuthSession(req, res, safeUser);
    res.json({ user: await withMedia(safeUser) });
  }),
);

authRouter.post(
  "/mobile/login",
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    let safeUser: PublicUser;
    try {
      safeUser = await authenticatePasswordLogin(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid credentials";
      const status =
        message === "Account is not active"
          ? 403
          : message === "Enter a valid phone number." || message === "Email or phone is required"
            ? 400
            : 401;
      return res.status(status).json({ error: message });
    }

    if (!isMobileAllowedRole(safeUser.role)) {
      return res.status(403).json({ error: MOBILE_ADMIN_BLOCKED_ERROR });
    }

    res.json(await toMobileAuthResponse(req, safeUser));
  }),
);

authRouter.post(
  "/phone/request-otp",
  asyncHandler(async (req, res) => {
    const data = phoneOtpRequestSchema.parse(req.body);
    const normalizedPhone = normalizeAuthPhone(data.phone);

    if (!normalizedPhone) {
      return res.status(400).json({ error: "Enter a valid phone number." });
    }

    if (data.mode === "login") {
      const user = await prisma.user.findFirst({
        where: { phone: normalizedPhone },
        select: { id: true, status: true },
      });

      if (!user) {
        return res.status(404).json({ error: "Account not found. Please sign up first." });
      }

      if (user.status !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }
    } else {
      const existing = await prisma.user.findFirst({
        where: { phone: normalizedPhone },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ error: "An account with this phone already exists." });
      }
    }

    const windowStart = new Date(Date.now() - PHONE_OTP_RATE_LIMIT_WINDOW_MS);
    const recentRequestCount = await prisma.phoneOtpChallenge.count({
      where: {
        phone: normalizedPhone,
        mode: data.mode,
        createdAt: { gt: windowStart },
      },
    });

    if (recentRequestCount >= PHONE_OTP_RATE_LIMIT_MAX_REQUESTS) {
      return res.status(429).json({ error: "Too many verification requests. Please try again later." });
    }

    const now = new Date();
    await prisma.phoneOtpChallenge.updateMany({
      where: {
        phone: normalizedPhone,
        mode: data.mode,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    const challengeToken = createPasswordResetToken();
    const code = createPhoneOtpCode();
    const tokenHash = hashPhoneOtpToken(challengeToken);
    const codeHash = hashPhoneOtpCode(challengeToken, code);
    const expiresAt = new Date(Date.now() + PHONE_OTP_TTL_MINUTES * 60_000);
    const requestMetadata = getSessionMetadata(req);

    await prisma.phoneOtpChallenge.create({
      data: {
        phone: normalizedPhone,
        mode: data.mode,
        tokenHash,
        codeHash,
        maxAttempts: PHONE_OTP_MAX_ATTEMPTS,
        expiresAt,
        requestIp: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
        lastSentAt: now,
      },
    });

    const sendResult = await sendPhoneOtpMessage({
      phone: normalizedPhone,
      code,
      mode: data.mode,
    });

    if (!sendResult.sent) {
      await prisma.phoneOtpChallenge.deleteMany({ where: { tokenHash } });
      return res.status(503).json({ error: sendResult.reason });
    }

    return res.status(202).json({
      otpRequired: true,
      challengeToken,
      delivery: {
        channel: sendResult.channel,
        destination: maskPhoneNumber(normalizedPhone),
      },
      expiresInSeconds: PHONE_OTP_TTL_MINUTES * 60,
    });
  }),
);

authRouter.post(
  "/phone/verify",
  asyncHandler(async (req, res) => {
    const data = phoneOtpVerifySchema.parse(req.body);
    const now = new Date();
    const tokenHash = hashPhoneOtpToken(data.challengeToken);

    const challenge = await prisma.phoneOtpChallenge.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        phone: true,
        mode: true,
        codeHash: true,
        attemptCount: true,
        maxAttempts: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!challenge || challenge.mode !== data.mode || challenge.usedAt || challenge.expiresAt <= now) {
      return res.status(401).json({ error: "Invalid or expired phone verification code." });
    }

    if (challenge.attemptCount >= challenge.maxAttempts) {
      await prisma.phoneOtpChallenge.updateMany({
        where: { id: challenge.id, usedAt: null },
        data: { usedAt: now },
      });
      return res.status(401).json({ error: "Invalid or expired phone verification code." });
    }

    const expectedCodeHash = hashPhoneOtpCode(data.challengeToken, data.code);
    if (!timingSafeEqualString(challenge.codeHash, expectedCodeHash)) {
      const nextAttemptCount = challenge.attemptCount + 1;
      const shouldExpire = nextAttemptCount >= challenge.maxAttempts;
      await prisma.phoneOtpChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptCount: nextAttemptCount,
          ...(shouldExpire ? { usedAt: now } : {}),
        },
      });
      return res.status(401).json({ error: "Invalid or expired phone verification code." });
    }

    const markedUsed = await prisma.phoneOtpChallenge.updateMany({
      where: { id: challenge.id, usedAt: null },
      data: { usedAt: now },
    });
    if (markedUsed.count === 0) {
      return res.status(401).json({ error: "Invalid or expired phone verification code." });
    }

    if (data.mode === "login") {
      const user = await prisma.user.findFirst({
        where: { phone: challenge.phone },
        select: publicUserSelect,
      });

      if (!user) {
        return res.status(404).json({ error: "Account not found. Please sign up first." });
      }

      if (user.status !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }

      await issueAuthSession(req, res, user, {
        adminMfaVerified: isAdminRole(user.role),
      });
      return res.json({ user: await withMedia(user) });
    }

    if (!data.register) {
      return res.status(400).json({ error: "Registration details are required." });
    }

    const registerData = phoneRegisterPayloadSchema.parse(data.register);
    const existingByPhone = await prisma.user.findFirst({
      where: { phone: challenge.phone },
      select: { id: true },
    });

    if (existingByPhone) {
      return res.status(409).json({ error: "An account with this phone already exists." });
    }

    let normalizedUsername: string;
    if (registerData.username) {
      try {
        const ensuredUsername = await ensureUsername(registerData.username);
        if (!ensuredUsername) {
          return res.status(400).json({ error: "Username is required." });
        }
        normalizedUsername = ensuredUsername;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Validation error";
        const status = message === "Username already taken" ? 409 : 400;
        return res.status(status).json({ error: message });
      }
    } else {
      normalizedUsername = await generateUsername(challenge.phone);
    }

    const passwordHash = await hashPassword(registerData.password);
    const user = await prisma.user.create({
      data: {
        phone: challenge.phone,
        username: normalizedUsername,
        passwordHash,
        role: registerData.role,
        providerProfile:
          registerData.role === "provider"
            ? {
                create: {
                  displayName: registerData.displayName ?? "Provider",
                  categories: [],
                },
              }
            : undefined,
      },
      select: publicUserSelect,
    });

    await issueAuthSession(req, res, user);
    return res.status(201).json({ user: await withMedia(user) });
  }),
);

authRouter.post(
  "/admin-mfa/verify",
  asyncHandler(async (req, res) => {
    const data = adminMfaVerifySchema.parse(req.body);
    let user: PublicUser;
    try {
      user = await verifyAdminMfaChallenge(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid or expired admin verification code.";
      return res.status(401).json({ error: message });
    }

    await issueAuthSession(req, res, user, { adminMfaVerified: true });
    res.json({ user: await withMedia(user) });
  }),
);

authRouter.post(
  "/mobile/admin-mfa/verify",
  asyncHandler(async (_req, res) => {
    return res.status(403).json({ error: MOBILE_ADMIN_BLOCKED_ERROR });
  }),
);

authRouter.post(
  "/password-reset",
  asyncHandler(async (req, res) => {
    const data = passwordResetRequestSchema.parse(req.body);
    const email = data.email.trim();

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, username: true, status: true },
    });

    if (!user || !user.email || user.status === "deleted") {
      return res.json({ status: "ok" });
    }

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const token = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const resetUrl = buildPasswordResetUrl(token);
    const recipientName = user.username ?? "there";
    const subject = "Reset your Servfix password";
    const text = [
      `Hi ${recipientName},`,
      "",
      "We received a request to reset your Servfix password.",
      "",
      `Reset your password: ${resetUrl}`,
      "",
      `This link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`,
      "",
      "If you did not request this, you can safely ignore this email.",
    ].join("\n");

    void sendEmail({
      to: user.email,
      subject,
      text,
      tag: "password_reset",
      metadata: { userId: user.id },
    }).catch((error) => {
      console.warn("Failed to send password reset email.", error);
    });

    res.json({ status: "ok" });
  }),
);

authRouter.post(
  "/password-reset/confirm",
  asyncHandler(async (req, res) => {
    const data = passwordResetConfirmSchema.parse(req.body);
    const now = new Date();
    const tokenHash = hashPasswordResetToken(data.token);

    const tokenRecord = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true, userId: true },
    });

    if (!tokenRecord) {
      return res.status(400).json({ error: "Password reset token is invalid or expired" });
    }

    const passwordHash = await hashPassword(data.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: tokenRecord.userId },
        data: { passwordHash },
      }),
      prisma.authSession.updateMany({
        where: { userId: tokenRecord.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: now },
      }),
      prisma.passwordResetToken.deleteMany({
        where: { userId: tokenRecord.userId, id: { not: tokenRecord.id } },
      }),
    ]);

    res.json({ status: "ok" });
  }),
);

authRouter.get(
  "/staff-invite",
  asyncHandler(async (req, res) => {
    const query = staffInviteQuerySchema.parse(req.query);
    const now = new Date();
    const invitation = await resolveActiveStaffInvitation(query.token, now);

    if (!invitation) {
      return res.status(404).json({ error: "Invitation is invalid or expired." });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        email: { equals: invitation.email, mode: "insensitive" },
      },
      select: { id: true },
    });

    res.json({
      invitation: {
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        requiresAccountSetup: !existingUser,
      },
    });
  }),
);

authRouter.post(
  "/staff-invite/accept",
  asyncHandler(async (req, res) => {
    const data = staffInviteAcceptSchema.parse(req.body);
    const now = new Date();
    const invitation = await resolveActiveStaffInvitation(data.token, now);

    if (!invitation) {
      return res.status(400).json({ error: "Invitation is invalid or expired." });
    }

    const normalizedInviteEmail = invitation.email.trim().toLowerCase();
    const hasProvidedPassword = Boolean(data.password?.trim());
    const normalizedInputUsername = data.username?.trim() || undefined;

    let usernameForCreate: string | undefined;
    let usernameForExistingUser: string | undefined;
    let passwordHash: string | undefined;

    const existingUserByEmail = await prisma.user.findFirst({
      where: {
        email: { equals: normalizedInviteEmail, mode: "insensitive" },
      },
      select: { id: true, username: true, status: true },
    });

    if (!existingUserByEmail && !hasProvidedPassword) {
      return res
        .status(400)
        .json({ error: "Password is required to activate this staff invitation." });
    }

    if (existingUserByEmail?.status === "deleted") {
      return res.status(400).json({ error: "This account cannot be invited." });
    }

    if (!existingUserByEmail) {
      if (normalizedInputUsername) {
        try {
          usernameForCreate = await ensureUsername(normalizedInputUsername);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Validation error";
          const status = message === "Username already taken" ? 409 : 400;
          return res.status(status).json({ error: message });
        }
      } else {
        usernameForCreate = await generateUsername(normalizedInviteEmail);
      }
    } else if (!existingUserByEmail.username && normalizedInputUsername) {
      try {
        usernameForExistingUser = await ensureUsername(normalizedInputUsername);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Validation error";
        const status = message === "Username already taken" ? 409 : 400;
        return res.status(status).json({ error: message });
      }
    }

    if (hasProvidedPassword) {
      passwordHash = await hashPassword(data.password!.trim());
    }

    const lockTokenHash = hashStaffInviteToken(data.token);

    let user: PublicUser;
    try {
      user = await prisma.$transaction(async (tx) => {
        const lockCount = await tx.staffInvitation.updateMany({
          where: {
            id: invitation.id,
            tokenHash: lockTokenHash,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { acceptedAt: now },
        });

        if (lockCount.count === 0) {
          throw new Error("staff_invite_already_used");
        }

        const existing = await tx.user.findFirst({
          where: {
            email: { equals: normalizedInviteEmail, mode: "insensitive" },
          },
          select: { id: true, status: true },
        });

        if (existing?.status === "deleted") {
          throw new Error("staff_invite_invalid_user");
        }

        let nextUser: PublicUser;
        if (existing) {
          nextUser = await tx.user.update({
            where: { id: existing.id },
            data: {
              role: invitation.role,
              status: "active",
              ...(usernameForExistingUser ? { username: usernameForExistingUser } : {}),
              ...(passwordHash ? { passwordHash } : {}),
            },
            select: publicUserSelect,
          });
        } else {
          if (!usernameForCreate || !passwordHash) {
            throw new Error("staff_invite_missing_credentials");
          }
          nextUser = await tx.user.create({
            data: {
              email: normalizedInviteEmail,
              username: usernameForCreate,
              passwordHash,
              role: invitation.role,
              status: "active",
            },
            select: publicUserSelect,
          });
        }

        await tx.staffInvitation.update({
          where: { id: invitation.id },
          data: { acceptedById: nextUser.id },
        });

        await tx.staffInvitation.updateMany({
          where: {
            email: normalizedInviteEmail,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
            id: { not: invitation.id },
          },
          data: { revokedAt: now },
        });

        return nextUser;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validation error";
      if (message === "staff_invite_already_used") {
        return res.status(409).json({ error: "Invitation is invalid or expired." });
      }
      if (message === "staff_invite_missing_credentials") {
        return res
          .status(400)
          .json({ error: "Password is required to activate this staff invitation." });
      }
      if (message === "staff_invite_invalid_user") {
        return res.status(400).json({ error: "This account cannot be invited." });
      }
      throw error;
    }

    if (await isAdminMfaRequired(user.role)) {
      const challenge = await createAdminMfaChallenge({ user });
      return res.status(202).json(challenge);
    }

    await issueAuthSession(req, res, user, {
      adminMfaVerified: isAdminRole(user.role),
    });
    res.json({ user: await withMedia(user) });
  }),
);

authRouter.post(
  "/google",
  asyncHandler(async (req, res) => {
    const data = googleAuthSchema.parse(req.body);

    if (!googleClient || !googleClientId) {
      return res.status(500).json({ error: "Google authentication is not configured" });
    }

    let payload: {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    } | null = null;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: data.idToken,
        audience: googleClientId,
      });
      payload = ticket.getPayload() ?? null;
    } catch {
      payload = null;
    }

    if (!payload?.sub) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const email = payload.email ?? null;
    const emailVerified = payload.email_verified === true;

    if (!email || !emailVerified) {
      return res.status(400).json({ error: "Google account email not verified" });
    }

    let user: PublicUser | null = await prisma.user.findFirst({
      where: { googleSub: payload.sub },
      select: publicUserSelect,
    });

    if (!user) {
      const existingByEmail = await prisma.user.findFirst({
        where: { email },
        select: { id: true, googleSub: true, status: true, role: true, avatarKey: true },
      });

      if (existingByEmail) {
        if (existingByEmail.googleSub && existingByEmail.googleSub !== payload.sub) {
          return res
            .status(409)
            .json({ error: "Email already linked to another Google account" });
        }

        await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleSub: payload.sub,
            ...(existingByEmail.avatarKey ? {} : { avatarKey: payload.picture ?? undefined }),
          },
        });

        user = await prisma.user.findUnique({
          where: { id: existingByEmail.id },
          select: publicUserSelect,
        });
      }
    }

    if (user) {
      if (user.status !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }
      const adminMfaVerified = (await isAdminMfaRequired(user.role)) ? true : false;
      await issueAuthSession(req, res, user, { adminMfaVerified });
      return res.json({ user: await withMedia(user) });
    }

    if (data.mode === "login") {
      return res.status(404).json({ error: "Account not found. Please sign up first." });
    }

    let username: string | undefined;
    try {
      username = await ensureUsername(data.username);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validation error";
      const status = message === "Username already taken" ? 409 : 400;
      return res.status(status).json({ error: message });
    }

    if (!username) {
      const seed = payload.name ?? email ?? "user";
      username = await generateUsername(seed);
    }

    const role = data.role ?? "buyer";
    const providerDisplayName = data.displayName?.trim() || payload.name || "Provider";

    const created = await prisma.user.create({
      data: {
        email,
        username,
        role,
        googleSub: payload.sub,
        avatarKey: payload.picture ?? undefined,
        providerProfile:
          role === "provider"
            ? {
                create: {
                  displayName: providerDisplayName,
                  categories: [],
                },
              }
            : undefined,
      },
      select: publicUserSelect,
    });

    await issueAuthSession(req, res, created);
    res.status(201).json({ user: await withMedia(created) });
  }),
);

authRouter.post(
  "/mobile/google",
  asyncHandler(async (req, res) => {
    const data = googleAuthSchema.parse(req.body);

    if (!googleClient || !googleClientId) {
      return res.status(500).json({ error: "Google authentication is not configured" });
    }

    let payload: {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    } | null = null;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: data.idToken,
        audience: googleClientId,
      });
      payload = ticket.getPayload() ?? null;
    } catch {
      payload = null;
    }

    if (!payload?.sub) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const email = payload.email ?? null;
    const emailVerified = payload.email_verified === true;

    if (!email || !emailVerified) {
      return res.status(400).json({ error: "Google account email not verified" });
    }

    let user: PublicUser | null = await prisma.user.findFirst({
      where: { googleSub: payload.sub },
      select: publicUserSelect,
    });

    if (!user) {
      const existingByEmail = await prisma.user.findFirst({
        where: { email },
        select: { id: true, googleSub: true, status: true, role: true, avatarKey: true },
      });

      if (existingByEmail) {
        if (existingByEmail.googleSub && existingByEmail.googleSub !== payload.sub) {
          return res
            .status(409)
            .json({ error: "Email already linked to another Google account" });
        }

        await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleSub: payload.sub,
            ...(existingByEmail.avatarKey ? {} : { avatarKey: payload.picture ?? undefined }),
          },
        });

        user = await prisma.user.findUnique({
          where: { id: existingByEmail.id },
          select: publicUserSelect,
        });
      }
    }

    if (user) {
      if (user.status !== "active") {
        return res.status(403).json({ error: "Account is not active" });
      }

      if (!isMobileAllowedRole(user.role)) {
        return res.status(403).json({ error: MOBILE_ADMIN_BLOCKED_ERROR });
      }

      return res.json(await toMobileAuthResponse(req, user));
    }

    if (data.mode === "login") {
      return res.status(404).json({ error: "Account not found. Please sign up first." });
    }

    let username: string | undefined;
    try {
      username = await ensureUsername(data.username);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validation error";
      const status = message === "Username already taken" ? 409 : 400;
      return res.status(status).json({ error: message });
    }

    if (!username) {
      const seed = payload.name ?? email ?? "user";
      username = await generateUsername(seed);
    }

    const role = data.role ?? "buyer";
    const providerDisplayName = data.displayName?.trim() || payload.name || "Provider";

    const created = await prisma.user.create({
      data: {
        email,
        username,
        role,
        googleSub: payload.sub,
        avatarKey: payload.picture ?? undefined,
        providerProfile:
          role === "provider"
            ? {
                create: {
                  displayName: providerDisplayName,
                  categories: [],
                },
              }
            : undefined,
      },
      select: publicUserSelect,
    });

    return res.status(201).json(await toMobileAuthResponse(req, created));
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({ error: SESSION_EXPIRED_ERROR });
    }

    try {
      const { session, user, adminMfaVerified } = await resolveRefreshSession(refreshToken);
      const issued = await rotatePersistedAuthTokens(req, session, user, {
        adminMfaVerified,
      });

      setAuthCookies(res, issued);
      return res.json({ user: await withMedia(user) });
    } catch (error) {
      if (isKnownRefreshError(error)) {
        clearAuthCookies(res);
        return res.status(401).json({ error: error.message });
      }
      throw error;
    }
  }),
);

authRouter.post(
  "/mobile/refresh",
  asyncHandler(async (req, res) => {
    const data = mobileRefreshSchema.parse(req.body);

    try {
      const { session, user, adminMfaVerified } = await resolveRefreshSession(data.refreshToken);
      if (!isMobileAllowedRole(user.role)) {
        await prisma.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        return res.status(403).json({ error: MOBILE_ADMIN_BLOCKED_ERROR });
      }

      const issued = await rotatePersistedAuthTokens(req, session, user, {
        adminMfaVerified,
      });

      return res.json(await formatMobileAuthResponse(user, issued));
    } catch (error) {
      if (isKnownRefreshError(error)) {
        return res.status(401).json({ error: error.message });
      }
      throw error;
    }
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (refreshToken) {
      await prisma.authSession.updateMany({
        where: {
          refreshTokenHash: hashRefreshToken(refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }

    clearAuthCookies(res);
    res.json({ status: "ok" });
  }),
);

authRouter.post(
  "/mobile/logout",
  asyncHandler(async (req, res) => {
    const data = mobileLogoutSchema.parse(req.body ?? {});

    if (data.refreshToken) {
      await prisma.authSession.updateMany({
        where: {
          refreshTokenHash: hashRefreshToken(data.refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }

    res.json({ status: "ok" });
  }),
);

authRouter.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: publicUserSelect,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: await withMedia(user) });
  }),
);
