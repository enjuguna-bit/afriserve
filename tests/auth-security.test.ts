import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  wait,
  startServer,
  api,
  loginAsAdmin,
  createHighRiskReviewerToken,
  approveLoan,
  submitAndReviewHighRiskRequest,
} from "./integration-helpers.js";

const isPostgresTestMode = String(
  process.env.TEST_DB_CLIENT || process.env.DB_CLIENT || "",
).toLowerCase() === "postgres";

test("email normalization is enforced and login is case-insensitive", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "ADMIN@AFRISERVE.LOCAL",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Case Test User",
        email: "Mixed.Case@Example.com",
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);
    assert.equal(createUser.data.email, "mixed.case@example.com");

    const loginLower = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "mixed.case@example.com",
        password: "Password@123",
      },
    });
    assert.equal(loginLower.status, 200);

    const loginUpper = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "MIXED.CASE@EXAMPLE.COM",
        password: "Password@123",
      },
    });
    assert.equal(loginUpper.status, 200);
  } finally {
    await stop();
  }
});

test("cached privileged sessions refresh authorization state before admin-only actions", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-auth-refresh-"));
  const dbPath = path.join(tempRoot, "auth-refresh.db");
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
      NODE_ENV: "test",
    },
  });

  try {
    const login = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(login.status, 200);
    const adminToken = login.data.token;

    const meBeforeRoleChange = await api(baseUrl, "/api/auth/me", {
      token: adminToken,
    });
    assert.equal(meBeforeRoleChange.status, 200);
    assert.equal(Array.isArray(meBeforeRoleChange.data.roles), true);
    assert.equal(meBeforeRoleChange.data.roles.includes("admin"), true);

    const db = new Database(dbPath);
    try {
      const adminRow = db
        .prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1")
        .get("admin@afriserve.local") as { id: number } | undefined;
      assert.ok(adminRow?.id);

      db.prepare("UPDATE users SET role = ? WHERE id = ?").run("cashier", adminRow.id);
      db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(adminRow.id);
    } finally {
      db.close();
    }

    const meAfterRoleChange = await api(baseUrl, "/api/auth/me", {
      token: adminToken,
    });
    assert.equal(meAfterRoleChange.status, 200);
    assert.deepEqual(meAfterRoleChange.data.roles, ["cashier"]);

    const createUserAfterDemotion = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Should Be Rejected",
        email: "should.be.rejected@example.com",
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUserAfterDemotion.status, 403);
  } finally {
    await stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("privileged users can authenticate and refresh across tenant-switched sessions", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const login = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: {
        "X-Tenant-ID": "tenant_b",
      },
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.role, "admin");

    const me = await api(baseUrl, "/api/auth/me", {
      token: login.data.token,
      headers: {
        "X-Tenant-ID": "tenant_b",
      },
    });
    assert.equal(me.status, 200);
    assert.equal(me.data.role, "admin");

    const refresh = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      headers: {
        "X-Tenant-ID": "tenant_b",
      },
      body: {
        token: login.data.refreshToken,
      },
    });
    assert.equal(refresh.status, 200);
    assert.equal(typeof refresh.data.token, "string");
  } finally {
    await stop();
  }
});

test("non-privileged users cannot authenticate through privileged tenant fallback", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Tenant Scoped Cashier",
        email: "tenant.scoped.cashier@example.com",
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);

    const crossTenantLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: {
        "X-Tenant-ID": "tenant_b",
      },
      body: {
        email: "tenant.scoped.cashier@example.com",
        password: "Password@123",
      },
    });
    assert.equal(crossTenantLogin.status, 401);
  } finally {
    await stop();
  }
});

test("user administration routes do not cross tenant boundaries by raw user id", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const tenantBCreateUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      headers: {
        "X-Tenant-ID": "tenant_b",
      },
      body: {
        fullName: "Tenant B Executive",
        email: "tenantb.executive@example.com",
        password: "Password@123",
        role: "ceo",
      },
    });
    assert.equal(tenantBCreateUser.status, 201);
    const tenantBUserId = Number(tenantBCreateUser.data.id);
    assert.ok(tenantBUserId > 0);

    const crossTenantRead = await api(baseUrl, `/api/users/${tenantBUserId}`, {
      token: adminToken,
    });
    assert.equal(crossTenantRead.status, 404);

    const crossTenantDeactivate = await api(baseUrl, `/api/users/${tenantBUserId}/deactivate`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(crossTenantDeactivate.status, 404);

    const tenantBRead = await api(baseUrl, `/api/users/${tenantBUserId}`, {
      token: adminToken,
      headers: {
        "X-Tenant-ID": "tenant_b",
      },
    });
    assert.equal(tenantBRead.status, 200);
    assert.equal(Number(tenantBRead.data?.is_active || 0), 1);
  } finally {
    await stop();
  }
});

test("default admin seeding can be disabled for empty databases", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-no-default-admin-"));
  const dbPath = path.join(tempRoot, "no-default-admin.db");
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
      NODE_ENV: "test",
      SEED_DEFAULT_ADMIN_ON_EMPTY_DB: "false",
    },
  });

  try {
    const login = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(login.status, 401);

    const db = new Database(dbPath);
    try {
      const users = db
        .prepare("SELECT COUNT(*) AS total FROM users")
        .get() as { total: number };
      assert.equal(Number(users.total || 0), 0);
    } finally {
      db.close();
    }
  } finally {
    await stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("changing password revokes existing token sessions", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const login = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(login.status, 200);
    const oldToken = login.data.token;

    const changePassword = await api(baseUrl, "/api/auth/change-password", {
      method: "POST",
      token: oldToken,
      body: {
        currentPassword: "Admin@123",
        newPassword: "AdminSecure@456",
      },
    });
    assert.equal(changePassword.status, 200);

    const meWithOldToken = await api(baseUrl, "/api/auth/me", {
      token: oldToken,
    });
    assert.equal(meWithOldToken.status, 401);

    const loginWithNewPassword = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "AdminSecure@456",
      },
    });
    assert.equal(loginWithNewPassword.status, 200);
  } finally {
    await stop();
  }
});

test("self-service logout revokes existing token session", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const login = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(login.status, 200);
    const token = login.data.token;

    const logout = await api(baseUrl, "/api/auth/logout", {
      method: "POST",
      token,
    });
    assert.equal(logout.status, 200);

    const meAfterLogout = await api(baseUrl, "/api/auth/me", {
      token,
    });
    assert.equal(meAfterLogout.status, 401);

    const loginAgain = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(loginAgain.status, 200);
  } finally {
    await stop();
  }
});

test("deactivating a user immediately invalidates existing token", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Deactivation Target",
        email: "deactivation.target@example.com",
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);
    const targetUserId = createUser.data.id;

    const targetLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "deactivation.target@example.com",
        password: "Password@123",
      },
    });
    assert.equal(targetLogin.status, 200);
    const targetToken = targetLogin.data.token;

    const deactivate = await api(baseUrl, `/api/users/${targetUserId}/deactivate`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(deactivate.status, 200);

    const meAfterDeactivate = await api(baseUrl, "/api/auth/me", {
      token: targetToken,
    });
    assert.equal(meAfterDeactivate.status, 401);
  } finally {
    await stop();
  }
});

test("admin can reset a user's password directly and invalidate existing sessions", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Password Reset Target",
        email: "password.reset.target@example.com",
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);
    const targetUserId = createUser.data.id;

    const targetLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "password.reset.target@example.com",
        password: "Password@123",
      },
    });
    assert.equal(targetLogin.status, 200);
    const targetToken = targetLogin.data.token;

    const resetPassword = await api(baseUrl, `/api/users/${targetUserId}/reset-password`, {
      method: "POST",
      token: adminToken,
      body: {
        newPassword: "ResetPass@456",
      },
    });
    assert.equal(resetPassword.status, 200);

    const meWithOldToken = await api(baseUrl, "/api/auth/me", {
      token: targetToken,
    });
    assert.equal(meWithOldToken.status, 401);

    const oldPasswordLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "password.reset.target@example.com",
        password: "Password@123",
      },
    });
    assert.equal(oldPasswordLogin.status, 401);

    const newPasswordLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "password.reset.target@example.com",
        password: "ResetPass@456",
      },
    });
    assert.equal(newPasswordLogin.status, 200);
  } finally {
    await stop();
  }
});

test("password reset requests store tenant-scoped reset rows for non-default tenants", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const tenantEmail = `tenant.reset.${Date.now()}@example.com`;

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const tenantBUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      headers: {
        "X-Tenant-ID": "tenant_b",
      },
      body: {
        fullName: "Tenant B Reset User",
        email: tenantEmail,
        password: "Password@123",
        role: "ceo",
      },
    });
    assert.equal(tenantBUser.status, 201);
    const tenantBUserId = Number(tenantBUser.data.id);
    assert.ok(tenantBUserId > 0);

    const resetRequest = await api(baseUrl, "/api/auth/reset-password/request", {
      method: "POST",
      headers: {
        "X-Tenant-ID": "tenant_b",
      },
      body: {
        email: tenantEmail,
      },
    });
    assert.equal(resetRequest.status, 200);

    assert.ok(dbFilePath);
    const database = new Database(dbFilePath, { readonly: true });
    try {
      const latestReset = database.prepare(`
        SELECT tenant_id, user_id
        FROM password_resets
        ORDER BY id DESC
        LIMIT 1
      `).get() as { tenant_id: string; user_id: number } | undefined;

      assert.ok(latestReset);
      assert.equal(String(latestReset?.tenant_id || ""), "tenant_b");
      assert.equal(Number(latestReset?.user_id || 0), tenantBUserId);
    } finally {
      database.close();
    }
  } finally {
    await stop();
  }
});

