import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resolveDefaultSqliteDbPath, resolveRepoRoot } from "../utils/projectPaths.js";
import { getConfiguredDbClient } from "../utils/env.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

const configuredDbClient = getConfiguredDbClient();
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

// ---------------------------------------------------------------------------
// Postgres RLS hook — sets app.tenant_id on the connection before every query.
//
// Why $use (deprecated) instead of $extends?
//   Prisma's $extends query extension does not expose a way to execute raw SQL
//   before delegating to the underlying query.  $use (Prisma middleware) runs
//   before the query and has access to basePrisma.$executeRawUnsafe.
//   $use is deprecated in Prisma v5 in favour of $extends, but still fully
//   functional; replace with the official solution once Prisma exposes a
//   "before-query raw execute" hook in extensions.
//
// set_config(key, value, is_local):
//   is_local = true  → SET LOCAL  (resets at end of transaction — use with
//                                   PgBouncer in transaction mode)
//   is_local = false → SET SESSION (persists for the connection lifetime — use
//                                   with direct connections / session-mode pool)
//
//   We default to is_local = false (session scope) because Azure PostgreSQL
//   Flexible Server is typically used without PgBouncer and Prisma does not
//   wrap every operation in an explicit transaction.  If you add PgBouncer in
//   transaction mode, change false → true here AND ensure every write path is
//   wrapped in prisma.$transaction().
// ---------------------------------------------------------------------------
if (configuredDbClient === "postgres") {
  (basePrisma as any).$use(async (params: any, next: (params: any) => Promise<any>) => {
    const tenantId = getCurrentTenantId();
    try {
      // set_config is preferred over SET SESSION because it works correctly
      // inside and outside transactions and is injection-safe via parameterised
      // calls.  We sanitise tenantId in tenantContext.ts (alphanumeric + - _,
      // max 64 chars) but still use parameterised form here as defence-in-depth.
      await (basePrisma as any).$executeRawUnsafe(
        `SELECT set_config('app.tenant_id', $1, false)`,
        tenantId,
      );
    } catch (err) {
      // Non-fatal: if the session variable cannot be set (e.g. during health-
      // check queries that run before full bootstrap) log and continue.  The
      // RLS policy uses current_setting('app.tenant_id', true) with missing_ok
      // = true, which returns NULL and the policy evaluates to false — no rows
      // are exposed rather than all rows, so this is a safe failure mode.
      console.error("[prismaClient] Failed to set app.tenant_id session variable:", err);
    }
    return next(params);
  });
}

// ---------------------------------------------------------------------------
// Build the set of Prisma model names that have a tenant_id column.
// Used by the tenant-filter extension below to avoid injecting WHERE
// tenant_id = ? into models that don't have the column (branches, regions, etc.)
// ---------------------------------------------------------------------------
const tenantScopedPrismaModels = new Set<string>(
  (models as Array<{ name: string; fields: Array<{ name: string }> }>)
    .filter((m) => m.fields.some((f) => f.name === "tenant_id"))
    .map((m) => m.name),
);

// ---------------------------------------------------------------------------
// Step 1: Normalisation extension (decimal / datetime coercion).
// Step 2: Tenant-filter extension — auto-injects tenant_id into every read,
//         write, and bulk-mutation on tenant-scoped models.
//
// Why application-layer filtering in addition to Postgres RLS?
//   - SQLite has no RLS; dev/test environments rely entirely on app-layer
//     filtering to enforce tenant isolation.
//   - Read replicas and raw-SQL paths may not go through the $use hook.
//   - Defence-in-depth: two independent enforcement points.
//
// Operations covered:
//   findMany / findFirst / count / aggregate / groupBy — inject WHERE tenant_id
//   create / createMany                               — inject tenant_id in data
//   updateMany / deleteMany                           — inject WHERE tenant_id
//
// Operations intentionally NOT rewritten:
//   findUnique — typed to require a unique-constraint key; adding tenant_id
//               would break TypeScript types. Protected by branch-scope checks.
//   update / delete (single) — same as above.
// ---------------------------------------------------------------------------
const prisma = basePrisma
  .$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const result = await query(normalizePrismaArgs(args));
          return normalizePrismaResult(result);
        },
      },
    },
  })
  .$extends({
    query: {
      $allModels: {
        // ── Reads ──────────────────────────────────────────────────────────
        async findMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
          if (tenantScopedPrismaModels.has(model)) {
            const tenantId = getCurrentTenantId();
            args = { ...args, where: { tenant_id: tenantId, ...(args.where ?? {}) } };
          }
          return query(args);
        },
        async findFirst({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
          if (tenantScopedPrismaModels.has(model)) {
            const tenantId = getCurrentTenantId();
            args = { ...args, where: { tenant_id: tenantId, ...(args.where ?? {}) } };
          }
          return query(args);
        },
        async count({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
          if (tenantScopedPrismaModels.has(model)) {
            const tenantId = getCurrentTenantId();
            args = { ...args, where: { tenant_id: tenantId, ...(args.where ?? {}) } };
          }
          return query(args);
        },
        async aggregate({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
          if (tenantScopedPrismaModels.has(model)) {
            const tenantId = getCurrentTenantId();
            args = { ...args, where: { tenant_id: tenantId, ...(args.where ?? {}) } };
          }
          return query(args);
        },
        async groupBy({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
          if (tenantScopedPrismaModels.has(model)) {
            const tenantId = getCurrentTenantId();
            args = { ...args, where: { tenant_id: tenantId, ...(args.where ?? {}) } };
          }
          return query(args);
        },
        // ── Writes ─────────────────────────────────────────────────────────
        async create({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
          if (tenantScopedPrismaModels.has(model)) {
            const tenantId = getCurrentTenantId();
            // Only set tenant_id if not explicitly provided — lets seeds and
            // migrations override with a specific tenant.
            if (!args.data?.tenant_id) {
              args = { ...args, data: { ...args.data, tenant_id: tenantId } };
            }
          }
          return query(args);
        },
        async createMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
          if (tenantScopedPrismaModels.has(model)) {
            const tenantId = getCurrentTenantId();
            const data = Array.isArray(args.data) ? args.data : [args.data];
            args = {
              ...args,
              data: data.map((item: any) => (item.tenant_id ? item : { ...item, tenant_id: tenantId })),
            };
          }
          return query(args);
        },
        // ── Bulk mutations ─────────────────────────────────────────────────
        async updateMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
          if (tenantScopedPrismaModels.has(model)) {
            const tenantId = getCurrentTenantId();
            args = { ...args, where: { tenant_id: tenantId, ...(args.where ?? {}) } };
          }
          return query(args);
        },
        async deleteMany({ model, args, query }: { model: string; args: any; query: (args: any) => Promise<any> }) {
          if (tenantScopedPrismaModels.has(model)) {
            const tenantId = getCurrentTenantId();
            args = { ...args, where: { tenant_id: tenantId, ...(args.where ?? {}) } };
          }
          return query(args);
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
