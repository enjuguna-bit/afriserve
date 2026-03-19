import assert from "node:assert/strict";
import test from "node:test";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function createLoanOfficer({
  baseUrl,
  adminToken,
  branchId,
  suffix,
  label,
}: {
  baseUrl: string;
  adminToken: string;
  branchId: number;
  suffix: string;
  label: string;
}) {
  const email = `portfolio.reallocation.${label}.${suffix}@example.com`;
  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: {
      fullName: `Portfolio Officer ${label.toUpperCase()} ${suffix}`,
      email,
      password: "Password@123",
      role: "loan_officer",
      branchId,
    },
  });
  assert.equal(createUser.status, 201);

  return Number(createUser.data?.id || createUser.data?.user?.id || 0);
}

test("portfolio reallocation moves borrower assignments and updates officer portfolio counts", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const branches = await api(baseUrl, "/api/branches?limit=1&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branches.status, 200);

    const branchId = Number(branches.data?.data?.[0]?.id || 0);
    assert.ok(Number.isInteger(branchId) && branchId > 0);

    const fromOfficerId = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "source",
    });
    const toOfficerId = await createLoanOfficer({
      baseUrl,
      adminToken,
      branchId,
      suffix,
      label: "target",
    });
    assert.ok(fromOfficerId > 0);
    assert.ok(toOfficerId > 0);

    const firstClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Portfolio Borrower One ${suffix}`,
        phone: `+2547${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
        branchId,
        officerId: fromOfficerId,
      },
    });
    assert.equal(firstClient.status, 201);

    const secondClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Portfolio Borrower Two ${suffix}`,
        phone: `+2547${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
        branchId,
        officerId: fromOfficerId,
      },
    });
    assert.equal(secondClient.status, 201);

    const officersBefore = await api(baseUrl, "/api/clients/assignable-officers", {
      token: adminToken,
    });
    assert.equal(officersBefore.status, 200);

    const sourceOfficerBefore = officersBefore.data?.find((officer: any) => Number(officer.id) === fromOfficerId);
    const targetOfficerBefore = officersBefore.data?.find((officer: any) => Number(officer.id) === toOfficerId);
    assert.equal(Number(sourceOfficerBefore?.assigned_portfolio_count || 0), 2);
    assert.equal(Number(targetOfficerBefore?.assigned_portfolio_count || 0), 0);

    const reallocate = await api(baseUrl, "/api/clients/portfolio-reallocation", {
      method: "POST",
      token: adminToken,
      body: {
        fromOfficerId,
        toOfficerId,
        note: "Portfolio reallocation regression test",
      },
    });
    assert.equal(reallocate.status, 200);
    assert.equal(Number(reallocate.data?.movedClients || 0), 2);

    const firstClientDetail = await api(baseUrl, `/api/clients/${firstClient.data?.id}`, {
      token: adminToken,
    });
    const secondClientDetail = await api(baseUrl, `/api/clients/${secondClient.data?.id}`, {
      token: adminToken,
    });
    assert.equal(firstClientDetail.status, 200);
    assert.equal(secondClientDetail.status, 200);
    assert.equal(Number(firstClientDetail.data?.officer_id || 0), toOfficerId);
    assert.equal(Number(secondClientDetail.data?.officer_id || 0), toOfficerId);

    const officersAfter = await api(baseUrl, "/api/clients/assignable-officers", {
      token: adminToken,
    });
    assert.equal(officersAfter.status, 200);

    const sourceOfficerAfter = officersAfter.data?.find((officer: any) => Number(officer.id) === fromOfficerId);
    const targetOfficerAfter = officersAfter.data?.find((officer: any) => Number(officer.id) === toOfficerId);
    assert.equal(Number(sourceOfficerAfter?.assigned_portfolio_count || 0), 0);
    assert.equal(Number(targetOfficerAfter?.assigned_portfolio_count || 0), 2);
  } finally {
    await stop();
  }
});