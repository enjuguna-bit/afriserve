import test from "node:test";
import assert from "node:assert/strict";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";

test("ceo can read users but cannot read audit logs", async () => {
  const { baseUrl, stop } = await startServer();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createCeo = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `User Read CEO ${suffix}`,
        email: `user.read.ceo.${suffix}@example.com`,
        password: "Password@123",
        role: "ceo",
      },
    });
    assert.equal(createCeo.status, 201);

    const ceoLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `user.read.ceo.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(ceoLogin.status, 200);
    const ceoToken = String(ceoLogin.data?.token || "");

    const userList = await api(baseUrl, "/api/users?limit=10&offset=0&sortBy=id&sortOrder=desc", {
      token: ceoToken,
    });
    assert.equal(userList.status, 200);
    assert.equal(Array.isArray(userList.data?.data), true);

    const auditLogs = await api(baseUrl, "/api/audit-logs?limit=10&offset=0", {
      token: ceoToken,
    });
    assert.equal(auditLogs.status, 403);
  } finally {
    await stop();
  }
});
