import test from "node:test";
import assert from "node:assert/strict";
import { redactDatabasePathForStatus } from "../src/utils/redaction.js";

test("redactDatabasePathForStatus redacts postgres passwords", () => {
  const redacted = redactDatabasePathForStatus(
    "postgresql://afdbadmin:super-secret@example.postgres.database.azure.com:5432/afriserve?sslmode=require",
    "postgres",
  );

  assert.equal(
    redacted,
    "postgresql://afdbadmin:<redacted>@example.postgres.database.azure.com:5432/afriserve?sslmode=require",
  );
});

test("redactDatabasePathForStatus leaves sqlite paths untouched", () => {
  const sqlitePath = "C:\\AfriserveBackend\\prisma\\data\\microfinance.db";

  assert.equal(redactDatabasePathForStatus(sqlitePath, "sqlite"), sqlitePath);
});
