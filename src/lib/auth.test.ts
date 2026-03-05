import { describe, expect, it, beforeEach } from "vitest";
import { clearAuth, identifierSchema, mapAuthErrorMessage, persistAuth } from "./auth";

describe("auth utils", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("accepts valid email and phone identifiers", () => {
    expect(identifierSchema.safeParse("user@example.com").success).toBe(true);
    expect(identifierSchema.safeParse("0240000000").success).toBe(true);
  });

  it("rejects invalid identifiers", () => {
    expect(identifierSchema.safeParse("xx").success).toBe(false);
    expect(identifierSchema.safeParse("not-an-email@").success).toBe(false);
  });

  it("persists only user state and clears legacy token keys", () => {
    persistAuth({
      user: {
        id: "user_1",
        role: "buyer",
      },
    });

    expect(localStorage.getItem("servfix-user")).toContain("user_1");
    expect(localStorage.getItem("servfix-token")).toBeNull();
    expect(localStorage.getItem("serveghana-token")).toBeNull();
  });

  it("clears all auth storage keys", () => {
    localStorage.setItem("servfix-user", "{}");
    localStorage.setItem("servfix-token", "token");
    localStorage.setItem("serveghana-token", "legacy");
    localStorage.setItem("serveghana-user", "{}");

    clearAuth();

    expect(localStorage.getItem("servfix-user")).toBeNull();
    expect(localStorage.getItem("servfix-token")).toBeNull();
    expect(localStorage.getItem("serveghana-token")).toBeNull();
    expect(localStorage.getItem("serveghana-user")).toBeNull();
  });

  it("maps known backend errors", () => {
    expect(mapAuthErrorMessage("Invalid credentials")).toBe(
      "Incorrect email/phone or password.",
    );
  });
});
