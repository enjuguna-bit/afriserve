/**
 * Unit tests for Loan entity domain logic
 * Tests state transitions, business rules, and event emission
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Loan } from '../src/domain/loan/entities/Loan.js';
import { Money } from '../src/domain/shared/value-objects/Money.js';
import { InterestRate } from '../src/domain/loan/value-objects/InterestRate.js';
import { LoanTerm } from '../src/domain/loan/value-objects/LoanTerm.js';

function createTestLoan(overrides = {}) {
  const defaults = {
    id: 1,
    clientId: 100,
    productId: null,
    branchId: 5,
    createdByUserId: 1,
    officerId: 2,
    principal: Money.fromNumber(10000),
    interestRate: InterestRate.fromPercentage(20),
    term: LoanTerm.fromWeeks(12),
    registrationFee: Money.fromNumber(200),
    processingFee: Money.fromNumber(500),
    expectedTotal: Money.fromNumber(12200),
    createdAt: new Date(),
    ...overrides,
  };
  return Loan.createApplication(defaults);
}

describe('Loan Entity', () => {
  describe('Initial State', () => {
    it('should create loan in pending_approval status', () => {
      const loan = createTestLoan();
      assert.ok(loan.status.isPendingApproval());
      assert.ok(loan.canBeApproved());
      assert.ok(!loan.canBeDisbursed());
    });

    it('should emit LoanApplicationSubmitted event', () => {
      const loan = createTestLoan();
      const events = loan.getUncommittedEvents();
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]!.constructor.name, 'LoanApplicationSubmitted');
    });

    it('should have balance equal to expected total', () => {
      const loan = createTestLoan();
      assert.ok(loan.balance.equals(loan.expectedTotal));
      assert.ok(loan.repaidTotal.isZero());
    });
  });

  describe('Approval Flow', () => {
    it('should transition to approved status', () => {
      const loan = createTestLoan();
      loan.approve(1);
      assert.ok(loan.status.isApproved());
      assert.ok(loan.canBeDisbursed());
    });

    it('should emit LoanApproved event', () => {
      const loan = createTestLoan();
      loan.approve(1);
      const events = loan.getUncommittedEvents();
      const approvalEvent = events.find(e => e.constructor.name === 'LoanApproved');
      assert.ok(approvalEvent);
    });

    it('should not approve already approved loan', () => {
      const loan = createTestLoan();
      loan.approve(1);
      assert.throws(() => loan.approve(2), /Cannot approve/);
    });

    it('should not approve disbursed loan', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 1 });
      assert.throws(() => loan.approve(2), /Cannot approve/);
    });
  });

  describe('Rejection Flow', () => {
    it('should transition to rejected status', () => {
      const loan = createTestLoan();
      loan.reject(1, 'Insufficient documentation');
      assert.ok(loan.status.isRejected());
      assert.strictEqual(loan.rejectionReason, 'Insufficient documentation');
    });

    it('should emit LoanRejected event', () => {
      const loan = createTestLoan();
      loan.reject(1, 'Risk too high');
      const events = loan.getUncommittedEvents();
      const rejectEvent = events.find(e => e.constructor.name === 'LoanRejected');
      assert.ok(rejectEvent);
    });

    it('should not reject disbursed loan', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 1 });
      assert.throws(() => loan.reject(2, 'Too late'), /Cannot reject/);
    });
  });

  describe('Disbursement Flow', () => {
    it('should transition to active status', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      assert.ok(loan.status.isActive());
      assert.ok(loan.canAcceptRepayment());
    });

    it('should emit LoanDisbursed event', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      const events = loan.getUncommittedEvents();
      const disbursedEvent = events.find(e => e.constructor.name === 'LoanDisbursed');
      assert.ok(disbursedEvent);
    });

    it('should not disburse pending loan', () => {
      const loan = createTestLoan();
      assert.throws(() => loan.disburse({ disbursedByUserId: 1 }), /Cannot disburse/);
    });

    it('should not disburse rejected loan', () => {
      const loan = createTestLoan();
      loan.reject(1, 'Bad');
      assert.throws(() => loan.disburse({ disbursedByUserId: 1 }), /Cannot disburse/);
    });
  });

  describe('Repayment Flow', () => {
    it('should record partial repayment', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      loan.recordRepayment({
        amount: Money.fromNumber(1000),
        recordedByUserId: 1,
      });
      assert.ok(loan.repaidTotal.equals(Money.fromNumber(1000)));
      assert.ok(!loan.balance.isZero());
      assert.ok(!loan.isFullyRepaid());
    });

    it('should record full repayment and close loan', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      loan.recordRepayment({
        amount: loan.expectedTotal,
        recordedByUserId: 1,
      });
      assert.ok(loan.isFullyRepaid());
      assert.ok(loan.status.isClosed());
    });

    it('should emit RepaymentRecorded event', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      loan.recordRepayment({ amount: Money.fromNumber(500), recordedByUserId: 1 });
      const events = loan.getUncommittedEvents();
      assert.ok(events.some(e => e.constructor.name === 'RepaymentRecorded'));
    });

    it('should emit LoanFullyRepaid event on full repayment', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      loan.recordRepayment({ amount: loan.expectedTotal, recordedByUserId: 1 });
      const events = loan.getUncommittedEvents();
      assert.ok(events.some(e => e.constructor.name === 'LoanFullyRepaid'));
    });

    it('should reject zero repayment', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      assert.throws(() => loan.recordRepayment({
        amount: Money.zero(),
        recordedByUserId: 1,
      }), /must be positive/);
    });

    it('should not record repayment on pending loan', () => {
      const loan = createTestLoan();
      assert.throws(() => loan.recordRepayment({
        amount: Money.fromNumber(100),
        recordedByUserId: 1,
      }), /Cannot record repayment/);
    });
  });

  describe('Overdue Flow', () => {
    it('should mark disbursed loan as overdue', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      loan.markOverdue(3);
      assert.ok(loan.status.isOverdue());
    });

    it('should emit LoanMarkedOverdue event', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      loan.markOverdue(1);
      const events = loan.getUncommittedEvents();
      assert.ok(events.some(e => e.constructor.name === 'LoanMarkedOverdue'));
    });

    it('should be idempotent for already overdue loan', () => {
      const loan = createTestLoan();
      loan.approve(1);
      loan.disburse({ disbursedByUserId: 2 });
      loan.markOverdue(1);
      loan.markOverdue(2); // Should not throw
      const events = loan.getUncommittedEvents();
      // Should only have one LoanMarkedOverdue event
      const overdueEvents = events.filter(e => e.constructor.name === 'LoanMarkedOverdue');
      assert.strictEqual(overdueEvents.length, 1);
    });

    it('should not mark pending loan as overdue', () => {
      const loan = createTestLoan();
      assert.throws(() => loan.markOverdue(1), /Cannot mark loan.*as overdue/);
    });
  });

  describe('Event Management', () => {
    it('should clear uncommitted events', () => {
      const loan = createTestLoan();
      loan.approve(1);
      assert.ok(loan.getUncommittedEvents().length > 0);
      loan.clearEvents();
      assert.strictEqual(loan.getUncommittedEvents().length, 0);
    });

    it('should return copy of events array', () => {
      const loan = createTestLoan();
      const events1 = loan.getUncommittedEvents();
      const events2 = loan.getUncommittedEvents();
      events1.push({} as any); // Mutate first array
      assert.strictEqual(loan.getUncommittedEvents().length, events2.length);
    });
  });

  describe('Persistence Mapping', () => {
    it('should convert to persistence format', () => {
      const loan = createTestLoan();
      const persisted = loan.toPersistence();
      assert.strictEqual(persisted.id, 1);
      assert.strictEqual(persisted.client_id, 100);
      assert.strictEqual(persisted.status, 'pending_approval');
      assert.strictEqual(persisted.principal, 10000);
    });
  });
});
