import assert from "node:assert/strict";
import test from "node:test";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

test("admins can edit customer 360 guarantor and collateral records", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Customer 360 Edit Client ${suffix}`,
        phone: `+2547${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data?.id || 0);
    assert.ok(clientId > 0);

    const createGuarantor = await api(baseUrl, `/api/clients/${clientId}/guarantors`, {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Editable Guarantor ${suffix}`,
        phone: "+254700001111",
        nationalId: `GUA-${suffix}`,
        monthlyIncome: 18000,
        guaranteeAmount: 9000,
      },
    });
    assert.equal(createGuarantor.status, 201);
    const guarantorId = Number(createGuarantor.data?.guarantor?.id || 0);
    assert.ok(guarantorId > 0);

    const createCollateral = await api(baseUrl, `/api/clients/${clientId}/collaterals`, {
      method: "POST",
      token: adminToken,
      body: {
        assetType: "vehicle",
        description: `Editable collateral ${suffix}`,
        estimatedValue: 120000,
        registrationNumber: `REG-${suffix}`.slice(0, 24),
        logbookNumber: `LOG-${suffix}`.slice(0, 24),
      },
    });
    assert.equal(createCollateral.status, 201);
    const collateralId = Number(createCollateral.data?.collateral?.id || 0);
    assert.ok(collateralId > 0);

    const updateGuarantor = await api(baseUrl, `/api/clients/${clientId}/guarantors/${guarantorId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        fullName: `Updated Guarantor ${suffix}`,
        monthlyIncome: 26000,
        guaranteeAmount: 14000,
      },
    });
    assert.equal(updateGuarantor.status, 200);
    assert.equal(String(updateGuarantor.data?.message || ""), "Client guarantor updated");
    assert.equal(String(updateGuarantor.data?.guarantor?.full_name || ""), `Updated Guarantor ${suffix}`);
    assert.equal(Number(updateGuarantor.data?.guarantor?.monthly_income || 0), 26000);
    assert.equal(Number(updateGuarantor.data?.guarantor?.guarantee_amount || 0), 14000);

    const updateCollateral = await api(baseUrl, `/api/clients/${clientId}/collaterals/${collateralId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        description: `Updated collateral ${suffix}`,
        estimatedValue: 175000,
        locationDetails: "Updated customer yard",
      },
    });
    assert.equal(updateCollateral.status, 200);
    assert.equal(String(updateCollateral.data?.message || ""), "Client collateral updated");
    assert.equal(String(updateCollateral.data?.collateral?.description || ""), `Updated collateral ${suffix}`);
    assert.equal(Number(updateCollateral.data?.collateral?.estimated_value || 0), 175000);
    assert.equal(String(updateCollateral.data?.collateral?.location_details || ""), "Updated customer yard");
  } finally {
    await stop();
  }
});

test("admins can edit pending approval loan details and the contract history records the change", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Pending Loan Edit Client ${suffix}`,
        phone: `+2547${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data?.id || 0);
    assert.ok(clientId > 0);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 2000,
        termWeeks: 8,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data?.id || 0);
    assert.ok(loanId > 0);

    const updateLoan = await api(baseUrl, `/api/loans/${loanId}/details`, {
      method: "PATCH",
      token: adminToken,
      body: {
        principal: 2600,
        termWeeks: 13,
        interestRate: 104,
        registrationFee: 250,
        processingFee: 400,
      },
    });
    assert.equal(updateLoan.status, 200);
    assert.equal(String(updateLoan.data?.message || ""), "Loan details updated");
    assert.equal(Number(updateLoan.data?.loan?.principal || 0), 2600);
    assert.equal(Number(updateLoan.data?.loan?.term_weeks || 0), 13);
    assert.equal(Number(updateLoan.data?.loan?.interest_rate || 0), 104);
    assert.equal(Number(updateLoan.data?.loan?.registration_fee || 0), 250);
    assert.equal(Number(updateLoan.data?.loan?.processing_fee || 0), 400);
    assert.equal(Number(updateLoan.data?.loan?.expected_total || 0), 3276);
    assert.equal(Number(updateLoan.data?.loan?.balance || 0), 3276);
    assert.equal(Number(updateLoan.data?.breakdown?.expected_total || 0), 3276);
    assert.equal(Number(updateLoan.data?.changedFields?.principal?.previous || 0), 2000);
    assert.equal(Number(updateLoan.data?.changedFields?.principal?.next || 0), 2600);

    const contracts = await api(baseUrl, `/api/loans/${loanId}/contracts`, {
      token: adminToken,
    });
    assert.equal(contracts.status, 200);

    const detailsVersion = Array.isArray(contracts.data?.versions)
      ? contracts.data.versions.find((row: Record<string, unknown>) => String(row.event_type || "").toLowerCase() === "details_update")
      : null;
    assert.ok(detailsVersion, "Expected loan contract versions to include a details_update event");
    assert.equal(Number(detailsVersion?.principal || 0), 2600);
    assert.equal(Number(detailsVersion?.expected_total || 0), 3276);
    assert.equal(Number(detailsVersion?.snapshot?.previousLoan?.principal || 0), 2000);
    assert.equal(Number(detailsVersion?.snapshot?.changes?.principal?.next || 0), 2600);
  } finally {
    await stop();
  }
});

test("loan detail edits are blocked once a loan leaves pending approval", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = uniqueSuffix();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Approved Loan Edit Client ${suffix}`,
        phone: `+2547${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data?.id || 0);
    assert.ok(clientId > 0);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1800,
        termWeeks: 6,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data?.id || 0);
    assert.ok(loanId > 0);

    const approveLoan = await api(baseUrl, `/api/loans/${loanId}/approve`, {
      method: "POST",
      token: adminToken,
      body: {
        notes: "Approve before attempting edit",
      },
    });
    assert.equal(approveLoan.status, 200);
    assert.equal(String(approveLoan.data?.status || ""), "approved");

    const blockedUpdate = await api(baseUrl, `/api/loans/${loanId}/details`, {
      method: "PATCH",
      token: adminToken,
      body: {
        principal: 1900,
      },
    });
    assert.equal(blockedUpdate.status, 409);
    assert.match(String(blockedUpdate.data?.message || ""), /pending_approval/i);
  } finally {
    await stop();
  }
});
