/**
 * patch-tenant-id-0022.mjs
 *
 * Applies migration 0022 schema patches to both Prisma schema files.
 * Adds tenant_id to: transactions, loan_installments, approval_requests
 *
 * Run once: node scripts/patch-tenant-id-0022.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dir, "..");

function patch(filePath, replacements) {
  let content = readFileSync(filePath, "utf8");
  let changed = 0;
  for (const [find, replace] of replacements) {
    if (!content.includes(find)) {
      console.warn(`  [SKIP] Pattern not found (already applied?): ${find.slice(0, 60).replace(/\n/g, "\\n")}...`);
      continue;
    }
    content = content.replace(find, replace);
    changed++;
  }
  writeFileSync(filePath, content, "utf8");
  console.log(`  Patched ${changed} replacement(s) in ${path.relative(root, filePath)}`);
}

// ─── SQLite schema ────────────────────────────────────────────────────────────
console.log("Patching prisma/schema.prisma (SQLite)...");
patch(path.join(root, "prisma", "schema.prisma"), [
  // transactions — add tenant_id field
  [
    `model transactions {
  id          Int      @id @default(autoincrement())
  loan_id     Int?`,
    `model transactions {
  id          Int      @id @default(autoincrement())
  tenant_id   String   @default("default")
  loan_id     Int?`,
  ],
  // transactions — add indexes
  [
    `  @@index([tx_type, occurred_at], map: "idx_transactions_tx_type_occurred_at")
  @@map("transactions")
}`,
    `  @@index([tx_type, occurred_at], map: "idx_transactions_tx_type_occurred_at")
  @@index([tenant_id], map: "idx_transactions_tenant_id")
  @@index([tenant_id, loan_id], map: "idx_transactions_tenant_loan")
  @@map("transactions")
}`,
  ],
  // loan_installments — add tenant_id field
  [
    `model loan_installments {
  id                                 Int       @id @default(autoincrement())
  loan_id                            Int`,
    `model loan_installments {
  id                                 Int       @id @default(autoincrement())
  tenant_id                          String    @default("default")
  loan_id                            Int`,
  ],
  // loan_installments — add indexes
  [
    `  @@index([due_date, status, loan_id], map: "idx_installments_due_status_loan_id")
  @@map("loan_installments")
}`,
    `  @@index([due_date, status, loan_id], map: "idx_installments_due_status_loan_id")
  @@index([tenant_id], map: "idx_loan_installments_tenant_id")
  @@index([tenant_id, loan_id], map: "idx_loan_installments_tenant_loan")
  @@map("loan_installments")
}`,
  ],
  // approval_requests — add tenant_id field
  [
    `model approval_requests {
  id                   Int       @id @default(autoincrement())
  request_type         String`,
    `model approval_requests {
  id                   Int       @id @default(autoincrement())
  tenant_id            String    @default("default")
  request_type         String`,
  ],
  // approval_requests — add indexes
  [
    `  @@index([expires_at])
  @@map("approval_requests")
}`,
    `  @@index([expires_at])
  @@index([tenant_id], map: "idx_approval_requests_tenant_id")
  @@index([tenant_id, status], map: "idx_approval_requests_tenant_status")
  @@map("approval_requests")
}`,
  ],
]);

// ─── Postgres schema ──────────────────────────────────────────────────────────
console.log("Patching prisma/postgres/schema.prisma (Postgres)...");
patch(path.join(root, "prisma", "postgres", "schema.prisma"), [
  // transactions — add tenant_id field
  [
    `model transactions {
  id          Int      @id @default(autoincrement())
  loan_id     Int?`,
    `model transactions {
  id          Int      @id @default(autoincrement())
  tenant_id   String   @default("default")
  loan_id     Int?`,
  ],
  // transactions — add indexes
  [
    `  @@index([tx_type, occurred_at], map: "idx_transactions_tx_type_occurred_at")
  @@map("transactions")
}`,
    `  @@index([tx_type, occurred_at], map: "idx_transactions_tx_type_occurred_at")
  @@index([tenant_id], map: "idx_transactions_tenant_id")
  @@index([tenant_id, loan_id], map: "idx_transactions_tenant_loan")
  @@map("transactions")
}`,
  ],
  // loan_installments — add tenant_id field
  [
    `model loan_installments {
  id                                 Int       @id @default(autoincrement())
  loan_id                            Int`,
    `model loan_installments {
  id                                 Int       @id @default(autoincrement())
  tenant_id                          String    @default("default")
  loan_id                            Int`,
  ],
  // loan_installments — add indexes
  [
    `  @@index([due_date, status, loan_id], map: "idx_installments_due_status_loan_id")
  @@map("loan_installments")
}`,
    `  @@index([due_date, status, loan_id], map: "idx_installments_due_status_loan_id")
  @@index([tenant_id], map: "idx_loan_installments_tenant_id")
  @@index([tenant_id, loan_id], map: "idx_loan_installments_tenant_loan")
  @@map("loan_installments")
}`,
  ],
  // approval_requests — add tenant_id field
  [
    `model approval_requests {
  id                   Int       @id @default(autoincrement())
  request_type         String`,
    `model approval_requests {
  id                   Int       @id @default(autoincrement())
  tenant_id            String    @default("default")
  request_type         String`,
  ],
  // approval_requests — add indexes
  [
    `  @@index([expires_at])
  @@map("approval_requests")
}`,
    `  @@index([expires_at])
  @@index([tenant_id], map: "idx_approval_requests_tenant_id")
  @@index([tenant_id, status], map: "idx_approval_requests_tenant_status")
  @@map("approval_requests")
}`,
  ],
]);

console.log("\nDone. Run `npm run prisma:generate` to regenerate the Prisma clients.");