test("admin can allocate roles and force re-authentication", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Role Allocation Target",
        email: "roles.target@example.com",
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);
    const targetUserId = createUser.data.id;

    const targetLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "roles.target@example.com",
        password: "Password@123",
      },
    });
    assert.equal(targetLogin.status, 200);
    const oldTargetToken = targetLogin.data.token;

    const updateRole = await api(baseUrl, `/api/users/${targetUserId}/role`, {
      method: "PATCH",
      token: adminToken,
      body: {
        role: "loan_officer",
      },
    });
    assert.equal(updateRole.status, 200);
    assert.equal(updateRole.data.user.role, "loan_officer");

    const meWithOldToken = await api(baseUrl, "/api/auth/me", {
      token: oldTargetToken,
    });
    assert.equal(meWithOldToken.status, 401);

    const targetLoginAfterRoleChange = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "roles.target@example.com",
        password: "Password@123",
      },
    });
    assert.equal(targetLoginAfterRoleChange.status, 200);
    assert.equal(targetLoginAfterRoleChange.data.user.role, "loan_officer");
    const postRoleToken = targetLoginAfterRoleChange.data.token;

    const revokeSessions = await api(baseUrl, `/api/users/${targetUserId}/revoke-sessions`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(revokeSessions.status, 200);

    const meWithRevokedToken = await api(baseUrl, "/api/auth/me", {
      token: postRoleToken,
    });
    assert.equal(meWithRevokedToken.status, 401);

    const rolesCatalog = await api(baseUrl, "/api/users/roles", {
      token: adminToken,
    });
    assert.equal(rolesCatalog.status, 200);
    const roleKeys = rolesCatalog.data.roles.map((roleItem) => roleItem.key);
    assert.deepEqual(roleKeys, [
      "admin",
      "ceo",
      "finance",
      "investor",
      "partner",
      "operations_manager",
      "it",
      "area_manager",
      "loan_officer",
      "cashier",
    ]);
    const loanOfficerRole = rolesCatalog.data.roles.find((roleItem) => roleItem.key === "loan_officer");
    assert.ok(loanOfficerRole.assignedUsers >= 1);
    assert.ok(Array.isArray(loanOfficerRole.capabilities));
  } finally {
    await stop();
  }
});

test("user read endpoints enforce hierarchy scope for scoped managers with user.manage permission", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    const seededAdminUserId = Number(adminLogin.data.user.id);

    const branchesResult = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branchesResult.status, 200);
    const branches = branchesResult.data.data;
    assert.ok(Array.isArray(branches) && branches.length >= 2, "Expected at least two seeded branches");

    const inScopeBranchId = Number(branches[0].id);
    const outOfScopeBranchId = Number(branches.find((branch) => Number(branch.id) !== inScopeBranchId)?.id || branches[1].id);

    const createInScopeOfficer = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Scoped In-Scope Officer",
        email: "scoped.inscope.officer@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId: inScopeBranchId,
      },
    });
    assert.equal(createInScopeOfficer.status, 201);
    const inScopeOfficerId = Number(createInScopeOfficer.data.id);

    const createOutOfScopeOfficer = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Scoped Out-Of-Scope Officer",
        email: "scoped.outscope.officer@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId: outOfScopeBranchId,
      },
    });
    assert.equal(createOutOfScopeOfficer.status, 201);
    const outOfScopeOfficerId = Number(createOutOfScopeOfficer.data.id);

    const createScopedManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Scoped User Manager",
        email: "scoped.user.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId: inScopeBranchId,
      },
    });
    assert.equal(createScopedManager.status, 201);
    const scopedManagerId = Number(createScopedManager.data.id);

    const assignAdminSecondaryRole = await api(baseUrl, `/api/users/${scopedManagerId}/role`, {
      method: "PATCH",
      token: adminToken,
      body: {
        role: "operations_manager",
        roles: ["operations_manager", "admin"],
        branchId: inScopeBranchId,
      },
    });
    assert.equal(assignAdminSecondaryRole.status, 200);
    assert.deepEqual(
      [...(assignAdminSecondaryRole.data.user.roles || [])].sort(),
      ["admin", "operations_manager"].sort(),
    );

    const managerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "scoped.user.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(managerLogin.status, 200);
    const managerToken = managerLogin.data.token;

    const scopedUsersList = await api(baseUrl, "/api/users?limit=200&sortBy=id&sortOrder=asc", {
      token: managerToken,
    });
    assert.equal(scopedUsersList.status, 200);
    const visibleUserIds = new Set((scopedUsersList.data.data || []).map((user) => Number(user.id)));
    assert.ok(visibleUserIds.has(scopedManagerId));
    assert.ok(visibleUserIds.has(inScopeOfficerId));
    assert.ok(!visibleUserIds.has(outOfScopeOfficerId));
    assert.ok(!visibleUserIds.has(seededAdminUserId));

    const inScopeUserDetail = await api(baseUrl, `/api/users/${inScopeOfficerId}`, {
      token: managerToken,
    });
    assert.equal(inScopeUserDetail.status, 200);
    assert.equal(Number(inScopeUserDetail.data.id), inScopeOfficerId);

    const outOfScopeUserDetail = await api(baseUrl, `/api/users/${outOfScopeOfficerId}`, {
      token: managerToken,
    });
    assert.equal(outOfScopeUserDetail.status, 404);

    const scopedSummary = await api(baseUrl, "/api/users/summary", {
      token: managerToken,
    });
    assert.equal(scopedSummary.status, 200);
    assert.equal(Number(scopedSummary.data.totals.totalUsers || 0), Number(scopedUsersList.data.paging.total || 0));
    const scopedLoanOfficerSummary = (scopedSummary.data.byRole || []).find((row) => row.role === "loan_officer");
    assert.equal(Number(scopedLoanOfficerSummary?.totalUsers || 0), 1);

    const scopedRolesCatalog = await api(baseUrl, "/api/users/roles", {
      token: managerToken,
    });
    assert.equal(scopedRolesCatalog.status, 200);
    const scopedLoanOfficerRole = (scopedRolesCatalog.data.roles || []).find((row) => row.key === "loan_officer");
    assert.equal(Number(scopedLoanOfficerRole?.assignedUsers || 0), 1);
  } finally {
    await stop();
  }
});

test("admin can update user profile and retrieve admin user summaries", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Profile Target",
        email: "profile.target@example.com",
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);
    const targetUserId = createUser.data.id;

    const summaryBefore = await api(baseUrl, "/api/users/summary", {
      token: adminToken,
    });
    assert.equal(summaryBefore.status, 200);
    assert.equal(summaryBefore.data.totals.totalUsers, 2);

    const updateProfile = await api(baseUrl, `/api/users/${targetUserId}/profile`, {
      method: "PATCH",
      token: adminToken,
      body: {
        fullName: "Profile Updated",
        email: "profile.updated@example.com",
        isActive: false,
      },
    });
    assert.equal(updateProfile.status, 200);
    assert.equal(updateProfile.data.user.full_name, "Profile Updated");
    assert.equal(updateProfile.data.user.email, "profile.updated@example.com");
    assert.equal(updateProfile.data.user.is_active, 0);

    const getUpdatedUser = await api(baseUrl, `/api/users/${targetUserId}`, {
      token: adminToken,
    });
    assert.equal(getUpdatedUser.status, 200);
    assert.equal(getUpdatedUser.data.roleDetails.key, "cashier");

    const oldEmailLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "profile.target@example.com",
        password: "Password@123",
      },
    });
    assert.equal(oldEmailLogin.status, 401);

    const newEmailWhileInactive = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "profile.updated@example.com",
        password: "Password@123",
      },
    });
    assert.equal(newEmailWhileInactive.status, 401);

    const reactivate = await api(baseUrl, `/api/users/${targetUserId}/activate`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(reactivate.status, 200);

    const newEmailAfterActivate = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "profile.updated@example.com",
        password: "Password@123",
      },
    });
    assert.equal(newEmailAfterActivate.status, 200);
  } finally {
    await stop();
  }
});

