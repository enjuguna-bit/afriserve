import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";
function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function createLoanOfficer({ baseUrl, adminToken, branchId, suffix, label }) {
  const email = `client.dedupe.officer.${label}.${suffix}@example.com`;
  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: {
      fullName: `Client Dedupe Officer ${label.toUpperCase()} ${suffix}`,
      email,
      password: "Password@123",
      role: "loan_officer",
      branchId,
    },
  });
  assert.equal(createUser.status, 201);

  const login = await api(baseUrl, "/api/auth/login", {
    method: "POST",
    body: {
      email,
      password: "Password@123",
    },
  });
  assert.equal(login.status, 200);

  return {
    token: login.data.token,
    userId: Number(login.data.user.id),
  };
}

test("potential duplicates endpoint returns fuzzy matches by name and phone patterns", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const primaryClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Dedupe Client ${suffix} Alpha`,
        phone: "+254700123456",
        nationalId: `NAT-${suffix}`,
      },
    });
    assert.equal(primaryClient.status, 201);

    const fuzzyClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Dedupe Clent ${suffix} Alpha`,
        phone: "0700123456",
        nationalId: `ALT-${suffix}`,
      },
    });
    assert.equal(fuzzyClient.status, 201);
    const fuzzyClientId = Number(fuzzyClient.data.id);
    assert.ok(Number.isInteger(fuzzyClientId) && fuzzyClientId > 0);

    const duplicates = await api(
      baseUrl,
      `/api/clients/potential-duplicates?name=${encodeURIComponent(`Dedupe Client ${suffix} Alpha`)}&phone=+254700123456`,
      {
        token: adminToken,
      },
    );

    assert.equal(duplicates.status, 200);
    assert.ok(Array.isArray(duplicates.data?.duplicates));
    assert.equal(duplicates.data.duplicates.length > 0, true);

    const matched = duplicates.data.duplicates.find((row) => Number(row.id) === fuzzyClientId);
    assert.ok(matched);
    assert.equal(Number(matched.matchScore) >= 35, true);
    assert.equal(Array.isArray(matched.matchSignals), true);
    assert.equal(matched.matchSignals.includes("same_phone_suffix"), true);
  } finally {
    await stop();
  }
});

test("potential duplicates endpoint requires at least one query criterion", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const emptyQuery = await api(baseUrl, "/api/clients/potential-duplicates", {
      token: adminToken,
    });

    assert.equal(emptyQuery.status, 400);
    assert.equal(emptyQuery.data?.errorCode, "VALIDATION_ERROR");
  } finally {
    await stop();
  }
});

test("potential duplicates endpoint applies loan-officer ownership filter", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);
    const branchId = Number(branches.data.data?.[0]?.id);
    assert.ok(Number.isInteger(branchId) && branchId > 0);

    const officerOne = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "owner",
    });
    const officerTwo = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "other",
    });

    const ownerClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerOne.token,
      body: {
        fullName: `Ownership Dedupe ${suffix} Shared`,
        phone: "+254700999001",
      },
    });
    assert.equal(ownerClient.status, 201);

    const otherClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerTwo.token,
      body: {
        fullName: `Ownership Dedupe ${suffix} Shared`,
        phone: "+254700999002",
      },
    });
    assert.equal(otherClient.status, 201);
    const otherClientId = Number(otherClient.data.id);

    const officerTwoSearch = await api(
      baseUrl,
      `/api/clients/potential-duplicates?name=${encodeURIComponent(`Ownership Dedupe ${suffix} Shared`)}`,
      {
        token: officerTwo.token,
      },
    );
    assert.equal(officerTwoSearch.status, 200);
    assert.ok(Array.isArray(officerTwoSearch.data?.duplicates));
    assert.equal(officerTwoSearch.data.duplicates.some((row) => Number(row.id) === otherClientId), true);
    assert.equal(officerTwoSearch.data.duplicates.some((row) => Number(row.id) === Number(ownerClient.data.id)), false);
  } finally {
    await stop();
  }
});
