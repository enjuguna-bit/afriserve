import * as postgresConnection from "./postgresConnection.js";
import * as sqliteConnection from "./sqliteConnection.js";
import { prisma } from "./prismaClient.js";
import type { DbRunResult, DbTransactionContext } from "../types/dataLayer.js";

type DbConnectionModule = {
  dbClient: string;
  db: unknown;
  dbPath: string;
  isInMemoryDb: boolean;
  defaultBackupDir: string;
  backupFileExtension: string;
  migrationsDirectory: string;
  supportsNativeBackup: boolean;
  runSync: ((sql: string, params?: unknown[]) => DbRunResult) | null;
  getSync: ((sql: string, params?: unknown[]) => Record<string, any> | null | undefined) | null;
  allSync: ((sql: string, params?: unknown[]) => Array<Record<string, any>>) | null;
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  readGet: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  readAll: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (work: (ctx: DbTransactionContext) => Promise<unknown> | unknown) => Promise<unknown>;
  getDatabaseInfo: () => { client: string; path: string; isInMemory: boolean };
  closeDb: () => Promise<void> | void;
};

const configuredClient = String(process.env.DB_CLIENT || "sqlite").trim().toLowerCase();
const client = configuredClient === "postgres" ? "postgres" : "sqlite";

const connection: DbConnectionModule = (
  client === "postgres" ? postgresConnection : sqliteConnection
) as unknown as DbConnectionModule;

export const {
  dbClient,
  db,
  dbPath,
  isInMemoryDb,
  defaultBackupDir,
  backupFileExtension,
  migrationsDirectory,
  supportsNativeBackup,
  runSync,
  getSync,
  allSync,
  run,
  get,
  all,
  readGet,
  readAll,
  executeTransaction,
  getDatabaseInfo,
  closeDb,
} = connection;

export {
  prisma,
};
