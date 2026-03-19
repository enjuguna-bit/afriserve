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
  all?: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  isTokenBlacklisted?: (token: string) => Promise<boolean>;
}
