import { getDefaultTenantId } from "../utils/env.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";
import { getUserRolesForUser, resolveAssignedRoles } from "./userRoleService.js";

type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;

type TenantAuthLookupResult<T extends Record<string, any>> = {
  user: T | null;
  roles: string[];
  lookupTenantId: string;
  privilegedTenantFallback: boolean;
};

const PRIVILEGED_TENANT_FALLBACK_ROLES = new Set(["admin", "it"]);

async function resolveUserRolesForLookup<T extends Record<string, any>>({
  get,
  all,
  user,
  tenantId,
}: {
  get: DbGet;
  all: DbAll;
  user: T;
  tenantId: string;
}): Promise<string[]> {
  const userId = Number(user.id || 0);
  if (!Number.isInteger(userId) || userId <= 0) {
    return [];
  }

  const assignedRoles = await getUserRolesForUser({
    all,
    get,
    userId,
    primaryRole: user.role,
    tenantId,
  });

  return resolveAssignedRoles({
    role: user.role,
    roles: assignedRoles,
    fallbackRole: user.role,
  });
}

async function loadUserWithPrivilegedTenantFallback<T extends Record<string, any>>({
  get,
  all,
  lookupByTenant,
}: {
  get: DbGet;
  all: DbAll;
  lookupByTenant: (tenantId: string) => Promise<T | null | undefined>;
}): Promise<TenantAuthLookupResult<T>> {
  const activeTenantId = getCurrentTenantId();
  const defaultTenantId = getDefaultTenantId();

  const activeTenantUser = await lookupByTenant(activeTenantId) || null;
  if (activeTenantUser) {
    return {
      user: activeTenantUser,
      roles: await resolveUserRolesForLookup({ get, all, user: activeTenantUser, tenantId: activeTenantId }),
      lookupTenantId: activeTenantId,
      privilegedTenantFallback: false,
    };
  }

  if (activeTenantId === defaultTenantId) {
    return {
      user: null,
      roles: [],
      lookupTenantId: activeTenantId,
      privilegedTenantFallback: false,
    };
  }

  const defaultTenantUser = await lookupByTenant(defaultTenantId) || null;
  if (!defaultTenantUser) {
    return {
      user: null,
      roles: [],
      lookupTenantId: activeTenantId,
      privilegedTenantFallback: false,
    };
  }

  const roles = await resolveUserRolesForLookup({ get, all, user: defaultTenantUser, tenantId: defaultTenantId });
  const isPrivilegedFallback = roles.some((role) => PRIVILEGED_TENANT_FALLBACK_ROLES.has(role));

  if (!isPrivilegedFallback) {
    return {
      user: null,
      roles: [],
      lookupTenantId: activeTenantId,
      privilegedTenantFallback: false,
    };
  }

  return {
    user: defaultTenantUser,
    roles,
    lookupTenantId: defaultTenantId,
    privilegedTenantFallback: true,
  };
}

export {
  loadUserWithPrivilegedTenantFallback,
};

export type {
  TenantAuthLookupResult,
};
