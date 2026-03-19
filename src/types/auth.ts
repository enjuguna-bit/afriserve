import type { Request } from "express";

export interface AuthTokenUser {
  id: number;
  email: string;
  role: string;
  roles?: string[];
  permissions?: string[];
  full_name: string;
  token_version?: number | null;
  branch_id?: number | null;
  primary_region_id?: number | null;
}

export interface AuthSessionUser {
  sub: number;
  email: string;
  role: string;
  roles?: string[];
  permissions?: string[];
  fullName: string;
  tokenVersion: number;
  branchId: number | null;
  primaryRegionId: number | null;
  scope?: {
    branchId: number | null;
    primaryRegionId: number | null;
  };
  [key: string]: unknown;
}

export interface AuthUserRow {
  id: number;
  full_name: string;
  email: string;
  role: string;
  roles?: string[];
  permissions?: string[];
  is_active: number;
  token_version: number | null;
  branch_id: number | null;
  primary_region_id: number | null;
  [key: string]: unknown;
}

export interface JwtLikePayload {
  sub?: number | string;
  jti?: string;
  typ?: string;
  tokenVersion?: number | string;
  email?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  fullName?: string;
  branchId?: number | string | null;
  primaryRegionId?: number | string | null;
  scope?: {
    branchId?: number | string | null;
    primaryRegionId?: number | string | null;
  };
  [key: string]: unknown;
}

export interface CreateAuthMiddlewareOptions {
  jwtSecret?: string;
  jwtSecrets?: string[];
  tokenExpiry: string;
  get: (sql: string, params?: unknown[]) => Promise<AuthUserRow | null | undefined>;
  all?: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  isTokenBlacklisted?: (token: string) => Promise<boolean>;
}

/**
 * Express Request augmented with the authenticated user.
 * Use this everywhere instead of `req: any` in controllers and service route handlers.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthSessionUser;
  /** Injected by requestContext middleware */
  requestId?: string;
  /** IP resolved by proxy-aware middleware */
  clientIp?: string;
}

/**
 * Narrow helper: assert that a request has been authenticated.
 * Call this at the top of any handler that depends on req.user to get a typed value.
 */
export function assertAuthenticated(req: Request): asserts req is AuthenticatedRequest {
  if (!(req as AuthenticatedRequest).user) {
    throw new Error("Unauthenticated request reached an authenticated handler");
  }
}
