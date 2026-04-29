import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// Tenant isolation assertion helper — unit tests
// ---------------------------------------------------------------------------
// We extract the assertion logic into a pure function so we can test it
// without needing a real database connection.

type DbAllFn = (sql: string) => Promise<Array<{ name: string }>>;

async function assertTableHasTenantColumn(
  tableName: string,
  all: DbAllFn,
): Promise<void> {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const hasTenantId = columns.some(
    (c) => String(c.name || "").toLowerCase() === "tenant_id",
  );
  if (!hasTenantId) {
    const error = Object.assign(
      new Error(
        `Tenant isolation is unavailable because ${tableName}.tenant_id is missing. ` +
        "Run the required schema repair before serving this endpoint.",
      ),
      { status: 503 },
    );
    throw error;
  }
}

describe("tenant isolation assertion", () => {
  it("resolves when tenant_id column is present", async () => {
    const mockAll: DbAllFn = async () => [
      { name: "id" },
      { name: "loan_id" },
      { name: "tenant_id" },
      { name: "created_at" },
    ];

    await assert.doesNotReject(() =>
      assertTableHasTenantColumn("loan_guarantors", mockAll),
    );
  });

  it("throws status 503 when tenant_id column is absent", async () => {
    const mockAll: DbAllFn = async () => [
      { name: "id" },
      { name: "loan_id" },
      { name: "created_at" },
    ];

    await assert.rejects(
      () => assertTableHasTenantColumn("loan_guarantors", mockAll),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("loan_guarantors.tenant_id is missing"));
        assert.equal((err as { status?: number }).status, 503);
        return true;
      },
    );
  });

  it("throws status 503 when tenant_id column is absent for loan_collaterals", async () => {
    const mockAll: DbAllFn = async () => [
      { name: "id" },
      { name: "collateral_asset_id" },
    ];

    await assert.rejects(
      () => assertTableHasTenantColumn("loan_collaterals", mockAll),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("loan_collaterals.tenant_id is missing"));
        assert.equal((err as { status?: number }).status, 503);
        return true;
      },
    );
  });

  it("is case-insensitive when matching the column name", async () => {
    const mockAll: DbAllFn = async () => [
      { name: "id" },
      { name: "TENANT_ID" },  // uppercase from some SQLite PRAGMA variants
    ];

    await assert.doesNotReject(() =>
      assertTableHasTenantColumn("loan_guarantors", mockAll),
    );
  });

  it("throws when the column list is empty", async () => {
    const mockAll: DbAllFn = async () => [];

    await assert.rejects(
      () => assertTableHasTenantColumn("loan_guarantors", mockAll),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as { status?: number }).status, 503);
        return true;
      },
    );
  });
});
