export default {
  id: "20260305_0009_user_roles",
  async up({ run }: any) {
    await run(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, role),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await run("CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role)");

    await run(
      `
        INSERT INTO user_roles (user_id, role, created_at)
        SELECT
          u.id,
          LOWER(TRIM(u.role)),
          COALESCE(u.created_at, datetime('now'))
        FROM users u
        WHERE TRIM(COALESCE(u.role, '')) <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM user_roles ur
            WHERE ur.user_id = u.id
              AND ur.role = LOWER(TRIM(u.role))
          )
      `,
    );
  },
  async down() {
    // Forward-only runtime migration.
  },
};
