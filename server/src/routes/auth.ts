import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../utils/async-handler.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";
import { authRequired } from "../middleware/auth.js";
import { signS3Key } from "../utils/s3.js";

export const authRouter = Router();

const publicUserSelect = {
  id: true,
  email: true,
  phone: true,
  username: true,
  role: true,
  status: true,
  createdAt: true,
  avatarKey: true,
  bannerKey: true,
  providerProfile: true,
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

const withMedia = async <T extends { avatarKey?: string | null; bannerKey?: string | null }>(
  user: T,
) => {
  const avatarUrl = await resolveMediaUrl(user.avatarKey);
  const bannerUrl = await resolveMediaUrl(user.bannerKey);
  const { avatarKey: _avatarKey, bannerKey: _bannerKey, ...rest } = user;
  return { ...rest, avatarUrl, bannerUrl };
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
