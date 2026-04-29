import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  containsSqliteSpecificSql,
  findSqliteRootedPostgresMigrationNames,
} from "../src/db/prismaMigrationHistoryDialect.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.basename(path.dirname(currentDir)) === "dist"
  ? path.resolve(currentDir, "..", "..")
  : path.resolve(currentDir, "..");

test("containsSqliteSpecificSql detects SQLite-only DDL markers", () => {
  assert.equal(
    containsSqliteSpecificSql(`
      CREATE TABLE "users" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `),
    true,
  );

  assert.equal(
    containsSqliteSpecificSql(`
      CREATE TABLE IF NOT EXISTS gl_accounting_batches (
        id BIGSERIAL PRIMARY KEY,
        effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `),
    false,
  );
});

test("findSqliteRootedPostgresMigrationNames flags the SQLite-rooted checked-in Postgres history", async () => {
  const migrationsDirectory = path.join(repoRoot, "prisma", "postgres", "migrations");
  const flaggedMigrationNames = await findSqliteRootedPostgresMigrationNames(migrationsDirectory);

  assert.ok(
    flaggedMigrationNames.includes("202602260001_init"),
    "Expected the SQLite-rooted init migration to be flagged",
  );
  assert.ok(
    flaggedMigrationNames.includes("202603050001_accounting_advanced"),
    "Expected the SQLite-rooted accounting migration to be flagged",
  );
  assert.equal(
    flaggedMigrationNames.includes("202603200001_gl_accounting_batches"),
    false,
    "The reviewed Postgres-only gl_accounting_batches migration should not be flagged",
  );
});
