import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApproveLoanHandler } from "../src/application/loan/handlers/ApproveLoanHandler.js";
import { LoanNotFoundError } from "../src/domain/errors.js";

describe("ApproveLoanHandler", () => {
  it("throws LoanNotFoundError when the loan does not exist", async () => {
    const handler = new ApproveLoanHandler(
      {
        save: async () => undefined,
        findById: async () => null,
        exists: async () => false,
        findByClientId: async () => [],
        findByBranchId: async () => [],
        countActiveLoansByClientId: async () => 0,
      },
      {
        publish: async () => undefined,
        publishAll: async () => undefined,
        subscribe: () => undefined,
        unsubscribe: () => undefined,
      },
    );

    await assert.rejects(
      () => handler.handle({ loanId: 404, approvedByUserId: 9 }),
      (error) => error instanceof LoanNotFoundError,
    );
  });
});
