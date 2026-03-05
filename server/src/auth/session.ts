import { createHash, randomBytes } from "crypto";
import type { IncomingHttpHeaders } from "http";
import type { CookieOptions, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { signToken } from "./jwt.js";

export const ACCESS_TOKEN_COOKIE_NAME = "servfix_at";
export const REFRESH_TOKEN_COOKIE_NAME = "servfix_rt";
const REFRESH_TOKEN_VERSION = "v1";
const REFRESH_TOKEN_MFA_VERIFIED = "m1";
const REFRESH_TOKEN_MFA_UNVERIFIED = "m0";

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === "production";
const USER_AGENT_MAX_LENGTH = 255;
const IP_MAX_LENGTH = 64;

type HeaderValue = string | string[] | undefined;
type AuthTokenOptions = {
  adminMfaVerified?: boolean;
};

const baseCookieOptions: Pick<CookieOptions, "httpOnly" | "secure" | "sameSite"> = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
};

const accessCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  path: "/",
  maxAge: ACCESS_TOKEN_TTL_MS,
};

const refreshCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  path: "/api/auth",
  maxAge: REFRESH_TOKEN_TTL_MS,
};

const parseCookieHeader = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, cookie) => {
      const separatorIndex = cookie.indexOf("=");
      if (separatorIndex <= 0) {
        return acc;
      }

      const key = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();
      if (!key) {
        return acc;
      }

      try {
        acc[key] = decodeURIComponent(value);
      } catch {
        acc[key] = value;
      }
      return acc;
    }, {});
};

const firstHeaderValue = (value: HeaderValue) => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export const getCookieValue = (cookieHeader: string | undefined, name: string) => {
  const parsed = parseCookieHeader(cookieHeader);
  return parsed[name];
};

export const getRefreshTokenFromHeaders = (headers: IncomingHttpHeaders) =>
  getCookieValue(firstHeaderValue(headers.cookie), REFRESH_TOKEN_COOKIE_NAME);

export const getRefreshTokenFromRequest = (req: Pick<Request, "headers">) =>
  getRefreshTokenFromHeaders(req.headers);

export const extractBearerToken = (authorizationHeader: HeaderValue) => {
  const value = firstHeaderValue(authorizationHeader);
  if (!value || !value.startsWith("Bearer ")) {
    return null;
  }

  const token = value.slice("Bearer ".length).trim();
  return token || null;
};

export const getAccessTokenFromHeaders = (headers: IncomingHttpHeaders) => {
  const bearer = extractBearerToken(headers.authorization);
  if (bearer) {
    return bearer;
  }
  return getCookieValue(firstHeaderValue(headers.cookie), ACCESS_TOKEN_COOKIE_NAME) ?? null;
};

export const getAccessTokenFromRequest = (req: Pick<Request, "headers">) =>
  getAccessTokenFromHeaders(req.headers);

export const createAccessToken = (payload: { sub: string; role: UserRole; mfa?: boolean }) =>
  signToken(payload, "15m");

export const createRefreshToken = (options: AuthTokenOptions = {}) => {
  const adminMfaVerified = options.adminMfaVerified === true;
  const flag = adminMfaVerified ? REFRESH_TOKEN_MFA_VERIFIED : REFRESH_TOKEN_MFA_UNVERIFIED;
  const token = randomBytes(48).toString("base64url");
  return `${REFRESH_TOKEN_VERSION}.${flag}.${token}`;
};

export const hashRefreshToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const getRefreshTokenExpiry = () => new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

export const getRefreshTokenMetadata = (token: string) => {
  const parts = token.split(".");
  if (parts.length === 3 && parts[0] === REFRESH_TOKEN_VERSION) {
    return {
      adminMfaVerified: parts[1] === REFRESH_TOKEN_MFA_VERIFIED,
    };
  }

  return { adminMfaVerified: false };
};

const getRequestIp = (req: Pick<Request, "headers" | "ip">) => {
  const forwarded = req.headers["x-forwarded-for"];
  const candidate = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded.split(",")[0]
      : req.ip;

  const normalized = candidate?.replace("::ffff:", "").trim();
  return normalized ? normalized.slice(0, IP_MAX_LENGTH) : undefined;
};

export const getSessionMetadata = (req: Pick<Request, "headers" | "ip" | "get">) => ({
  ipAddress: getRequestIp(req),
  userAgent: req.get("user-agent")?.trim().slice(0, USER_AGENT_MAX_LENGTH),
});

export const setAuthCookies = (res: Response, values: { accessToken: string; refreshToken: string }) => {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, values.accessToken, accessCookieOptions);
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, values.refreshToken, refreshCookieOptions);
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, {
    ...baseCookieOptions,
    path: "/",
  });
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    ...baseCookieOptions,
    path: "/api/auth",
  });
};
