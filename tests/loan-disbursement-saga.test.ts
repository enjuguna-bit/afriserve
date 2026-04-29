import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LoanDisbursementSaga } from "../src/application/loan/sagas/LoanDisbursementSaga.js";

class TestEventBus {
  private readonly handlers = new Map<string, Array<(event: Record<string, unknown>) => Promise<void>>>();

  async publish(): Promise<void> {}
  async publishAll(): Promise<void> {}

  subscribe(eventType: string, handler: (event: Record<string, unknown>) => Promise<void>): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  unsubscribe(): void {}

  async emit(eventType: string, event: Record<string, unknown>): Promise<void> {
    for (const handler of this.handlers.get(eventType) || []) {
      await handler(event);
    }
  }
}

describe("LoanDisbursementSaga", () => {
  it("defaults to not auto-disbursing approval events when the flag is omitted", async () => {
    const eventBus = new TestEventBus();
    let disburseCalls = 0;

    const saga = new LoanDisbursementSaga({
      loanLifecycleService: {
        disburseLoan: async () => {
          disburseCalls += 1;
          return { ok: true };
        },
      },
      mobileMoneyService: null,
      publishDomainEvent: async () => 0,
      autoMobileMoney: false,
    });

    saga.register(eventBus as unknown as Parameters<LoanDisbursementSaga["register"]>[0]);
    await eventBus.emit("loan.approved", { aggregateId: 40, eventType: "loan.approved" });

    assert.equal(disburseCalls, 0);
  });

  it("does not auto-disburse approval events when autoDisburseOnApproval is disabled", async () => {
    const eventBus = new TestEventBus();
    let disburseCalls = 0;

    const saga = new LoanDisbursementSaga({
      loanLifecycleService: {
        disburseLoan: async () => {
          disburseCalls += 1;
          return { ok: true };
        },
      },
      mobileMoneyService: null,
      publishDomainEvent: async () => 0,
      autoDisburseOnApproval: false,
      autoMobileMoney: false,
    });

    saga.register(eventBus as unknown as Parameters<LoanDisbursementSaga["register"]>[0]);
    await eventBus.emit("loan.approved", { aggregateId: 41, eventType: "loan.approved" });

    assert.equal(disburseCalls, 0);
  });

  it("auto-disburses approval events when autoDisburseOnApproval is enabled", async () => {
    const eventBus = new TestEventBus();
    let disburseCalls = 0;

    const saga = new LoanDisbursementSaga({
      loanLifecycleService: {
        disburseLoan: async () => {
          disburseCalls += 1;
          return { ok: true };
        },
      },
      mobileMoneyService: null,
      publishDomainEvent: async () => 0,
      autoDisburseOnApproval: true,
      autoMobileMoney: false,
    });

    saga.register(eventBus as unknown as Parameters<LoanDisbursementSaga["register"]>[0]);
    await eventBus.emit("loan.approved", { aggregateId: 42, eventType: "loan.approved" });

    assert.equal(disburseCalls, 1);
  });
});