test("new role policies enforce officer origination while preserving manager approval and finance flows", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const branchesResult = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branchesResult.status, 200);
    assert.ok(Array.isArray(branchesResult.data.data));
    assert.ok(branchesResult.data.data.length > 0, "Expected seeded branches to include at least one entry");
    const sharedBranchId = Number(branchesResult.data.data[0].id);
    assert.ok(Number.isInteger(sharedBranchId) && sharedBranchId > 0);

    const provisionedUsers = [
      {
        roleInput: "operations manager",
        expectedRole: "operations_manager",
        email: "branch.manager@example.com",
        branchId: sharedBranchId,
      },
      { roleInput: "FINANCE", expectedRole: "finance", email: "finance.user@example.com" },
      { roleInput: "CEO", expectedRole: "ceo", email: "ceo.user@example.com" },
      { roleInput: "Area Managers", expectedRole: "area_manager", email: "area.manager@example.com" },
      { roleInput: "IT", expectedRole: "it", email: "it.user@example.com" },
      { roleInput: "Cashier", expectedRole: "cashier", email: "cashier.user@example.com" },
    ];

    const roleTokens = {};
    for (const user of provisionedUsers) {
      const createUser = await api(baseUrl, "/api/users", {
        method: "POST",
        token: adminToken,
        body: {
          fullName: `${user.expectedRole} test`,
          email: user.email,
          password: "Password@123",
          role: user.roleInput,
          ...(Number.isInteger(user.branchId) ? { branchId: user.branchId } : {}),
        },
      });
      assert.equal(createUser.status, 201);
      assert.equal(createUser.data.role, user.expectedRole);

      const login = await api(baseUrl, "/api/auth/login", {
        method: "POST",
        body: {
          email: user.email,
          password: "Password@123",
        },
      });
      assert.equal(login.status, 200);
      roleTokens[user.expectedRole] = login.data.token;
    }

    const createOfficer = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Origination Officer",
        email: "origination.officer@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId: sharedBranchId,
      },
    });
    assert.equal(createOfficer.status, 201);

    const officerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "origination.officer@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerLogin.status, 200);
    const officerToken = officerLogin.data.token;

    const createClientByBranchManager = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: roleTokens.operations_manager,
      body: {
        fullName: "Branch Managed Client",
        phone: "+254700000123",
      },
    });
    assert.equal(createClientByBranchManager.status, 403);

    const createLoanByBranchManager = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: roleTokens.operations_manager,
      body: {
        clientId: 999999,
        principal: 1000,
        termWeeks: 12,
      },
    });
    assert.equal(createLoanByBranchManager.status, 403);

    const createClientByOfficer = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerToken,
      body: {
        fullName: "Officer Originated Client",
        phone: "+254700000124",
      },
    });
    assert.equal(createClientByOfficer.status, 201);
    const clientId = Number(createClientByOfficer.data.id);
    assert.ok(clientId > 0);

    const createLoanByOfficer = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: officerToken,
      body: {
        clientId,
        principal: 1000,
        termWeeks: 12,
      },
    });
    assert.equal(createLoanByOfficer.status, 201);
    const loanId = Number(createLoanByOfficer.data.id);
    assert.ok(loanId > 0);

    const managerPendingQueue = await api(baseUrl, "/api/loans/pending-approval?limit=10&sortBy=loanId&sortOrder=asc", {
      token: roleTokens.operations_manager,
    });
    assert.equal(managerPendingQueue.status, 200);
    assert.ok(Array.isArray(managerPendingQueue.data.data));
    assert.ok(
      managerPendingQueue.data.data.some((row) => Number(row.loan_id) === loanId),
      "Expected officer-originated loan to appear in branch manager approval queue",
    );

    const approveBranchManagerLoan = await approveLoan(baseUrl, loanId, roleTokens.operations_manager, {
      notes: "Approve role-policy workflow loan",
    });
    assert.equal(approveBranchManagerLoan.status, 200);

    const createRepaymentByFinance = await api(baseUrl, `/api/loans/${loanId}/repayments`, {
      method: "POST",
      token: roleTokens.finance,
      body: {
        amount: 100,
        note: "Finance desk repayment",
      },
    });
    assert.equal(createRepaymentByFinance.status, 201);

    const viewOverdueByCeo = await api(baseUrl, "/api/collections/overdue?limit=5", {
      token: roleTokens.ceo,
    });
    assert.equal(viewOverdueByCeo.status, 200);

    const viewCollectionsSummaryByIt = await api(baseUrl, "/api/reports/collections-summary", {
      token: roleTokens.it,
    });
    assert.equal(viewCollectionsSummaryByIt.status, 200);

    const viewPortfolioByIt = await api(baseUrl, "/api/reports/portfolio", {
      token: roleTokens.it,
    });
    assert.equal(viewPortfolioByIt.status, 200);

    const viewPortfolioByCashier = await api(baseUrl, "/api/reports/portfolio", {
      token: roleTokens.cashier,
    });
    assert.equal(viewPortfolioByCashier.status, 200);

    const blockedActionByCeo = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: roleTokens.ceo,
      body: {
        loanId,
        actionType: "note",
        actionNote: "Executive-only note",
      },
    });
    assert.equal(blockedActionByCeo.status, 403);

    const blockedActionByFinance = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: roleTokens.finance,
      body: {
        loanId,
        actionType: "note",
        actionNote: "Finance-only note",
      },
    });
    assert.equal(blockedActionByFinance.status, 403);

    const createActionByBranchManager = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: roleTokens.operations_manager,
      body: {
        loanId,
        actionType: "note",
        actionNote: "Branch follow-up logged",
      },
    });
    assert.equal(createActionByBranchManager.status, 201);
    assert.equal(createActionByBranchManager.data.loan_id, loanId);
  } finally {
    await stop();
  }
});

test("collection action updates enforce role, scope, and status transitions", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const branchesResult = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branchesResult.status, 200);
    const branches = branchesResult.data.data;
    assert.ok(Array.isArray(branches));
    assert.ok(branches.length >= 2, "Expected seeded branches to include at least two entries");

    const branchInScopeId = Number(branches[0].id);
    const branchOutOfScopeId = Number(branches.find((branch) => Number(branch.id) !== branchInScopeId)?.id || branches[1].id);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Collections Update Client",
        phone: "+254700001001",
        branchId: branchInScopeId,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 2000,
        termWeeks: 8,
        branchId: branchInScopeId,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const nextWeekIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const createAction = await api(baseUrl, "/api/collections/actions", {
      method: "POST",
      token: adminToken,
      body: {
        loanId,
        actionType: "promise_to_pay",
        actionNote: "Customer promised to pay next week",
        promiseDate: tomorrowIso,
        nextFollowUpDate: nextWeekIso,
        actionStatus: "open",
      },
    });
    assert.equal(createAction.status, 201);
    const actionId = Number(createAction.data.id);

    const createOutOfScopeManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Out Of Scope Manager",
        email: "collections.outofscope.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId: branchOutOfScopeId,
      },
    });
    assert.equal(createOutOfScopeManager.status, 201);

    const outOfScopeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "collections.outofscope.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(outOfScopeLogin.status, 200);
    const outOfScopeToken = outOfScopeLogin.data.token;

    const outOfScopePatch = await api(baseUrl, `/api/collections/actions/${actionId}`, {
      method: "PATCH",
      token: outOfScopeToken,
      body: {
        actionStatus: "completed",
      },
    });
    assert.equal(outOfScopePatch.status, 403);

    const createInScopeManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "In Scope Manager",
        email: "collections.inscope.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId: branchInScopeId,
      },
    });
    assert.equal(createInScopeManager.status, 201);

    const inScopeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "collections.inscope.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(inScopeLogin.status, 200);
    const inScopeToken = inScopeLogin.data.token;

    const emptyPatch = await api(baseUrl, `/api/collections/actions/${actionId}`, {
      method: "PATCH",
      token: inScopeToken,
      body: {},
    });
    assert.equal(emptyPatch.status, 400);

    const markCompleted = await api(baseUrl, `/api/collections/actions/${actionId}`, {
      method: "PATCH",
      token: inScopeToken,
      body: {
        actionStatus: "completed",
        actionNote: "Promise honored and loan brought current",
        nextFollowUpDate: null,
      },
    });
    assert.equal(markCompleted.status, 200);
    assert.equal(markCompleted.data.action.action_status, "completed");
    assert.equal(markCompleted.data.action.next_follow_up_date, null);

    const completedActions = await api(baseUrl, `/api/collections/actions?loanId=${loanId}&status=completed`, {
      token: inScopeToken,
    });
    assert.equal(completedActions.status, 200);
    assert.ok(
      completedActions.data.data.some((row) => Number(row.id) === actionId && row.action_status === "completed"),
      "Expected completed actions filter to include the patched record",
    );

    const createCeo = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Collections CEO",
        email: "collections.ceo@example.com",
        password: "Password@123",
        role: "ceo",
      },
    });
    assert.equal(createCeo.status, 201);

    const ceoLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "collections.ceo@example.com",
        password: "Password@123",
      },
    });
    assert.equal(ceoLogin.status, 200);

    const ceoPatch = await api(baseUrl, `/api/collections/actions/${actionId}`, {
      method: "PATCH",
      token: ceoLogin.data.token,
      body: {
        actionStatus: "cancelled",
      },
    });
    assert.equal(ceoPatch.status, 403);
  } finally {
    await stop();
  }
});

