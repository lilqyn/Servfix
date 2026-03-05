import { randomBytes, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  extractBearerToken,
  getCookieValue,
} from "../auth/session.js";

export const CSRF_COOKIE_NAME = "servfix_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PATH_PREFIXES = ["/api/webhooks"];
const isProduction = process.env.NODE_ENV === "production";

const generateCsrfToken = () => randomBytes(32).toString("base64url");

const csrfCookieOptions = {
  httpOnly: false,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
  maxAge: CSRF_MAX_AGE_MS,
};

const hasAuthCookies = (cookieHeader: string | undefined) => {
  const accessToken = getCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE_NAME);
  const refreshToken = getCookieValue(cookieHeader, REFRESH_TOKEN_COOKIE_NAME);
  return Boolean(accessToken || refreshToken);
};

const isTimingSafeMatch = (a: string, b: string) => {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
};

const shouldSkipCsrf = (req: Request) => {
  if (!req.path.startsWith("/api")) {
    return true;
  }

  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return true;
  }

  if (EXEMPT_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return true;
  }

  // Non-cookie API clients using explicit bearer auth are not CSRF susceptible.
  const hasBearerToken = Boolean(extractBearerToken(req.headers.authorization));
  if (hasBearerToken && !hasAuthCookies(req.headers.cookie)) {
    return true;
  }

  return false;
};

export const ensureCsrfCookie = (req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith("/api")) {
    return next();
  }

  const existing = getCookieValue(req.headers.cookie, CSRF_COOKIE_NAME);
  if (!existing) {
    res.cookie(CSRF_COOKIE_NAME, generateCsrfToken(), csrfCookieOptions);
  }

  return next();
};

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (shouldSkipCsrf(req)) {
    return next();
  }

  if (!hasAuthCookies(req.headers.cookie)) {
    return next();
  }

  const cookieToken = getCookieValue(req.headers.cookie, CSRF_COOKIE_NAME);
  const headerToken = req.get(CSRF_HEADER_NAME)?.trim();

  if (!cookieToken || !headerToken || !isTimingSafeMatch(cookieToken, headerToken)) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  return next();
};
