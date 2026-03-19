import Database from "better-sqlite3";
import test from "node:test";
import assert from "node:assert/strict";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

test("granting a custom permission revokes stale tokens and persists a domain event", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createItUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Permission IT ${suffix}`,
        email: `permission.it.${suffix}@example.com`,
        password: "Password@123",
        role: "it",
      },
    });
    assert.equal(createItUser.status, 201);

    const createOfficer = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Permission Officer ${suffix}`,
        email: `permission.officer.${suffix}@example.com`,
        password: "Password@123",
        role: "loan_officer",
      },
    });
    assert.equal(createOfficer.status, 201);
    const officerId = Number(createOfficer.data?.id || 0);
    assert.ok(officerId > 0);

    const itLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `permission.it.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(itLogin.status, 200);
    const itToken = String(itLogin.data?.token || "");

    const officerLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `permission.officer.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(officerLogin.status, 200);
    const staleOfficerToken = String(officerLogin.data?.token || "");
    assert.equal(Array.isArray(officerLogin.data?.user?.permissions), true);
    assert.equal(officerLogin.data.user.permissions.includes("audit.view"), false);

    const grant = await api(baseUrl, `/api/users/${officerId}/permissions`, {
      method: "POST",
      token: itToken,
      body: {
        permissionId: "audit.view",
      },
    });
    assert.equal(grant.status, 201);

    const staleMe = await api(baseUrl, "/api/auth/me", {
      token: staleOfficerToken,
    });
    assert.equal(staleMe.status, 401);

    const officerReLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `permission.officer.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(officerReLogin.status, 200);
    assert.equal(officerReLogin.data.user.permissions.includes("audit.view"), true);

    const permissionView = await api(baseUrl, `/api/users/${officerId}/permissions`, {
      token: itToken,
    });
    assert.equal(permissionView.status, 200);
    assert.equal(permissionView.data.effectivePermissions.includes("audit.view"), true);

    assert.ok(dbFilePath);
    const database = new Database(dbFilePath, { readonly: true });
    try {
      const domainEvent = database.prepare(`
        SELECT event_type, aggregate_type, aggregate_id, payload_json, metadata_json
        FROM domain_events
        WHERE aggregate_type = 'user' AND aggregate_id = ? AND event_type = 'user.permission.granted'
        ORDER BY id DESC
        LIMIT 1
      `).get(officerId) as Record<string, unknown> | undefined;

      assert.ok(domainEvent);
      assert.equal(String(domainEvent?.event_type || ""), "user.permission.granted");
      assert.equal(String(domainEvent?.aggregate_type || ""), "user");
      const payload = JSON.parse(String(domainEvent?.payload_json || "{}"));
      assert.equal(String(payload.permissionId || ""), "audit.view");
    } finally {
      database.close();
    }
  } finally {
    await stop();
  }
});

test("permission catalog endpoint returns live permission metadata for IT administrators", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createItUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Catalog IT ${suffix}`,
        email: `catalog.it.${suffix}@example.com`,
        password: "Password@123",
        role: "it",
      },
    });
    assert.equal(createItUser.status, 201);

    const itLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `catalog.it.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(itLogin.status, 200);
    const itToken = String(itLogin.data?.token || "");

    const catalog = await api(baseUrl, "/api/permissions/catalog", {
      token: itToken,
    });
    assert.equal(catalog.status, 200);
    assert.equal(Array.isArray(catalog.data?.permissions), true);
    assert.equal(catalog.data.permissions.some((entry: Record<string, unknown>) => String(entry.permission_id || "") === "user.permission.manage"), true);

    const permissionEntry = catalog.data.permissions.find((entry: Record<string, unknown>) => String(entry.permission_id || "") === "audit.view");
    assert.ok(permissionEntry);
    assert.equal(Array.isArray(permissionEntry.default_roles), true);
    assert.equal(permissionEntry.default_roles.includes("admin"), true);
  } finally {
    await stop();
  }
});