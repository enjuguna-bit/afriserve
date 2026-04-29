import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");

test("audit log Prisma schemas include tenant_id parity", () => {
  const sqliteSchema = fs.readFileSync(path.join(repoRoot, "prisma", "schema.prisma"), "utf8");
  const postgresSchema = fs.readFileSync(path.join(repoRoot, "prisma", "postgres", "schema.prisma"), "utf8");

  assert.match(sqliteSchema, /model audit_logs \{[\s\S]*tenant_id\s+String\s+@default\("default"\)/);
  assert.match(postgresSchema, /model audit_logs \{[\s\S]*tenant_id\s+String\s+@default\("default"\)/);
  assert.match(sqliteSchema, /@@index\(\[tenant_id, created_at\], map: "idx_audit_logs_tenant_created_at"\)/);
  assert.match(postgresSchema, /@@index\(\[tenant_id, created_at\], map: "idx_audit_logs_tenant_created_at"\)/);
});

test("audit service writes tenant_id for both SQLite and Prisma audit inserts", () => {
  const auditService = fs.readFileSync(path.join(repoRoot, "src", "services", "auditService.ts"), "utf8");

  assert.match(auditService, /INSERT INTO audit_logs \(tenant_id, user_id, action, target_type, target_id, details, ip_address, created_at\)/);
  assert.match(auditService, /tenant_id: tenantId/);
});
