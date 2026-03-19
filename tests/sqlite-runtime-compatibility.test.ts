import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs/promises";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";

test("startup repairs legacy sqlite schema for loan guarantors and mobile money workbench", async () => {
  const dbPath = `.runtime/test-dbs/sqlite-compat-${Date.now()}.sqlite`;
  const initialServer = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
    },
  });
  const { baseUrl, stop, dbFilePath } = initialServer;

  assert.ok(dbFilePath, "Expected sqlite test database path");

  let loanId = 0;

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "SQLite Compatibility Client",
        phone: "+254700003777",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1400,
        termWeeks: 6,
      },
    });
    assert.equal(createLoan.status, 201);
    loanId = Number(createLoan.data.id);
    assert.ok(loanId > 0);
  } finally {
    await stop();
  }

  const legacyDb = new Database(dbFilePath);
  legacyDb.exec(`
    PRAGMA foreign_keys = OFF;

    ALTER TABLE loan_guarantors RENAME TO loan_guarantors_modern;
    CREATE TABLE loan_guarantors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      guarantor_id INTEGER NOT NULL,
      guarantee_amount REAL NOT NULL DEFAULT 0,
      liability_type TEXT NOT NULL DEFAULT 'individual',
      note TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (guarantor_id) REFERENCES guarantors(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
    );
    INSERT INTO loan_guarantors (id, loan_id, guarantor_id, guarantee_amount, liability_type, note, created_by_user_id, created_at)
    SELECT id, loan_id, guarantor_id, guarantee_amount, liability_type, note, created_by_user_id, created_at
    FROM loan_guarantors_modern;
    DROP TABLE loan_guarantors_modern;
    CREATE INDEX IF NOT EXISTS idx_loan_guarantors_loan_id ON loan_guarantors(loan_id);
    CREATE INDEX IF NOT EXISTS idx_loan_guarantors_guarantor_id ON loan_guarantors(guarantor_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_guarantors_unique_link ON loan_guarantors(loan_id, guarantor_id);

    DROP TABLE IF EXISTS mobile_money_c2b_events;

    ALTER TABLE collateral_assets RENAME TO collateral_assets_modern;
    CREATE TABLE collateral_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type TEXT NOT NULL,
      description TEXT NOT NULL,
      estimated_value REAL NOT NULL DEFAULT 0,
      ownership_type TEXT NOT NULL DEFAULT 'client',
      owner_name TEXT,
      owner_national_id TEXT,
      registration_number TEXT,
      logbook_number TEXT,
      title_number TEXT,
      location_details TEXT,
      valuation_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      client_id INTEGER,
      branch_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE
    );
    INSERT INTO collateral_assets (
      id,
      asset_type,
      description,
      estimated_value,
      ownership_type,
      owner_name,
      owner_national_id,
      registration_number,
      logbook_number,
      title_number,
      location_details,
      valuation_date,
      status,
      client_id,
      branch_id,
      created_at,
      updated_at
    )
    SELECT
      id,
      asset_type,
      description,
      estimated_value,
      ownership_type,
      owner_name,
      owner_national_id,
      registration_number,
      logbook_number,
      title_number,
      location_details,
      valuation_date,
      status,
      client_id,
      branch_id,
      created_at,
      updated_at
    FROM collateral_assets_modern;
    DROP TABLE collateral_assets_modern;
    CREATE INDEX IF NOT EXISTS idx_collateral_assets_client_id ON collateral_assets(client_id);

    PRAGMA foreign_keys = ON;
  `);
  legacyDb.close();

  const restartedServer = await startServer({
    envOverrides: {
      DB_PATH: dbFilePath,
    },
  });

  try {
    const adminToken = await loginAsAdmin(restartedServer.baseUrl);

    const loanGuarantors = await api(restartedServer.baseUrl, `/api/loans/${loanId}/guarantors`, {
      token: adminToken,
    });
    assert.equal(loanGuarantors.status, 200);
    assert.ok(Array.isArray(loanGuarantors.data));

    const c2bEvents = await api(restartedServer.baseUrl, "/api/mobile-money/c2b/events?status=unmatched", {
      token: adminToken,
    });
    assert.equal(c2bEvents.status, 200);
    assert.ok(Array.isArray(c2bEvents.data));
  } finally {
    await restartedServer.stop();
  }

  const repairedDb = new Database(dbFilePath, { readonly: true });
  const loanGuarantorColumns = repairedDb.prepare("PRAGMA table_info(loan_guarantors)").all() as Array<{ name: string }>;
  const collateralColumns = repairedDb.prepare("PRAGMA table_info(collateral_assets)").all() as Array<{ name: string }>;
  const c2bColumns = repairedDb.prepare("PRAGMA table_info(mobile_money_c2b_events)").all() as Array<{ name: string }>;
  repairedDb.close();

  assert.ok(
    loanGuarantorColumns.some((column) => String(column.name) === "relationship_to_client"),
    "Expected startup compatibility to restore loan_guarantors.relationship_to_client",
  );
  assert.ok(
    collateralColumns.some((column) => String(column.name) === "created_by_user_id"),
    "Expected startup compatibility to restore collateral_assets.created_by_user_id",
  );
  assert.ok(
    c2bColumns.some((column) => String(column.name) === "external_receipt"),
    "Expected startup compatibility to restore mobile_money_c2b_events",
  );

  await Promise.all([
    fs.rm(dbFilePath, { force: true }),
    fs.rm(`${dbFilePath}-wal`, { force: true }),
    fs.rm(`${dbFilePath}-shm`, { force: true }),
  ]);
});

