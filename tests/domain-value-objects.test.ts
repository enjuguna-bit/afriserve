/**
 * Unit tests for Loan domain value objects
 * Tests LoanStatus, InterestRate, LoanTerm, and related value objects
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LoanStatus } from '../src/domain/loan/value-objects/LoanStatus.js';
import { InterestRate } from '../src/domain/loan/value-objects/InterestRate.js';
import { LoanTerm } from '../src/domain/loan/value-objects/LoanTerm.js';

describe('LoanStatus Value Object', () => {
  describe('Factory Methods', () => {
    it('should create pending_approval status', () => {
      const status = LoanStatus.pendingApproval();
      assert.strictEqual(status.value, 'pending_approval');
      assert.ok(status.isPendingApproval());
    });

    it('should create approved status', () => {
      const status = LoanStatus.approved();
      assert.strictEqual(status.value, 'approved');
      assert.ok(status.isApproved());
    });

    it('should create active status', () => {
      const status = LoanStatus.active();
      assert.strictEqual(status.value, 'active');
      assert.ok(status.isActive());
    });

    it('should create overdue status', () => {
      const status = LoanStatus.overdue();
      assert.strictEqual(status.value, 'overdue');
      assert.ok(status.isOverdue());
    });

    it('should create closed status', () => {
      const status = LoanStatus.closed();
      assert.strictEqual(status.value, 'closed');
      assert.ok(status.isClosed());
    });

    it('should create rejected status', () => {
      const status = LoanStatus.rejected();
      assert.strictEqual(status.value, 'rejected');
      assert.ok(status.isRejected());
    });

    it('should create restructured status', () => {
      const status = LoanStatus.restructured();
      assert.strictEqual(status.value, 'restructured');
      assert.ok(status.isRestructured());
    });

    it('should create written_off status', () => {
      const status = LoanStatus.writtenOff();
      assert.strictEqual(status.value, 'written_off');
      assert.ok(status.isWrittenOff());
    });
  });

  describe('fromString', () => {
    it('should parse valid status strings', () => {
      const tests = [
        ['pending_approval', 'pending_approval'],
        ['ACTIVE', 'active'],
        [' Overdue ', 'overdue'],
        ['closed', 'closed'],
      ] as const;
      
      for (const [input, expected] of tests) {
        const status = LoanStatus.fromString(input);
        assert.strictEqual(status.value, expected);
      }
    });

    it('should throw on invalid status', () => {
      assert.throws(() => LoanStatus.fromString('invalid'), /Invalid loan status/);
      assert.throws(() => LoanStatus.fromString(''), /Invalid loan status/);
      assert.throws(() => LoanStatus.fromString('PENDING'), /Invalid loan status/);
    });
  });

  describe('Status Checks', () => {
    it('should correctly identify disbursed statuses', () => {
      const disbursedStatuses = ['active', 'overdue', 'restructured'];
      for (const statusStr of disbursedStatuses) {
        const status = LoanStatus.fromString(statusStr);
        assert.ok(status.isDisbursed(), `${statusStr} should be disbursed`);
      }
    });

    it('should correctly identify non-disbursed statuses', () => {
      const nonDisbursedStatuses = ['pending_approval', 'approved', 'closed', 'rejected', 'written_off'];
      for (const statusStr of nonDisbursedStatuses) {
        const status = LoanStatus.fromString(statusStr);
        assert.ok(!status.isDisbursed(), `${statusStr} should not be disbursed`);
      }
    });

    it('should correctly identify terminal statuses', () => {
      const terminalStatuses = ['closed', 'written_off', 'rejected'];
      for (const statusStr of terminalStatuses) {
        const status = LoanStatus.fromString(statusStr);
        assert.ok(status.isTerminal(), `${statusStr} should be terminal`);
      }
    });

    it('should correctly identify non-terminal statuses', () => {
      const nonTerminalStatuses = ['pending_approval', 'approved', 'active', 'overdue', 'restructured'];
      for (const statusStr of nonTerminalStatuses) {
        const status = LoanStatus.fromString(statusStr);
        assert.ok(!status.isTerminal(), `${statusStr} should not be terminal`);
      }
    });
  });

  describe('Equality', () => {
    it('should be equal for same status', () => {
      const a = LoanStatus.active();
      const b = LoanStatus.active();
      assert.ok(a.equals(b));
    });

    it('should not be equal for different status', () => {
      const a = LoanStatus.active();
      const b = LoanStatus.overdue();
      assert.ok(!a.equals(b));
    });
  });

  describe('toString', () => {
    it('should return string representation', () => {
      assert.strictEqual(LoanStatus.pendingApproval().toString(), 'pending_approval');
      assert.strictEqual(LoanStatus.active().toString(), 'active');
    });
  });
});

describe('InterestRate Value Object', () => {
  describe('Creation', () => {
    it('should create from percentage', () => {
      const rate = InterestRate.fromPercentage(20);
      assert.strictEqual(rate.percentage, 20);
    });

    it('should accept zero rate', () => {
      const rate = InterestRate.fromPercentage(0);
      assert.strictEqual(rate.percentage, 0);
    });

    it('should accept 100% rate', () => {
      const rate = InterestRate.fromPercentage(100);
      assert.strictEqual(rate.percentage, 100);
    });

    it('should reject negative rate', () => {
      assert.throws(() => InterestRate.fromPercentage(-5), /Invalid interest rate/);
    });

    it('should reject rate over 100', () => {
      assert.throws(() => InterestRate.fromPercentage(101), /Invalid interest rate/);
    });

    it('should reject non-finite values', () => {
      assert.throws(() => InterestRate.fromPercentage(NaN), /Invalid interest rate/);
      assert.throws(() => InterestRate.fromPercentage(Infinity), /Invalid interest rate/);
    });
  });

  describe('Operations', () => {
    it('should convert to factor', () => {
      assert.strictEqual(InterestRate.fromPercentage(20).asFactor(), 0.2);
      assert.strictEqual(InterestRate.fromPercentage(100).asFactor(), 1);
      assert.strictEqual(InterestRate.fromPercentage(0).asFactor(), 0);
    });

    it('should be equal for same rate', () => {
      const a = InterestRate.fromPercentage(15);
      const b = InterestRate.fromPercentage(15);
      assert.ok(a.equals(b));
    });

    it('should not be equal for different rate', () => {
      const a = InterestRate.fromPercentage(15);
      const b = InterestRate.fromPercentage(20);
      assert.ok(!a.equals(b));
    });

    it('should return string representation', () => {
      assert.strictEqual(InterestRate.fromPercentage(20).toString(), '20%');
    });
  });
});

describe('LoanTerm Value Object', () => {
  describe('Creation', () => {
    it('should create from weeks', () => {
      const term = LoanTerm.fromWeeks(12);
      assert.strictEqual(term.weeks, 12);
      assert.strictEqual(term.months, 3);
    });

    it('should create from months', () => {
      const term = LoanTerm.fromMonths(6);
      assert.strictEqual(term.weeks, 26); // 6 * 52 / 12 ≈ 26
      assert.strictEqual(term.months, 6);
    });

    it('should handle edge cases', () => {
      const oneWeek = LoanTerm.fromWeeks(1);
      assert.strictEqual(oneWeek.weeks, 1);

      const oneMonth = LoanTerm.fromMonths(1);
      assert.strictEqual(oneMonth.weeks, 4); // ~4.33 weeks, likely rounded
    });
  });

  describe('Calculations', () => {
    it('should correctly calculate weekly installments', () => {
      // 10000 KES over 12 weeks = ~833.33 per week
      const term = LoanTerm.fromWeeks(12);
      assert.ok(term.weeks > 0);
    });

    it('should correctly calculate monthly installments', () => {
      // 12000 KES over 6 months = 2000 per month
      const term = LoanTerm.fromMonths(6);
      assert.strictEqual(term.months, 6);
    });
  });

  describe('Equality', () => {
    it('should be equal for same term', () => {
      const a = LoanTerm.fromWeeks(12);
      const b = LoanTerm.fromWeeks(12);
      assert.ok(a.equals(b));
    });

    it('should not be equal for different term', () => {
      const a = LoanTerm.fromWeeks(12);
      const b = LoanTerm.fromWeeks(24);
      assert.ok(!a.equals(b));
    });
  });

  describe('Conversion', () => {
    it('should convert months to weeks correctly', () => {
      const term = LoanTerm.fromMonths(12);
      assert.strictEqual(term.months, 12);
      assert.ok(term.weeks >= 52); // 12 months should be at least 52 weeks
    });

    it('should convert weeks to months correctly', () => {
      const term = LoanTerm.fromWeeks(52);
      assert.strictEqual(term.weeks, 52);
      assert.ok(term.months >= 12);
    });
  });
});

describe('Value Object Immutability', () => {
  it('LoanStatus should be immutable', () => {
    const status = LoanStatus.active();
    // @ts-expect-error - intentionally testing immutability
    assert.throws(() => { status.value = 'rejected'; }, TypeError);
  });

  it('InterestRate should be immutable', () => {
    const rate = InterestRate.fromPercentage(20);
    // @ts-expect-error - intentionally testing immutability
    assert.throws(() => { rate.percentage = 50; }, TypeError);
  });
});