test("client updates enforce role and scope while allowing profile corrections", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const branchesResult = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branchesResult.status, 200);
    const branches = branchesResult.data.data;
    assert.ok(Array.isArray(branches) && branches.length >= 2);
    const branchInScopeId = Number(branches[0].id);
    const branchOutOfScopeId = Number(branches.find((branch) => Number(branch.id) !== branchInScopeId)?.id || branches[1].id);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Client Before Update",
        phone: "+254700001111",
        nationalId: "ID-CLIENT-001",
        branchId: branchInScopeId,
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = Number(createClient.data.id);
    assert.equal(Number(createClient.data.is_active || 0), 1);
    assert.equal(typeof createClient.data.updated_at, "string");
    const originalUpdatedAt = createClient.data.updated_at;

    const createDuplicateNationalId = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Duplicate National ID Client",
        phone: "+254700001112",
        nationalId: "ID-CLIENT-001",
        branchId: branchInScopeId,
      },
    });
    assert.equal(createDuplicateNationalId.status, 409);

    const createInScopeManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Client Scope Manager",
        email: "client.scope.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId: branchInScopeId,
      },
    });
    assert.equal(createInScopeManager.status, 201);

    const inScopeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "client.scope.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(inScopeLogin.status, 200);
    const inScopeToken = inScopeLogin.data.token;

    const emptyPatch = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: inScopeToken,
      body: {},
    });
    assert.equal(emptyPatch.status, 403);

    await wait(1100);

    const blockedManagerUpdate = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: inScopeToken,
      body: {
        fullName: "Client After Update",
        phone: null,
        nationalId: "ID-CLIENT-002",
        isActive: false,
      },
    });
    assert.equal(blockedManagerUpdate.status, 403);

    const missingPiiReason = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        phone: null,
        nationalId: "ID-CLIENT-002",
      },
    });
    assert.equal(missingPiiReason.status, 400);

    const updateClient = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        fullName: "Client After Update",
        phone: null,
        nationalId: "ID-CLIENT-002",
        isActive: false,
        piiOverrideReason: "Customer presented new identity details during audited admin correction",
      },
    });
    assert.equal(updateClient.status, 200);
    assert.equal(updateClient.data.client.full_name, "Client After Update");
    assert.equal(updateClient.data.client.phone, null);
    assert.equal(updateClient.data.client.national_id, "ID-CLIENT-002");
    assert.equal(Number(updateClient.data.client.is_active || 0), 0);
    assert.equal(typeof updateClient.data.client.updated_at, "string");
    assert.notEqual(updateClient.data.client.updated_at, originalUpdatedAt);

    const blockedLoanForInactiveClient = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1000,
        termWeeks: 12,
        branchId: branchInScopeId,
      },
    });
    assert.equal(blockedLoanForInactiveClient.status, 400);

    const reactivateClient = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        isActive: true,
      },
    });
    assert.equal(reactivateClient.status, 200);
    assert.equal(Number(reactivateClient.data.client.is_active || 0), 1);

    const loanAfterReactivation = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId,
        principal: 1000,
        termWeeks: 12,
        branchId: branchInScopeId,
      },
    });
    assert.equal(loanAfterReactivation.status, 201);

    const noOpPatch = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        fullName: "Client After Update",
      },
    });
    assert.equal(noOpPatch.status, 200);
    assert.equal(noOpPatch.data.message, "No client changes were applied");

    const readUpdatedClient = await api(baseUrl, `/api/clients/${clientId}`, {
      token: adminToken,
    });
    assert.equal(readUpdatedClient.status, 200);
    assert.equal(readUpdatedClient.data.full_name, "Client After Update");
    assert.equal(readUpdatedClient.data.phone, null);
    assert.equal(readUpdatedClient.data.national_id, "ID-CLIENT-002");
    assert.equal(Number(readUpdatedClient.data.is_active || 0), 1);

    const createSecondClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Second National ID Client",
        phone: "+254700001113",
        nationalId: "ID-CLIENT-003",
        branchId: branchInScopeId,
      },
    });
    assert.equal(createSecondClient.status, 201);
    const secondClientId = Number(createSecondClient.data.id);

    const duplicateNationalIdOnUpdate = await api(baseUrl, `/api/clients/${secondClientId}`, {
      method: "PATCH",
      token: adminToken,
      body: {
        nationalId: "ID-CLIENT-002",
        piiOverrideReason: "Attempting duplicate override to verify uniqueness guard",
      },
    });
    assert.equal(duplicateNationalIdOnUpdate.status, 409);

    const createOutOfScopeManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Out Of Scope Client Manager",
        email: "client.outofscope.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId: branchOutOfScopeId,
      },
    });
    assert.equal(createOutOfScopeManager.status, 201);

    const outOfScopeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "client.outofscope.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(outOfScopeLogin.status, 200);
    const outOfScopeToken = outOfScopeLogin.data.token;

    const outOfScopeUpdate = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: outOfScopeToken,
      body: {
        fullName: "Should Be Rejected",
      },
    });
    assert.equal(outOfScopeUpdate.status, 403);

    const createFinanceUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Finance Client Update Blocked",
        email: "finance.client.update.blocked@example.com",
        password: "Password@123",
        role: "finance",
      },
    });
    assert.equal(createFinanceUser.status, 201);

    const financeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "finance.client.update.blocked@example.com",
        password: "Password@123",
      },
    });
    assert.equal(financeLogin.status, 200);

    const financeUpdateAttempt = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: financeLogin.data.token,
      body: {
        fullName: "Finance Should Not Update",
      },
    });
    assert.equal(financeUpdateAttempt.status, 403);
  } finally {
    await stop();
  }
});

test("loan expected total is pro-rated by termWeeks", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createShortTermClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Short Term Client",
        phone: "+254700001201",
      },
    });
    assert.equal(createShortTermClient.status, 201);

    const createLongTermClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Long Term Client",
        phone: "+254700001202",
      },
    });
    assert.equal(createLongTermClient.status, 201);

    const shortTermWeeks = 4;
    const longTermWeeks = 20;
    const principal = 1000;
    const annualInterestRate = 20;
    const expectedTotalFor = (termWeeks) => Number(
      (
        principal
        + (principal * (annualInterestRate / 100) * (termWeeks / 52))
      ).toFixed(2),
    );

    const createShortTermLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createShortTermClient.data.id),
        principal,
        termWeeks: shortTermWeeks,
      },
    });
    assert.equal(createShortTermLoan.status, 201);
    assert.equal(createShortTermLoan.data.expected_total, expectedTotalFor(shortTermWeeks));

    const createLongTermLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createLongTermClient.data.id),
        principal,
        termWeeks: longTermWeeks,
      },
    });
    assert.equal(createLongTermLoan.status, 201);
    assert.equal(createLongTermLoan.data.expected_total, expectedTotalFor(longTermWeeks));
    assert.ok(
      Number(createLongTermLoan.data.expected_total) > Number(createShortTermLoan.data.expected_total),
      "Expected longer term loan to have higher interest-adjusted total",
    );
  } finally {
    await stop();
  }
});

