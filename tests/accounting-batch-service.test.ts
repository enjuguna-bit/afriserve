import test from "node:test";
import assert from "node:assert/strict";
import { createAccountingBatchService } from "../src/services/accountingBatchService.js";

type HarnessOptions = {
  failSnapshotOnce?: boolean;
};

function normalizeSql(sql: string): string {
  return String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function createBatchHarness(options: HarnessOptions = {}) {
  let accountingBatch: { id: number; status: string } | null = null;
  let latestBatchRun: { id: number; status: string; summaryJson: string | null } | null = null;
  let nextBatchRunId = 100;
  let failSnapshotOnce = Boolean(options.failSnapshotOnce);
  let accountingBatchInsertCount = 0;
  const accountingBatchStatusUpdates: string[] = [];

  function currentAccountingBatchRow() {
    return accountingBatch
      ? { id: accountingBatch.id, status: accountingBatch.status }
      : null;
  }

  async function get(sql: string) {
    const normalized = normalizeSql(sql);

    if (normalized.includes("from gl_batch_runs")) {
      return latestBatchRun
        ? {
          id: latestBatchRun.id,
          status: latestBatchRun.status,
          summary_json: latestBatchRun.summaryJson,
        }
        : null;
    }

    if (normalized.includes("from gl_accounting_batches")) {
      return currentAccountingBatchRow();
    }

    return null;
  }

  async function all() {
    return [];
  }

  async function run(sql: string) {
    const normalized = normalizeSql(sql);

    if (normalized.includes("insert into gl_batch_runs")) {
      latestBatchRun = {
        id: nextBatchRunId,
        status: "running",
        summaryJson: null,
      };
      nextBatchRunId += 1;
      return { changes: 1, lastID: latestBatchRun.id };
    }

    return { changes: 1, lastID: 1 };
  }

  async function executeTransaction(
    callback: (tx: {
      run: (sql: string, params?: unknown[]) => Promise<{ changes?: number; lastID?: number }>;
      get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null>;
      all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
    }) => Promise<unknown>,
  ) {
    const tx = {
      async run(sql: string, params: unknown[] = []) {
        const normalized = normalizeSql(sql);

        if (normalized.includes("insert into gl_accounting_batches")) {
          accountingBatch = {
            id: 7,
            status: "processing",
          };
          accountingBatchInsertCount += 1;
          return { changes: 1, lastID: accountingBatch.id };
        }

        if (normalized.includes("update gl_accounting_batches")) {
          assert.ok(accountingBatch, "Expected an accounting batch row before updating it");
          if (normalized.includes("status = 'processing'")) {
            accountingBatch.status = "processing";
            accountingBatchStatusUpdates.push("processing");
          } else if (normalized.includes("status = 'completed'")) {
            accountingBatch.status = "completed";
            accountingBatchStatusUpdates.push("completed");
          } else if (normalized.includes("status = 'failed'")) {
            accountingBatch.status = "failed";
            accountingBatchStatusUpdates.push("failed");
          }
          return { changes: 1, lastID: accountingBatch.id };
        }

        if (normalized.includes("update gl_batch_runs")) {
          assert.ok(latestBatchRun, "Expected a GL batch run before updating it");
          if (normalized.includes("status = 'completed'")) {
            latestBatchRun.status = "completed";
            latestBatchRun.summaryJson = String(params[1] || "");
          } else if (normalized.includes("status = 'failed'")) {
            latestBatchRun.status = "failed";
          }
          return { changes: 1, lastID: latestBatchRun.id };
        }

        if (normalized.includes("select id from gl_period_locks")) {
          return { changes: 0, lastID: 0 };
        }

        if (normalized.includes("insert into gl_period_locks")) {
          if (failSnapshotOnce) {
            failSnapshotOnce = false;
            throw new Error("simulated snapshot failure");
          }
          return { changes: 1, lastID: 1 };
        }

        if (
          normalized.includes("delete from gl_balance_snapshots")
          || normalized.includes("delete from gl_trial_balance_snapshots")
          || normalized.includes("insert into gl_balance_snapshots")
          || normalized.includes("insert into gl_trial_balance_snapshots")
        ) {
          return { changes: 1, lastID: 1 };
        }

        return { changes: 1, lastID: 1 };
      },

      async get(sql: string) {
        const normalized = normalizeSql(sql);

        if (normalized.includes("from gl_accounting_batches")) {
          return currentAccountingBatchRow();
        }

        if (normalized.includes("from gl_period_locks")) {
          return null;
        }

        if (normalized.includes("as total_debit")) {
          return {
            total_debit: 0,
            total_credit: 0,
            row_count: 0,
          };
        }

        return null;
      },

      async all() {
        return [];
      },
    };

    return callback(tx);
  }

  return {
    service: createAccountingBatchService({
      get,
      all,
      run,
      executeTransaction,
      logger: null,
      metrics: null,
    }),
    getState() {
      return {
        accountingBatch,
        latestBatchRun,
        accountingBatchInsertCount,
        accountingBatchStatusUpdates: [...accountingBatchStatusUpdates],
      };
    },
  };
}

test("accounting batch service marks gl_accounting_batches completed after a successful run", async () => {
  const harness = createBatchHarness();

  const result = await harness.service.runBatch({
    batchType: "eom",
    effectiveDate: "2026-03-19",
    note: "month-end close",
  });

  const state = harness.getState();
  assert.equal(result.status, "completed");
  assert.equal(state.accountingBatch?.status, "completed");
  assert.equal(state.accountingBatchInsertCount, 1);
  assert.ok(state.accountingBatchStatusUpdates.includes("completed"));
});

test("accounting batch service reuses a failed gl_accounting_batches row on retry", async () => {
  const harness = createBatchHarness({ failSnapshotOnce: true });

  await assert.rejects(
    harness.service.runBatch({
      batchType: "eom",
      effectiveDate: "2026-03-19",
      note: "month-end close",
    }),
    /simulated snapshot failure/,
  );

  let state = harness.getState();
  assert.equal(state.accountingBatch?.status, "failed");
  assert.equal(state.accountingBatchInsertCount, 1);
  assert.ok(state.accountingBatchStatusUpdates.includes("failed"));

  const retryResult = await harness.service.runBatch({
    batchType: "eom",
    effectiveDate: "2026-03-19",
    note: "month-end close",
  });

  state = harness.getState();
  assert.equal(retryResult.status, "completed");
  assert.equal(state.accountingBatch?.status, "completed");
  assert.equal(state.accountingBatchInsertCount, 1);
  assert.ok(state.accountingBatchStatusUpdates.includes("processing"));
  assert.ok(state.accountingBatchStatusUpdates.includes("completed"));
});
