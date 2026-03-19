/**
 * tests/tenant-routes.test.ts
 *
 * Integration tests for the tenant management API endpoints:
 *   GET    /api/admin/tenants
 *   GET    /api/admin/tenants/:id
 *   POST   /api/admin/tenants
 *   PATCH  /api/admin/tenants/:id
 *
 * Uses a real in-memory SQLite database and a lightweight Express app that
 * mirrors the production route registration without auth/rate-limit overhead.
 * Requests are made directly via the Node http client so no test library is needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import Database from "better-sqlite3";
import { registerTenantRoutes } from "../src/routes/tenantRoutes.js";

// ── HTTP helper ──────────────────────────────────────────────────────────────

type HttpResult = {
  status: number;
  body: Record<string, unknown>;
};

function httpRequest(
  base: string,
  path: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const url = new URL(path, base);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── In-memory harness ────────────────────────────────────────────────────────

function openTestDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      ip_address TEXT,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO tenants (id, name, status, created_at, updated_at)
      VALUES ('default', 'Default Tenant', 'active', datetime('now'), datetime('now'));
    INSERT INTO tenants (id, name, status, created_at, updated_at)
      VALUES ('acme_corp', 'Acme Corp', 'active', datetime('now'), datetime('now'));
    INSERT INTO tenants (id, name, status, created_at, updated_at)
      VALUES ('suspended_co', 'Suspended Co', 'suspended', datetime('now'), datetime('now'));
  `);
  return db;
}

function buildDbHelpers(db: Database.Database) {
  const run = async (sql: string, params: unknown[] = []) => { db.prepare(sql).run(...(params as any[])); return {}; };
  const get = async (sql: string, params: unknown[] = []) => db.prepare(sql).get(...(params as any[])) as Record<string, unknown> | undefined;
  const all = async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as any[])) as Array<Record<string, unknown>>;
  return { run, get, all };
}

async function startTestServer(db: Database.Database): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());

  const helpers = buildDbHelpers(db);
  const authenticate = (_req: any, _res: any, next: any) => { _req.user = { sub: 1, id: 1, role: "admin" }; next(); };
  const authorize = (..._roles: string[]) => (_req: any, _res: any, next: any) => next();
  const writeAuditLog = async () => {};

  registerTenantRoutes(app as any, { ...helpers, authenticate, authorize, writeAuditLog });

  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      const base = `http://127.0.0.1:${address.port}`;
      resolve({
        base,
        close: () => new Promise((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
    server.on("error", reject);
  });
}

// ── GET /api/admin/tenants ────────────────────────────────────────────────────

test("GET /api/admin/tenants returns all tenants ordered by id", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants", "GET");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.total, 3);
    const ids = (body.data as Array<{ id: string }>).map((t) => t.id);
    assert.equal(ids[0], "acme_corp", "First result should be 'acme_corp' (alpha order)");
    assert.equal(ids[1], "default");
  } finally {
    await close();
    db.close();
  }
});

test("GET /api/admin/tenants returns correct fields for each tenant", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { body } = await httpRequest(base, "/api/admin/tenants", "GET");
    const tenant = (body.data as Array<Record<string, unknown>>).find((t) => t.id === "acme_corp");
    assert.ok(tenant);
    assert.equal(tenant.name, "Acme Corp");
    assert.equal(tenant.status, "active");
    assert.equal(typeof tenant.created_at, "string");
  } finally {
    await close();
    db.close();
  }
});

// ── GET /api/admin/tenants/:id ────────────────────────────────────────────────

test("GET /api/admin/tenants/:id returns a single tenant", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants/acme_corp", "GET");
    assert.equal(status, 200);
    const tenant = body.tenant as Record<string, unknown>;
    assert.equal(tenant.id, "acme_corp");
    assert.equal(tenant.name, "Acme Corp");
  } finally {
    await close();
    db.close();
  }
});

test("GET /api/admin/tenants/:id returns 404 for non-existent tenant", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants/does_not_exist", "GET");
    assert.equal(status, 404);
  } finally {
    await close();
    db.close();
  }
});

test("GET /api/admin/tenants/:id returns 400 for invalid format", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    // Spaces in the path segment are encoded as %20 by browsers — we test the raw case
    const { status } = await httpRequest(base, "/api/admin/tenants/bad%20id", "GET");
    assert.equal(status, 400);
  } finally {
    await close();
    db.close();
  }
});

// ── POST /api/admin/tenants ───────────────────────────────────────────────────

test("POST /api/admin/tenants creates a new tenant and returns 201", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants", "POST",
      { id: "new_tenant", name: "New Tenant Inc" });
    assert.equal(status, 201);
    const tenant = body.tenant as Record<string, unknown>;
    assert.equal(tenant.id, "new_tenant");
    assert.equal(tenant.name, "New Tenant Inc");
    assert.equal(tenant.status, "active");
    // Verify it actually persisted
    const row = db.prepare("SELECT id FROM tenants WHERE id = 'new_tenant'").get();
    assert.ok(row, "Tenant should be in the database");
  } finally {
    await close();
    db.close();
  }
});

test("POST /api/admin/tenants returns 409 for existing tenant ID", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants", "POST",
      { id: "acme_corp", name: "Duplicate" });
    assert.equal(status, 409);
    assert.ok((body.message as string).toLowerCase().includes("already exists"));
  } finally {
    await close();
    db.close();
  }
});

test("POST /api/admin/tenants rejects reserved 'default' ID", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants", "POST",
      { id: "default", name: "Cannot create" });
    assert.equal(status, 409);
    assert.ok((body.message as string).toLowerCase().includes("reserved"));
  } finally {
    await close();
    db.close();
  }
});

test("POST /api/admin/tenants returns 400 for missing ID", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants", "POST", { name: "No ID" });
    assert.equal(status, 400);
  } finally {
    await close();
    db.close();
  }
});

test("POST /api/admin/tenants returns 400 for invalid tenant ID characters", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants", "POST",
      { id: "has spaces!", name: "Bad ID" });
    assert.equal(status, 400);
  } finally {
    await close();
    db.close();
  }
});

test("POST /api/admin/tenants returns 400 for single-char ID (min is 2)", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants", "POST",
      { id: "x", name: "Too Short" });
    assert.equal(status, 400);
  } finally {
    await close();
    db.close();
  }
});

test("POST /api/admin/tenants returns 400 for missing name", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants", "POST", { id: "valid_id" });
    assert.equal(status, 400);
  } finally {
    await close();
    db.close();
  }
});

test("POST /api/admin/tenants returns 400 for single-char name (min is 2)", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants", "POST",
      { id: "valid_id", name: "X" });
    assert.equal(status, 400);
  } finally {
    await close();
    db.close();
  }
});

// ── PATCH /api/admin/tenants/:id ──────────────────────────────────────────────

test("PATCH /api/admin/tenants/:id updates tenant name", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants/acme_corp", "PATCH",
      { name: "Acme Corporation" });
    assert.equal(status, 200);
    assert.equal((body.tenant as Record<string, unknown>).name, "Acme Corporation");
    const row = db.prepare("SELECT name FROM tenants WHERE id = 'acme_corp'").get() as { name: string };
    assert.equal(row.name, "Acme Corporation");
  } finally {
    await close();
    db.close();
  }
});

test("PATCH /api/admin/tenants/:id suspends an active tenant", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants/acme_corp", "PATCH",
      { status: "suspended" });
    assert.equal(status, 200);
    assert.equal((body.tenant as Record<string, unknown>).status, "suspended");
  } finally {
    await close();
    db.close();
  }
});

test("PATCH /api/admin/tenants/:id reactivates a suspended tenant", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants/suspended_co", "PATCH",
      { status: "active" });
    assert.equal(status, 200);
    assert.equal((body.tenant as Record<string, unknown>).status, "active");
  } finally {
    await close();
    db.close();
  }
});

test("PATCH /api/admin/tenants/:id deactivates a tenant", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants/acme_corp", "PATCH",
      { status: "deactivated" });
    assert.equal(status, 200);
    assert.equal((body.tenant as Record<string, unknown>).status, "deactivated");
  } finally {
    await close();
    db.close();
  }
});

test("PATCH /api/admin/tenants/:id cannot suspend the 'default' tenant", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants/default", "PATCH",
      { status: "suspended" });
    assert.equal(status, 409);
  } finally {
    await close();
    db.close();
  }
});

test("PATCH /api/admin/tenants/:id cannot deactivate the 'default' tenant", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants/default", "PATCH",
      { status: "deactivated" });
    assert.equal(status, 409);
  } finally {
    await close();
    db.close();
  }
});

test("PATCH /api/admin/tenants/:id returns 200 with no-change message when values are identical", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status, body } = await httpRequest(base, "/api/admin/tenants/acme_corp", "PATCH",
      { name: "Acme Corp", status: "active" });
    assert.equal(status, 200);
    assert.ok((body.message as string).toLowerCase().includes("no changes"));
  } finally {
    await close();
    db.close();
  }
});

test("PATCH /api/admin/tenants/:id returns 404 for non-existent tenant", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants/phantom_tenant", "PATCH",
      { name: "Ghost" });
    assert.equal(status, 404);
  } finally {
    await close();
    db.close();
  }
});

test("PATCH /api/admin/tenants/:id returns 400 for invalid status value", async () => {
  const db = openTestDb();
  const { base, close } = await startTestServer(db);
  try {
    const { status } = await httpRequest(base, "/api/admin/tenants/acme_corp", "PATCH",
      { status: "banana" });
    assert.equal(status, 400);
  } finally {
    await close();
    db.close();
  }
});
