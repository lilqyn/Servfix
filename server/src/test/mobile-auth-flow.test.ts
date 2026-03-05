/* @vitest-environment node */

import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, verifyPasswordMock, getPlatformSettingsMock, googleVerifyIdTokenMock } = vi.hoisted(
  () => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    authSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    passwordResetToken: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    phoneOtpChallenge: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    staffInvitation: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  verifyPasswordMock: vi.fn(),
  getPlatformSettingsMock: vi.fn(),
  googleVerifyIdTokenMock: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../auth/password.js", () => ({
  hashPassword: vi.fn(async (value: string) => `hashed:${value}`),
  verifyPassword: verifyPasswordMock,
}));

vi.mock("../utils/platform-settings.js", () => ({
  getPlatformSettings: getPlatformSettingsMock,
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = googleVerifyIdTokenMock;
  },
}));

let app: express.Express;

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-google-client-id";
  const { authRouter } = await import("../routes/auth.js");

  app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
});

beforeEach(() => {
  vi.clearAllMocks();

  getPlatformSettingsMock.mockResolvedValue({
    settings: {
      securityControls: {
        requireMfaForAdmins: false,
        adminIpAllowlist: [],
        adminSessionTimeoutHours: 0,
      },
      integrations: {
        sms: {
          provider: "disabled",
          senderId: "SERVFIX",
          apiKey: "",
        },
      },
    },
  });
});

describe("mobile auth flow", () => {
  it("returns bearer tokens for mobile login and does not set auth cookies", async () => {
    verifyPasswordMock.mockResolvedValue(true);
    prismaMock.user.findFirst.mockResolvedValue({
      id: "buyer-1",
      email: "buyer@example.com",
      phone: null,
      username: "buyer",
      location: null,
      role: "buyer",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      avatarKey: null,
      bannerKey: null,
      providerProfile: null,
      passwordHash: "hashed:password123",
    });
    prismaMock.authSession.create.mockResolvedValue({ id: "session-1" });

    const res = await request(app).post("/api/auth/mobile/login").send({
      email: "buyer@example.com",
      password: "password123",
    });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("buyer-1");
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.accessToken.length).toBeGreaterThan(20);
    expect(typeof res.body.refreshToken).toBe("string");
    expect(res.body.refreshToken.length).toBeGreaterThan(20);
    expect(res.body.expiresInSeconds).toBe(900);
    expect(res.body.refreshExpiresInSeconds).toBe(2592000);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(prismaMock.authSession.create).toHaveBeenCalledTimes(1);
  });

  it("blocks admin login on mobile", async () => {
    verifyPasswordMock.mockResolvedValue(true);
    prismaMock.user.findFirst.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      phone: null,
      username: "admin",
      location: null,
      role: "admin",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      avatarKey: null,
      bannerKey: null,
      providerProfile: null,
      passwordHash: "hashed:password123",
    });

    const res = await request(app).post("/api/auth/mobile/login").send({
      email: "admin@example.com",
      password: "password123",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admins must use the web app.");
    expect(prismaMock.authSession.create).not.toHaveBeenCalled();
  });

  it("returns bearer tokens for mobile register and does not set auth cookies", async () => {
    prismaMock.user.create.mockResolvedValue({
      id: "buyer-registered-1",
      email: "newbuyer@example.com",
      phone: null,
      username: "newbuyer",
      location: null,
      role: "buyer",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      avatarKey: null,
      bannerKey: null,
      providerProfile: null,
    });
    prismaMock.authSession.create.mockResolvedValue({ id: "session-register-1" });

    const res = await request(app).post("/api/auth/mobile/register").send({
      email: "newbuyer@example.com",
      username: "newbuyer",
      password: "password123",
      role: "buyer",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe("buyer-registered-1");
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(prismaMock.authSession.create).toHaveBeenCalledTimes(1);
  });

  it("keeps web login cookie-based", async () => {
    verifyPasswordMock.mockResolvedValue(true);
    prismaMock.user.findFirst.mockResolvedValue({
      id: "buyer-2",
      email: "buyer2@example.com",
      phone: null,
      username: "buyer2",
      location: null,
      role: "buyer",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      avatarKey: null,
      bannerKey: null,
      providerProfile: null,
      passwordHash: "hashed:password123",
    });
    prismaMock.authSession.create.mockResolvedValue({ id: "session-2" });

    const res = await request(app).post("/api/auth/login").send({
      email: "buyer2@example.com",
      password: "password123",
    });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("buyer-2");
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();

    const cookies = res.headers["set-cookie"] ?? [];
    const raw = Array.isArray(cookies) ? cookies.join(";") : String(cookies);
    expect(raw).toContain("servfix_at=");
    expect(raw).toContain("servfix_rt=");
  });

  it("blocks admin google auth on mobile", async () => {
    googleVerifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({
        sub: "google-admin-1",
        email: "admin.google@example.com",
        email_verified: true,
        name: "Admin User",
        picture: null,
      }),
    });
    prismaMock.user.findFirst.mockResolvedValue({
      id: "admin-google-1",
      email: "admin.google@example.com",
      phone: null,
      username: "admin_google",
      location: null,
      role: "admin",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      avatarKey: null,
      bannerKey: null,
      providerProfile: null,
    });

    const res = await request(app).post("/api/auth/mobile/google").send({
      idToken: "google-id-token",
      mode: "login",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admins must use the web app.");
    expect(prismaMock.authSession.create).not.toHaveBeenCalled();
  });

  it("blocks admin refresh on mobile and revokes that session", async () => {
    prismaMock.authSession.findUnique.mockResolvedValue({
      id: "session-admin",
      userId: "admin-3",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      revokedAt: null,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin-3",
      email: "admin3@example.com",
      phone: null,
      username: "admin3",
      location: null,
      role: "admin",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      avatarKey: null,
      bannerKey: null,
      providerProfile: null,
    });
    prismaMock.authSession.update.mockResolvedValue({
      id: "session-admin",
      revokedAt: new Date(),
    });

    const res = await request(app).post("/api/auth/mobile/refresh").send({
      refreshToken: "v1.m1.abcdefghijklmnopqrstuvwxyz0123456789",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admins must use the web app.");
    expect(prismaMock.authSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-admin" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });
});
