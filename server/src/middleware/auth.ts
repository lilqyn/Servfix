import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { verifyToken } from "../auth/jwt.js";
import { UserRole } from "@prisma/client";
import { ADMIN_ROLES } from "../utils/permissions.js";
import { getPlatformSettings } from "../utils/platform-settings.js";

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization required" });
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Authorization required" });
  }

  try {
    const payload = verifyToken(token) as { sub: string; role: UserRole; iat?: number };
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true, email: true, phone: true, username: true },
    });

    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (ADMIN_ROLES.includes(user.role)) {
      const { settings } = await getPlatformSettings();
      const allowlist = settings.securityControls.adminIpAllowlist;

      if (allowlist.length > 0) {
        const forwarded = req.headers["x-forwarded-for"];
        const rawIp = Array.isArray(forwarded)
          ? forwarded[0]
          : typeof forwarded === "string"
            ? forwarded.split(",")[0]
            : req.ip;
        const normalizedIp = (rawIp ?? "").replace("::ffff:", "").trim();

        if (!normalizedIp || !allowlist.includes(normalizedIp)) {
          return res.status(403).json({ error: "Access denied from this IP." });
        }
      }

      const timeoutHours = settings.securityControls.adminSessionTimeoutHours;
      if (timeoutHours > 0 && payload.iat) {
        const issuedAtMs = payload.iat * 1000;
        const maxAgeMs = timeoutHours * 60 * 60 * 1000;
        if (Date.now() - issuedAtMs > maxAgeMs) {
          return res.status(401).json({ error: "Session expired." });
        }
      }
    }

    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
      username: user.username,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authorization required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next();
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return next();
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true, email: true, phone: true, username: true },
    });

    if (user && user.status === "active") {
      req.user = {
        id: user.id,
        role: user.role,
        email: user.email,
        phone: user.phone,
        username: user.username,
      };
    }
  } catch {
    // Ignore invalid token for public routes.
  }

  return next();
}
