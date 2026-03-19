import type { RoleAliasMap, RoleCatalog, RoleId } from "../types/roles.js";

/** @type {RoleCatalog} */
const roleCatalog = {
  admin: {
    label: "Administrator",
    description: "Full system access including security and user administration.",
    capabilities: [
      "users:create",
      "users:view",
      "users:update",
      "users:role:assign",
      "users:activate",
      "users:deactivate",
      "users:unlock",
      "users:session:revoke",
      "branches:manage",
      "hierarchy:manage",
      "reports:view",
      "loans:manage",
      "collections:manage",
    ],
  },
  ceo: {
    label: "CEO",
    description: "Executive oversight for portfolio health, performance, and governance.",
    capabilities: [
      "clients:view",
      "loans:view",
      "collections:view",
      "reports:view",
    ],
  },
  finance: {
    label: "Finance",
    description: "Financial operations, reconciliations, and repayment processing support.",
    capabilities: [
      "loans:view",
      "repayments:create",
      "collections:view",
      "reports:view",
    ],
  },
  investor: {
    label: "Investor",
    description: "Portfolio visibility for investment oversight and performance tracking.",
    scopeRule: "Assign one or more active branches. Assignments can be updated over time.",
    capabilities: [
      "reports:view",
    ],
  },
  partner: {
    label: "Partner",
    description: "External partner visibility for monitored program performance.",
    scopeRule: "Assign one or more active branches. Assignments can be updated over time.",
    capabilities: [
      "reports:view",
    ],
  },
  operations_manager: {
    label: "Branch Manager",
    description: "Branch operations leadership for approval oversight, portfolio monitoring, and collections execution.",
    scopeRule: "Must be assigned to exactly one active branch.",
    capabilities: [
      "clients:view",
      "loans:view",
      "collections:view",
      "collections:manage",
      "reports:view",
      "reports:view:branch",
    ],
  },
  it: {
    label: "IT",
    description: "Technical support and operational visibility for system maintenance.",
    capabilities: [
      "users:create",
      "users:view",
      "users:update",
      "users:role:assign",
      "users:activate",
      "users:deactivate",
      "users:unlock",
      "users:session:revoke",
      "clients:view",
      "loans:view",
      "collections:view",
      "reports:view",
    ],
  },
  area_manager: {
    label: "Area Manager",
    description: "Regional oversight of assigned branches for portfolio quality and collection activity.",
    scopeRule: "Assign one region and one or more active branches in that region.",
    capabilities: [
      "clients:view",
      "loans:view",
      "collections:view",
      "collections:manage",
      "reports:view",
      "reports:view:region",
    ],
  },
  loan_officer: {
    label: "Loan Officer",
    description: "Client onboarding, loan origination, and collections operations.",
    scopeRule: "Must be assigned to exactly one active branch.",
    capabilities: [
      "clients:create",
      "clients:view",
      "loans:create",
      "loans:view",
      "repayments:create",
      "collections:view",
      "collections:manage",
      "reports:view",
      "reports:view:branch",
    ],
  },
  cashier: {
    label: "Cashier",
    description: "Repayment posting and collection support visibility.",
    scopeRule: "Must be assigned to exactly one active branch.",
    capabilities: [
      "loans:view",
      "repayments:create",
      "collections:view",
      "collections:manage",
      "reports:view",
    ],
  },
};

const roleAliases: RoleAliasMap = {
  investor: "investor",
  investors: "investor",
  partner: "partner",
  partners: "partner",
  branch_manager: "operations_manager",
  branch_managers: "operations_manager",
  operation_manager: "operations_manager",
  operations_manager: "operations_manager",
  operations_managers: "operations_manager",
  area_manager: "area_manager",
  area_managers: "area_manager",
  loan_officer: "loan_officer",
  loan_officers: "loan_officer",
};

/**
 * @param {unknown} role
 * @returns {unknown}
 */
function normalizeRoleInput(role: unknown): unknown {
  if (typeof role !== "string") {
    return role;
  }

  const normalized = role
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    return normalized;
  }

  return roleAliases[normalized] || normalized;
}

/**
 * @returns {RoleId[]}
 */
function getAllowedRoles(): RoleId[] {
  return Object.keys(roleCatalog) as RoleId[];
}

/**
 * @param {unknown} role
 * @returns {boolean}
 */
function isValidRole(role: unknown): boolean {
  const normalizedRole = normalizeRoleInput(role);
  return typeof normalizedRole === "string" && getAllowedRoles().includes(normalizedRole as RoleId);
}

/**
 * @returns {RoleCatalog}
 */
function getRoleCatalog(): RoleCatalog {
  return roleCatalog;
}

export {
  getAllowedRoles,
  isValidRole,
  getRoleCatalog,
  normalizeRoleInput,
};
