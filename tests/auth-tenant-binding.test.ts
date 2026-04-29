import test from "node:test";
import assert from "node:assert/strict";
import { api, startServer } from "./integration-helpers.js";

test("tenant-scoped access and refresh tokens are rejected when replayed under a different tenant", async () => {
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

    const mismatchedAccessToken = await api(baseUrl, "/api/auth/me", {
      token: String(login.data?.token || ""),
    });
    assert.equal(mismatchedAccessToken.status, 401);

    const mismatchedRefreshToken = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      body: {
        token: String(login.data?.refreshToken || ""),
      },
    });
    assert.equal(mismatchedRefreshToken.status, 401);

    const matchedTenantAccessToken = await api(baseUrl, "/api/auth/me", {
      token: String(login.data?.token || ""),
      headers: {
        "X-Tenant-ID": "tenant_b",
      },
    });
    assert.equal(matchedTenantAccessToken.status, 200);
  } finally {
    await stop();
  }
});
