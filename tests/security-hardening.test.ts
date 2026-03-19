import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { startServer, api, loginAsAdmin } from "./integration-helpers.js";
test("password complexity blocks weak create-user and change-password payloads", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const weakCreateUser = await api(baseUrl, "/api/users", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "Weak Password User",
        email: "weak.password.user@example.com",
        password: "Short1!a",
        role: "cashier",
      },
    });

    assert.equal(weakCreateUser.status, 400);
    assert.equal(weakCreateUser.data.message, "Validation failed");
    assert.ok(
      Array.isArray(weakCreateUser.data.issues)
      && weakCreateUser.data.issues.some((issue) => String(issue.message || "").includes("12 characters")),
    );

    const weakChangePassword = await api(baseUrl, "/api/auth/change-password", {
      method: "POST",
      token: adminToken,
      body: {
        currentPassword: "Admin@123",
        newPassword: "Short1!a",
      },
    });

    assert.equal(weakChangePassword.status, 400);
    assert.equal(weakChangePassword.data.message, "Validation failed");
    assert.ok(
      Array.isArray(weakChangePassword.data.issues)
      && weakChangePassword.data.issues.some((issue) => String(issue.message || "").includes("12 characters")),
    );
  } finally {
    await stop();
  }
});

test("access and refresh tokens honor JWT_SECRETS when JWT_SECRET is blank", async () => {
  const onlySecret = "jwt-secrets-only-test-secret";
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      JWT_SECRET: "",
      JWT_SECRETS: onlySecret,
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

    const accessPayload = jwt.verify(String(login.data.token || ""), onlySecret) as jwt.JwtPayload;
    const refreshPayload = jwt.verify(String(login.data.refreshToken || ""), onlySecret) as jwt.JwtPayload;
    assert.equal(accessPayload.typ, "access");
    assert.equal(refreshPayload.typ, "refresh");

    const refreshed = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      body: {
        token: login.data.refreshToken,
      },
    });
    assert.equal(refreshed.status, 200);
  } finally {
    await stop();
  }
});

test("jwt secret rotation accepts legacy tokens only while previous secrets remain configured", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-jwt-rotation-"));
  const dbPath = path.join(tempRoot, "rotation.db");
  const previousSecret = "rotation-secret-old";
  const currentSecret = "rotation-secret-new";
  let legacyToken = "";

  try {
    const serverWithOldSecret = await startServer({
      envOverrides: {
        DB_PATH: dbPath,
        JWT_SECRET: previousSecret,
      },
    });
    try {
      const login = await api(serverWithOldSecret.baseUrl, "/api/auth/login", {
        method: "POST",
        body: {
          email: "admin@afriserve.local",
          password: "Admin@123",
        },
      });
      assert.equal(login.status, 200);
      legacyToken = login.data.token;
    } finally {
      await serverWithOldSecret.stop();
    }

    const serverWithRotatedSecrets = await startServer({
      envOverrides: {
        DB_PATH: dbPath,
        JWT_SECRET: currentSecret,
        JWT_SECRETS: `${currentSecret},${previousSecret}`,
      },
    });
    try {
      const legacyTokenSession = await api(serverWithRotatedSecrets.baseUrl, "/api/auth/me", {
        token: legacyToken,
      });
      assert.equal(legacyTokenSession.status, 200);
      assert.equal(legacyTokenSession.data.email, "admin@afriserve.local");
    } finally {
      await serverWithRotatedSecrets.stop();
    }

    const serverWithoutLegacySecret = await startServer({
      envOverrides: {
        DB_PATH: dbPath,
        JWT_SECRET: currentSecret,
        JWT_SECRETS: currentSecret,
      },
    });
    try {
      const legacyTokenSession = await api(serverWithoutLegacySecret.baseUrl, "/api/auth/me", {
        token: legacyToken,
      });
      assert.equal(legacyTokenSession.status, 401);
    } finally {
      await serverWithoutLegacySecret.stop();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("audit_logs table is append-only via database triggers", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-audit-immutability-"));
  const dbPath = path.join(tempRoot, "audit.db");
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    assert.ok(adminToken);
  } finally {
    await stop();
  }

  try {
    const db = new Database(dbPath);
    try {
      const row = db.prepare("SELECT id FROM audit_logs ORDER BY id ASC LIMIT 1").get();
      assert.ok(row && Number.isInteger(Number(row.id)));

      assert.throws(
        () => db.prepare("UPDATE audit_logs SET action = ? WHERE id = ?").run("tampered.action", row.id),
        /append-only/i,
      );

      assert.throws(
        () => db.prepare("DELETE FROM audit_logs WHERE id = ?").run(row.id),
        /append-only/i,
      );
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("refresh endpoint issues a token for active sessions and rejects revoked sessions", async () => {
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
    const activeToken = login.data.token;

    const refresh = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      body: {
        token: activeToken,
      },
    });
    assert.equal(refresh.status, 200);
    assert.equal(typeof refresh.data.token, "string");

    const meWithRefreshedToken = await api(baseUrl, "/api/auth/me", {
      token: refresh.data.token,
    });
    assert.equal(meWithRefreshedToken.status, 200);

    const logout = await api(baseUrl, "/api/auth/logout", {
      method: "POST",
      token: activeToken,
    });
    assert.equal(logout.status, 200);

    const refreshWithRevokedToken = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      body: {
        token: activeToken,
      },
    });
    assert.equal(refreshWithRevokedToken.status, 401);
  } finally {
    await stop();
  }
});

