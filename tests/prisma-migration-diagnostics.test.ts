import test from "node:test";
import assert from "node:assert/strict";
import { summarizeFailedPrismaMigrationRows } from "../src/db/prismaMigrationDiagnostics.js";

test("summarizeFailedPrismaMigrationRows returns compact migration diagnostics", () => {
  const summary = summarizeFailedPrismaMigrationRows([
    {
      migration_name: "202603200001_gl_accounting_batches",
      started_at: "2026-03-20T16:30:31.000Z",
      applied_steps_count: 0,
      logs: "relation \"gl_accounting_batches\" does not exist\nretrying with the same statement",
    },
  ]);

  assert.deepEqual(summary, [
    {
      migrationName: "202603200001_gl_accounting_batches",
      startedAt: "2026-03-20T16:30:31.000Z",
      appliedStepsCount: 0,
      logSnippet: "relation \"gl_accounting_batches\" does not exist retrying with the same statement",
    },
  ]);
});
