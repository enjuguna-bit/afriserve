import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");

test("overdue sync binds date before tenant id in the tenant-scoped installment update", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src", "jobs", "overdueSync.ts"),
    "utf8",
  );

  assert.match(
    source,
    /date\(due_date\) < date\(\?\)[\s\S]*SELECT id FROM loans WHERE tenant_id = \?[\s\S]*\[today, getCurrentTenantId\(\)\]/,
    "overdue sync should bind the comparison date before the tenant id",
  );
});
