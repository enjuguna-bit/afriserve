export default {
  id: "20260323_0017_b2c_core_pending_status",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    let renamedExistingTable = false;
    try {
      await run("ALTER TABLE mobile_money_b2c_disbursements RENAME TO mobile_money_b2c_disbursements_old");
      renamedExistingTable = true;
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
      if (!message.includes("no such table")) {
        throw error;
      }
    }

    await run(`
      CREATE TABLE mobile_money_b2c_disbursements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL UNIQUE,
        loan_id INTEGER NOT NULL REFERENCES loans(id),
        provider TEXT NOT NULL,
        amount REAL NOT NULL,
        phone_number TEXT NOT NULL,
        account_reference TEXT NOT NULL,
        narration TEXT,
        initiated_by_user_id INTEGER REFERENCES users(id),
        provider_request_id TEXT,
        provider_response_json TEXT,
        status TEXT NOT NULL CHECK(status IN ('initiated', 'accepted', 'failed', 'core_pending', 'core_disbursed', 'core_failed', 'completed')),
        failure_reason TEXT,
        reversal_attempts INTEGER NOT NULL DEFAULT 0,
        reversal_last_requested_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    if (renamedExistingTable) {
      await run(`
        INSERT INTO mobile_money_b2c_disbursements (
          id,
          request_id,
          loan_id,
          provider,
          amount,
          phone_number,
          account_reference,
          narration,
          initiated_by_user_id,
          provider_request_id,
          provider_response_json,
          status,
          failure_reason,
          reversal_attempts,
          reversal_last_requested_at,
          created_at,
          updated_at
        )
        SELECT
          id,
          request_id,
          loan_id,
          provider,
          amount,
          phone_number,
          account_reference,
          narration,
          initiated_by_user_id,
          provider_request_id,
          provider_response_json,
          CASE
            WHEN status IN ('initiated', 'accepted', 'failed', 'core_pending', 'core_disbursed', 'core_failed', 'completed') THEN status
            ELSE 'failed'
          END,
          failure_reason,
          COALESCE(reversal_attempts, 0),
          reversal_last_requested_at,
          created_at,
          updated_at
        FROM mobile_money_b2c_disbursements_old
      `);

      await run("DROP TABLE mobile_money_b2c_disbursements_old");
    }

    await run(
      "CREATE INDEX IF NOT EXISTS idx_mobile_money_b2c_disbursements_loan_id ON mobile_money_b2c_disbursements(loan_id)",
    );
    await run(
      "CREATE INDEX IF NOT EXISTS idx_mobile_money_b2c_disbursements_status ON mobile_money_b2c_disbursements(status)",
    );
  },
  async down({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run("ALTER TABLE mobile_money_b2c_disbursements RENAME TO mobile_money_b2c_disbursements_new");

    await run(`
      CREATE TABLE mobile_money_b2c_disbursements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL UNIQUE,
        loan_id INTEGER NOT NULL REFERENCES loans(id),
        provider TEXT NOT NULL,
        amount REAL NOT NULL,
        phone_number TEXT NOT NULL,
        account_reference TEXT NOT NULL,
        narration TEXT,
        initiated_by_user_id INTEGER REFERENCES users(id),
        provider_request_id TEXT,
        provider_response_json TEXT,
        status TEXT NOT NULL CHECK(status IN ('initiated', 'accepted', 'failed', 'core_disbursed', 'core_failed', 'completed')),
        failure_reason TEXT,
        reversal_attempts INTEGER NOT NULL DEFAULT 0,
        reversal_last_requested_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await run(`
      INSERT INTO mobile_money_b2c_disbursements (
        id,
        request_id,
        loan_id,
        provider,
        amount,
        phone_number,
        account_reference,
        narration,
        initiated_by_user_id,
        provider_request_id,
        provider_response_json,
        status,
        failure_reason,
        reversal_attempts,
        reversal_last_requested_at,
        created_at,
        updated_at
      )
      SELECT
        id,
        request_id,
        loan_id,
        provider,
        amount,
        phone_number,
        account_reference,
        narration,
        initiated_by_user_id,
        provider_request_id,
        provider_response_json,
        CASE
          WHEN status = 'core_pending' THEN 'accepted'
          WHEN status IN ('initiated', 'accepted', 'failed', 'core_disbursed', 'core_failed', 'completed') THEN status
          ELSE 'failed'
        END,
        failure_reason,
        COALESCE(reversal_attempts, 0),
        reversal_last_requested_at,
        created_at,
        updated_at
      FROM mobile_money_b2c_disbursements_new
    `);

    await run("DROP TABLE mobile_money_b2c_disbursements_new");

    await run(
      "CREATE INDEX IF NOT EXISTS idx_mobile_money_b2c_disbursements_loan_id ON mobile_money_b2c_disbursements(loan_id)",
    );
    await run(
      "CREATE INDEX IF NOT EXISTS idx_mobile_money_b2c_disbursements_status ON mobile_money_b2c_disbursements(status)",
    );
  },
};
