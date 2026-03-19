#!/usr/bin/env node
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const configuredDbPath = String(process.env.DB_PATH || "").trim();
const dbPath = configuredDbPath || path.join(currentDir, "..", "data", "microfinance.db");
const db = new Database(dbPath);

console.log(`Starting KYC and workflow migration for ${dbPath}...`);

/**
 * @param {string} sql
 */
function run(sql) {
  db.prepare(sql).run();
  console.log(`Executed: ${sql.slice(0, 80)}...`);
}

/**
 * @param {string} tableName
 * @param {string} columnName
 * @returns {boolean}
 */
function hasColumn(tableName, columnName) {
  const columns = /** @type {Array<{ name?: string }>} */ (db.prepare(`PRAGMA table_info(${tableName})`).all());
  return columns.some((column) => column.name === columnName);
}

/**
 * @param {string} tableName
 * @param {string} definitionSql
 */
function ensureColumn(tableName, definitionSql) {
  const columnName = definitionSql.split(/\s+/)[0];
  if (hasColumn(tableName, columnName)) {
    console.log(`Skipping (already exists): ${tableName}.${columnName}`);
    return;
  }

  run(`ALTER TABLE ${tableName} ADD COLUMN ${definitionSql}`);
}

function ensureLoanStatusConstraint() {
  const requiredStatuses = ["active", "closed", "written_off", "restructured", "pending_approval", "rejected"];
  const loansTable = /** @type {{ sql?: string } | undefined} */ (
    db.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'loans'
    `).get()
  );

  if (!loansTable?.sql) {
    console.log("Skipping loan status migration: loans table does not exist.");
    return;
  }

  const loansTableSql = String(loansTable.sql).toLowerCase();
  const hasAllStatuses = requiredStatuses.every((status) => loansTableSql.includes(`'${status}'`));
  if (loansTableSql.includes("check(status in") && hasAllStatuses) {
    console.log("Loan status constraint already includes pending_approval/rejected.");
    return;
  }

  const loanColumns = /** @type {Array<{ name?: string }>} */ (db.prepare("PRAGMA table_info(loans)").all());
  const hasLoanColumn = (columnName) => loanColumns.some((column) => column.name === columnName);
  const selectColumnOrNull = (columnName) => (hasLoanColumn(columnName) ? columnName : `NULL AS ${columnName}`);
  const statusCheckSql = requiredStatuses.map((status) => `'${status}'`).join(", ");

  console.log("Rebuilding loans table to update status constraint...");
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN TRANSACTION");

    db.exec(`
      CREATE TABLE loans_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        branch_id INTEGER REFERENCES branches(id),
        created_by_user_id INTEGER REFERENCES users(id),
        principal REAL NOT NULL,
        interest_rate REAL NOT NULL,
        term_months INTEGER NOT NULL,
        term_weeks INTEGER,
        registration_fee REAL NOT NULL DEFAULT 0,
        processing_fee REAL NOT NULL DEFAULT 0,
        disbursed_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN (${statusCheckSql})),
        officer_id INTEGER REFERENCES users(id),
        approved_by_user_id INTEGER REFERENCES users(id),
        approved_at TEXT,
        rejected_by_user_id INTEGER REFERENCES users(id),
        rejected_at TEXT,
        rejection_reason TEXT,
        expected_total REAL NOT NULL,
        repaid_total REAL NOT NULL DEFAULT 0,
        balance REAL NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )
    `);

    db.exec(`
      INSERT INTO loans_new (
        id,
        client_id,
        branch_id,
        created_by_user_id,
        principal,
        interest_rate,
        term_months,
        term_weeks,
        registration_fee,
        processing_fee,
        disbursed_at,
        status,
        officer_id,
        approved_by_user_id,
        approved_at,
        rejected_by_user_id,
        rejected_at,
        rejection_reason,
        expected_total,
        repaid_total,
        balance
      )
      SELECT
        id,
        client_id,
        branch_id,
        created_by_user_id,
        principal,
        interest_rate,
        term_months,
        term_weeks,
        COALESCE(registration_fee, 0),
        COALESCE(processing_fee, 0),
        disbursed_at,
        CASE
          WHEN LOWER(COALESCE(status, '')) IN (${statusCheckSql}) THEN LOWER(status)
          ELSE 'active'
        END,
        ${selectColumnOrNull("officer_id")},
        ${selectColumnOrNull("approved_by_user_id")},
        ${selectColumnOrNull("approved_at")},
        ${selectColumnOrNull("rejected_by_user_id")},
        ${selectColumnOrNull("rejected_at")},
        ${selectColumnOrNull("rejection_reason")},
        expected_total,
        COALESCE(repaid_total, 0),
        balance
      FROM loans
    `);

    db.exec("DROP TABLE loans");
    db.exec("ALTER TABLE loans_new RENAME TO loans");
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (_rollbackError) {
      // Preserve the original migration error.
    }
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

const clientColumns = [
  "photo_url TEXT",
  "id_document_url TEXT",
  "kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK(kyc_status IN ('pending', 'verified', 'rejected'))",
  "kra_pin TEXT",
  "next_of_kin_name TEXT",
  "next_of_kin_phone TEXT",
  "next_of_kin_relation TEXT",
  "business_type TEXT",
  "business_years INTEGER",
  "business_location TEXT",
  "residential_address TEXT",
  "officer_id INTEGER REFERENCES users(id)",
];

for (const definition of clientColumns) {
  ensureColumn("clients", definition);
}
run("UPDATE clients SET kyc_status = LOWER(TRIM(COALESCE(kyc_status, 'pending')))");
run("UPDATE clients SET kyc_status = 'pending' WHERE kyc_status NOT IN ('pending', 'verified', 'rejected')");

const loanColumns = [
  "officer_id INTEGER REFERENCES users(id)",
  "approved_by_user_id INTEGER REFERENCES users(id)",
  "approved_at TEXT",
  "rejected_by_user_id INTEGER REFERENCES users(id)",
  "rejected_at TEXT",
  "rejection_reason TEXT",
];

for (const definition of loanColumns) {
  ensureColumn("loans", definition);
}

ensureLoanStatusConstraint();

console.log("Migration complete.");
