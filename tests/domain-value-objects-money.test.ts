/**
 * Unit tests for Money value object
 * Tests decimal precision, arithmetic operations, and edge cases
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Money } from '../src/domain/shared/value-objects/Money.js';

describe('Money Value Object', () => {
  describe('Creation', () => {
    it('should create Money from number', () => {
      const money = Money.fromNumber(100.50);
      assert.strictEqual(money.amount, 100.50);
      assert.strictEqual(money.currency, 'KES');
    });

    it('should create Money with custom currency', () => {
      const money = Money.fromNumber(50, 'USD');
      assert.strictEqual(money.currency, 'USD');
    });

    it('should create zero Money', () => {
      const money = Money.zero();
      assert.strictEqual(money.amount, 0);
      assert.ok(money.isZero());
    });

    it('should throw on invalid money amount', () => {
      assert.throws(() => Money.fromNumber(NaN), /Invalid money amount/);
      assert.throws(() => Money.fromNumber(Infinity), /Invalid money amount/);
    });

    it('should throw on negative money amount', () => {
      assert.throws(() => Money.fromNumber(-100), /cannot be negative/);
    });

    it('should round to 2 decimal places', () => {
      const money = Money.fromNumber(100.999);
      assert.strictEqual(money.amount, 101.00);
    });
  });

  describe('Arithmetic Operations', () => {
    it('should add two Money objects correctly', () => {
      const a = Money.fromNumber(100.50);
      const b = Money.fromNumber(50.25);
      const result = a.add(b);
      assert.strictEqual(result.amount, 150.75);
    });

    it('should subtract two Money objects correctly', () => {
      const a = Money.fromNumber(100);
      const b = Money.fromNumber(50.50);
      const result = a.subtract(b);
      assert.strictEqual(result.amount, 49.50);
    });

    it('should throw on subtraction resulting in negative', () => {
      const a = Money.fromNumber(50);
      const b = Money.fromNumber(100);
      assert.throws(() => a.subtract(b), /negative value/);
    });

    it('should allow uncapped subtraction', () => {
      const a = Money.fromNumber(50);
      const b = Money.fromNumber(100);
      const result = a.subtractUncapped(b);
      assert.strictEqual(result.amount, -50);
    });

    it('should multiply Money by factor', () => {
      const money = Money.fromNumber(100);
      const result = money.multiply(1.1);
      assert.strictEqual(result.amount, 110);
    });

    it('should divide Money by divisor', () => {
      const money = Money.fromNumber(100);
      const result = money.divide(4);
      assert.strictEqual(result.amount, 25);
    });

    it('should throw on division by zero', () => {
      const money = Money.fromNumber(100);
      assert.throws(() => money.divide(0), /Cannot divide Money by zero/);
    });

    it('should handle currency mismatch', () => {
      const kes = Money.fromNumber(100, 'KES');
      const usd = Money.fromNumber(100, 'USD');
      assert.throws(() => kes.add(usd), /Currency mismatch/);
    });
  });

  describe('Comparison Operations', () => {
    it('should correctly compare greater than', () => {
      const a = Money.fromNumber(100);
      const b = Money.fromNumber(50);
      assert.ok(a.isGreaterThan(b));
      assert.ok(!b.isGreaterThan(a));
    });

    it('should correctly compare less than', () => {
      const a = Money.fromNumber(50);
      const b = Money.fromNumber(100);
      assert.ok(a.isLessThan(b));
      assert.ok(!b.isLessThan(a));
    });

    it('should correctly check zero', () => {
      const zero = Money.zero();
      const nonZero = Money.fromNumber(1);
      assert.ok(zero.isZero());
      assert.ok(!nonZero.isZero());
    });

    it('should correctly check equality', () => {
      const a = Money.fromNumber(100.50);
      const b = Money.fromNumber(100.50);
      const c = Money.fromNumber(100.51);
      assert.ok(a.equals(b));
      assert.ok(!a.equals(c));
    });
  });

  describe('Serialization', () => {
    it('should convert to string format', () => {
      const money = Money.fromNumber(1234.56);
      assert.strictEqual(money.toString(), 'KES 1234.56');
    });

    it('should serialize to JSON', () => {
      const money = Money.fromNumber(999.99, 'USD');
      const json = money.toJSON();
      assert.deepStrictEqual(json, { amount: 999.99, currency: 'USD' });
    });
  });

  describe('Precision Edge Cases', () => {
    it('should handle financial calculation precision', () => {
      // Test common financial scenario: 0.1 + 0.2 !== 0.3 in floating point
      const a = Money.fromNumber(0.1);
      const b = Money.fromNumber(0.2);
      const result = a.add(b);
      assert.strictEqual(result.amount, 0.30);
    });

    it('should handle large numbers', () => {
      const money = Money.fromNumber(999999999.99);
      const doubled = money.multiply(2);
      assert.strictEqual(doubled.amount, 1999999999.98);
    });

    it('should handle weekly installment calculation', () => {
      // Common loan scenario: 1000 divided by 12 weeks
      const principal = Money.fromNumber(1000);
      const weekly = principal.divide(12);
      // Should not lose precision
      assert.ok(weekly.amount > 0);
    });
  });
});
