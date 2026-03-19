import { getRbacPolicy } from "../config/rbacPolicies.js";
import { requirePermission } from "./permissions.js";
import type { RbacPolicyId } from "../config/rbacPolicies.js";

function applyRbacPolicy(policyId: RbacPolicyId, authorize: (...roles: string[]) => (...args: any[]) => any) {
  const policy = getRbacPolicy(policyId);
  return [
    authorize(...policy.roles),
    ...policy.permissions.map((permission) => requirePermission(permission)),
  ];
}

export {
  applyRbacPolicy,
};