test("loan lifecycle supports restructured and written-off statuses", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    const checkerToken = await createHighRiskReviewerToken(baseUrl, adminToken);

    const createRestructureClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Restructure Lifecycle Client",
        phone: "+254700001301",
      },
    });
    assert.equal(createRestructureClient.status, 201);

    const createWriteOffClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Write Off Lifecycle Client",
        phone: "+254700001302",
      },
    });
    assert.equal(createWriteOffClient.status, 201);

    const restructuredLoanCreate = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createRestructureClient.data.id),
        principal: 1500,
        termWeeks: 12,
      },
    });
    assert.equal(restructuredLoanCreate.status, 201);
    const restructuredLoanId = Number(restructuredLoanCreate.data.id);

    const approveRestructuredLoan = await approveLoan(baseUrl, restructuredLoanId, adminToken, {
      notes: "Approve lifecycle loan before restructure",
    });
    assert.equal(approveRestructuredLoan.status, 200);

    const writtenOffLoanCreate = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createWriteOffClient.data.id),
        principal: 1800,
        termWeeks: 16,
      },
    });
    assert.equal(writtenOffLoanCreate.status, 201);
    const writtenOffLoanId = Number(writtenOffLoanCreate.data.id);

    const approveWrittenOffLoan = await approveLoan(baseUrl, writtenOffLoanId, adminToken, {
      notes: "Approve lifecycle loan before write-off",
    });
    assert.equal(approveWrittenOffLoan.status, 200);

    const restructureFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId: restructuredLoanId,
      action: "restructure",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        newTermWeeks: 8,
        note: "Restructured due to client cashflow changes",
      },
      reviewNote: "Approve lifecycle restructure request",
    });
    assert.equal(restructureFlow.request.status, 200);
    assert.ok(Number(restructureFlow.approvalRequest?.id || 0) > 0);
    assert.equal(restructureFlow.review?.status, 200);
    assert.equal(restructureFlow.review?.data?.loan?.status, "restructured");

    const repaymentOnRestructuredLoan = await api(baseUrl, `/api/loans/${restructuredLoanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 100,
        note: "Repayment after restructure",
      },
    });
    assert.equal(repaymentOnRestructuredLoan.status, 201);
    assert.equal(repaymentOnRestructuredLoan.data.loan.status, "restructured");

    const restructuredLoanFilter = await api(baseUrl, "/api/loans?status=restructured", {
      token: adminToken,
    });
    assert.equal(restructuredLoanFilter.status, 200);
    assert.ok(
      restructuredLoanFilter.data.data.some((loan) => Number(loan.id) === restructuredLoanId),
      "Expected restructured status filter to include restructured loan",
    );

    const writeOffFlow = await submitAndReviewHighRiskRequest(baseUrl, {
      loanId: writtenOffLoanId,
      action: "write-off",
      requestToken: adminToken,
      reviewToken: checkerToken,
      requestBody: {
        note: "Loan moved to bad debt portfolio",
      },
      reviewNote: "Approve lifecycle write-off request",
    });
    assert.equal(writeOffFlow.request.status, 200);
    assert.ok(Number(writeOffFlow.approvalRequest?.id || 0) > 0);
    assert.equal(writeOffFlow.review?.status, 200);
    assert.equal(writeOffFlow.review?.data?.loan?.status, "written_off");

    const writtenOffLoanFilter = await api(baseUrl, "/api/loans?status=written_off", {
      token: adminToken,
    });
    assert.equal(writtenOffLoanFilter.status, 200);
    assert.ok(
      writtenOffLoanFilter.data.data.some((loan) => Number(loan.id) === writtenOffLoanId),
      "Expected written_off status filter to include written-off loan",
    );

    const repaymentOnWrittenOffLoan = await api(baseUrl, `/api/loans/${writtenOffLoanId}/repayments`, {
      method: "POST",
      token: adminToken,
      body: {
        amount: 50,
        note: "Repayment should be blocked",
      },
    });
    assert.equal(repaymentOnWrittenOffLoan.status, 400);

    const restructureWrittenOffLoan = await api(baseUrl, `/api/loans/${writtenOffLoanId}/restructure`, {
      method: "POST",
      token: adminToken,
      body: {
        newTermWeeks: 8,
        note: "Should not be allowed",
      },
    });
    assert.equal(restructureWrittenOffLoan.status, 409);

    const portfolio = await api(baseUrl, "/api/reports/portfolio", {
      token: adminToken,
    });
    assert.equal(portfolio.status, 200);
    assert.ok(Number(portfolio.data.restructured_loans || 0) >= 1);
    assert.ok(Number(portfolio.data.written_off_loans || 0) >= 1);
    assert.ok(Number(portfolio.data.written_off_balance || 0) > 0);
  } finally {
    await stop();
  }
});

test("overdue installment status is synchronized without schedule requests", { skip: isPostgresTestMode }, async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-overdue-sync-"));
  const dbPath = path.join(tempDir, "integration.db");
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
      OVERDUE_SYNC_INTERVAL_MS: "250",
    },
  });

  let db;
  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Overdue Sync Client",
        phone: "+254700001401",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1200,
        termWeeks: 4,
      },
    });
    assert.equal(createLoan.status, 201);
    const loanId = Number(createLoan.data.id);

    const approveOverdueLoan = await approveLoan(baseUrl, loanId, adminToken, {
      notes: "Approve overdue sync loan",
    });
    assert.equal(approveOverdueLoan.status, 200);

    db = new Database(dbPath);
    db.pragma("busy_timeout = 5000");
    db.prepare(
      `
        UPDATE loan_installments
        SET due_date = datetime('now', '-3 days'),
            status = 'pending',
            amount_paid = 0,
            paid_at = NULL
        WHERE loan_id = ?
      `,
    ).run(loanId);

    let overdueCount = 0;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      overdueCount = Number(
        db.prepare("SELECT COUNT(*) AS total FROM loan_installments WHERE loan_id = ? AND status = 'overdue'")
          .get(loanId)?.total || 0,
      );
      if (overdueCount > 0) {
        break;
      }
      await wait(100);
    }

    assert.ok(
      overdueCount > 0,
      "Expected background sync to mark overdue installments without visiting loan schedule endpoint",
    );
  } finally {
    if (db) {
      db.close();
    }
    await stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("client read endpoints enforce explicit client-view roles including finance", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "RBAC Client Visibility",
        phone: "+254700000999",
      },
    });
    assert.equal(createClient.status, 201);
    const clientId = createClient.data.id;

    const createFinanceUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Finance With Client View",
        email: "finance.noclientview@example.com",
        password: "Password@123",
        role: "finance",
      },
    });
    assert.equal(createFinanceUser.status, 201);

    const financeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "finance.noclientview@example.com",
        password: "Password@123",
      },
    });
    assert.equal(financeLogin.status, 200);
    const financeToken = financeLogin.data.token;

    const financeClientList = await api(baseUrl, "/api/clients", {
      token: financeToken,
    });
    assert.equal(financeClientList.status, 200);

    const financeClientById = await api(baseUrl, `/api/clients/${clientId}`, {
      token: financeToken,
    });
    assert.equal(financeClientById.status, 200);

    const createCeoUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "CEO With Client View",
        email: "ceo.clientview@example.com",
        password: "Password@123",
        role: "ceo",
      },
    });
    assert.equal(createCeoUser.status, 201);

    const ceoLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "ceo.clientview@example.com",
        password: "Password@123",
      },
    });
    assert.equal(ceoLogin.status, 200);

    const ceoClientList = await api(baseUrl, "/api/clients", {
      token: ceoLogin.data.token,
    });
    assert.equal(ceoClientList.status, 200);
  } finally {
    await stop();
  }
});

test("loan officers can only view and edit their own clients in the same branch", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const branchesResult = await api(baseUrl, "/api/branches?limit=1&offset=0&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branchesResult.status, 200);
    assert.ok(Array.isArray(branchesResult.data.data));
    assert.ok(branchesResult.data.data.length > 0);
    const sharedBranchId = Number(branchesResult.data.data[0].id);
    const sharedBranchName = String(branchesResult.data.data[0].name || "");
    assert.ok(Number.isInteger(sharedBranchId) && sharedBranchId > 0);
    assert.ok(sharedBranchName.length > 0);

    const createOfficerOne = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Officer One",
        email: "branch.officer.one@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId: sharedBranchId,
      },
    });
    assert.equal(createOfficerOne.status, 201);
    const officerOneUserId = Number(createOfficerOne.data?.id || createOfficerOne.data?.user?.id || 0);
    assert.ok(officerOneUserId > 0);

    const createOfficerTwo = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Officer Two",
        email: "branch.officer.two@example.com",
        password: "Password@123",
        role: "loan_officer",
        branchId: sharedBranchId,
      },
    });
    assert.equal(createOfficerTwo.status, 201);

    const officerOneLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "branch.officer.one@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerOneLogin.status, 200);
    const officerOneToken = officerOneLogin.data.token;

    const officerTwoLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "branch.officer.two@example.com",
        password: "Password@123",
      },
    });
    assert.equal(officerTwoLogin.status, 200);
    const officerTwoToken = officerTwoLogin.data.token;

    const createClientByOfficerOne = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: officerOneToken,
      body: {
        fullName: "Officer One Exclusive Client",
        phone: "+254700001199",
      },
    });
    assert.equal(createClientByOfficerOne.status, 201);
    const clientId = Number(createClientByOfficerOne.data.id);
    assert.equal(Number(createClientByOfficerOne.data.branch_id || 0), sharedBranchId);
    assert.equal(Number(createClientByOfficerOne.data.officer_id || 0), officerOneUserId);
    assert.equal(typeof createClientByOfficerOne.data.created_at, "string");

    const officerOneClientList = await api(baseUrl, "/api/clients", {
      token: officerOneToken,
    });
    assert.equal(officerOneClientList.status, 200);
    assert.ok(Array.isArray(officerOneClientList.data.data));
    assert.ok(officerOneClientList.data.data.some((client) => Number(client.id) === clientId));

    const officerTwoClientList = await api(baseUrl, "/api/clients", {
      token: officerTwoToken,
    });
    assert.equal(officerTwoClientList.status, 200);
    assert.ok(Array.isArray(officerTwoClientList.data.data));
    assert.ok(!officerTwoClientList.data.data.some((client) => Number(client.id) === clientId));

    const officerOneClientDetail = await api(baseUrl, `/api/clients/${clientId}`, {
      token: officerOneToken,
    });
    assert.equal(officerOneClientDetail.status, 200);
    assert.equal(Number(officerOneClientDetail.data.branch_id || 0), sharedBranchId);
    assert.equal(String(officerOneClientDetail.data.branch_name || ""), sharedBranchName);
    assert.equal(Number(officerOneClientDetail.data.assigned_officer_id || 0), officerOneUserId);
    assert.equal(String(officerOneClientDetail.data.assigned_officer_name || ""), "Branch Officer One");
    assert.equal(typeof officerOneClientDetail.data.created_at, "string");

    const officerTwoClientDetail = await api(baseUrl, `/api/clients/${clientId}`, {
      token: officerTwoToken,
    });
    assert.equal(officerTwoClientDetail.status, 403);

    const officerTwoPatchClient = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: officerTwoToken,
      body: {
        fullName: "Unauthorized Officer Edit",
      },
    });
    assert.equal(officerTwoPatchClient.status, 403);

    const officerOnePatchClient = await api(baseUrl, `/api/clients/${clientId}`, {
      method: "PATCH",
      token: officerOneToken,
      body: {
        fullName: "Authorized Officer Edit",
      },
    });
    assert.equal(officerOnePatchClient.status, 200);
  } finally {
    await stop();
  }
});

test("manual errors include requestId for traceability", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const invalidUserIdError = await api(baseUrl, "/api/users/not-a-number/deactivate", {
      method: "POST",
      token: adminToken,
    });
    assert.equal(invalidUserIdError.status, 400);
    assert.equal(typeof invalidUserIdError.data.requestId, "string");
    assert.ok(invalidUserIdError.data.requestId.length > 0);

    const createFinanceUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Finance Role Guard",
        email: "finance.roleguard@example.com",
        password: "Password@123",
        role: "finance",
      },
    });
    assert.equal(createFinanceUser.status, 201);

    const financeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "finance.roleguard@example.com",
        password: "Password@123",
      },
    });
    assert.equal(financeLogin.status, 200);

    const forbiddenUsersList = await api(baseUrl, "/api/users", {
      token: financeLogin.data.token,
    });
    assert.equal(forbiddenUsersList.status, 403);
    assert.equal(typeof forbiddenUsersList.data.requestId, "string");
    assert.ok(forbiddenUsersList.data.requestId.length > 0);
  } finally {
    await stop();
  }
});

test("audit logs support filtering, pagination, and totals", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    const adminUserId = Number(adminLogin.data.user.id);

    const createClientOne = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Audit Log Client One",
        phone: "+254700001501",
      },
    });
    assert.equal(createClientOne.status, 201);

    const createClientTwo = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Audit Log Client Two",
        phone: "+254700001502",
      },
    });
    assert.equal(createClientTwo.status, 201);

    const filteredLogsPageOne = await api(
      baseUrl,
      `/api/audit-logs?action=client.created&targetType=client&userId=${adminUserId}&limit=1&offset=0`,
      {
        token: adminToken,
      },
    );
    assert.equal(filteredLogsPageOne.status, 200);
    assert.ok(Array.isArray(filteredLogsPageOne.data.data));
    assert.equal(filteredLogsPageOne.data.data.length, 1);
    assert.ok(Number(filteredLogsPageOne.data.paging.total || 0) >= 2);
    assert.equal(filteredLogsPageOne.data.paging.limit, 1);
    assert.equal(filteredLogsPageOne.data.paging.offset, 0);
    for (const row of filteredLogsPageOne.data.data) {
      assert.equal(row.action, "client.created");
      assert.equal(row.target_type, "client");
      assert.equal(Number(row.user_id), adminUserId);
    }

    const filteredLogsPageTwo = await api(
      baseUrl,
      `/api/audit-logs?action=client.created&targetType=client&userId=${adminUserId}&limit=1&offset=1`,
      {
        token: adminToken,
      },
    );
    assert.equal(filteredLogsPageTwo.status, 200);
    assert.equal(filteredLogsPageTwo.data.paging.total, filteredLogsPageOne.data.paging.total);
    assert.equal(filteredLogsPageTwo.data.paging.offset, 1);

    const futureDateFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const futureFilteredLogs = await api(baseUrl, `/api/audit-logs?dateFrom=${encodeURIComponent(futureDateFrom)}`, {
      token: adminToken,
    });
    assert.equal(futureFilteredLogs.status, 200);
    assert.equal(Number(futureFilteredLogs.data.paging.total || 0), 0);
    assert.equal(futureFilteredLogs.data.data.length, 0);

    const invalidUserFilter = await api(baseUrl, "/api/audit-logs?userId=invalid", {
      token: adminToken,
    });
    assert.equal(invalidUserFilter.status, 400);

    const dateFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const invalidDateRange = await api(
      baseUrl,
      `/api/audit-logs?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      {
        token: adminToken,
      },
    );
    assert.equal(invalidDateRange.status, 400);
  } finally {
    await stop();
  }
});

