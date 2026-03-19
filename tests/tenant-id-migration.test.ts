/**
 * tests/tenant-id-migration.test.ts
 *
 * Unit tests for migration 0015 — tenant_id columns on core business tables.
 *
 * Verifies:
 *   1. All target tables receive a tenant_id column.
 *   2. Existing rows default to 'default' (backward-compat).
 *   3. New rows without an explicit tenant_id also default to 'default'.
 *   4. Per-tenant national_id uniqueness is enforced (same ID → different tenant = OK).
 *   5. Per-tenant email uniqueness on users (case-insensitive).
 *   6. Cross-tenant duplicate national_id / email is allowed.
 *   7. The old single-tenant national_id index is dropped.
 *   8. All expected composite indexes are created.
 *   9. Migration is idempotent (running twice does not throw).
 *  10. down() restores the pre-migration national_id index.
 */
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

// ── In-memory SQLite test harness ─────────────────────────────────────────────

function openTestDb() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'loan_officer',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      national_id TEXT,
      branch_id INTEGER,
      officer_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      branch_id INTEGER,
      officer_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      principal REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      expected_total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE repayments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      paid_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE gl_journals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER,
      branch_id INTEGER,
      client_id INTEGER,
      posted_at TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE domain_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      event_type TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id INTEGER,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Pre-migration 0014 index that migration 0015 replaces
    CREATE UNIQUE INDEX idx_clients_national_id_normalised
      ON clients (LOWER(REPLACE(REPLACE(TRIM(national_id), ' ', ''), '-', '')))
      WHERE national_id IS NOT NULL;
  `);

  // Seed one pre-existing row per table (should backfill to 'default')
  db.exec(`
    INSERT INTO users (full_name, email, role) VALUES ('Admin User', 'admin@test.com', 'admin');
    INSERT INTO clients (full_name, national_id) VALUES ('Jane Doe', '12345678');
    INSERT INTO loans (client_id, principal, balance, expected_total) VALUES (1, 10000, 10000, 11200);
    INSERT INTO repayments (loan_id, amount) VALUES (1, 500);
    INSERT INTO gl_journals (description) VALUES ('Test journal');
    INSERT INTO audit_logs (action) VALUES ('test_action');
  `);

  return db;
}

function buildHelpers(db: Database.Database) {
  const run = async (sql: string, params: unknown[] = []) => {
    db.prepare(sql).run(...(params as any[]));
    return {};
  };
  const get = async (sql: string, params: unknown[] = []) => {
    return db.prepare(sql).get(...(params as any[])) as Record<string, unknown> | undefined;
  };
  return { run, get };
}

function getColumnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map((r) => r.name);
}

function getIndexNames(db: Database.Database): string[] {
  return (db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .all() as Array<{ name: string }>)
    .map((r) => r.name);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("migration 0015 — adds tenant_id to users", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.ok(getColumnNames(db, "users").includes("tenant_id"), "users should have tenant_id");
  db.close();
});

test("migration 0015 — adds tenant_id to clients", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.ok(getColumnNames(db, "clients").includes("tenant_id"), "clients should have tenant_id");
  db.close();
});

test("migration 0015 — adds tenant_id to loans", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.ok(getColumnNames(db, "loans").includes("tenant_id"), "loans should have tenant_id");
  db.close();
});

test("migration 0015 — adds tenant_id to repayments", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.ok(getColumnNames(db, "repayments").includes("tenant_id"), "repayments should have tenant_id");
  db.close();
});

test("migration 0015 — adds tenant_id to gl_journals", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.ok(getColumnNames(db, "gl_journals").includes("tenant_id"), "gl_journals should have tenant_id");
  db.close();
});

test("migration 0015 — adds tenant_id to audit_logs", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.ok(getColumnNames(db, "audit_logs").includes("tenant_id"), "audit_logs should have tenant_id");
  db.close();
});

test("migration 0015 — existing rows backfill to 'default'", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  const tables = ["users", "clients", "loans", "repayments", "gl_journals", "audit_logs"];
  for (const table of tables) {
    const row = db.prepare(`SELECT tenant_id FROM ${table} WHERE id = 1`).get() as { tenant_id: string };
    assert.equal(row.tenant_id, "default", `${table}.tenant_id should default to 'default'`);
  }
  db.close();
});

test("migration 0015 — new rows without explicit tenant_id default to 'default'", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  db.prepare("INSERT INTO loans (client_id, principal, balance, expected_total) VALUES (1, 5000, 5000, 5600)").run();
  const row = db.prepare("SELECT tenant_id FROM loans ORDER BY id DESC LIMIT 1").get() as { tenant_id: string };
  assert.equal(row.tenant_id, "default");
  db.close();
});

test("migration 0015 — is idempotent (running twice does not throw)", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  await migration.up(helpers as any); // should not throw
  db.close();
});

test("migration 0015 — allows same national_id in different tenants", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  // '12345678' already exists under 'default' — same ID under a different tenant must be allowed
  assert.doesNotThrow(() => {
    db.prepare("INSERT INTO clients (full_name, national_id, tenant_id) VALUES (?, ?, ?)").run(
      "Other Tenant Client", "12345678", "tenant_b",
    );
  }, "same national_id in different tenants should be allowed");
  db.close();
});

test("migration 0015 — rejects duplicate national_id within the same tenant", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.throws(() => {
    db.prepare("INSERT INTO clients (full_name, national_id, tenant_id) VALUES (?, ?, ?)").run(
      "Duplicate", "12345678", "default",
    );
  }, "duplicate national_id in same tenant should throw");
  db.close();
});

test("migration 0015 — normalised national_id collision is caught within same tenant", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  // '12 345-678' normalises to '12345678' — same as existing row under 'default'
  assert.throws(() => {
    db.prepare("INSERT INTO clients (full_name, national_id, tenant_id) VALUES (?, ?, ?)").run(
      "Normalised Dupe", "12 345-678", "default",
    );
  }, "normalised national_id collision should be caught");
  db.close();
});

test("migration 0015 — allows same email in different tenants", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.doesNotThrow(() => {
    db.prepare("INSERT INTO users (full_name, email, role, tenant_id) VALUES (?, ?, ?, ?)").run(
      "Tenant B Admin", "admin@test.com", "admin", "tenant_b",
    );
  }, "same email in different tenants should be allowed");
  db.close();
});

test("migration 0015 — rejects duplicate email within the same tenant", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.throws(() => {
    db.prepare("INSERT INTO users (full_name, email, role, tenant_id) VALUES (?, ?, ?, ?)").run(
      "Duplicate Admin", "admin@test.com", "admin", "default",
    );
  }, "duplicate email in same tenant should throw");
  db.close();
});

test("migration 0015 — email uniqueness is case-insensitive within same tenant", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  assert.throws(() => {
    db.prepare("INSERT INTO users (full_name, email, role, tenant_id) VALUES (?, ?, ?, ?)").run(
      "Upper Dupe", "ADMIN@TEST.COM", "admin", "default",
    );
  }, "uppercase email that collides with existing lowercase should throw");
  db.close();
});

test("migration 0015 — drops old single-tenant national_id index", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  const indexes = getIndexNames(db);
  assert.ok(!indexes.includes("idx_clients_national_id_normalised"),
    "old single-tenant national_id index should be removed");
  db.close();
});

test("migration 0015 — creates expected composite indexes", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  const indexes = getIndexNames(db);
  const expected = [
    "idx_users_tenant_email",
    "uq_users_tenant_email",
    "idx_users_tenant_role_active",
    "idx_clients_tenant_branch",
    "idx_clients_tenant_officer",
    "idx_clients_tenant_national_id_normalised",
    "idx_loans_tenant_branch_status",
    "idx_loans_tenant_client",
    "idx_loans_tenant_officer",
    "idx_repayments_tenant_loan_paid_at",
    "idx_repayments_tenant_paid_at",
    "idx_gl_journals_tenant_loan",
    "idx_gl_journals_tenant_branch_posted_at",
    "idx_audit_logs_tenant_created_at",
    "idx_domain_events_tenant_status_id",
  ];
  for (const name of expected) {
    assert.ok(indexes.includes(name), `Expected index '${name}' to exist`);
  }
  db.close();
});

test("migration 0015 — down() restores pre-migration national_id index", async () => {
  const db = openTestDb();
  const helpers = buildHelpers(db);
  const { default: migration } = await import("../src/migrations/20260317_0015_tenant_id_columns.js");
  await migration.up(helpers as any);
  await migration.down(helpers as any);
  const indexes = getIndexNames(db);
  assert.ok(indexes.includes("idx_clients_national_id_normalised"),
    "pre-migration national_id index should be restored by down()");
  assert.ok(!indexes.includes("idx_clients_tenant_national_id_normalised"),
    "tenant national_id index should be removed by down()");
  assert.ok(!indexes.includes("uq_users_tenant_email"),
    "tenant email uniqueness index should be removed by down()");
  db.close();
});
