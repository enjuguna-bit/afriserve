/**
 * Migration 0014 — Client national_id expression UNIQUE index (Gap 3 + Gap 4 fix)
 *
 * Gap 3: The clients table had no DB-level uniqueness constraint on national_id,
 *        relying entirely on application-level checks that are fallible under concurrency.
 *
 * Gap 4: All previous national_id lookups wrapped the column in LOWER(TRIM(...)),
 *        making them index-hostile. Standard indexes on the bare national_id column
 *        were ignored by the query planner.
 *
 * This migration creates a partial expression index on the normalised form of national_id
 * (lowercase, spaces stripped, hyphens stripped) that:
 *   1. Acts as a UNIQUE constraint — the DB rejects duplicate IDs even if two
 *      transactions race past the application-level check simultaneously.
 *   2. Is used by query plans for the LOWER(REPLACE(REPLACE(TRIM(...)))) predicate
 *      now used consistently in hasDuplicateNationalId and updateClient.
 *   3. Is partial (WHERE national_id IS NOT NULL) so NULL rows (clients without an ID)
 *      are never compared for uniqueness.
 *
 * SQLite supports expression indexes from version 3.9.0 (released 2015-10-14).
 * The minimum SQLite version used in this project is > 3.35, so this is safe.
 *
 * Note: Prisma does not model expression indexes; this migration is the authoritative
 * source of truth for this index. The schema.prisma @@index([national_id]) entry
 * remains and covers simple equality lookups on the raw column.
 */
export default {
  id: "20260316_0014_client_national_id_unique_index",
  async up({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    // Expression UNIQUE index on the normalised national_id.
    // Matches the predicate used in hasDuplicateNationalId:
    //   LOWER(REPLACE(REPLACE(TRIM(national_id), ' ', ''), '-', ''))
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_national_id_normalised
        ON clients (LOWER(REPLACE(REPLACE(TRIM(national_id), ' ', ''), '-', '')))
        WHERE national_id IS NOT NULL
    `);
  },
  async down({ run }: { run: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    await run("DROP INDEX IF EXISTS idx_clients_national_id_normalised");
  },
};
