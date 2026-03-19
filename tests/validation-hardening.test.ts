import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";
/**
 * @param {unknown} issues
 * @param {string} fieldName
 * @returns {boolean}
 */
function hasValidationIssueForField(issues, fieldName) {
  if (!Array.isArray(issues)) {
    return false;
  }
  return issues.some((issue) => Array.isArray(issue?.path) && issue.path.includes(fieldName));
}

test("loan creation rejects principal values below 1", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Minimum Principal Validation Client",
        phone: "+254711111001",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 0.5,
        termWeeks: 12,
      },
    });

    assert.equal(createLoan.status, 400);
    assert.equal(createLoan.data?.errorCode, "VALIDATION_ERROR");
    assert.equal(hasValidationIssueForField(createLoan.data?.issues, "principal"), true);
  } finally {
    await stop();
  }
});

test("client KRA PIN validation enforces expected format on create and update", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const invalidCreate = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Invalid KRA PIN Client",
        phone: "+254711111002",
        kraPin: "invalid-pin",
      },
    });
    assert.equal(invalidCreate.status, 400);
    assert.equal(invalidCreate.data?.errorCode, "VALIDATION_ERROR");
    assert.equal(hasValidationIssueForField(invalidCreate.data?.issues, "kraPin"), true);

    const validCreate = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Valid KRA PIN Client",
        phone: "+254711111003",
        kraPin: "A123456789B",
      },
    });
    assert.equal(validCreate.status, 201);
    const clientId = Number(validCreate.data.id);
    assert.ok(Number.isInteger(clientId) && clientId > 0);

    const invalidPatch = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        kraPin: "bad",
      },
    });
    assert.equal(invalidPatch.status, 400);
    assert.equal(invalidPatch.data?.errorCode, "VALIDATION_ERROR");
    assert.equal(hasValidationIssueForField(invalidPatch.data?.issues, "kraPin"), true);
  } finally {
    await stop();
  }
});

test("client collateral failures return exact error text and requestId in non-production mode", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-collateral-error-"));
  const dbPath = path.join(tempRoot, "collateral-error.db");
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
      NODE_ENV: "test",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Collateral Failure Debug Client",
        phone: "+254711111099",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const db = new Database(dbPath);
    try {
      db.exec("DROP TABLE collateral_assets");
    } finally {
      db.close();
    }

    const addCollateral = await api(baseUrl, `/api/clients/${clientId}/collaterals`, {
      method: "POST",
      token: adminToken,
      body: {
        assetType: "vehicle",
        description: "Broken collateral table asset",
        estimatedValue: 100000,
        registrationNumber: "DBG1001",
      },
    });

    assert.equal(addCollateral.status, 500);
    assert.match(String(addCollateral.data?.message || ""), /no such table: collateral_assets/i);
    assert.equal(typeof addCollateral.data?.requestId, "string");
    assert.ok(String(addCollateral.data.requestId).length > 0);
    assert.equal(String(addCollateral.data?.debugDetails?.errorName || ""), "SqliteError");
  } finally {
    await stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

