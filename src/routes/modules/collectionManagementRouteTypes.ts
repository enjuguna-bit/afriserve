import type { ClientHierarchyServiceLike, RouteRegistrar } from "../../types/routeDeps.js";
import type { ReportCacheLike } from "../../types/serviceContracts.js";

type CollectionManagementRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  collectionViewRoles: string[];
  collectionManageRoles: string[];
  createCollectionActionSchema: { parse: (value: unknown) => any };
  updateCollectionActionSchema: { parse: (value: unknown) => any };
  hierarchyService: ClientHierarchyServiceLike;
  reportCache: ReportCacheLike | null;
  parseId: (value: unknown) => number | null;
  hasOwn: (payload: Record<string, unknown> | null | undefined, key: string) => boolean;
  resolveOfficerFilter: (req: any, res: any) => { mineOnly: boolean; officerId: number | null } | null;
  toScopeCachePayload: (scope: any) => Record<string, unknown>;
  invalidateReportCaches: () => Promise<void>;
  run: (sql: string, params?: unknown[]) => Promise<any>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
};

export type {
  CollectionManagementRouteOptions,
};
