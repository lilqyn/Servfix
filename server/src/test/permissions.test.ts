/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { canAssignRole, canManageRole, hasPermission } from "../utils/permissions.js";

describe("RBAC permission hardening", () => {
  it("removes risky write permissions from support roles", () => {
    expect(hasPermission("support_agent", "users.write")).toBe(false);
    expect(hasPermission("marketing_manager", "support.update")).toBe(false);
    expect(hasPermission("data_analyst", "support.update")).toBe(false);
  });

  it("splits settings updates between config and content scopes", () => {
    expect(hasPermission("technical_admin", "settings.config.update")).toBe(true);
    expect(hasPermission("technical_admin", "settings.content.update")).toBe(false);
    expect(hasPermission("admin", "settings.config.update")).toBe(true);
    expect(hasPermission("admin", "settings.content.update")).toBe(true);
  });

  it("enforces role hierarchy for managing and assigning roles", () => {
    expect(canManageRole("admin", "super_admin")).toBe(false);
    expect(canManageRole("admin", "admin")).toBe(false);
    expect(canManageRole("admin", "technical_admin")).toBe(true);
    expect(canAssignRole("admin", "super_admin")).toBe(false);
    expect(canAssignRole("admin", "admin")).toBe(false);
    expect(canAssignRole("admin", "technical_admin")).toBe(true);
    expect(canAssignRole("super_admin", "super_admin")).toBe(true);
  });
});
