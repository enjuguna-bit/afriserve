import test from "node:test";
import assert from "node:assert/strict";
import { Loan } from "../src/domain/loan/entities/Loan.js";
import { InterestRate } from "../src/domain/loan/value-objects/InterestRate.js";
import { LoanTerm } from "../src/domain/loan/value-objects/LoanTerm.js";
import { Money } from "../src/domain/shared/value-objects/Money.js";
import { DomainValidationError, InvalidLoanStatusError } from "../src/domain/errors.js";

function buildPendingLoan() {
  return Loan.createApplication({
    id: 101,
    clientId: 202,
    createdByUserId: 303,
    principal: Money.fromNumber(5000),
    interestRate: InterestRate.fromPercentage(12),
    term: LoanTerm.fromWeeks(12),
    registrationFee: Money.fromNumber(0),
    processingFee: Money.fromNumber(0),
    expectedTotal: Money.fromNumber(5600),
  });
}

test("loan aggregate emits typed invalid-status errors for duplicate approvals", () => {
  const loan = buildPendingLoan();
  loan.approve(404);

  assert.throws(
    () => loan.approve(404),
    (error) => {
      assert.ok(error instanceof InvalidLoanStatusError);
      assert.equal(error.code, "INVALID_LOAN_STATUS");
      assert.equal(error.details?.action, "approve");
      return true;
    },
  );
});

test("loan aggregate emits typed invalid-status errors for disbursement before approval", () => {
  const loan = buildPendingLoan();

  assert.throws(
    () => loan.disburse({ disbursedByUserId: 505 }),
    (error) => {
      assert.ok(error instanceof InvalidLoanStatusError);
      assert.equal(error.code, "INVALID_LOAN_STATUS");
      assert.equal(error.details?.action, "disburse");
      return true;
    },
  );
});

test("loan aggregate emits typed domain validation errors for zero repayments", () => {
  const loan = buildPendingLoan();
  loan.approve(404);
  loan.disburse({ disbursedByUserId: 505 });

  assert.throws(
    () => loan.recordRepayment({
      amount: Money.zero(),
      recordedByUserId: 606,
    }),
    (error) => {
      assert.ok(error instanceof DomainValidationError);
      assert.equal(error.code, "DOMAIN_VALIDATION_FAILED");
      assert.equal(error.details?.action, "repayment");
      return true;
    },
  );
});
