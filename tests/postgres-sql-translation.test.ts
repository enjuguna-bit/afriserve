import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");
const postgresConnectionModuleUrl = pathToFileURL(
  path.join(repoRoot, "src", "db", "postgresConnection.ts"),
).href;

function renderTranslatedSql(sourceSql: string): string {
  const script = `
    import { convertPlaceholders, translateSql } from ${JSON.stringify(postgresConnectionModuleUrl)};
    const translated = convertPlaceholders(translateSql(${JSON.stringify(sourceSql)}));
    console.log(translated);
    process.exit(0);
  `;

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30000,
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout || "translation subprocess failed");
  return String(result.stdout || "");
}

test("Postgres SQL translation rewrites SQLite date filters used by dashboard reports", () => {
  const translated = renderTranslatedSql(`
    SELECT *
    FROM loan_installments i
    WHERE date(i.due_date) < date(?)
      AND date('now') >= date(i.due_date)
      AND date(datetime(i.due_date, '+3 hours')) BETWEEN date(?) AND date(?)
  `);

  assert.match(translated, /CAST\(i\.due_date AS date\) < CAST\(\$1 AS date\)/);
  assert.match(translated, /CURRENT_DATE >= CAST\(i\.due_date AS date\)/);
  assert.match(
    translated,
    /CAST\(\(CAST\(i\.due_date AS timestamp\) \+ INTERVAL '3 hours'\) AS date\) BETWEEN CAST\(\$2 AS date\) AND CAST\(\$3 AS date\)/,
  );
  assert.doesNotMatch(translated, /\bdate\(/i);
});

test("Postgres SQL translation rewrites SQLite julianday aging math used by arrears reports", () => {
  const translated = renderTranslatedSql(`
    SELECT
      CAST(julianday(date(?)) - julianday(date(MIN(i.due_date))) AS INTEGER) AS days_overdue
    FROM loan_installments i
    WHERE date(datetime(i.due_date, '+3 hours')) < date(?)
  `);

  assert.match(
    translated,
    /CAST\(\(EXTRACT\(EPOCH FROM CAST\(CAST\(\$1 AS date\) AS timestamp\)\) \/ 86400\.0\) - \(EXTRACT\(EPOCH FROM CAST\(CAST\(MIN\(i\.due_date\) AS date\) AS timestamp\)\) \/ 86400\.0\) AS INTEGER\) AS days_overdue/,
  );
  assert.match(
    translated,
    /CAST\(\(CAST\(i\.due_date AS timestamp\) \+ INTERVAL '3 hours'\) AS date\) < CAST\(\$2 AS date\)/,
  );
  assert.doesNotMatch(translated, /\bjulianday\(/i);
});

test("Postgres SQL translation rewrites nested SQLite datetime wrappers used by deploy-only report queries", () => {
  const translated = renderTranslatedSql(`
    SELECT *
    FROM loans l
    WHERE datetime(COALESCE(l.written_off_at, l.updated_at)) >= datetime(?)
      AND datetime(COALESCE(l.written_off_at, l.updated_at)) <= datetime(?)
  `);

  assert.match(
    translated,
    /CAST\(COALESCE\(l\.written_off_at, l\.updated_at\) AS timestamp\) >= CAST\(\$1 AS timestamp\)/,
  );
  assert.match(
    translated,
    /CAST\(COALESCE\(l\.written_off_at, l\.updated_at\) AS timestamp\) <= CAST\(\$2 AS timestamp\)/,
  );
  assert.doesNotMatch(translated, /\bdatetime\(/i);
});
