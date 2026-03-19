import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resolveDefaultSqliteDbPath, resolveRepoRoot } from "../utils/projectPaths.js";

const configuredDbClient = String(process.env.DB_CLIENT || "sqlite").trim().toLowerCase();
const configuredDatabaseUrl = String(process.env.DATABASE_URL || "").trim();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = resolveRepoRoot(currentDir);

if (!configuredDatabaseUrl && configuredDbClient === "sqlite") {
  const defaultDbPath = resolveDefaultSqliteDbPath(currentDir);
  const configuredDbPath = String(process.env.DB_PATH || "").trim();
  const resolvedDbPath = configuredDbPath || defaultDbPath;
  process.env.DATABASE_URL = resolvedDbPath.startsWith("file:")
    ? resolvedDbPath
    : `file:${resolvedDbPath.replace(/\\/g, "/")}`;
}

const sqliteClientModule = await import(
  pathToFileURL(path.join(repoRoot, "generated", "prisma", "sqlite-client", "index.js")).href
);
const postgresClientModule = await import(
  pathToFileURL(path.join(repoRoot, "generated", "prisma", "postgres-client", "index.js")).href
);

const activePrismaModule = configuredDbClient === "postgres" ? postgresClientModule : sqliteClientModule;
const PrismaClientCtor = activePrismaModule.PrismaClient;
const Prisma = activePrismaModule.Prisma;

function resolveSqliteAdapterUrl(): ":memory:" | string {
  const configuredDbPath = String(process.env.DB_PATH || "").trim();
  if (configuredDbPath === ":memory:") {
    return ":memory:";
  }
  if (configuredDbPath) {
    return configuredDbPath.startsWith("file:")
      ? configuredDbPath.slice(5)
      : path.resolve(repoRoot, configuredDbPath);
  }

  const normalizedDatabaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (normalizedDatabaseUrl.startsWith("file:")) {
    const resolvedFromUrl = normalizedDatabaseUrl.slice(5);
    return path.isAbsolute(resolvedFromUrl)
      ? resolvedFromUrl
      : path.resolve(repoRoot, resolvedFromUrl);
  }

  return resolveDefaultSqliteDbPath(currentDir);
}

const decimalFieldNames = new Set<string>();
const dateTimeFieldNames = new Set<string>();
const models = Prisma?.dmmf?.datamodel?.models || [];
for (const model of models) {
  for (const field of model.fields) {
    if (field.kind !== "scalar") {
      continue;
    }
    if (field.type === "Decimal") {
      decimalFieldNames.add(field.name);
    }
    if (field.type === "DateTime") {
      dateTimeFieldNames.add(field.name);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

function isDecimalLike(value: unknown): value is { toString: () => string } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { constructor?: { name?: string }; toString?: () => string; toFixed?: () => string };
  return candidate.constructor?.name === "Decimal"
    || (typeof candidate.toString === "function" && typeof candidate.toFixed === "function");
}

function normalizeDecimalInput(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeDecimalInput(entry));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizeDecimalInput(entryValue)]),
    );
  }
  if (isDecimalLike(value)) {
    return new Prisma.Decimal(value.toString());
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "bigint") {
    const normalized = String(value).trim();
    if (!normalized) {
      return value;
    }
    return new Prisma.Decimal(normalized);
  }

  return value;
}

function normalizeDateTimeInput(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeDateTimeInput(entry));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizeDateTimeInput(entryValue)]),
    );
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    const raw = String(value).trim();
    if (/^\d{10,17}$/.test(raw)) {
      const normalizedMs = raw.length <= 10
        ? Number(raw) * 1000
        : Number(raw.slice(0, 13));
      const normalizedDate = new Date(normalizedMs);
      if (Number.isFinite(normalizedMs) && !Number.isNaN(normalizedDate.getTime())) {
        return normalizedDate.toISOString();
      }
    }
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^\d{10,17}$/.test(normalized)) {
      const normalizedMs = normalized.length <= 10
        ? Number(normalized) * 1000
        : Number(normalized.slice(0, 13));
      const normalizedDate = new Date(normalizedMs);
      if (Number.isFinite(normalizedMs) && !Number.isNaN(normalizedDate.getTime())) {
        return normalizedDate.toISOString();
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return `${normalized}T00:00:00.000Z`;
    }
    return normalized;
  }

  return value;
}

function normalizePrismaArgs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePrismaArgs(entry));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (dateTimeFieldNames.has(key)) {
        return [key, normalizeDateTimeInput(entryValue)];
      }
      if (decimalFieldNames.has(key)) {
        return [key, normalizeDecimalInput(entryValue)];
      }
      return [key, normalizePrismaArgs(entryValue)];
    }),
  );
}

function normalizePrismaResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePrismaResult(entry));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (!value || typeof value !== "object" || isDecimalLike(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [key, normalizePrismaResult(entryValue)]),
  );
}

const globalForPrisma = globalThis as unknown as {
  sqlitePrisma?: InstanceType<typeof sqliteClientModule.PrismaClient>;
  postgresPrisma?: InstanceType<typeof postgresClientModule.PrismaClient>;
};

const globalClientKey = configuredDbClient === "postgres" ? "postgresPrisma" : "sqlitePrisma";
const sqliteAdapter = configuredDbClient === "sqlite"
  ? new PrismaBetterSqlite3(
    { url: resolveSqliteAdapterUrl() },
    { timestampFormat: "iso8601" },
  )
  : null;
const basePrisma = globalForPrisma[globalClientKey] || new PrismaClientCtor(
  sqliteAdapter
    ? { adapter: sqliteAdapter }
    : undefined,
);
const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const result = await query(normalizePrismaArgs(args));
        return normalizePrismaResult(result);
      },
    },
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma[globalClientKey] = basePrisma;
}

type PrismaClientLike = typeof prisma;
type PrismaTransactionClient = any;

export type {
  PrismaClientLike,
  PrismaTransactionClient,
};

export {
  Prisma,
  prisma,
};
