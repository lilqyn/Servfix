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

export const isAdminRole = (role?: UserRole | null) => Boolean(role && ADMIN_ROLE_SET.has(role));

export const isCoreAdminRole = (role?: UserRole | null) =>
  Boolean(role && CORE_ADMIN_ROLE_SET.has(role));

export const isProviderRole = (role?: UserRole | null) => role === "provider";

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
