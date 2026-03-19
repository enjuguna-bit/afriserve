export default {
  id: "20260305_0007_accounting_advanced",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    async function runSafe(sql: string, params?: unknown[]) {
      try {
        await run(sql, params);
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
        if (message.includes("duplicate column name")) {
          return;
        }
        if (message.includes("already exists")) {
          return;
        }
        throw error;
      }
    }

    await runSafe(`ALTER TABLE gl_journals ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'KES'`);
    await runSafe(`ALTER TABLE gl_journals ADD COLUMN transaction_currency TEXT NOT NULL DEFAULT 'KES'`);
    await runSafe(`ALTER TABLE gl_journals ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1`);
    await runSafe(`ALTER TABLE gl_journals ADD COLUMN fx_rate_source TEXT`);
    await runSafe(`ALTER TABLE gl_journals ADD COLUMN fx_rate_timestamp TEXT`);

    await runSafe(`ALTER TABLE gl_entries ADD COLUMN transaction_amount REAL`);
    await runSafe(`ALTER TABLE gl_entries ADD COLUMN transaction_currency TEXT`);
    await runSafe(`ALTER TABLE gl_entries ADD COLUMN coa_version_id INTEGER`);
    await runSafe(`ALTER TABLE gl_entries ADD COLUMN coa_account_code TEXT`);
    await runSafe(`ALTER TABLE gl_entries ADD COLUMN coa_account_name TEXT`);

    await run(`
      CREATE TABLE IF NOT EXISTS gl_fx_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        base_currency TEXT NOT NULL,
        quote_currency TEXT NOT NULL,
        rate REAL NOT NULL,
        source TEXT NOT NULL,
        quoted_at TEXT NOT NULL,
        created_by_user_id INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS gl_batch_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_type TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        triggered_by_user_id INTEGER,
        summary_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (triggered_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS gl_period_locks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_run_id INTEGER,
        lock_type TEXT NOT NULL,
        lock_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'locked',
        note TEXT,
        locked_by_user_id INTEGER,
        locked_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (batch_run_id) REFERENCES gl_batch_runs(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (locked_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS gl_balance_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_run_id INTEGER,
        snapshot_date TEXT NOT NULL,
        account_id INTEGER NOT NULL,
        branch_id INTEGER,
        currency TEXT NOT NULL,
        debit_total REAL NOT NULL DEFAULT 0,
        credit_total REAL NOT NULL DEFAULT 0,
        net_balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (batch_run_id) REFERENCES gl_batch_runs(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (account_id) REFERENCES gl_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS gl_trial_balance_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_run_id INTEGER,
        snapshot_date TEXT NOT NULL,
        branch_id INTEGER,
        currency TEXT NOT NULL,
        total_debit REAL NOT NULL DEFAULT 0,
        total_credit REAL NOT NULL DEFAULT 0,
        balanced INTEGER NOT NULL DEFAULT 1,
        row_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (batch_run_id) REFERENCES gl_batch_runs(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS gl_coa_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_code TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        effective_from TEXT,
        effective_to TEXT,
        parent_version_id INTEGER,
        notes TEXT,
        created_by_user_id INTEGER,
        activated_by_user_id INTEGER,
        activated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_version_id) REFERENCES gl_coa_versions(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS gl_coa_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coa_version_id INTEGER NOT NULL,
        base_account_id INTEGER,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        is_contra INTEGER NOT NULL DEFAULT 0,
        is_posting_allowed INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (coa_version_id) REFERENCES gl_coa_versions(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (base_account_id) REFERENCES gl_accounts(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS gl_suspense_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_reference TEXT,
        source_channel TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        description TEXT,
        branch_id INTEGER,
        client_id INTEGER,
        loan_id INTEGER,
        transaction_currency TEXT NOT NULL DEFAULT 'KES',
        transaction_amount REAL NOT NULL,
        transaction_amount_remaining REAL NOT NULL,
        book_currency TEXT NOT NULL DEFAULT 'KES',
        book_amount REAL NOT NULL,
        book_amount_remaining REAL NOT NULL,
        opening_fx_rate REAL NOT NULL DEFAULT 1,
        received_at TEXT NOT NULL,
        created_by_user_id INTEGER,
        resolved_by_user_id INTEGER,
        resolved_at TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS gl_suspense_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suspense_case_id INTEGER NOT NULL,
        journal_id INTEGER NOT NULL,
        target_account_code TEXT NOT NULL,
        allocated_transaction_amount REAL NOT NULL,
        carrying_book_amount REAL NOT NULL,
        settled_book_amount REAL NOT NULL,
        fx_difference_amount REAL NOT NULL DEFAULT 0,
        transaction_currency TEXT NOT NULL,
        book_currency TEXT NOT NULL,
        fx_rate REAL NOT NULL DEFAULT 1,
        note TEXT,
        allocated_by_user_id INTEGER,
        allocated_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (suspense_case_id) REFERENCES gl_suspense_cases(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (journal_id) REFERENCES gl_journals(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (allocated_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_fx_rates_pair_time ON gl_fx_rates(base_currency, quote_currency, quoted_at)`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_batch_runs_type_date ON gl_batch_runs(batch_type, effective_date)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_gl_batch_runs_status ON gl_batch_runs(status)`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_period_locks_type_date ON gl_period_locks(lock_type, lock_date)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_gl_period_locks_date ON gl_period_locks(lock_date)`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_balance_snapshot_unique ON gl_balance_snapshots(snapshot_date, account_id, branch_id, currency)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_gl_balance_snapshot_date ON gl_balance_snapshots(snapshot_date)`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_coa_versions_code ON gl_coa_versions(version_code)`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_coa_accounts_version_code ON gl_coa_accounts(coa_version_id, code)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_gl_suspense_cases_status ON gl_suspense_cases(status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_gl_suspense_cases_branch ON gl_suspense_cases(branch_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_gl_suspense_allocations_case ON gl_suspense_allocations(suspense_case_id)`);

    await run(`DROP TRIGGER IF EXISTS trg_gl_journals_lock_guard_insert`);
    await run(`
      CREATE TRIGGER IF NOT EXISTS trg_gl_journals_lock_guard_insert
      BEFORE INSERT ON gl_journals
      FOR EACH ROW
      WHEN EXISTS (
        SELECT 1
        FROM gl_period_locks pl
        WHERE LOWER(TRIM(COALESCE(pl.status, ''))) = 'locked'
          AND LOWER(TRIM(COALESCE(pl.lock_type, ''))) = 'eod'
          AND date(pl.lock_date) = date(COALESCE(NEW.posted_at, datetime('now')))
      )
      BEGIN
        SELECT RAISE(ABORT, 'GL period is locked for posting date');
      END
    `);

    await run(
      `
        INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
        SELECT ?, ?, ?, 0, 1, datetime('now')
        WHERE NOT EXISTS (
          SELECT 1
          FROM gl_accounts
          WHERE code = ?
        )
      `,
      ["SUSPENSE_FUNDS", "Suspense Funds", "liability", "SUSPENSE_FUNDS"],
    );

    await run(
      `
        INSERT INTO gl_accounts (code, name, account_type, is_contra, is_active, created_at)
        SELECT ?, ?, ?, 0, 1, datetime('now')
        WHERE NOT EXISTS (
          SELECT 1
          FROM gl_accounts
          WHERE code = ?
        )
      `,
      ["FX_GAIN_LOSS", "FX Gain/Loss", "revenue", "FX_GAIN_LOSS"],
    );
  },
  async down() {
    // Forward-only runtime migration for SQLite compatibility mode.
  },
};
