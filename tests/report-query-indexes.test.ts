import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { startServer } from "./integration-helpers.js";
/**
 * @param {Database.Database} db
 * @param {string} indexName
 * @returns {string[]}
 */
function getIndexColumns(db, indexName) {
  return db.prepare(`PRAGMA index_info('${indexName}')`).all().map((row) => String(row.name));
}

test("schema provisions report query optimization indexes", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-report-indexes-"));
  const dbPath = path.join(tempRoot, "report-indexes.db");

  const { stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
    },
  });

  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      /** @type {Record<string, string[]>} */
      const expectedIndexes = {
        idx_users_role_active: ["role", "is_active"],
        idx_clients_kyc_status: ["kyc_status"],
        idx_clients_onboarding_status: ["onboarding_status"],
        idx_clients_fee_payment_status: ["fee_payment_status"],
        idx_loans_created_at: ["created_at"],
        idx_loans_client_id: ["client_id"],
        idx_loans_status: ["status"],
        idx_loans_branch_status: ["branch_id", "status"],
        idx_loans_branch_disbursed_at: ["branch_id", "disbursed_at"],
        idx_loans_created_by_disbursed_at: ["created_by_user_id", "disbursed_at"],
        idx_repayments_paid_at: ["paid_at"],
        idx_repayments_loan_paid_at: ["loan_id", "paid_at"],
        idx_repayments_recorded_by_paid_at: ["recorded_by_user_id", "paid_at"],
        idx_installments_loan_status_due_date: ["loan_id", "status", "due_date"],
        idx_installments_due_status_loan_id: ["due_date", "status", "loan_id"],
        idx_clients_branch_created_at: ["branch_id", "created_at"],
      };

      for (const [indexName, expectedColumns] of Object.entries(expectedIndexes)) {
        const indexRow = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
          .get(indexName);
        assert.ok(indexRow, `Expected index ${indexName} to exist`);
        assert.deepEqual(getIndexColumns(db, indexName), expectedColumns);
      }
    } finally {
      db.close();
    }
  } finally {
    await stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
