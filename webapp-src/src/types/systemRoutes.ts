export interface RouteRegistrarApp {
  get(path: string, ...handlers: Array<(...args: any[]) => any>): void;
  post(path: string, ...handlers: Array<(...args: any[]) => any>): void;
  put(path: string, ...handlers: Array<(...args: any[]) => any>): void;
  patch(path: string, ...handlers: Array<(...args: any[]) => any>): void;
  delete(path: string, ...handlers: Array<(...args: any[]) => any>): void;
}

export interface ScopeCondition {
  sql: string;
  params: unknown[];
}

export interface HierarchyServiceLike {
  resolveHierarchyScope(user: any): Promise<any>;
  buildScopeCondition(scope: any, column: string): ScopeCondition;
}

export interface MetricsLike {
  getSnapshot?: () => any;
}

export interface ReportCacheLike {
  enabled: boolean;
  configuredStrategy: "memory" | "redis";
  activeStrategy: "memory" | "redis";
  defaultTtlMs: number;
  buildKey: (namespace: string, payload?: unknown) => string;
  getOrSet: <T = unknown>(options: {
    key: string;
    ttlMs?: number;
    compute: () => Promise<T> | T;
  }) => Promise<{ value: T; cacheHit: boolean; key: string }>;
}

export interface SystemRouteDeps {
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any>>;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  getConfigStatus: () => any;
  getRuntimeStatus: () => Promise<any> | any;
  runDatabaseBackup?: () => Promise<{
    skipped?: boolean;
    reason?: string | null;
    backupPath?: string | null;
    createdAt?: string | null;
    deletedFiles?: string[];
  }>;
  metrics?: MetricsLike;
  reportCache?: ReportCacheLike | null;
  hierarchyService: HierarchyServiceLike;
}