test("refresh tokens cannot authenticate requests and are rejected after first rotation", async () => {
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
    const refreshToken = String(login.data.refreshToken || "");
    assert.ok(refreshToken);

    const meWithRefreshToken = await api(baseUrl, "/api/auth/me", {
      token: refreshToken,
    });
    assert.equal(meWithRefreshToken.status, 401);

    const firstRefresh = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      body: {
        token: refreshToken,
      },
    });
    assert.equal(firstRefresh.status, 200);
    assert.ok(String(firstRefresh.data.refreshToken || "").length > 0);

    const reusedRefresh = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      body: {
        token: refreshToken,
      },
    });
    assert.equal(reusedRefresh.status, 401);

    const secondRefresh = await api(baseUrl, "/api/auth/refresh", {
      method: "POST",
      body: {
        token: firstRefresh.data.refreshToken,
      },
    });
    assert.equal(secondRefresh.status, 200);
  } finally {
    await stop();
  }
});

test("access tokens omit permissions claims while auth responses still expose resolved permissions", async () => {
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

    const payload = JSON.parse(Buffer.from(String(login.data.token).split(".")[1], "base64url").toString("utf8"));
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "permissions"), false);
    assert.ok(Array.isArray(login.data.user?.permissions));
    assert.ok(login.data.user.permissions.length > 0);
  } finally {
    await stop();
  }
});

test("trusted proxy mode records forwarded client IP in audit logs", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-trust-proxy-"));
  const dbPath = path.join(tempRoot, "trust-proxy.db");
  const forwardedIp = "203.0.113.77";
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
      TRUST_PROXY: "true",
    },
  });

  try {
    const login = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      headers: {
        "X-Forwarded-For": forwardedIp,
      },
      body: {
        email: "admin@afriserve.local",
        password: "Admin@123",
      },
    });
    assert.equal(login.status, 200);
  } finally {
    await stop();
  }

  try {
    const db = new Database(dbPath);
    try {
      const auditRow = db.prepare(`
        SELECT ip_address
        FROM audit_logs
        WHERE action = 'auth.login.success'
        ORDER BY id DESC
        LIMIT 1
      `).get();
      assert.ok(auditRow);
      assert.ok(String(auditRow.ip_address || "").includes(forwardedIp));
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("general API limiter applies across authenticated routes", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    let sawRateLimit = false;

    for (let requestIndex = 0; requestIndex < 260; requestIndex += 1) {
      const response = await api(baseUrl, "/api/auth/me", {
        token: adminToken,
      });
      if (response.status === 429) {
        sawRateLimit = true;
        break;
      }
      assert.equal(response.status, 200);
    }

    assert.equal(sawRateLimit, true);
  } finally {
    await stop();
  }
});

test("openapi endpoints are available and include auth refresh contract", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const specResponse = await fetch(`${baseUrl}/api/openapi.json`);
    assert.equal(specResponse.status, 200);
    const spec = await specResponse.json();
    assert.equal(spec.openapi, "3.0.3");
    assert.ok(spec.paths?.["/api/auth/refresh"]);

    const docsResponse = await fetch(`${baseUrl}/api/docs`);
    assert.equal(docsResponse.status, 200);
    const docsHtml = await docsResponse.text();
    assert.ok(docsHtml.includes("swagger-ui-bundle.js"));
  } finally {
    await stop();
  }
});

test("schema migrations are tracked in schema_migrations table", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-schema-migrations-"));
  const dbPath = path.join(tempRoot, "migrations.db");
  const { stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
    },
  });

  try {
    // Startup triggers schema initialization and pending migrations.
  } finally {
    await stop();
  }

  try {
    const db = new Database(dbPath);
    try {
      const schemaMigrationTable = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'schema_migrations'
      `).get();
      assert.ok(schemaMigrationTable);

      const appliedIds = db.prepare("SELECT id FROM schema_migrations ORDER BY id ASC").all().map((row) => row.id);
      assert.ok(appliedIds.includes("20260225_0001_baseline"));
      assert.ok(appliedIds.includes("20260225_0002_audit_log_indexes"));
      assert.ok(appliedIds.includes("20260225_0003_startup_data_fixes"));
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
