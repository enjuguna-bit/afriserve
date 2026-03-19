import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";
function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

test("admin delete endpoint soft-deactivates a user without removing their record", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const suffix = uniqueSuffix();
    const email = `delete.user.${suffix}@example.com`;

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Delete User ${suffix}`,
        email,
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);
    const userId = Number(createUser.data.id);
    assert.ok(userId > 0);

    const deleteUser = await api(baseUrl, `/api/users/${userId}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(deleteUser.status, 200);
    assert.equal(deleteUser.data.message, "User deactivated");
    assert.equal(Number(deleteUser.data?.user?.is_active || 0), 0);
    assert.ok(deleteUser.data?.user?.deactivated_at);

    const fetchDeletedUser = await api(baseUrl, `/api/users/${userId}`, {
      token: adminToken,
    });
    assert.equal(fetchDeletedUser.status, 200);
    assert.equal(Number(fetchDeletedUser.data?.is_active || 0), 0);
    assert.ok(fetchDeletedUser.data?.deactivated_at);
  } finally {
    await stop();
  }
});

test("admin delete endpoint soft-deactivates users even when they have audit history", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const suffix = uniqueSuffix();
    const email = `delete.blocked.${suffix}@example.com`;
    const password = "Password@123";

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Delete Blocked ${suffix}`,
        email,
        password,
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);
    const userId = Number(createUser.data.id);
    assert.ok(userId > 0);

    const targetLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email,
        password,
      },
    });
    assert.equal(targetLogin.status, 200);

    const deleteUser = await api(baseUrl, `/api/users/${userId}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(deleteUser.status, 200);
    assert.equal(deleteUser.data.message, "User deactivated");
    assert.equal(Number(deleteUser.data?.user?.is_active || 0), 0);
    assert.ok(deleteUser.data?.user?.deactivated_at);
  } finally {
    await stop();
  }
});

test("admin can permanently delete a branch when no linked records exist", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const hierarchyTree = await api(baseUrl, "/api/hierarchy/tree", {
      token: adminToken,
    });
    assert.equal(hierarchyTree.status, 200);
    const regionId = Number(hierarchyTree.data?.regions?.[0]?.id || 0);
    assert.ok(regionId > 0);

    const suffix = uniqueSuffix();
    const branchCode = `PDEL-${suffix.slice(-8).replace(/[^A-Z0-9]/gi, "").toUpperCase()}`;

    const createBranch = await api(baseUrl, "/api/branches", {
      method: "POST",
      token: adminToken,
      body: {
        name: `Permanent Delete Branch ${suffix}`,
        locationAddress: "99 Cleanup Avenue",
        county: "Nairobi",
        town: "Nairobi",
        regionId,
        branchCode,
      },
    });
    assert.equal(createBranch.status, 201);
    const branchId = Number(createBranch.data.id);
    assert.ok(branchId > 0);

    const deleteBranch = await api(baseUrl, `/api/branches/${branchId}/permanent`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(deleteBranch.status, 200);
    assert.equal(deleteBranch.data.message, "Branch deleted permanently");

    const fetchDeletedBranch = await api(baseUrl, `/api/branches/${branchId}`, {
      token: adminToken,
    });
    assert.equal(fetchDeletedBranch.status, 404);
  } finally {
    await stop();
  }
});

test("branch permanent delete is blocked when linked records exist", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const hierarchyTree = await api(baseUrl, "/api/hierarchy/tree", {
      token: adminToken,
    });
    assert.equal(hierarchyTree.status, 200);
    const regionId = Number(hierarchyTree.data?.regions?.[0]?.id || 0);
    assert.ok(regionId > 0);

    const suffix = uniqueSuffix();
    const branchCode = `PBLK-${suffix.slice(-8).replace(/[^A-Z0-9]/gi, "").toUpperCase()}`;

    const createBranch = await api(baseUrl, "/api/branches", {
      method: "POST",
      token: adminToken,
      body: {
        name: `Permanent Delete Blocked ${suffix}`,
        locationAddress: "101 Dependency Street",
        county: "Nairobi",
        town: "Nairobi",
        regionId,
        branchCode,
      },
    });
    assert.equal(createBranch.status, 201);
    const branchId = Number(createBranch.data.id);
    assert.ok(branchId > 0);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Linked Client ${suffix}`,
        phone: `+254700${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
        branchId,
      },
    });
    assert.equal(createClient.status, 201);

    const deleteBranch = await api(baseUrl, `/api/branches/${branchId}/permanent`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(deleteBranch.status, 409);
    assert.equal(
      deleteBranch.data.message,
      "Cannot permanently delete branch with linked records. Reassign or remove linked records first.",
    );
    assert.ok(Number(deleteBranch.data?.dependencies?.clients_assigned || 0) >= 1);
  } finally {
    await stop();
  }
});
