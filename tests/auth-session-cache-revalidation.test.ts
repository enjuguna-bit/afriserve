import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { api, startServer, wait } from "./integration-helpers.js";

test("non-privileged sessions are revalidated after the configured cache window", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-auth-revalidate-"));
  const dbPath = path.join(tempRoot, "auth-revalidate.db");
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
      NODE_ENV: "test",
      AUTH_SESSION_CACHE_REVALIDATE_AFTER_SECONDS: "1",
    },
  });

  try {
    const adminLogin = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = String(adminLogin.data?.token || "");

    const createUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: `Cache Revalidate Officer ${suffix}`,
        email: `cache.revalidate.${suffix}@example.com`,
        password: "Password@123",
        role: "loan_officer",
      },
    });
    assert.equal(createUser.status, 201);

    const login = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: {
        email: `cache.revalidate.${suffix}@example.com`,
        password: "Password@123",
      },
    });
    assert.equal(login.status, 200);
    const staleToken = String(login.data?.token || "");

    const beforeRoleChange = await api(baseUrl, "/api/auth/me", {
      token: staleToken,
    });
    assert.equal(beforeRoleChange.status, 200);
    assert.equal(beforeRoleChange.data?.role, "loan_officer");

    const database = new Database(dbPath);
    try {
      const userRow = database
        .prepare("SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1")
        .get(`cache.revalidate.${suffix}@example.com`) as { id: number } | undefined;
      assert.ok(userRow?.id);

      database.prepare("UPDATE users SET role = ? WHERE id = ?").run("cashier", userRow.id);
      database.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userRow.id);
    } finally {
      database.close();
    }

    await wait(1200);

    const afterRoleChange = await api(baseUrl, "/api/auth/me", {
      token: staleToken,
    });
    assert.equal(afterRoleChange.status, 200);
    assert.deepEqual(afterRoleChange.data?.roles, ["cashier"]);
    assert.equal(afterRoleChange.data?.role, "cashier");
  } finally {
    await stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
