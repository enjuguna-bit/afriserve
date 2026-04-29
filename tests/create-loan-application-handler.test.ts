import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreateLoanApplicationHandler } from "../src/application/loan/handlers/CreateLoanApplicationHandler.js";

describe("CreateLoanApplicationHandler", () => {
  it("delegates to the authoritative loan creation workflow when provided", async () => {
    const workflowCalls: Array<Record<string, unknown>> = [];

    const handler = new CreateLoanApplicationHandler(
      {
        createLoan: async (args) => {
          workflowCalls.push(args);
          return { id: 77 };
        },
      },
    );

    const result = await handler.handle({
      id: 10,
      clientId: 22,
      productId: 5,
      branchId: 3,
      purpose: "Inventory financing",
      principal: 1500,
      interestRate: 12,
      termWeeks: 8,
      registrationFee: 10,
      processingFee: 20,
      expectedTotal: 1700,
      officerId: 9,
      createdByUserId: 4,
      createdByRole: "loan_officer",
      createdByRoles: ["loan_officer"],
      createdByPermissions: ["loan.create"],
      createdByBranchId: 3,
      ipAddress: "127.0.0.1",
    });

    assert.equal(result.loanId, 77);
    assert.equal(workflowCalls.length, 1);
    assert.deepEqual(workflowCalls[0], {
      payload: {
        clientId: 22,
        principal: 1500,
        termWeeks: 8,
        productId: 5,
        interestRate: 12,
        registrationFee: 10,
        processingFee: 20,
        branchId: 3,
        officerId: 9,
        purpose: "Inventory financing",
      },
      user: {
        sub: 4,
        role: "loan_officer",
        roles: ["loan_officer"],
        permissions: ["loan.create"],
        branchId: 3,
      },
      ipAddress: "127.0.0.1",
    });
  });

  it("rejects workflow responses without a valid loan id", async () => {
    const handler = new CreateLoanApplicationHandler({
      createLoan: async () => ({ id: "not-a-number" }),
    });

    await assert.rejects(
      handler.handle({
        id: 10,
        clientId: 22,
        principal: 1500,
        interestRate: 12,
        termWeeks: 8,
        registrationFee: 10,
        processingFee: 20,
        expectedTotal: 1700,
        createdByUserId: 4,
      }),
      /valid loan id/i,
    );
  });
});