test("transactions endpoint enforces explicit role policy", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const createFinanceUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Transactions Finance",
        email: "transactions.finance@example.com",
        password: "Password@123",
        role: "finance",
      },
    });
    assert.equal(createFinanceUser.status, 201);

    const createItUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Transactions IT",
        email: "transactions.it@example.com",
        password: "Password@123",
        role: "it",
      },
    });
    assert.equal(createItUser.status, 201);

    const financeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "transactions.finance@example.com",
        password: "Password@123",
      },
    });
    assert.equal(financeLogin.status, 200);

    const itLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "transactions.it@example.com",
        password: "Password@123",
      },
    });
    assert.equal(itLogin.status, 200);

    const financeTransactions = await api(baseUrl, "/api/transactions?limit=5", {
      token: financeLogin.data.token,
    });
    assert.equal(financeTransactions.status, 200);
    assert.ok(Array.isArray(financeTransactions.data.data));

    const itTransactions = await api(baseUrl, "/api/transactions?limit=5", {
      token: itLogin.data.token,
    });
    assert.equal(itTransactions.status, 403);
  } finally {
    await stop();
  }
});

test("hierarchy events journal supports admin filtering and pagination", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    const adminUserId = Number(adminLogin.data.user.id);

    const regionsResult = await api(baseUrl, "/api/regions", {
      token: adminToken,
    });
    assert.equal(regionsResult.status, 200);
    assert.ok(Array.isArray(regionsResult.data.data));
    assert.ok(regionsResult.data.data.length > 0);
    const regionId = Number(regionsResult.data.data[0].id);

    const uniqueCodeSuffix = Date.now().toString(36).toUpperCase().slice(-6);
    const createBranch = await api(baseUrl, "/api/branches", {
      method: "POST",
      token: adminToken,
      body: {
        name: `Hierarchy Journal Branch ${uniqueCodeSuffix}`,
        locationAddress: "101 Ledger Street",
        county: "Nairobi",
        town: "Nairobi",
        regionId,
        branchCode: `HJ-${uniqueCodeSuffix}`,
      },
    });
    assert.equal(createBranch.status, 201);
    const branchId = Number(createBranch.data.id);

    const filteredEventsPageOne = await api(
      baseUrl,
      `/api/hierarchy-events?eventType=hierarchy.branch.created&scopeLevel=branch&branchId=${branchId}&actorUserId=${adminUserId}&limit=1&offset=0`,
      {
        token: adminToken,
      },
    );
    assert.equal(filteredEventsPageOne.status, 200);
    assert.ok(Array.isArray(filteredEventsPageOne.data.data));
    assert.equal(filteredEventsPageOne.data.data.length, 1);
    assert.ok(Number(filteredEventsPageOne.data.paging.total || 0) >= 1);
    assert.equal(filteredEventsPageOne.data.paging.limit, 1);
    assert.equal(filteredEventsPageOne.data.paging.offset, 0);

    const event = filteredEventsPageOne.data.data[0];
    assert.equal(event.event_type, "hierarchy.branch.created");
    assert.equal(event.scope_level, "branch");
    assert.equal(Number(event.branch_id), branchId);
    assert.equal(Number(event.actor_user_id), adminUserId);
    assert.equal(event.actor_user_email, "admin@afriserve.local");
    assert.equal(typeof event.details, "object");

    const futureDateFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const futureFilteredEvents = await api(
      baseUrl,
      `/api/hierarchy-events?dateFrom=${encodeURIComponent(futureDateFrom)}`,
      {
        token: adminToken,
      },
    );
    assert.equal(futureFilteredEvents.status, 200);
    assert.equal(Number(futureFilteredEvents.data.paging.total || 0), 0);
    assert.equal(futureFilteredEvents.data.data.length, 0);

    const invalidScopeLevel = await api(baseUrl, "/api/hierarchy-events?scopeLevel=national", {
      token: adminToken,
    });
    assert.equal(invalidScopeLevel.status, 400);

    const invalidActorUserFilter = await api(baseUrl, "/api/hierarchy-events?actorUserId=invalid", {
      token: adminToken,
    });
    assert.equal(invalidActorUserFilter.status, 400);

    const dateFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const dateTo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const invalidDateRange = await api(
      baseUrl,
      `/api/hierarchy-events?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      {
        token: adminToken,
      },
    );
    assert.equal(invalidDateRange.status, 400);

    const createFinanceUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Hierarchy Events Finance",
        email: "hierarchy.events.finance@example.com",
        password: "Password@123",
        role: "finance",
      },
    });
    assert.equal(createFinanceUser.status, 201);

    const financeLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "hierarchy.events.finance@example.com",
        password: "Password@123",
      },
    });
    assert.equal(financeLogin.status, 200);

    const financeHierarchyEvents = await api(baseUrl, "/api/hierarchy-events", {
      token: financeLogin.data.token,
    });
    assert.equal(financeHierarchyEvents.status, 403);
  } finally {
    await stop();
  }
});

test("password reset webhook delivery is bounded by timeout", async () => {
  const hangingServer = http.createServer((_req, _res) => {
    // Keep request open to emulate an unresponsive webhook.
  });

  await new Promise((resolve, reject) => {
    hangingServer.listen(0, "127.0.0.1", (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const webhookAddress = hangingServer.address();
  if (!webhookAddress || typeof webhookAddress !== "object") {
    hangingServer.close();
    throw new Error("Failed to start hanging webhook server");
  }

  const { baseUrl, stop } = await startServer({
    envOverrides: {
      PASSWORD_RESET_WEBHOOK_URL: `http://127.0.0.1:${webhookAddress.port}/reset`,
      PASSWORD_RESET_WEBHOOK_TIMEOUT_MS: "1000",
    },
  });

  try {
    const startedAt = Date.now();
    const resetRequest = await api(baseUrl, "/api/auth/reset-password/request", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
      },
    });
    const durationMs = Date.now() - startedAt;

    assert.equal(resetRequest.status, 200);
    assert.ok(
      durationMs < 3500,
      `Expected reset request to complete quickly with timeout, but took ${durationMs}ms`,
    );
  } finally {
    await stop();
    await new Promise((resolve) => hangingServer.close(() => resolve()));
  }
});

test("admin cannot remove own admin role or deactivate own account", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    const adminUserId = adminLogin.data.user.id;

    const removeOwnAdminRole = await api(baseUrl, `/api/users/${adminUserId}/role`, {
      method: "PATCH",
      token: adminToken,
      body: {
        role: "cashier",
      },
    });
    assert.equal(removeOwnAdminRole.status, 400);

    const deactivateSelf = await api(baseUrl, `/api/users/${adminUserId}/deactivate`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(deactivateSelf.status, 400);
  } finally {
    await stop();
  }
});

