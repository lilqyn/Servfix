import { UserRole } from "@prisma/client";

export type Permission =
  | "admin.access"
  | "users.read"
  | "users.write"
  | "users.role"
  | "providers.read"
  | "providers.verify"
  | "providers.update"
  | "services.read"
  | "services.moderate"
  | "orders.read"
  | "orders.update"
  | "business.read"
  | "business.update"
  | "reviews.read"
  | "reviews.moderate"
  | "community.read"
  | "community.moderate"
  | "reports.read"
  | "reports.update"
  | "support.read"
  | "support.update"
  | "payouts.read"
  | "payouts.update"
  | "analytics.read"
  | "settings.read"
  | "settings.config.update"
  | "settings.content.update";

export const ADMIN_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "moderator",
  "support_agent",
  "dispute_manager",
  "operations_manager",
  "finance_manager",
  "marketing_manager",
  "data_analyst",
  "technical_admin",
];

const rolePermissions: Record<UserRole, Permission[]> = {
  buyer: [],
  provider: [],
  super_admin: [
    "admin.access",
    "users.read",
    "users.write",
    "users.role",
    "providers.read",
    "providers.verify",
    "providers.update",
    "services.read",
    "services.moderate",
    "orders.read",
    "orders.update",
    "business.read",
    "business.update",
    "reviews.read",
    "reviews.moderate",
    "community.read",
    "community.moderate",
    "reports.read",
    "reports.update",
    "support.read",
    "support.update",
    "payouts.read",
    "payouts.update",
    "analytics.read",
    "settings.read",
    "settings.config.update",
    "settings.content.update",
  ],
  admin: [
    "admin.access",
    "users.read",
    "users.write",
    "users.role",
    "providers.read",
    "providers.verify",
    "providers.update",
    "services.read",
    "services.moderate",
    "orders.read",
    "orders.update",
    "business.read",
    "business.update",
    "reviews.read",
    "reviews.moderate",
    "community.read",
    "community.moderate",
    "reports.read",
    "reports.update",
    "support.read",
    "support.update",
    "payouts.read",
    "payouts.update",
    "analytics.read",
    "settings.read",
    "settings.config.update",
    "settings.content.update",
  ],
  moderator: [
    "admin.access",
    "reviews.read",
    "reviews.moderate",
    "community.read",
    "community.moderate",
    "reports.read",
    "reports.update",
    "support.read",
    "support.update",
  ],
  support_agent: [
    "admin.access",
    "users.read",
    "orders.read",
    "orders.update",
    "reports.read",
    "support.read",
    "support.update",
  ],
  dispute_manager: [
    "admin.access",
    "orders.read",
    "orders.update",
    "reports.read",
    "reports.update",
    "support.read",
    "support.update",
  ],
  operations_manager: [
    "admin.access",
    "providers.read",
    "providers.verify",
    "providers.update",
    "services.read",
    "services.moderate",
    "orders.read",
    "business.read",
    "business.update",
    "support.read",
    "support.update",
  ],
  finance_manager: [
    "admin.access",
    "orders.read",
    "business.read",
    "business.update",
    "payouts.read",
    "payouts.update",
    "analytics.read",
    "support.read",
    "support.update",
  ],
  marketing_manager: [
    "admin.access",
    "community.read",
    "reports.read",
    "analytics.read",
    "support.read",
  ],
  data_analyst: ["admin.access", "analytics.read", "support.read"],
  technical_admin: [
    "admin.access",
    "settings.read",
    "settings.config.update",
    "users.read",
    "services.read",
    "orders.read",
    "business.read",
    "analytics.read",
    "support.read",
    "support.update",
  ],
};

export const hasPermission = (role: UserRole, permission: Permission) => {
  return rolePermissions[role]?.includes(permission) ?? false;
};

export const listPermissions = (role: UserRole) => {
  return rolePermissions[role] ?? [];
};

const roleAuthorityRank: Record<UserRole, number> = {
  buyer: 0,
  provider: 0,
  data_analyst: 10,
  marketing_manager: 20,
  support_agent: 30,
  moderator: 30,
  dispute_manager: 40,
  operations_manager: 50,
  finance_manager: 50,
  technical_admin: 60,
  admin: 70,
  super_admin: 80,
};

export const canManageRole = (actorRole: UserRole, targetRole: UserRole) => {
  if (targetRole === "super_admin") {
    return actorRole === "super_admin";
  }
  return roleAuthorityRank[actorRole] > roleAuthorityRank[targetRole];
};

export const canAssignRole = (actorRole: UserRole, targetRole: UserRole) => {
  if (targetRole === "super_admin") {
    return actorRole === "super_admin";
  }
  return canManageRole(actorRole, targetRole);
};

