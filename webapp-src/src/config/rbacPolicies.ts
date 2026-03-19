import type { PermissionCode } from "../services/permissionService.js";
import type { RoleId } from "../types/roles.js";

type RbacPolicyDefinition = {
  description: string;
  roles: RoleId[];
  permissions: PermissionCode[];
  capabilities?: string[];
  constraints?: string[];
};

const RBAC_POLICIES = {
  "clients.read": {
    description: "View clients and client history",
    roles: ["admin", "ceo", "finance", "operations_manager", "it", "area_manager", "loan_officer"],
    permissions: [],
    capabilities: ["clients:view"],
  },
  "users.create": {
    description: "Create platform users",
    roles: ["admin", "it"],
    permissions: ["user.create"],
    capabilities: ["users:create"],
  },
  "users.profile.update": {
    description: "Update user profile and assignment",
    roles: ["admin", "it"],
    permissions: ["user.profile.update"],
    capabilities: ["users:update"],
  },
  "users.role.assign": {
    description: "Allocate roles and hierarchy assignment to users",
    roles: ["admin", "it"],
    permissions: ["user.role.assign"],
    capabilities: ["users:role:assign"],
  },
  "users.permission.manage": {
    description: "Grant and revoke custom user permissions",
    roles: ["admin", "it"],
    permissions: ["user.permission.manage"],
    capabilities: ["users:permission:manage"],
  },
  "audit.logs.read": {
    description: "Read audit logs",
    roles: ["admin"],
    permissions: ["audit.view"],
  },
  "audit.trail.read": {
    description: "Read system audit trail",
    roles: ["admin", "ceo", "operations_manager"],
    permissions: ["audit.view"],
  },
  "loan.approve.standard": {
    description: "Approve standard pending loans",
    roles: ["admin", "operations_manager", "finance", "area_manager"],
    permissions: ["loan.approve"],
    constraints: ["maker_checker"],
  },
  "loan.reject.standard": {
    description: "Reject standard pending loans",
    roles: ["admin", "operations_manager"],
    permissions: ["loan.reject"],
    constraints: ["maker_checker"],
  },
  "loan.approval_request.review": {
    description: "Review queued high-risk loan lifecycle requests",
    roles: ["admin", "finance", "operations_manager", "area_manager"],
    permissions: ["loan.approve"],
    constraints: ["maker_checker"],
  },
  "loan.lifecycle.write_off": {
    description: "Write off a loan",
    roles: ["admin", "finance"],
    permissions: ["loan.write_off"],
    constraints: ["high_impact_action", "branch_scope"],
  },
  "loan.lifecycle.restructure": {
    description: "Restructure a loan",
    roles: ["admin", "finance", "operations_manager"],
    permissions: ["loan.restructure"],
    constraints: ["high_impact_action", "branch_scope"],
  },
  "loan.lifecycle.top_up": {
    description: "Top up a loan",
    roles: ["admin", "finance", "operations_manager"],
    permissions: ["loan.top_up"],
    constraints: ["high_impact_action", "branch_scope"],
  },
  "loan.lifecycle.refinance": {
    description: "Refinance a loan",
    roles: ["admin", "finance", "operations_manager"],
    permissions: ["loan.refinance"],
    constraints: ["high_impact_action", "branch_scope"],
  },
  "loan.lifecycle.extend_term": {
    description: "Extend a loan term",
    roles: ["admin", "finance", "operations_manager"],
    permissions: ["loan.term_extension"],
    constraints: ["high_impact_action", "branch_scope"],
  },
  "reports.gl.legacy_redirect": {
    description: "Access deprecated GL redirect endpoints that point to reports module",
    roles: ["admin", "ceo", "finance", "investor", "partner", "it", "operations_manager", "area_manager", "loan_officer", "cashier"],
    permissions: [],
    capabilities: ["reports:view"],
  },
} as const satisfies Record<string, RbacPolicyDefinition>;

type RbacPolicyId = keyof typeof RBAC_POLICIES;

function getRbacPolicy(policyId: RbacPolicyId): RbacPolicyDefinition {
  return RBAC_POLICIES[policyId];
}

function getRbacPolicyIds(): RbacPolicyId[] {
  return Object.keys(RBAC_POLICIES) as RbacPolicyId[];
}

export type {
  RbacPolicyId,
  RbacPolicyDefinition,
};

export {
  RBAC_POLICIES,
  getRbacPolicy,
  getRbacPolicyIds,
};
