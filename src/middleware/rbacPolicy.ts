import { getRbacPolicy } from "../config/rbacPolicies.js";
import { requireAnyPermission } from "./permissions.js";
import type { RbacPolicyId } from "../config/rbacPolicies.js";

function applyRbacPolicy(policyId: RbacPolicyId, authorize: (...roles: string[]) => (...args: any[]) => any) {
  const policy = getRbacPolicy(policyId);
  if (policy.permissions.length > 0) {
    return [requireAnyPermission(...policy.permissions)];
  }

  if (policy.roles.length > 0) {
    return [authorize(...policy.roles)];
  }

  return [];
}

export {
  applyRbacPolicy,
};
