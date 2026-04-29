import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { api, loginAsAdmin, startServer } from "./integration-helpers.js";
import { SqliteLoanRepository } from "../src/infrastructure/repositories/SqliteLoanRepository.js";
import { ApproveLoanHandler } from "../src/application/loan/handlers/ApproveLoanHandler.js";
import { runWithTenant } from "../src/utils/tenantStore.js";

function createSqliteAdapters(database: Database.Database) {
  const get = async (sql: string, params: unknown[] = []) => {
    const row = database.prepare(sql).get(...params);
    return (row as Record<string, unknown> | undefined) ?? null;
  };

  const all = async (sql: string, params: unknown[] = []) => {
    return database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  };

  const run = async (sql: string, params: unknown[] = []) => {
    const result = database.prepare(sql).run(...params);
    return {
      lastID: Number(result.lastInsertRowid || 0),
      changes: Number(result.changes || 0),
    };
  };

  const executeTransaction = async <T>(callback: (tx: { get: typeof get; all: typeof all; run: typeof run }) => Promise<T>) => {
    database.prepare("BEGIN IMMEDIATE").run();
    try {
      const tx = { get, all, run };
      const result = await callback(tx);
      database.prepare("COMMIT").run();
      return result;
    } catch (error) {
      try {
        database.prepare("ROLLBACK").run();
      } catch {
        // Best effort rollback for failed test transactions.
      }
      throw error;
    }
  };

  return {
    get,
    all,
    run,
    executeTransaction,
  };
}

test("ApproveLoanHandler persists approval state and publishes the LoanApproved event through the sqlite repository", async () => {
  const { baseUrl, stop, dbFilePath } = await startServer();

  let database: Database.Database | null = null;
  try {
    const adminToken = await loginAsAdmin(baseUrl);

    const createClient = await api(baseUrl, "/api/clients", {
      method: "POST",
      token: adminToken,
      body: {
        fullName: "CQRS Approval Client",
        phone: "+254700003103",
      },
    });
    assert.equal(createClient.status, 201);

    const createLoan = await api(baseUrl, "/api/loans", {
      method: "POST",
      token: adminToken,
      body: {
        clientId: Number(createClient.data?.id),
        principal: 3200,
        termWeeks: 10,
        purpose: "Working capital",
      },
    });
    assert.equal(createLoan.status, 201);

    assert.ok(dbFilePath, "Expected sqlite database path for test verification");
    database = new Database(dbFilePath);
    const adapters = createSqliteAdapters(database);
    const loanRepository = new SqliteLoanRepository(adapters);
    const publishedEventTypes: string[] = [];

    const handler = new ApproveLoanHandler(loanRepository, {
      publish: async () => undefined,
      publishAll: async (events) => {
        for (const event of events) {
          publishedEventTypes.push(String(event.eventType || ""));
        }
      },
      subscribe: () => undefined,
      unsubscribe: () => undefined,
    });

    const loanId = Number(createLoan.data?.id || 0);
    await runWithTenant("default", async () => {
      await handler.handle({
        loanId,
        approvedByUserId: 1,
        approvedByRole: "admin",
      });
    });

    const approvedLoanRow = database.prepare(`
      SELECT status, approved_by_user_id
      FROM loans
      WHERE id = ?
      LIMIT 1
    `).get(loanId) as Record<string, unknown> | undefined;

    assert.equal(String(approvedLoanRow?.status || ""), "approved");
    assert.equal(Number(approvedLoanRow?.approved_by_user_id || 0), 1);
    assert.ok(publishedEventTypes.includes("loan.approved"));
  } finally {
    database?.close();
    await stop();
  }
});
