/* @vitest-environment node */

import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../middleware/auth.js")>(
    "../middleware/auth.js",
  );

  const resolveUser = (req: { header: (name: string) => string | undefined }) => {
    const role = req.header("x-test-role");
    if (!role) {
      return null;
    }
    return {
      id: req.header("x-test-user-id") ?? "test-user",
      role: role as never,
      email: null,
      phone: null,
      username: "test-user",
    };
  };

  return {
    ...actual,
    authRequired: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const user = resolveUser(req);
      if (!user) {
        return res.status(401).json({ error: "Authorization required" });
      }
      req.user = user;
      return next();
    },
    optionalAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      const user = resolveUser(req);
      if (user) {
        req.user = user;
      }
      return next();
    },
  };
});

let app: express.Express;

beforeAll(async () => {
  const [{ authRouter }, { pagesRouter }, { paymentsRouter }, { ordersRouter }, { adminRouter }] =
    await Promise.all([
      import("../routes/auth.js"),
      import("../routes/pages.js"),
      import("../routes/payments.js"),
      import("../routes/orders.js"),
      import("../routes/admin.js"),
    ]);

  app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/pages", pagesRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/admin", adminRouter);
});

describe("API auth/session access", () => {
  it("rejects refresh without refresh cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Session expired");
  });

  it("logs out safely without an active refresh cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    const setCookie = res.headers["set-cookie"] ?? [];
    const raw = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
    expect(raw).toContain("servfix_at=");
    expect(raw).toContain("servfix_rt=");
  });

  it("logs out safely for mobile clients without a stored refresh token", async () => {
    const res = await request(app).post("/api/auth/mobile/logout");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("keeps admin verification off the mobile auth flow", async () => {
    const res = await request(app).post("/api/auth/mobile/admin-mfa/verify");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admins must use the web app.");
  });
});

describe("Provider resource API lock", () => {
  it("returns 401 for unauthenticated provider resources request", async () => {
    const res = await request(app).get("/api/pages/providerResources");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authorization required");
  });

  it("returns 403 for non-provider role on provider resources", async () => {
    const res = await request(app)
      .get("/api/pages/providerResources")
      .set("x-test-role", "buyer");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });
});

describe("Critical role/permission gates", () => {
  it("requires auth for payments checkout", async () => {
    const res = await request(app).post("/api/payments/checkout");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authorization required");
  });

  it("blocks unsupported role from payments checkout", async () => {
    const res = await request(app)
      .post("/api/payments/checkout")
      .set("x-test-role", "moderator");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("blocks buyer from provider/admin order status update endpoint", async () => {
    const res = await request(app)
      .patch("/api/orders/not-a-uuid/status")
      .set("x-test-role", "buyer")
      .send({ status: "accepted" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("blocks buyer from admin disputes endpoint", async () => {
    const res = await request(app)
      .get("/api/admin/disputes")
      .set("x-test-role", "buyer");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("blocks provider from admin overview endpoint", async () => {
    const res = await request(app)
      .get("/api/admin/overview")
      .set("x-test-role", "provider");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });
});
