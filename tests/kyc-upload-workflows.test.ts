import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer, api, loginAsAdmin, approveLoan, createHighRiskReviewerToken } from "./integration-helpers.js";

test("loan approval is blocked until client KYC is verified when enforcement flag is enabled", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      REQUIRE_VERIFIED_CLIENT_KYC_FOR_LOAN_APPROVAL: "true",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "KYC Blocking Client",
        phone: "+254700001801",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1500,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const resetKycToPending = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "pending",
        note: "Move client back to pending KYC before approval review",
      },
    });
    assert.equal(resetKycToPending.status, 200);
    assert.equal(resetKycToPending.data.client.kyc_status, "pending");

    const blockedApproval = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Attempt approval before KYC verification",
    });

    assert.equal(blockedApproval.status, 409);
    assert.match(String(blockedApproval.data?.message || ""), /KYC/i);

    const verifyKyc = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "verified",
        note: "Identity and documents verified",
      },
    });
    assert.equal(verifyKyc.status, 200);
    assert.equal(verifyKyc.data.client.kyc_status, "verified");

    const approvedAfterVerification = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "KYC complete, approve loan",
    });

    assert.equal(approvedAfterVerification.status, 200);
    assert.equal(approvedAfterVerification.data.status, "active");
  } finally {
    await stop();
  }
});

test("loan approval remains blocked for in-review and suspended KYC states until verification", async () => {
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      REQUIRE_VERIFIED_CLIENT_KYC_FOR_LOAN_APPROVAL: "true",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "KYC Multi-State Blocking Client",
        phone: "+254700001802",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1400,
        termWeeks: 10,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const moveToReview = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "in_review",
        note: "Documents submitted for compliance review",
      },
    });
    assert.equal(moveToReview.status, 200);
    assert.equal(moveToReview.data.client.kyc_status, "in_review");

    const blockedWhileInReview = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Should remain blocked while KYC is in review",
    });

    assert.equal(blockedWhileInReview.status, 409);
    assert.match(String(blockedWhileInReview.data?.message || ""), /KYC/i);

    const suspendKyc = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "suspended",
        note: "Compliance hold applied",
      },
    });
    assert.equal(suspendKyc.status, 200);
    assert.equal(suspendKyc.data.client.kyc_status, "suspended");

    const blockedWhileSuspended = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Should remain blocked while KYC is suspended",
    });

    assert.equal(blockedWhileSuspended.status, 409);
    assert.match(String(blockedWhileSuspended.data?.message || ""), /KYC/i);

    const verifyKyc = await api(baseUrl, `/api/clients/${clientId}/kyc`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "verified",
        note: "Compliance cleared and verified",
      },
    });
    assert.equal(verifyKyc.status, 200);
    assert.equal(verifyKyc.data.client.kyc_status, "verified");

    const approvedAfterVerification = await approveLoan(baseUrl, loanId, checkerToken, {
      notes: "Verified KYC now permits approval",
    });

    assert.equal(approvedAfterVerification.status, 200);
    assert.equal(approvedAfterVerification.data.status, "active");
  } finally {
    await stop();
  }
});

test("multipart client document upload updates photo_url and stores file on local disk", async () => {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-upload-"));
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      UPLOAD_STORAGE_DRIVER: "local",
      UPLOAD_LOCAL_DIR: uploadDirectory,
      UPLOAD_PUBLIC_BASE_PATH: "/uploads-test",
      UPLOAD_MAX_FILE_SIZE_MB: "2",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "KYC Upload Client",
        phone: "+254700001901",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const form = new FormData();
    form.set("clientId", String(clientId));
    form.set("documentType", "photo");
    form.set("file", new Blob([Buffer.from("fake-image-data")], { type: "image/png" }), "photo.png");

    const uploadResponse = await fetch(`${baseUrl}/api/uploads/client-document`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      body: form,
    });
    const uploadData = await uploadResponse.json();

    assert.equal(uploadResponse.status, 201);
    assert.equal(uploadData.documentType, "photo");
    assert.ok(typeof uploadData.url === "string" && uploadData.url.includes("/uploads-test/"));
    assert.equal(uploadData.client.photo_url, uploadData.url);

    const clientAfterUpload = await api(baseUrl, `/api/clients/${clientId}`, {
      token: adminToken,
    });
    assert.equal(clientAfterUpload.status, 200);
    assert.equal(clientAfterUpload.data.photo_url, uploadData.url);

    const clientUploadFolder = path.join(uploadDirectory, "clients", String(clientId), "photo");
    assert.ok(fs.existsSync(clientUploadFolder), "Expected client upload folder to exist");
    assert.ok(fs.readdirSync(clientUploadFolder).length > 0, "Expected uploaded file to be written");
  } finally {
    await stop();
    fs.rmSync(uploadDirectory, { recursive: true, force: true });
  }
});
