import type { RouteRegistrar } from "../types/routeDeps.js";

type BranchManagementRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  createBranchSchema: { parse: (value: unknown) => any };
  updateBranchSchema: { parse: (value: unknown) => any };
  hierarchyService: any;
  hierarchyEventService: any;
  run: (sql: string, params?: unknown[]) => Promise<any>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  normalizeBranchCode: (code: unknown) => string;
  ensureUniqueBranchCode: (initialCode: unknown) => Promise<string>;
  getScope: (req: any) => Promise<any>;
  getBranchDeletionDependencies: (branchId: number) => Promise<Record<string, number>>;
  hasDeletionDependencies: (dependencies: Record<string, number>) => boolean;
  publishHierarchyEvent: (payload: Record<string, unknown>) => Promise<void>;
  invalidateReportCaches: () => Promise<void>;
};

export type {
  BranchManagementRouteOptions,
};