test("startup tolerates legacy accounting business-date rows without colliding on normalization", async () => {
  const dbPath = `.runtime/test-dbs/sqlite-compat-accounting-${Date.now()}.sqlite`;
  const initialServer = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
    },
  });
  const { stop, dbFilePath } = initialServer;

  assert.ok(dbFilePath, "Expected sqlite test database path");

  await stop();

  const legacyDb = new Database(dbFilePath);
  legacyDb.prepare(
    `
      INSERT INTO gl_batch_runs (
        batch_type,
        effective_date,
        status,
        started_at,
        completed_at,
        triggered_by_user_id,
        summary_json,
        error_message,
        created_at
      )
      VALUES (?, ?, 'completed', ?, ?, NULL, NULL, NULL, ?)
    `,
  ).run("eod", "2026-01-15T00:00:00.000Z", "2026-01-16T00:00:00.000Z", "2026-01-16T00:00:01.000Z", "2026-01-16T00:00:00.000Z");
  legacyDb.prepare(
    `
      INSERT INTO gl_batch_runs (
        batch_type,
        effective_date,
        status,
        started_at,
        completed_at,
        triggered_by_user_id,
        summary_json,
        error_message,
        created_at
      )
      VALUES (?, ?, 'completed', ?, ?, NULL, NULL, NULL, ?)
    `,
  ).run("eod", "2026-01-15", "2026-01-16T00:05:00.000Z", "2026-01-16T00:05:01.000Z", "2026-01-16T00:05:00.000Z");
  legacyDb.close();

  const restartedServer = await startServer({
    envOverrides: {
      DB_PATH: dbFilePath,
    },
  });

  try {
    const adminToken = await loginAsAdmin(restartedServer.baseUrl);
    assert.ok(typeof adminToken === "string" && adminToken.length > 0, "Expected admin login after compatibility startup");
  } finally {
    await restartedServer.stop();
  }

  const repairedDb = new Database(dbFilePath, { readonly: true });
  const batchRows = repairedDb.prepare(
    `
      SELECT effective_date
      FROM gl_batch_runs
      WHERE batch_type = 'eod'
        AND date(effective_date) = date('2026-01-15')
      ORDER BY id ASC
    `,
  ).all() as Array<{ effective_date: string }>;
  repairedDb.close();

  assert.equal(batchRows.length, 2, "Expected both legacy accounting business-date rows to remain readable after startup");
  assert.ok(
    batchRows.some((row) => String(row.effective_date) === "2026-01-15"),
    "Expected startup compatibility to preserve date-only business-date values",
  );
  assert.ok(
    batchRows.some((row) => String(row.effective_date) === "2026-01-15T00:00:00.000Z"),
    "Expected startup compatibility to preserve already-normalized accounting business-date values",
  );

  await Promise.all([
    fs.rm(dbFilePath, { force: true }),
    fs.rm(`${dbFilePath}-wal`, { force: true }),
    fs.rm(`${dbFilePath}-shm`, { force: true }),
  ]);
});
