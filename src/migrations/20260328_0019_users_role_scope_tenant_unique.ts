const EXPANDED_USER_ROLE_SQL = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'ceo', 'finance', 'operations_manager', 'it', 'area_manager', 'loan_officer', 'cashier', 'investor', 'partner')),
    is_active INTEGER NOT NULL DEFAULT 1,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    token_version INTEGER NOT NULL DEFAULT 0,
    branch_id INTEGER REFERENCES branches(id),
    primary_region_id INTEGER REFERENCES regions(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deactivated_at TEXT,
    tenant_id TEXT NOT NULL DEFAULT 'default'
  )
`;

export default {
  id: "20260328_0019_users_role_scope_tenant_unique",
  async up({ run, get }: any) {
    const usersTable = await get(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1",
    );
    const usersTableSql = String(usersTable?.sql || "").trim().toLowerCase();
    if (!usersTableSql) {
      return;
    }

    const needsRoleExpansion = !usersTableSql.includes("'investor'") || !usersTableSql.includes("'partner'");
    const hasLegacyGlobalEmailUnique = usersTableSql.includes("email text not null unique");

    if (!needsRoleExpansion && !hasLegacyGlobalEmailUnique) {
      await run("CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_users_primary_region_id ON users(primary_region_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active)");
      await run("CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, email)");
      await run("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON users (tenant_id, LOWER(TRIM(email))) WHERE email IS NOT NULL");
      await run("CREATE INDEX IF NOT EXISTS idx_users_tenant_role_active ON users (tenant_id, role, is_active)");
      await run("CREATE INDEX IF NOT EXISTS idx_users_email_normalized ON users (LOWER(TRIM(email)))");
      return;
    }

    const rebuiltTableName = "users_rebuilt_20260328_0019";

    await run("PRAGMA foreign_keys = OFF");

    try {
      await run("BEGIN IMMEDIATE TRANSACTION");
      await run(`DROP TABLE IF EXISTS ${rebuiltTableName}`);
      await run(EXPANDED_USER_ROLE_SQL.replace("CREATE TABLE users", `CREATE TABLE ${rebuiltTableName}`));
      await run(`
        INSERT INTO ${rebuiltTableName} (
          id,
          full_name,
          email,
          password_hash,
          role,
          is_active,
          failed_login_attempts,
          locked_until,
          token_version,
          branch_id,
          primary_region_id,
          created_at,
          deactivated_at,
          tenant_id
        )
        SELECT
          id,
          full_name,
          email,
          password_hash,
          role,
          is_active,
          failed_login_attempts,
          locked_until,
          token_version,
          branch_id,
          primary_region_id,
          created_at,
          deactivated_at,
          COALESCE(tenant_id, 'default')
        FROM users
      `);
      await run("DROP TABLE users");
      await run(`ALTER TABLE ${rebuiltTableName} RENAME TO users`);
      await run("CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_users_primary_region_id ON users(primary_region_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active)");
      await run("CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, email)");
      await run("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON users (tenant_id, LOWER(TRIM(email))) WHERE email IS NOT NULL");
      await run("CREATE INDEX IF NOT EXISTS idx_users_tenant_role_active ON users (tenant_id, role, is_active)");
      await run("CREATE INDEX IF NOT EXISTS idx_users_email_normalized ON users (LOWER(TRIM(email)))");
      await run("COMMIT");
    } catch (error) {
      await run("ROLLBACK");
      throw error;
    } finally {
      await run("PRAGMA foreign_keys = ON");
    }
  },
  async down() {
    // Forward-only runtime migration.
  },
};
