import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// Lifecycle startup tenant isolation check — unit tests
//
// We test the check in isolation by reproducing its logic rather than
// importing lifecycle (which would require a full bootstrap). The contract is:
//   - SQLite + column present  → no throw, logs info
//   - SQLite + column absent   → throws FATAL error before server binds
//   - Postgres + column absent → logs warn, does NOT throw (RLS backup)
// db.all is required in LifecycleOptions (not optional) so adapters that
// omit it will fail TypeScript compilation rather than silently skipping.
// ---------------------------------------------------------------------------

type Column = { [key: string]: unknown };

async function runStartupTenantCheck(
  dbClient: "sqlite" | "postgres",
  tableColumns: Record<string, Column[]>,
  logger: { info: (msg: string, meta?: unknown) => void; warn: (msg: string, meta?: unknown) => void },
): Promise<void> {
  const tenantCheckTables = ["loan_guarantors", "loan_collaterals"];

  if (dbClient === "sqlite") {
    const allFn = async (sql: string) => {
      const match = sql.match(/PRAGMA table_info\((\w+)\)/);
      const table = match?.[1] ?? "";
      return tableColumns[table] ?? [];
    };

    for (const table of tenantCheckTables) {
      const columns = await allFn(`PRAGMA table_info(${table})`);
      const hasTenantId = columns.some(
        (c) => String(c["name"] || "").toLowerCase() === "tenant_id",
      );
      if (!hasTenantId) {
        throw Object.assign(
          new Error(
            `FATAL: ${table}.tenant_id is missing. ` +
            "Tenant isolation is broken — run the required schema migration before starting.",
          ),
          { isFatal: true },
        );
      }
    }
    logger.info("tenant_isolation.startup_check.ok", { tables: tenantCheckTables });
  } else {
    const getFn = async (sql: string, params?: unknown[]) => {
      const table = String(params?.[0] ?? "");
      const cols = tableColumns[table] ?? [];
      return cols.some((c) => String(c["name"] || "") === "tenant_id") ? { column_name: "tenant_id" } : null;
    };

    for (const table of tenantCheckTables) {
      const row = await getFn(
        "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'tenant_id' LIMIT 1",
        [table],
      ).catch(() => null);
      if (!row) {
        logger.warn("tenant_isolation.startup_check.missing_column", { table });
      }
    }
  }
}

describe("lifecycle startup tenant isolation assertion", () => {
  it("passes silently on SQLite when both tables have tenant_id", async () => {
    const infoLogs: string[] = [];
    const warnLogs: string[] = [];

    await assert.doesNotReject(() =>
      runStartupTenantCheck(
        "sqlite",
        {
          loan_guarantors: [{ name: "id" }, { name: "loan_id" }, { name: "tenant_id" }],
          loan_collaterals: [{ name: "id" }, { name: "collateral_asset_id" }, { name: "tenant_id" }],
        },
        {
          info: (msg) => infoLogs.push(msg),
          warn: (msg) => warnLogs.push(msg),
        },
      ),
    );

    assert.ok(infoLogs.includes("tenant_isolation.startup_check.ok"));
    assert.equal(warnLogs.length, 0);
  });

  it("throws FATAL on SQLite when loan_guarantors is missing tenant_id", async () => {
    await assert.rejects(
      () =>
        runStartupTenantCheck(
          "sqlite",
          {
            loan_guarantors: [{ name: "id" }, { name: "loan_id" }],
            loan_collaterals: [{ name: "id" }, { name: "tenant_id" }],
          },
          { info: () => {}, warn: () => {} },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.startsWith("FATAL:"),
          `expected FATAL prefix, got: ${err.message}`,
        );
        assert.ok(err.message.includes("loan_guarantors.tenant_id is missing"));
        return true;
      },
    );
  });

  it("throws FATAL on SQLite when loan_collaterals is missing tenant_id", async () => {
    await assert.rejects(
      () =>
        runStartupTenantCheck(
          "sqlite",
          {
            loan_guarantors: [{ name: "id" }, { name: "tenant_id" }],
            loan_collaterals: [{ name: "id" }],
          },
          { info: () => {}, warn: () => {} },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("loan_collaterals.tenant_id is missing"));
        return true;
      },
    );
  });

  it("warns but does NOT throw on Postgres when column is missing", async () => {
    const warnLogs: Array<{ msg: string; meta: unknown }> = [];

    await assert.doesNotReject(() =>
      runStartupTenantCheck(
        "postgres",
        {
          loan_guarantors: [],   // no tenant_id
          loan_collaterals: [],  // no tenant_id
        },
        {
          info: () => {},
          warn: (msg, meta) => warnLogs.push({ msg, meta }),
        },
      ),
    );

    assert.equal(warnLogs.length, 2);
    assert.ok(warnLogs.every((l) => l.msg === "tenant_isolation.startup_check.missing_column"));
  });

  it("does NOT warn on Postgres when both tables have tenant_id", async () => {
    const warnLogs: string[] = [];

    await assert.doesNotReject(() =>
      runStartupTenantCheck(
        "postgres",
        {
          loan_guarantors: [{ name: "tenant_id" }],
          loan_collaterals: [{ name: "tenant_id" }],
        },
        {
          info: () => {},
          warn: (msg) => warnLogs.push(msg),
        },
      ),
    );

    assert.equal(warnLogs.length, 0);
  });
});
