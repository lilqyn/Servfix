import { ADMIN_ROLES, type UserRole } from "@/lib/roles";

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
  | "settings.update";

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
    "settings.update",
  ],
  admin: [
    "admin.access",
    "users.read",
    "users.write",
    "providers.read",
    "providers.verify",
    "providers.update",
    "services.read",
    "services.moderate",
    "orders.read",
    "orders.update",
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
    "settings.update",
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
    "users.write",
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
    "support.read",
    "support.update",
  ],
  finance_manager: [
    "admin.access",
    "orders.read",
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
    "support.update",
  ],
  data_analyst: ["admin.access", "analytics.read", "support.read", "support.update"],
  technical_admin: [
    "admin.access",
    "settings.read",
    "settings.update",
    "users.read",
    "services.read",
    "orders.read",
    "analytics.read",
    "support.read",
    "support.update",
  ],
};

export const hasPermission = (role: UserRole | null | undefined, permission: Permission) => {
  if (!role) return false;
  return rolePermissions[role]?.includes(permission) ?? false;
};

export const listPermissions = (role: UserRole | null | undefined) => {
  if (!role) return [];
  return rolePermissions[role] ?? [];
};

export const canAccessAdmin = (role: UserRole | null | undefined) => {
  return Boolean(role && ADMIN_ROLES.includes(role));
};
