import test from "node:test";
import assert from "node:assert/strict";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";

test("user deactivation immediately revokes active JWT and blocks new login", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Session Revocation Target",
        email: "session.revoke.target@example.com",
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);
    const userId = Number(createUser.data?.id || 0);
    assert.ok(userId > 0);

    const userLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "session.revoke.target@example.com",
        password: "Password@123",
      },
    });
    assert.equal(userLogin.status, 200);
    const staleToken = userLogin.data?.token;
    assert.equal(typeof staleToken, "string");

    const meBefore = await api(baseUrl, "/api/auth/me", {
      token: staleToken,
    });
    assert.equal(meBefore.status, 200);

    const deactivate = await api(baseUrl, `/api/users/${userId}/deactivate`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(deactivate.status, 200);
    assert.equal(Number(deactivate.data?.user?.is_active || 0), 0);

    const meAfter = await api(baseUrl, "/api/auth/me", {
      token: staleToken,
    });
    assert.equal(meAfter.status, 401);
    assert.match(String(meAfter.data?.message || ""), /inactive|revoked|invalid/i);

    const loginAfterDeactivate = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "session.revoke.target@example.com",
        password: "Password@123",
      },
    });
    assert.ok(loginAfterDeactivate.status === 401 || loginAfterDeactivate.status === 403);

    const secondDeactivate = await api(baseUrl, `/api/users/${userId}/deactivate`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(secondDeactivate.status, 200);
    assert.match(String(secondDeactivate.data?.message || ""), /already inactive/i);
  } finally {
    await stop();
  }
});

test("session revocation updates security state and blocks stale access tokens", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Security State ${suffix}`,
        email: `security.state.${suffix}@example.com`,
        password: "Password@123",
        role: "cashier",
      },
    });
    assert.equal(createUser.status, 201);
    const userId = Number(createUser.data?.id || 0);
    assert.ok(userId > 0);

    const login = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `security.state.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(login.status, 200);
    const staleToken = String(login.data?.token || "");

    const badLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `security.state.${suffix}@example.com`,
        password: "WrongPassword@123",
      },
    });
    assert.equal(badLogin.status, 401);

    const revokeSessions = await api(baseUrl, `/api/users/${userId}/revoke-sessions`, {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(revokeSessions.status, 200);

    const meAfterRevoke = await api(baseUrl, '/api/auth/me', {
      token: staleToken,
    });
    assert.equal(meAfterRevoke.status, 401);

    const securityState = await api(baseUrl, `/api/users/${userId}/security-state`, {
      token: adminToken,
    });
    assert.equal(securityState.status, 200);
    assert.equal(Boolean(securityState.data?.failedLoginAttempts >= 1), true);
    assert.equal(Boolean(Number(securityState.data?.tokenVersion || 0) >= 1), true);
    assert.equal(Array.isArray(securityState.data?.recentActions), true);
    assert.equal(
      securityState.data.recentActions.some((entry: Record<string, unknown>) => String(entry.action || '') === 'user.sessions.revoked'),
      true,
    );
  } finally {
    await stop();
  }
});
