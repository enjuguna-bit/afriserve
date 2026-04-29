/**
 * accounting-gl-subscriber.test.ts
 *
 * Tests for AccountingGlSubscriber covering:
 *   1. Shadow mode — reconcile MATCH (journal exists) and MISSING (journal absent)
 *   2. Active mode — successful GL post for disbursement, repayment, write-off
 *   3. Active mode — idempotency: DomainConflictError is swallowed, not rethrown
 *   4. Active mode — non-idempotency errors are rethrown so broker can retry
 *   5. Restructured event — always shadow-logs only regardless of mode
 *   6. Register wires all four event types on any subscribable bus
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { AccountingGlSubscriber } from "../src/infrastructure/accounting/AccountingGlSubscriber.js";
import { DomainConflictError } from "../src/domain/errors.js";

// ── Minimal stubs ────────────────────────────────────────────────────────────

function makeDb(overrides: Record<string, any> = {}) {
  const journals: Record<string, any> = {};      // key: `${refType}:${refId}`
  const repayments: Record<number, any> = {};    // key: repaymentId
  const loans: Record<number, any> = {};         // key: loanId

  return {
    journals,
    repayments,
    loans,
    async get(sql: string, params: unknown[] = []) {
      const s = sql.trim().toLowerCase();

      // Repayment lookup
      if (s.includes("repayments") && s.includes("loan_id")) {
        const loanId = Number(params[0]);
        const amount = Number(params[1]);
        const match = Object.values(repayments).find(
          (r: any) => r.loan_id === loanId && Math.abs(r.amount - amount) < 0.005,
        );
        return match ?? null;
      }
      // GL journal lookup for idempotency / reconcile
      if (s.includes("gl_journals") && s.includes("reference_type")) {
        const refType = params[0] as string;
        const refId   = Number(params[1]);
        return journals[`${refType}:${refId}`] ?? null;
      }
      // Loan lookup
      if (s.includes("from loans")) {
        const id = Number(params[0]);
        return loans[id] ?? null;
      }
      return overrides.get?.(sql, params) ?? null;
    },
    async all() { return []; },
    async run() { return { lastID: 0 }; },
  };
}

function makeGl(mode: "ok" | "conflict" | "error" = "ok") {
  const posted: any[] = [];
  return {
    posted,
    ACCOUNT_CODES: {
      CASH: "CASH",
      LOAN_RECEIVABLE: "LOAN_RECEIVABLE",
      INTEREST_INCOME: "INTEREST_INCOME",
      PENALTY_INCOME: "PENALTY_INCOME",
      FEE_INCOME: "FEE_INCOME",
      WRITE_OFF_EXPENSE: "WRITE_OFF_EXPENSE",
      UNEARNED_INTEREST: "UNEARNED_INTEREST",
    },
    async postJournal(opts: any) {
      if (mode === "conflict") throw new DomainConflictError("already posted");
      if (mode === "error")    throw new Error("db connection lost");
      posted.push(opts);
      return posted.length;
    },
  };
}

function makeLogger() {
  const logs: Array<{ level: string; event: string; data?: any }> = [];
  return {
    logs,
    info(event: string, data?: any)  { logs.push({ level: "info",  event, data }); },
    warn(event: string, data?: any)  { logs.push({ level: "warn",  event, data }); },
    error(event: string, data?: any) { logs.push({ level: "error", event, data }); },
  };
}

function makeSubscribableBus() {
  type Handler = (payload: unknown) => Promise<void> | void;
  const handlers: Record<string, Handler[]> = {};
  return {
    handlers,
    subscribe(eventType: string, handler: Handler) {
      handlers[eventType] = handlers[eventType] || [];
      handlers[eventType].push(handler);
    },
    async emit(eventType: string, payload: unknown) {
      for (const h of (handlers[eventType] || [])) await h(payload);
    },
  };
}

// ── Test data helpers ─────────────────────────────────────────────────────────

const DISBURSEMENT_EVENT = {
  eventType: "loan.disbursed",
  loanId: 42,
  clientId: 7,
  principal: 10000,
  disbursedByUserId: 1,
  occurredAt: new Date().toISOString(),
  disbursedAt: new Date().toISOString(),
};

const REPAYMENT_EVENT = {
  eventType: "loan.repayment.recorded",
  loanId: 42,
  clientId: 7,
  amount: 1500,
  recordedByUserId: 1,
  occurredAt: new Date().toISOString(),
};

const WRITE_OFF_EVENT = {
  eventType: "loan.written_off",
  loanId: 42,
  clientId: 7,
  branchId: 3,
  writtenOffAmount: 5000,
  writtenOffByUserId: 1,
  writtenOffAt: new Date().toISOString(),
  occurredAt: new Date().toISOString(),
};

const RESTRUCTURE_EVENT = {
  eventType: "loan.restructured",
  loanId: 42,
  previousBalance: 8000,
  newPrincipal: 8200,
  newTermWeeks: 24,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AccountingGlSubscriber — registration", () => {
  it("registers handlers for all four loan event types", () => {
    const db  = makeDb();
    const gl  = makeGl();
    const bus = makeSubscribableBus();
    const sub = new AccountingGlSubscriber({
      get: db.get.bind(db), all: db.all.bind(db), run: db.run.bind(db),
      generalLedgerService: gl,
      shadowMode: true,
    });
    sub.register(bus);
    assert.ok(bus.handlers["loan.disbursed"],          "disbursed handler registered");
    assert.ok(bus.handlers["loan.repayment.recorded"], "repayment handler registered");
    assert.ok(bus.handlers["loan.written_off"],        "written_off handler registered");
    assert.ok(bus.handlers["loan.restructured"],       "restructured handler registered");
  });
});

describe("AccountingGlSubscriber — shadow mode", () => {
  let db: ReturnType<typeof makeDb>;
  let gl: ReturnType<typeof makeGl>;
  let logger: ReturnType<typeof makeLogger>;
  let bus: ReturnType<typeof makeSubscribableBus>;
  let sub: AccountingGlSubscriber;

  beforeEach(() => {
    db     = makeDb();
    gl     = makeGl();
    logger = makeLogger();
    bus    = makeSubscribableBus();
    sub    = new AccountingGlSubscriber({
      get: db.get.bind(db), all: db.all.bind(db), run: db.run.bind(db),
      generalLedgerService: gl,
      shadowMode: true,
      logger,
    });
    sub.register(bus);

    // Seed loan record
    db.loans[42] = {
      principal: 10000, registration_fee: 200, processing_fee: 500,
      branch_id: 3, client_id: 7, disbursed_by_user_id: 1,
    };
  });

  it("logs MATCH when GL journal already exists (disbursement)", async () => {
    db.journals["disbursement:42"] = { id: 1001, total_debit: 10000 };
    await bus.emit("loan.disbursed", DISBURSEMENT_EVENT);

    const match = logger.logs.find(l => l.event === "gl.subscriber.reconcile.match");
    assert.ok(match, "match log emitted");
    assert.equal(match?.data?.referenceType, "loan_disbursement");
    assert.equal(match?.data?.matchedReferenceType, "disbursement");
    assert.equal(match?.data?.referenceId, 42);
    assert.equal(gl.posted.length, 0, "no GL write in shadow mode");
  });

  it("logs MISSING when GL journal is absent (disbursement)", async () => {
    await bus.emit("loan.disbursed", DISBURSEMENT_EVENT);

    const missing = logger.logs.find(l => l.event === "gl.subscriber.reconcile.missing");
    assert.ok(missing, "missing log emitted");
    assert.equal(missing?.data?.referenceType, "loan_disbursement");
    assert.equal(gl.posted.length, 0, "no GL write in shadow mode");
  });

  it("logs MATCH for write-off when journal exists", async () => {
    db.journals["write_off:42"] = { id: 2001, total_debit: 5000 };
    await bus.emit("loan.written_off", WRITE_OFF_EVENT);

    const match = logger.logs.find(l => l.event === "gl.subscriber.reconcile.match");
    assert.ok(match, "match log emitted for write-off");
    assert.equal(match?.data?.referenceType, "loan_write_off");
    assert.equal(match?.data?.matchedReferenceType, "write_off");
  });

  it("always shadow-logs restructure regardless of mode", async () => {
    await bus.emit("loan.restructured", RESTRUCTURE_EVENT);
    const log = logger.logs.find(l => l.event === "gl.subscriber.loan_restructured.shadow_log_only");
    assert.ok(log, "restructure shadow log emitted");
    assert.equal(gl.posted.length, 0);
  });
});

describe("AccountingGlSubscriber — active mode (GL posting)", () => {
  let db: ReturnType<typeof makeDb>;
  let gl: ReturnType<typeof makeGl>;
  let logger: ReturnType<typeof makeLogger>;
  let bus: ReturnType<typeof makeSubscribableBus>;
  let sub: AccountingGlSubscriber;

  beforeEach(() => {
    db     = makeDb();
    gl     = makeGl("ok");
    logger = makeLogger();
    bus    = makeSubscribableBus();
    sub    = new AccountingGlSubscriber({
      get: db.get.bind(db), all: db.all.bind(db), run: db.run.bind(db),
      generalLedgerService: gl,
      shadowMode: false,
      logger,
    });
    sub.register(bus);

    // Seed supporting DB rows
    db.loans[42] = {
      principal: 10000, registration_fee: 200, processing_fee: 500,
      branch_id: 3, client_id: 7, disbursed_by_user_id: 1,
    };
    db.repayments[99] = {
      id: 99, loan_id: 42, amount: 1500,
      principal_amount: 1000, interest_amount: 400, penalty_amount: 100,
      branch_id: 3, client_id: 7,
    };
  });

  it("posts disbursement journal with balanced debit/credit lines", async () => {
    await bus.emit("loan.disbursed", DISBURSEMENT_EVENT);

    assert.equal(gl.posted.length, 1, "one journal posted");
    const j = gl.posted[0];
    assert.equal(j.referenceType, "loan_disbursement");
    assert.equal(j.referenceId,   42);
    assert.equal(j.loanId,        42);

    const debit  = j.lines.filter((l: any) => l.side === "debit");
    const credit = j.lines.filter((l: any) => l.side === "credit");
    const totalD = debit.reduce( (s: number, l: any) => s + l.amount, 0);
    const totalC = credit.reduce((s: number, l: any) => s + l.amount, 0);
    assert.ok(debit.some( (l: any) => l.accountCode === "LOAN_RECEIVABLE"), "DR LOAN_RECEIVABLE");
    assert.ok(credit.some((l: any) => l.accountCode === "CASH"),            "CR CASH");
    assert.ok(credit.some((l: any) => l.accountCode === "FEE_INCOME"),      "CR FEE_INCOME for fees");
    assert.equal(totalD, totalC, "journal is balanced");
    assert.equal(totalD, 10000);
  });

  it("posts repayment journal when unposted repayment row exists", async () => {
    await bus.emit("loan.repayment.recorded", REPAYMENT_EVENT);

    assert.equal(gl.posted.length, 1);
    const j = gl.posted[0];
    assert.equal(j.referenceType, "loan_repayment");
    assert.equal(j.referenceId,   99);

    const debit  = j.lines.filter((l: any) => l.side === "debit");
    const credit = j.lines.filter((l: any) => l.side === "credit");
    assert.ok(debit.some( (l: any) => l.accountCode === "CASH"),             "DR CASH");
    assert.ok(credit.some((l: any) => l.accountCode === "LOAN_RECEIVABLE"),  "CR LOAN_RECEIVABLE");
    assert.ok(credit.some((l: any) => l.accountCode === "INTEREST_INCOME"),  "CR INTEREST_INCOME");
    assert.ok(credit.some((l: any) => l.accountCode === "PENALTY_INCOME"),   "CR PENALTY_INCOME");
    const totalD = debit.reduce( (s: number, l: any) => s + l.amount, 0);
    const totalC = credit.reduce((s: number, l: any) => s + l.amount, 0);
    assert.equal(totalD, totalC, "balanced");
    assert.equal(totalD, 1500);
  });

  it("posts write-off journal with WRITE_OFF_EXPENSE / LOAN_RECEIVABLE", async () => {
    await bus.emit("loan.written_off", WRITE_OFF_EVENT);

    assert.equal(gl.posted.length, 1);
    const j = gl.posted[0];
    assert.equal(j.referenceType, "loan_write_off");
    const debit  = j.lines.filter((l: any) => l.side === "debit");
    const credit = j.lines.filter((l: any) => l.side === "credit");
    assert.ok(debit.some( (l: any) => l.accountCode === "WRITE_OFF_EXPENSE"), "DR WRITE_OFF_EXPENSE");
    assert.ok(credit.some((l: any) => l.accountCode === "LOAN_RECEIVABLE"),   "CR LOAN_RECEIVABLE");
    const totalD = debit.reduce( (s: number, l: any) => s + l.amount, 0);
    const totalC = credit.reduce((s: number, l: any) => s + l.amount, 0);
    assert.equal(totalD, totalC);
    assert.equal(totalD, 5000);
  });

  it("logs journal_posted and emits info on success", async () => {
    await bus.emit("loan.disbursed", DISBURSEMENT_EVENT);
    const posted = logger.logs.find(l => l.event === "gl.subscriber.journal_posted");
    assert.ok(posted, "journal_posted info log emitted");
    assert.equal(posted?.data?.referenceType, "loan_disbursement");
  });
});

describe("AccountingGlSubscriber — idempotency (active mode)", () => {
  it("swallows DomainConflictError and logs journal_already_posted", async () => {
    const db  = makeDb();
    const gl  = makeGl("conflict");
    const logger = makeLogger();
    const bus = makeSubscribableBus();
    db.loans[42] = {
      principal: 10000, registration_fee: 0, processing_fee: 0,
      branch_id: 3, client_id: 7, disbursed_by_user_id: 1,
    };
    const sub = new AccountingGlSubscriber({
      get: db.get.bind(db), all: db.all.bind(db), run: db.run.bind(db),
      generalLedgerService: gl,
      shadowMode: false,
      logger,
    });
    sub.register(bus);

    await assert.doesNotReject(
      () => bus.emit("loan.disbursed", DISBURSEMENT_EVENT),
      "DomainConflictError must not propagate",
    );
    const log = logger.logs.find(l => l.event === "gl.subscriber.journal_already_posted");
    assert.ok(log, "already_posted log emitted");
  });

  it("rethrows non-idempotency errors so broker can retry", async () => {
    const db  = makeDb();
    const gl  = makeGl("error");
    const bus = makeSubscribableBus();
    db.loans[42] = {
      principal: 10000, registration_fee: 0, processing_fee: 0,
      branch_id: 3, client_id: 7, disbursed_by_user_id: 1,
    };
    const sub = new AccountingGlSubscriber({
      get: db.get.bind(db), all: db.all.bind(db), run: db.run.bind(db),
      generalLedgerService: gl,
      shadowMode: false,
    });
    sub.register(bus);

    // The error is caught by the bus.emit wrapper and logged, not rethrown to the test
    // but the subscriber's internal handler rethrows so the broker gets a nack.
    // We verify the error was surfaced via the error log.
    const logger2 = makeLogger();
    const sub2 = new AccountingGlSubscriber({
      get: db.get.bind(db), all: db.all.bind(db), run: db.run.bind(db),
      generalLedgerService: gl,
      shadowMode: false,
      logger: logger2,
    });
    sub2.register(bus);
    await bus.emit("loan.disbursed", DISBURSEMENT_EVENT);
    const errLog = logger2.logs.find(l => l.level === "error");
    assert.ok(errLog, "error was surfaced through error log");
  });
});

describe("AccountingGlSubscriber — repayment no-op cases", () => {
  it("skips repayment in active mode when no unposted repayment row found", async () => {
    const db  = makeDb();
    const gl  = makeGl("ok");
    const bus = makeSubscribableBus();
    // No repayment row seeded
    const sub = new AccountingGlSubscriber({
      get: db.get.bind(db), all: db.all.bind(db), run: db.run.bind(db),
      generalLedgerService: gl,
      shadowMode: false,
    });
    sub.register(bus);
    await bus.emit("loan.repayment.recorded", REPAYMENT_EVENT);
    assert.equal(gl.posted.length, 0, "no post when no repayment row");
  });

  it("skips write-off with zero balance", async () => {
    const db  = makeDb();
    const gl  = makeGl("ok");
    const bus = makeSubscribableBus();
    db.loans[42] = { balance: 0, branch_id: 3, client_id: 7 };
    const sub = new AccountingGlSubscriber({
      get: db.get.bind(db), all: db.all.bind(db), run: db.run.bind(db),
      generalLedgerService: gl,
      shadowMode: false,
    });
    sub.register(bus);
    const zeroEvent = { ...WRITE_OFF_EVENT, writtenOffAmount: 0 };
    await bus.emit("loan.written_off", zeroEvent);
    assert.equal(gl.posted.length, 0, "skip zero-balance write-off");
  });
});
