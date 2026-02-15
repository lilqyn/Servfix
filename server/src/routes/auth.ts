import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { prisma } from "../db.js";
import { env } from "../config.js";
import { asyncHandler } from "../utils/async-handler.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";
import { authRequired } from "../middleware/auth.js";
import { signS3Key } from "../utils/s3.js";
import { sendEmail } from "../utils/email.js";

export const authRouter = Router();

const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
const appUrlBase = env.APP_URL.trim().replace(/\/+$/, "");
const passwordResetBase = appUrlBase.split("#")[0].replace(/\/+$/, "");
const PASSWORD_RESET_TTL_MINUTES = 60;

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

const createPasswordResetToken = () => randomBytes(32).toString("base64url");

const hashPasswordResetToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const buildPasswordResetUrl = (token: string) =>
  `${passwordResetBase}/#/reset-password?token=${encodeURIComponent(token)}`;

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

    if (!data.email && !data.phone) {
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
        phone: data.phone,
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

    const token = signToken({ sub: user.id, role: user.role });
    res.status(201).json({ token, user: await withMedia(user) });
  }),
);

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  password: z.string().min(8),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1),
  mode: z.enum(["login", "register"]),
  role: z.enum(["buyer", "provider"]).optional(),
  username: z.string().trim().min(3).max(20).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);

    if (!data.email && !data.phone) {
      return res.status(400).json({ error: "Email or phone is required" });
    }

    const or: Array<{ email?: string; phone?: string }> = [];
    if (data.email) {
      or.push({ email: data.email });
    }
    if (data.phone) {
      or.push({ phone: data.phone });
    }

    const user = await prisma.user.findFirst({
      where: { OR: or },
      select: { ...publicUserSelect, passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ error: "Account is not active" });
    }

    const ok = await verifyPassword(data.password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken({ sub: user.id, role: user.role });
    const { passwordHash: _passwordHash, ...safeUser } = user;
    res.json({ token, user: await withMedia(safeUser) });
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
      const token = signToken({ sub: user.id, role: user.role });
      return res.json({ token, user: await withMedia(user) });
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

    const token = signToken({ sub: created.id, role: created.role });
    res.status(201).json({ token, user: await withMedia(created) });
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
