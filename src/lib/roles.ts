export type UserRole =
  | "buyer"
  | "provider"
  | "super_admin"
  | "admin"
  | "moderator"
  | "support_agent"
  | "dispute_manager"
  | "operations_manager"
  | "finance_manager"
  | "marketing_manager"
  | "data_analyst"
  | "technical_admin";

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

export const CORE_ADMIN_ROLES: UserRole[] = ["super_admin", "admin", "technical_admin"];

export const ALL_ROLES: UserRole[] = [
  "buyer",
  "provider",
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

const ADMIN_ROLE_SET = new Set<UserRole>(ADMIN_ROLES);
const CORE_ADMIN_ROLE_SET = new Set<UserRole>(CORE_ADMIN_ROLES);

export const isAdminRole = (role?: UserRole | null) => Boolean(role && ADMIN_ROLE_SET.has(role));

export const isCoreAdminRole = (role?: UserRole | null) =>
  Boolean(role && CORE_ADMIN_ROLE_SET.has(role));

export const isProviderRole = (role?: UserRole | null) => role === "provider";

export const getRoleLabel = (role?: UserRole | null) => {
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "admin":
      return "Admin";
    case "technical_admin":
      return "Technical admin";
    case "moderator":
      return "Moderator";
    case "support_agent":
      return "Support agent";
    case "dispute_manager":
      return "Dispute manager";
    case "operations_manager":
      return "Operations manager";
    case "finance_manager":
      return "Finance manager";
    case "marketing_manager":
      return "Marketing manager";
    case "data_analyst":
      return "Data analyst";
    case "provider":
      return "Service provider";
    case "buyer":
      return "Buyer";
    default:
      return "Account";
  }
};