test("hierarchy scope limits branch and area manager visibility", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const allBranches = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(allBranches.status, 200);
    const branches = allBranches.data.data;
    assert.ok(Array.isArray(branches));
    assert.ok(branches.length >= 3, "Expected seeded hierarchy to include at least three branches");

    const branchesByRegion = new Map();
    for (const branch of branches) {
      const regionId = Number(branch.region_id);
      if (!branchesByRegion.has(regionId)) {
        branchesByRegion.set(regionId, []);
      }
      branchesByRegion.get(regionId).push(branch);
    }

    const availableRegionIds = [...branchesByRegion.keys()];
    assert.ok(availableRegionIds.length >= 2, "Expected at least two regions with seeded branches");
    const primaryRegionId = Number(availableRegionIds[0]);
    const secondaryRegionId = Number(availableRegionIds[1]);
    const primaryRegionBranches = branchesByRegion.get(primaryRegionId);
    const secondaryRegionBranches = branchesByRegion.get(secondaryRegionId);
    assert.ok(primaryRegionBranches.length >= 1);
    assert.ok(secondaryRegionBranches.length >= 1);

    const branchInPrimaryRegion = primaryRegionBranches[0];
    const secondPrimaryBranch = primaryRegionBranches[1] || primaryRegionBranches[0];
    const branchOutsideScope = secondaryRegionBranches[0];

    const createBranchManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Scoped Branch Manager",
        email: "scoped.branch.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId: Number(branchInPrimaryRegion.id),
      },
    });
    assert.equal(createBranchManager.status, 201);

    const branchManagerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "scoped.branch.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(branchManagerLogin.status, 200);
    const branchManagerToken = branchManagerLogin.data.token;

    const branchManagerBranches = await api(baseUrl, "/api/branches?limit=100", {
      token: branchManagerToken,
    });
    assert.equal(branchManagerBranches.status, 200);
    assert.deepEqual(
      branchManagerBranches.data.data.map((branch) => Number(branch.id)),
      [Number(branchInPrimaryRegion.id)],
    );

    const branchManagerOutOfScopeBranch = await api(baseUrl, `/api/branches/${branchOutsideScope.id}`, {
      token: branchManagerToken,
    });
    assert.equal(branchManagerOutOfScopeBranch.status, 403);

    const branchManagerReport = await api(baseUrl, "/api/reports/hierarchy/performance", {
      token: branchManagerToken,
    });
    assert.equal(branchManagerReport.status, 200);
    assert.deepEqual(
      branchManagerReport.data.branchPerformance.map((item) => Number(item.branch_id)),
      [Number(branchInPrimaryRegion.id)],
    );

    const assignedAreaBranches = [...new Set([Number(branchInPrimaryRegion.id), Number(secondPrimaryBranch.id)])];
    const createAreaManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Scoped Area Manager",
        email: "scoped.area.manager@example.com",
        password: "Password@123",
        role: "area_manager",
        primaryRegionId,
        branchIds: assignedAreaBranches,
      },
    });
    assert.equal(createAreaManager.status, 201);

    const areaManagerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "scoped.area.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(areaManagerLogin.status, 200);
    const areaManagerToken = areaManagerLogin.data.token;

    const areaManagerBranches = await api(baseUrl, "/api/branches?limit=100", {
      token: areaManagerToken,
    });
    assert.equal(areaManagerBranches.status, 200);
    const areaVisibleIds = new Set(areaManagerBranches.data.data.map((branch) => Number(branch.id)));
    for (const branchId of assignedAreaBranches) {
      assert.ok(areaVisibleIds.has(branchId), `Expected area manager to see assigned branch ${branchId}`);
    }
    assert.ok(!areaVisibleIds.has(Number(branchOutsideScope.id)));

    const areaManagerOutOfScopeBranch = await api(baseUrl, `/api/branches/${branchOutsideScope.id}`, {
      token: areaManagerToken,
    });
    assert.equal(areaManagerOutOfScopeBranch.status, 403);

    const areaManagerReport = await api(baseUrl, "/api/reports/hierarchy/performance", {
      token: areaManagerToken,
    });
    assert.equal(areaManagerReport.status, 200);
    const areaReportBranchIds = new Set(areaManagerReport.data.branchPerformance.map((item) => Number(item.branch_id)));
    assert.ok(!areaReportBranchIds.has(Number(branchOutsideScope.id)));
    assert.ok(
      areaManagerReport.data.branchPerformance.every((item) => Number(item.region_id) === primaryRegionId),
      "Expected area manager report rows to stay in the assigned region",
    );
  } finally {
    await stop();
  }
});

test("branch detail endpoint returns branch metrics and respects scope", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const branchesResult = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branchesResult.status, 200);
    const branches = branchesResult.data.data;
    assert.ok(Array.isArray(branches));
    assert.ok(branches.length >= 2, "Expected seeded hierarchy to include at least two branches");

    const targetBranchId = Number(branches[0].id);
    const otherBranchId = Number(branches.find((branch) => Number(branch.id) !== targetBranchId)?.id || branches[1].id);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Metrics Client",
        phone: "+254700001601",
        branchId: targetBranchId,
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data.id),
        principal: 1200,
        termWeeks: 12,
      },
    });
    assert.equal(createLoan.status, 201);

    const approveBranchMetricsLoan = await approveLoan(baseUrl, Number(createLoan.data.id), adminToken, {
      notes: "Approve branch metrics loan",
    });
    assert.equal(approveBranchMetricsLoan.status, 200);

    const branchDetail = await api(baseUrl, `/api/branches/${targetBranchId}`, {
      token: adminToken,
    });
    assert.equal(branchDetail.status, 200);
    assert.equal(Number(branchDetail.data.id), targetBranchId);
    assert.ok(branchDetail.data.stats, "Expected branch detail response to include stats");
    assert.ok(Number(branchDetail.data.stats.total_clients || 0) >= 1);
    assert.ok(Number(branchDetail.data.stats.active_clients || 0) >= 1);
    assert.ok(Number(branchDetail.data.stats.total_loans || 0) >= 1);
    assert.ok(Number(branchDetail.data.stats.active_loans || 0) >= 1);
    assert.equal(typeof branchDetail.data.stats.overdue_installments, "number");
    assert.equal(typeof branchDetail.data.stats.overdue_loans, "number");

    const createBranchManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Metrics Scoped Manager",
        email: "branch.metrics.scoped.manager@example.com",
        password: "Password@123",
        role: "operations_manager",
        branchId: otherBranchId,
      },
    });
    assert.equal(createBranchManager.status, 201);

    const branchManagerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "branch.metrics.scoped.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(branchManagerLogin.status, 200);

    const outOfScopeBranchDetail = await api(baseUrl, `/api/branches/${targetBranchId}`, {
      token: branchManagerLogin.data.token,
    });
    assert.equal(outOfScopeBranchDetail.status, 403);

    const ownBranchDetail = await api(baseUrl, `/api/branches/${otherBranchId}`, {
      token: branchManagerLogin.data.token,
    });
    assert.equal(ownBranchDetail.status, 200);
    assert.ok(ownBranchDetail.data.stats);
    assert.equal(typeof ownBranchDetail.data.stats.total_loans, "number");
  } finally {
    await stop();
  }
});

test("portfolio report returns scoped branch and region breakdowns in one call", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const branchesResult = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(branchesResult.status, 200);
    const branches = branchesResult.data.data;
    assert.ok(Array.isArray(branches));
    assert.ok(branches.length >= 3, "Expected seeded hierarchy to include at least three branches");

    const branchesByRegion = new Map();
    for (const branch of branches) {
      const regionId = Number(branch.region_id);
      if (!branchesByRegion.has(regionId)) {
        branchesByRegion.set(regionId, []);
      }
      branchesByRegion.get(regionId).push(Number(branch.id));
    }

    const targetRegionEntry = [...branchesByRegion.entries()].find(([, branchIds]) => branchIds.length >= 2);
    assert.ok(targetRegionEntry, "Expected a region with at least two branches");
    const targetRegionId = Number(targetRegionEntry[0]);
    const inScopeBranchIds = targetRegionEntry[1].slice(0, 2);
    const outOfScopeEntry = [...branchesByRegion.entries()].find(([regionId]) => Number(regionId) !== targetRegionId);
    assert.ok(outOfScopeEntry, "Expected at least one secondary region");
    const outOfScopeBranchId = Number(outOfScopeEntry[1][0]);

    const createAreaManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Portfolio Scoped Area Manager",
        email: "portfolio.scoped.area.manager@example.com",
        password: "Password@123",
        role: "area_manager",
        primaryRegionId: targetRegionId,
        branchIds: inScopeBranchIds,
      },
    });
    assert.equal(createAreaManager.status, 201);

    const areaManagerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "portfolio.scoped.area.manager@example.com",
        password: "Password@123",
      },
    });
    assert.equal(areaManagerLogin.status, 200);
    const areaManagerToken = areaManagerLogin.data.token;

    const createClientAndLoanAtBranch = async ({ fullName, phone, branchId, principal }) => {
      const createClient = await api(baseUrl, "/api/clients", {
        method: "POST",
        token: adminToken,
        body: {
          fullName,
          phone,
          branchId,
        },
      });
      assert.equal(createClient.status, 201);

      const createLoan = await api(baseUrl, "/api/loans", {
        method: "POST",
        token: adminToken,
        body: {
          clientId: Number(createClient.data.id),
          principal,
          termWeeks: 12,
        },
      });
      assert.equal(createLoan.status, 201);
    };

    await createClientAndLoanAtBranch({
      fullName: "Portfolio Scope Branch One",
      phone: "+254700001701",
      branchId: inScopeBranchIds[0],
      principal: 1000,
    });
    await createClientAndLoanAtBranch({
      fullName: "Portfolio Scope Branch Two",
      phone: "+254700001702",
      branchId: inScopeBranchIds[1],
      principal: 1500,
    });
    await createClientAndLoanAtBranch({
      fullName: "Portfolio Scope Out Branch",
      phone: "+254700001703",
      branchId: outOfScopeBranchId,
      principal: 2000,
    });

    const scopedPortfolio = await api(baseUrl, "/api/reports/portfolio?includeBreakdown=true", {
      token: areaManagerToken,
    });
    assert.equal(scopedPortfolio.status, 200);
    assert.ok(Array.isArray(scopedPortfolio.data.branchBreakdown));
    assert.ok(Array.isArray(scopedPortfolio.data.regionBreakdown));

    assert.equal(Number(scopedPortfolio.data.total_loans || 0), 2);

    const scopedBranchIds = new Set(scopedPortfolio.data.branchBreakdown.map((row) => Number(row.branch_id)));
    assert.equal(scopedBranchIds.size, inScopeBranchIds.length);
    for (const branchId of inScopeBranchIds) {
      assert.ok(scopedBranchIds.has(Number(branchId)), `Expected scoped branch ${branchId} in breakdown`);
    }
    assert.ok(!scopedBranchIds.has(outOfScopeBranchId));

    assert.equal(scopedPortfolio.data.regionBreakdown.length, 1);
    assert.equal(Number(scopedPortfolio.data.regionBreakdown[0].region_id), targetRegionId);

    const branchTotalLoans = scopedPortfolio.data.branchBreakdown
      .reduce((sum, row) => sum + Number(row.total_loans || 0), 0);
    const regionTotalLoans = scopedPortfolio.data.regionBreakdown
      .reduce((sum, row) => sum + Number(row.total_loans || 0), 0);
    assert.equal(branchTotalLoans, Number(scopedPortfolio.data.total_loans || 0));
    assert.equal(regionTotalLoans, Number(scopedPortfolio.data.total_loans || 0));
  } finally {
    await stop();
  }
});

