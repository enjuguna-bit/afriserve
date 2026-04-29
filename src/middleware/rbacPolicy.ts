import type { NextFunction, Request, Response } from "express";
import { getRbacPolicy } from "../config/rbacPolicies.js";
import { requireAnyPermission } from "./permissions.js";
import type { RbacPolicyId } from "../config/rbacPolicies.js";

/** Structural type matching the authorize factory produced by createAuthMiddleware. */
type MiddlewareLike = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
type AuthorizeFactory = (...roles: string[]) => MiddlewareLike;

function applyRbacPolicy(policyId: RbacPolicyId, authorize: AuthorizeFactory) {
  const policy = getRbacPolicy(policyId);
  const guards: MiddlewareLike[] = [];

  if (policy.roles.length > 0) {
    guards.push(authorize(...policy.roles));
  }

  if (policy.permissions.length > 0) {
    guards.push(requireAnyPermission(...policy.permissions));
  }

  return guards;
}

export {
  applyRbacPolicy,
};
