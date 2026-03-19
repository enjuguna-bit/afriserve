import assert from "node:assert/strict";
import test from "node:test";
import { getRoleCatalog } from "../src/config/roles.js";
import { RBAC_POLICIES } from "../src/config/rbacPolicies.js";
import { SUPPORTED_PERMISSION_CODES } from "../src/services/permissionService.js";

test("rbac policies reference valid roles and permissions", () => {
  const roleCatalog = getRoleCatalog();
  const knownRoles = new Set(Object.keys(roleCatalog));
  const knownPermissions = new Set(SUPPORTED_PERMISSION_CODES);

  for (const [policyId, policy] of Object.entries(RBAC_POLICIES)) {
    for (const role of policy.roles) {
      assert.equal(
        knownRoles.has(role),
        true,
        `Policy ${policyId} references unknown role: ${role}`,
      );
    }
    for (const permission of policy.permissions) {
      assert.equal(
        knownPermissions.has(permission),
        true,
        `Policy ${policyId} references unknown permission: ${permission}`,
      );
    }
  }
});

test("capability-driven policies cover all declared roles for those capabilities", () => {
  const roleCatalog = getRoleCatalog();

  for (const [policyId, policy] of Object.entries(RBAC_POLICIES)) {
    if (!Array.isArray(policy.capabilities) || policy.capabilities.length === 0) {
      continue;
    }

    for (const capability of policy.capabilities) {
      const declaredRoles = Object.entries(roleCatalog)
        .filter(([_roleId, metadata]) => Array.isArray(metadata.capabilities) && metadata.capabilities.includes(capability))
        .map(([roleId]) => roleId);

      for (const roleId of declaredRoles) {
        assert.equal(
          policy.roles.includes(roleId as any),
          true,
          `Policy ${policyId} missing role ${roleId} for capability ${capability}`,
        );
      }
    }
  }
});