test("explicit branch assignment is required for multi-branch roles while branchCount validates scope size", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const allBranches = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: adminToken,
    });
    assert.equal(allBranches.status, 200);
    const branches = allBranches.data.data;
    assert.ok(Array.isArray(branches) && branches.length > 0);

    const branchesByRegion = new Map();
    for (const branch of branches) {
      const regionId = Number(branch.region_id);
      if (!branchesByRegion.has(regionId)) {
        branchesByRegion.set(regionId, []);
      }
      branchesByRegion.get(regionId).push(Number(branch.id));
    }

    const targetRegionEntry = [...branchesByRegion.entries()].find(([, branchIds]) => branchIds.length >= 2);
    assert.ok(targetRegionEntry, "Expected at least one region with two branches");
    const targetRegionId = Number(targetRegionEntry[0]);
    const targetRegionBranchIds = targetRegionEntry[1];

    const selectedRegionBranchIds = targetRegionBranchIds.slice(0, 2);
    assert.equal(selectedRegionBranchIds.length, 2);

    const createAreaManagerWithoutBranchIds = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Count Missing Assignments",
        email: "branch.count.missing.assignments@example.com",
        password: "Password@123",
        role: "area_manager",
        primaryRegionId: targetRegionId,
        branchCount: 2,
      },
    });
    assert.equal(createAreaManagerWithoutBranchIds.status, 400);

    const createAreaManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Count Create",
        email: "branch.count.create@example.com",
        password: "Password@123",
        role: "area_manager",
        primaryRegionId: targetRegionId,
        branchIds: selectedRegionBranchIds,
        branchCount: 2,
      },
    });
    assert.equal(createAreaManager.status, 201);
    assert.equal(createAreaManager.data.assigned_branch_ids.length, 2);
    assert.ok(
      createAreaManager.data.assigned_branch_ids.every((branchId) => selectedRegionBranchIds.includes(Number(branchId))),
      "Expected created area manager branches to come from selected region",
    );

    const createMismatchAreaManager = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Count Mismatch",
        email: "branch.count.mismatch@example.com",
        password: "Password@123",
        role: "area_manager",
        primaryRegionId: targetRegionId,
        branchIds: [targetRegionBranchIds[0]],
        branchCount: 2,
      },
    });
    assert.equal(createMismatchAreaManager.status, 400);

    const createCashier = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Branch Count Role Target",
        email: "branch.count.role.target@example.com",
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createCashier.status, 201);
    const targetUserId = Number(createCashier.data.id);

    const roleToAreaManager = await api(baseUrl, `/api/users/${targetUserId}/role`, {
      method: "PATCH",
      token: adminToken,
      body: {
        role: "area_manager",
        primaryRegionId: targetRegionId,
        branchIds: selectedRegionBranchIds,
        branchCount: 2,
      },
    });
    assert.equal(roleToAreaManager.status, 200);
    assert.equal(roleToAreaManager.data.user.assigned_branch_ids.length, 2);

    const scopeToSingleBranch = await api(baseUrl, `/api/users/${targetUserId}/profile`, {
      method: "PATCH",
      token: adminToken,
      body: {
        primaryRegionId: targetRegionId,
        branchIds: [selectedRegionBranchIds[0]],
        branchCount: 1,
      },
    });
    assert.equal(scopeToSingleBranch.status, 200);
    assert.equal(scopeToSingleBranch.data.user.assigned_branch_ids.length, 1);
    assert.ok(
      selectedRegionBranchIds.includes(Number(scopeToSingleBranch.data.user.assigned_branch_ids[0])),
      "Expected profile update branchCount assignment to stay in region",
    );

    const branchCountForNonAreaRole = await api(baseUrl, `/api/users/${targetUserId}/role`, {
      method: "PATCH",
      token: adminToken,
      body: {
        role: "operations_manager",
        branchId: targetRegionBranchIds[0],
        branchCount: 1,
      },
    });
    assert.equal(branchCountForNonAreaRole.status, 400);
  } finally {
    await stop();
  }
});

test("investor and partner branch assignments support create and post-create add/remove updates", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const allBranches = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc&isActive=true", {
      token: adminToken,
    });
    assert.equal(allBranches.status, 200);
    const branchIds = (allBranches.data.data || [])
      .map((branch) => Number(branch.id))
      .filter((branchId) => Number.isInteger(branchId) && branchId > 0);
    assert.ok(branchIds.length >= 3, "Expected at least three active branches for assignment tests");

    const [branchA, branchB, branchC] = branchIds;

    const createInvestorWithoutBranches = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Investor Missing Scope",
        email: "investor.missing.scope@example.com",
        password: "Password@123",
        role: "investor",
      },
    });
    assert.equal(createInvestorWithoutBranches.status, 400);

    const createInvestorByBranchCount = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Investor Branch Count User",
        email: "investor.branch.count@example.com",
        password: "Password@123",
        role: "investor",
        branchCount: 2,
      },
    });
    assert.equal(createInvestorByBranchCount.status, 400);

    const createInvestorByExplicitBranchCount = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Investor Branch Count User",
        email: "investor.branch.count.explicit@example.com",
        password: "Password@123",
        role: "investor",
        branchIds: [branchA, branchB],
        branchCount: 2,
      },
    });
    assert.equal(createInvestorByExplicitBranchCount.status, 201);
    assert.equal(Number(createInvestorByExplicitBranchCount.data.assigned_branch_ids?.length || 0), 2);

    const createInvestor = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Investor Scoped User",
        email: "investor.scoped@example.com",
        password: "Password@123",
        role: "investor",
        branchIds: [branchA, branchB],
      },
    });
    assert.equal(createInvestor.status, 201);
    const investorUserId = Number(createInvestor.data.id);
    assert.deepEqual(new Set(createInvestor.data.assigned_branch_ids || []), new Set([branchA, branchB]));

    const investorLoginBeforeUpdate = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "investor.scoped@example.com",
        password: "Password@123",
      },
    });
    assert.equal(investorLoginBeforeUpdate.status, 200);

    const investorBranchesBeforeUpdate = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: investorLoginBeforeUpdate.data.token,
    });
    assert.equal(investorBranchesBeforeUpdate.status, 200);
    const visibleInvestorBranchesBefore = new Set(
      (investorBranchesBeforeUpdate.data.data || [])
        .map((branch) => Number(branch.id))
        .filter((branchId) => Number.isInteger(branchId) && branchId > 0),
    );
    assert.deepEqual(visibleInvestorBranchesBefore, new Set([branchA, branchB]));

    const updateInvestorBranches = await api(baseUrl, `/api/users/${investorUserId}/profile`, {
      method: "PATCH",
      token: adminToken,
      body: {
        branchIds: [branchB, branchC],
      },
    });
    assert.equal(updateInvestorBranches.status, 200);
    assert.deepEqual(new Set(updateInvestorBranches.data.user.assigned_branch_ids || []), new Set([branchB, branchC]));

    const investorMeWithOldToken = await api(baseUrl, "/api/auth/me", {
      token: investorLoginBeforeUpdate.data.token,
    });
    assert.equal(investorMeWithOldToken.status, 401);

    const investorLoginAfterUpdate = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "investor.scoped@example.com",
        password: "Password@123",
      },
    });
    assert.equal(investorLoginAfterUpdate.status, 200);

    const investorBranchesAfterUpdate = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: investorLoginAfterUpdate.data.token,
    });
    assert.equal(investorBranchesAfterUpdate.status, 200);
    const visibleInvestorBranchesAfter = new Set(
      (investorBranchesAfterUpdate.data.data || [])
        .map((branch) => Number(branch.id))
        .filter((branchId) => Number.isInteger(branchId) && branchId > 0),
    );
    assert.deepEqual(visibleInvestorBranchesAfter, new Set([branchB, branchC]));

    const createPartner = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Partner Scoped User",
        email: "partner.scoped@example.com",
        password: "Password@123",
        role: "partner",
        branchId: branchC,
      },
    });
    assert.equal(createPartner.status, 201);
    const partnerUserId = Number(createPartner.data.id);
    assert.deepEqual(new Set(createPartner.data.assigned_branch_ids || []), new Set([branchC]));

    const updatePartnerBranches = await api(baseUrl, `/api/users/${partnerUserId}/profile`, {
      method: "PATCH",
      token: adminToken,
      body: {
        branchIds: [branchA, branchC],
      },
    });
    assert.equal(updatePartnerBranches.status, 200);
    assert.deepEqual(new Set(updatePartnerBranches.data.user.assigned_branch_ids || []), new Set([branchA, branchC]));

    const partnerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "partner.scoped@example.com",
        password: "Password@123",
      },
    });
    assert.equal(partnerLogin.status, 200);

    const partnerBranches = await api(baseUrl, "/api/branches?limit=500&sortBy=id&sortOrder=asc", {
      token: partnerLogin.data.token,
    });
    assert.equal(partnerBranches.status, 200);
    const visiblePartnerBranches = new Set(
      (partnerBranches.data.data || [])
        .map((branch) => Number(branch.id))
        .filter((branchId) => Number.isInteger(branchId) && branchId > 0),
    );
    assert.deepEqual(visiblePartnerBranches, new Set([branchA, branchC]));
  } finally {
    await stop();
  }
});
