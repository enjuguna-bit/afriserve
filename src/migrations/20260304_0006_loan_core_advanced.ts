export default {
  id: "20260304_0006_loan_core_advanced",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    async function runSafe(sql: string, params?: unknown[]) {
      try {
        await run(sql, params);
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
        if (message.includes("duplicate column name")) {
          return;
        }
        throw error;
      }
    }

    await runSafe(`
      ALTER TABLE loan_products
      ADD COLUMN interest_accrual_method TEXT NOT NULL DEFAULT 'upfront'
    `);

    await runSafe(`
      ALTER TABLE loan_products
      ADD COLUMN penalty_compounding_method TEXT NOT NULL DEFAULT 'simple'
    `);

    await runSafe(`
      ALTER TABLE loan_products
      ADD COLUMN penalty_base_amount TEXT NOT NULL DEFAULT 'installment_outstanding'
    `);

    await runSafe(`
      ALTER TABLE loan_products
      ADD COLUMN penalty_cap_percent_of_outstanding REAL
    `);

    await runSafe(`
      ALTER TABLE loan_installments
      ADD COLUMN penalty_compounding_method TEXT
    `);

    await runSafe(`
      ALTER TABLE loan_installments
      ADD COLUMN penalty_base_amount TEXT
    `);

    await runSafe(`
      ALTER TABLE loan_installments
      ADD COLUMN penalty_cap_percent_of_outstanding REAL
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS loan_disbursement_tranches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        tranche_number INTEGER NOT NULL,
        amount REAL NOT NULL,
        disbursed_at TEXT NOT NULL,
        disbursed_by_user_id INTEGER,
        note TEXT,
        is_final INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (disbursed_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_disbursement_tranches_loan_tranche
      ON loan_disbursement_tranches(loan_id, tranche_number)
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_loan_disbursement_tranches_loan_id
      ON loan_disbursement_tranches(loan_id)
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS loan_interest_profiles (
        loan_id INTEGER PRIMARY KEY,
        accrual_method TEXT NOT NULL DEFAULT 'upfront',
        accrual_basis TEXT NOT NULL DEFAULT 'flat',
        accrual_start_at TEXT,
        maturity_at TEXT,
        total_contractual_interest REAL NOT NULL DEFAULT 0,
        accrued_interest REAL NOT NULL DEFAULT 0,
        last_accrual_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS loan_interest_accrual_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        accrual_date TEXT NOT NULL,
        amount REAL NOT NULL,
        days_accrued INTEGER NOT NULL DEFAULT 0,
        balance_snapshot REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_interest_accrual_events_unique
      ON loan_interest_accrual_events(loan_id, accrual_date)
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_loan_interest_accrual_events_loan_id
      ON loan_interest_accrual_events(loan_id)
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS loan_contract_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        version_number INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        principal REAL NOT NULL,
        interest_rate REAL NOT NULL,
        term_weeks INTEGER NOT NULL,
        expected_total REAL NOT NULL,
        repaid_total REAL NOT NULL,
        balance REAL NOT NULL,
        snapshot_json TEXT,
        note TEXT,
        created_by_user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_contract_versions_loan_version
      ON loan_contract_versions(loan_id, version_number)
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_loan_contract_versions_loan_id
      ON loan_contract_versions(loan_id)
    `);

    await run(`
      DROP TRIGGER IF EXISTS trg_approval_request_type_insert
    `);
    await run(`
      DROP TRIGGER IF EXISTS trg_approval_request_type_update
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_approval_request_type_insert
      BEFORE INSERT ON approval_requests
      FOR EACH ROW
      WHEN NEW.request_type NOT IN (
        'loan_restructure',
        'loan_write_off',
        'loan_top_up',
        'loan_refinance',
        'loan_term_extension'
      )
      BEGIN
        SELECT RAISE(ABORT, 'Invalid approval request type');
      END
    `);

    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_approval_request_type_update
      BEFORE UPDATE OF request_type ON approval_requests
      FOR EACH ROW
      WHEN NEW.request_type NOT IN (
        'loan_restructure',
        'loan_write_off',
        'loan_top_up',
        'loan_refinance',
        'loan_term_extension'
      )
      BEGIN
        SELECT RAISE(ABORT, 'Invalid approval request type');
      END
    `);

    await run(`
      INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
      SELECT ?, ?, ?, 0, 1, datetime('now')
      WHERE NOT EXISTS (
        SELECT 1
        FROM gl_accounts
        WHERE code = ?
      )
    `, ["UNEARNED_INTEREST", "Unearned Interest", "liability", "UNEARNED_INTEREST"]);
  },
  async down() {
    // Forward-only runtime migration for SQLite compatibility mode.
  },
};
