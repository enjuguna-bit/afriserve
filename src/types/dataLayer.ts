import type { PrismaClientLike } from "../db/prismaClient.js";

export interface DbRunResult {
  lastID?: number;
  changes?: number;
  [key: string]: unknown;
}

export type DbTransactionWork<T = unknown> = (ctx: DbTransactionContext) => Promise<T> | T;

export type DbTransactionIsolationLevel = "read committed" | "repeatable read" | "serializable";

export interface DbTransactionOptions {
  isolationLevel?: DbTransactionIsolationLevel;
  busyTimeoutMs?: number;
}

export interface DbTransactionContext {
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
}

export interface HierarchyScope {
  level: "hq" | "region" | "branch" | "none";
  role: string;
  branchIds: number[];
  branchId: number | null;
  regionId: number | null;
  branchName?: string | null;
}

export interface HierarchyServiceOptions {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (callback: (ctx: DbTransactionContext) => any, options?: DbTransactionOptions) => Promise<any>;
}

export interface HierarchyEventServiceOptions {
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  prisma?: PrismaClientLike;
}

export interface BackupOptions {
  backupDirectory?: string;
  retentionCount?: number;
}

export interface BackupResult {
  skipped: boolean;
  reason: string | null;
  backupPath: string | null;
  deletedFiles: string[];
  createdAt: string | null;
}

export interface MigrationContext {
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (callback: (ctx: DbTransactionContext) => any, options?: DbTransactionOptions) => Promise<any>;
  db: unknown;
}

export interface MigrationDefinition {
  id: string;
  name?: string;
  up: (context: MigrationContext) => Promise<void> | void;
  down?: (context: MigrationContext) => Promise<void> | void;
}

export interface RunMigrationsOptions {
  direction?: "up" | "down";
  steps?: number;
}

export interface RunMigrationsResult {
  direction: "up" | "down";
  applied: string[];
  skipped: string[];
}
