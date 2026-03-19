/**
 * Money Value Object
 * Represents monetary values with precision and currency handling
 */

import { Decimal } from 'decimal.js';

export class Money {
  private readonly _amount: Decimal;
  private readonly _currency: string;

  private constructor(amount: Decimal, currency: string = 'KES') {
    this._amount = amount;
    this._currency = currency;
  }

  static fromNumber(value: number, currency: string = 'KES'): Money {
    if (!Number.isFinite(value)) {
      throw new Error('Invalid money amount: must be a finite number');
    }
    if (value < 0) {
      throw new Error('Money amount cannot be negative');
    }
    return new Money(new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP), currency);
  }

  static fromDecimal(value: Decimal, currency: string = 'KES'): Money {
    if (value.isNegative()) {
      throw new Error('Money amount cannot be negative');
    }
    return new Money(value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), currency);
  }

  static zero(currency: string = 'KES'): Money {
    return new Money(new Decimal(0), currency);
  }

  get amount(): number {
    return this._amount.toNumber();
  }

  get amountDecimal(): Decimal {
    return this._amount;
  }

  get currency(): string {
    return this._currency;
  }

  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return Money.fromDecimal(this._amount.plus(other._amount), this._currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    const result = this._amount.minus(other._amount);
    if (result.isNegative()) {
      throw new Error('Subtraction would result in negative amount');
    }
    return Money.fromDecimal(result, this._currency);
  }

  multiply(factor: number): Money {
    if (!Number.isFinite(factor) || factor < 0) {
      throw new Error('Invalid multiplication factor');
    }
    return Money.fromDecimal(this._amount.times(factor), this._currency);
  }

  divide(divisor: number): Money {
    if (!Number.isFinite(divisor) || divisor === 0) {
      throw new Error('Invalid divisor: must be non-zero finite number');
    }
    return Money.fromDecimal(this._amount.dividedBy(divisor), this._currency);
  }

  isGreaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amount.greaterThan(other._amount);
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amount.greaterThanOrEqualTo(other._amount);
  }

  isLessThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amount.lessThan(other._amount);
  }

  isLessThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this._amount.lessThanOrEqualTo(other._amount);
  }

  equals(other: Money): boolean {
    return this._currency === other._currency && this._amount.equals(other._amount);
  }

  isZero(): boolean {
    return this._amount.isZero();
  }

  private ensureSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Cannot perform operation on different currencies: ${this._currency} vs ${other._currency}`
      );
    }
  }

  toString(): string {
    return `${this._currency} ${this._amount.toFixed(2)}`;
  }

  toJSON(): { amount: number; currency: string } {
    return {
      amount: this.amount,
      currency: this.currency,
    };
  }
}
