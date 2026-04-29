import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");

test("Postgres schema parity includes gl_accounting_batches for accounting close", () => {
  const postgresSchema = fs.readFileSync(path.join(repoRoot, "prisma", "postgres", "schema.prisma"), "utf8");
  const migrationSql = fs.readFileSync(
    path.join(
      repoRoot,
      "prisma",
      "postgres",
      "migrations",
      "202603200001_gl_accounting_batches",
      "migration.sql",
    ),
    "utf8",
  );

  assert.match(postgresSchema, /model gl_accounting_batches \{/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS gl_accounting_batches/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS uniq_gl_accounting_batches_type_effective_date/i);
});
