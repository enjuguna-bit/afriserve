import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SQLITE_SPECIFIC_SQL_PATTERNS = [
  /\bAUTOINCREMENT\b/i,
  /\bPRAGMA\b/i,
  /\bsqlite_master\b/i,
  /\bdatetime\(\s*'now'\s*\)/i,
  /\bSELECT\s+RAISE\s*\(\s*ABORT\b/i,
];

function containsSqliteSpecificSql(sql: string): boolean {
  const normalizedSql = String(sql || "");
  return SQLITE_SPECIFIC_SQL_PATTERNS.some((pattern) => pattern.test(normalizedSql));
}

async function findSqliteRootedPostgresMigrationNames(migrationsDirectory: string): Promise<string[]> {
  try {
    const entries = await readdir(migrationsDirectory, { withFileTypes: true });
    const flaggedMigrationNames: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const migrationSqlPath = path.join(migrationsDirectory, entry.name, "migration.sql");
      let migrationSql = "";
      try {
        migrationSql = await readFile(migrationSqlPath, "utf8");
      } catch {
        continue;
      }

      if (containsSqliteSpecificSql(migrationSql)) {
        flaggedMigrationNames.push(entry.name);
      }
    }

    return flaggedMigrationNames.sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

export {
  containsSqliteSpecificSql,
  findSqliteRootedPostgresMigrationNames,
};
