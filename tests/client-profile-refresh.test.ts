import test from "node:test";
import assert from "node:assert/strict";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function createUserAndLogin({
  baseUrl,
  adminToken,
  branchId,
  role,
  suffix,
  label,
}: {
  baseUrl: string;
  adminToken: string;
  branchId?: number;
  role: string;
  suffix: string;
  label: string;
}) {
  const email = `profile.refresh.${role}.${label}.${suffix}@example.com`;
  const createUser = await api(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: {
      fullName: `Profile Refresh ${role} ${label} ${suffix}`,
      email,
      password: "Password@123",
      role,
      ...(branchId ? { branchId } : {}),
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
    email,
  };
}

test("client profile refresh workflow supports pushback, scoped correction, and version history", async () => {
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

    const officer = await createUserAndLogin({
      baseUrl,
      adminToken,
      branchId,
      role: "loan_officer",
      suffix,
      label: "officer",
    });
    const manager = await createUserAndLogin({
      baseUrl,
      adminToken,
      branchId,
      role: "operations_manager",
      suffix,
      label: "manager",
    });

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officer.token,
      body: {
        fullName: `Refresh Client ${suffix}`,
        phone: "+254700123456",
        businessType: "Retail",
        businessYears: 5,
        businessLocation: "Westlands",
        residentialAddress: "Nairobi",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createRefresh = await api(baseUrl, `/api/clients/${clientId}/profile-refreshes`, {
      method: "POST",
      token: manager.token,
      body: {
        assignedToUserId: officer.userId,
        note: "Routine KYC refresh",
      },
    });
    assert.equal(createRefresh.status, 201);
    const refreshId = Number(createRefresh.data.refresh.id);
    assert.ok(refreshId > 0);

    const firstCaptureAt = new Date().toISOString();
    const draftUpdate = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}`, {
      method: "PATCH",
      token: officer.token,
      body: {
        businessLocation: "Gikomba Market",
        residentialAddress: "Eastleigh, Nairobi",
        gps: {
          latitude: -1.2841,
          longitude: 36.8155,
          accuracyMeters: 5,
          capturedAt: firstCaptureAt,
        },
        photo: {
          url: "https://example.com/photos/refresh-client-1.jpg",
          capturedAt: firstCaptureAt,
          gpsLatitude: -1.2841,
          gpsLongitude: 36.8155,
          gpsAccuracyMeters: 5,
        },
        guarantors: [
          {
            fullName: `Refresh Guarantor ${suffix}`,
            phone: "+254711000111",
            nationalId: `PG-${suffix}`,
            guaranteeAmount: 20000,
          },
        ],
        collaterals: [
          {
            assetType: "vehicle",
            description: `Delivery bike ${suffix}`,
            estimatedValue: 120000,
            registrationNumber: `KYC-${suffix}`.slice(0, 20),
            logbookNumber: `LOG-${suffix}`.slice(0, 20),
            imageUrls: [
              "https://example.com/collateral/logbook-front.jpg",
              "https://example.com/collateral/logbook-back.jpg",
            ],
          },
        ],
      },
    });
    assert.equal(draftUpdate.status, 200);

    const submitDraft = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}/submit`, {
      method: "POST",
      token: officer.token,
      body: {
        note: "Ready for review",
      },
    });
    assert.equal(submitDraft.status, 200);
    assert.equal(submitDraft.data.refresh.status, "pending_review");

    const pushBack = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}/review`, {
      method: "POST",
      token: manager.token,
      body: {
        decision: "push_back",
        note: "Photo is blurry",
        flaggedFields: [
          {
            fieldPath: "profile.photo",
            reasonCode: "blurry_photo",
            comment: "Retake the live photo in better light",
          },
        ],
      },
    });
    assert.equal(pushBack.status, 200);
    assert.equal(pushBack.data.refresh.status, "pushed_back");
    assert.equal(pushBack.data.refresh.priorityStatus, "priority_correction");

    const blockedScopedEdit = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}`, {
      method: "PATCH",
      token: officer.token,
      body: {
        businessLocation: "Should Not Change",
      },
    });
    assert.equal(blockedScopedEdit.status, 403);

    const secondCaptureAt = new Date(Date.now() + 5000).toISOString();
    const correctedPhoto = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}`, {
      method: "PATCH",
      token: officer.token,
      body: {
        photo: {
          url: "https://example.com/photos/refresh-client-2.jpg",
          capturedAt: secondCaptureAt,
          gpsLatitude: -1.2842,
          gpsLongitude: 36.8157,
          gpsAccuracyMeters: 4,
        },
      },
    });
    assert.equal(correctedPhoto.status, 200);
    assert.equal(correctedPhoto.data.refresh.openFeedback.length, 0);

    const resubmit = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}/submit`, {
      method: "POST",
      token: officer.token,
      body: {
        note: "Photo retaken and corrected",
      },
    });
    assert.equal(resubmit.status, 200);
    assert.equal(resubmit.data.refresh.status, "pending_review");

    const approve = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}/review`, {
      method: "POST",
      token: manager.token,
      body: {
        decision: "approve",
        note: "Approved after correction",
      },
    });
    assert.equal(approve.status, 200);
    assert.equal(approve.data.refresh.status, "approved");

    const history = await api(baseUrl, `/api/clients/${clientId}/history`, {
      token: manager.token,
    });
    assert.equal(history.status, 200);
    assert.ok(Array.isArray(history.data.profileVersions));
    assert.ok(history.data.profileVersions.length >= 2);
    assert.equal(history.data.pendingProfileRefresh, null);
    assert.ok(Number(history.data.currentProfileVersionId) > 0);

    const versions = await api(baseUrl, `/api/clients/${clientId}/profile-versions`, {
      token: manager.token,
    });
    assert.equal(versions.status, 200);
    assert.ok(Array.isArray(versions.data.versions));
    assert.ok(versions.data.versions.length >= 2);
    const latestVersionId = Number(versions.data.currentVersionId);

    const versionDetail = await api(baseUrl, `/api/clients/${clientId}/profile-versions/${latestVersionId}`, {
      token: manager.token,
    });
    assert.equal(versionDetail.status, 200);
    assert.equal(versionDetail.data.version.snapshot.profile.photo.url, "https://example.com/photos/refresh-client-2.jpg");
    assert.equal(versionDetail.data.version.snapshot.guarantors.length, 1);
    assert.equal(versionDetail.data.version.snapshot.collaterals[0].imageUrls.length, 2);

    const activeCollaterals = await api(baseUrl, `/api/clients/${clientId}/collaterals`, {
      token: manager.token,
    });
    assert.equal(activeCollaterals.status, 200);
    assert.equal(activeCollaterals.data.length, 1);
    assert.equal(activeCollaterals.data[0].image_urls.length, 2);
  } finally {
    await stop();
  }
});

test("client profile refresh locks PII changes to admins with a mandatory reason", async () => {
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

    const officer = await createUserAndLogin({
      baseUrl,
      adminToken,
      branchId,
      role: "loan_officer",
      suffix,
      label: "pii-officer",
    });

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officer.token,
      body: {
        fullName: `Locked PII Client ${suffix}`,
        phone: "+254700987654",
        nationalId: `LOCK-${suffix}`,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createRefresh = await api(baseUrl, `/api/clients/${clientId}/profile-refreshes`, {
      method: "POST",
      token: officer.token,
      body: {
        note: "Officer-initiated refresh",
      },
    });
    assert.equal(createRefresh.status, 201);
    const refreshId = Number(createRefresh.data.refresh.id);

    const officerPiiEdit = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}`, {
      method: "PATCH",
      token: officer.token,
      body: {
        phone: "+254701111222",
      },
    });
    assert.equal(officerPiiEdit.status, 403);

    const missingReason = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        phone: "+254701111222",
        nationalId: `NEW-${suffix}`,
      },
    });
    assert.equal(missingReason.status, 400);

    const adminOverride = await api(baseUrl, `/api/client-profile-refreshes/${refreshId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        phone: "+254701111222",
        nationalId: `NEW-${suffix}`,
        piiOverrideReason: "Customer produced updated registration documents",
      },
    });
    assert.equal(adminOverride.status, 200);
    assert.equal(adminOverride.data.refresh.draftSnapshot.profile.identity.phone, "254701111222");
    assert.equal(adminOverride.data.refresh.draftSnapshot.profile.identity.nationalId, `NEW-${suffix}`);
  } finally {
    await stop();
  }
});
