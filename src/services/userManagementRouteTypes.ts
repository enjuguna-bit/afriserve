import type { RouteRegistrar } from "../types/routeDeps.js";
import type { HierarchyScope } from "../types/dataLayer.js";

type UserManagementHierarchyService = {
  resolveHierarchyScope: (user: Record<string, any> | null | undefined) => Promise<HierarchyScope>;
  normalizeIds: (values: unknown[]) => number[];
  replaceAreaManagerAssignments: (userId: number, branchIds: unknown[]) => Promise<number[]>;
  invalidateHierarchyCaches: (params?: { userId?: number }) => void;
};

type UserManagementRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  allowedRoles: string[];
  roleCatalog: Record<string, any>;
  roleListLabel: string;
  parseUserIdOrRespond: (req: any, res: any) => number | null;
  fetchUserById: (userId: number) => Promise<Record<string, any> | null>;
  sanitizeUserRow: (user: Record<string, any> | null | undefined) => Record<string, any> | null;
  resolveRoleAssignments: (params: {
    role: unknown;
    branchIdInput?: unknown;
    branchIdsInput?: unknown;
    branchCountInput?: unknown;
    primaryRegionIdInput?: unknown;
  }) => Promise<{ branchId: number | null; primaryRegionId: number | null; areaBranchIds: number[] }>;
  getAdminContinuityViolation: (params: { actingUserId: number; targetUser: Record<string, any>; nextRole: string; nextIsActive: number }) => Promise<{ status: number; message: string } | null>;
  hasOwn: (payload: Record<string, unknown> | null | undefined, key: string) => boolean;
  ensureTokenVersionBump: (setClauses: string[]) => void;
  sameIdList: (left: unknown[], right: unknown[]) => boolean;
  sameRoleList: (left: unknown, right: unknown) => boolean;
  invalidateReportCaches: () => Promise<void>;
  publishHierarchyEvent: (payload: Record<string, unknown>) => Promise<void>;
  publishDomainEvent: (payload: {
    eventType: string;
    aggregateType: string;
    aggregateId: number | null | undefined;
    payload?: Record<string, unknown> | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    occurredAt?: string | null | undefined;
  }) => Promise<number | void>;
  hierarchyService: UserManagementHierarchyService;
  normalizeEmail: (value: unknown) => string;
  normalizeRoleInput: (value: unknown) => string;
  createUserSchema: { parse: (value: unknown) => any };
  updateUserProfileSchema: { parse: (value: unknown) => any };
  allocateUserRoleSchema: { parse: (value: unknown) => any };
  adminResetPasswordSchema: { parse: (value: unknown) => any };
  bcrypt: { hash: (plainText: string, rounds: number) => Promise<string> };
  issuePasswordResetToken: (payload: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number; [key: string]: unknown }>;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
};

export type {
  UserManagementRouteOptions,
};
