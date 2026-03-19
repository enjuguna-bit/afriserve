import { Decimal } from "decimal.js";

/**
 * Immutable Money value object. Uses decimal.js for precision (same as loanLifecycleService).
 * Currency defaults to KES (the system currency).
 */
export class Money {
  private readonly _amount: Decimal;
  readonly currency: string;

  private constructor(amount: Decimal, currency = "KES") {
    this._amount = amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    this.currency = currency;
  }

  static fromNumber(value: number, currency = "KES"): Money {
    if (!Number.isFinite(value)) throw new Error(`Invalid money amount: ${value}`);
    if (value < 0) throw new Error("Money amount cannot be negative");
    return new Money(new Decimal(value), currency);
  }

  static fromDecimal(value: Decimal, currency = "KES"): Money {
    return new Money(value, currency);
  }

  static zero(currency = "KES"): Money {
    return new Money(new Decimal(0), currency);
  }

  get amount(): number {
    return this._amount.toNumber();
  }

  get decimal(): Decimal {
    return this._amount;
  }

  add(other: Money): Money {
    this._assertSameCurrency(other);
    return Money.fromDecimal(this._amount.plus(other._amount), this.currency);
  }

  subtract(other: Money): Money {
    this._assertSameCurrency(other);
    const result = this._amount.minus(other._amount);
    if (result.isNegative()) throw new Error("Money subtraction would result in negative value");
    return Money.fromDecimal(result, this.currency);
  }

  subtractUncapped(other: Money): Money {
    this._assertSameCurrency(other);
    return Money.fromDecimal(this._amount.minus(other._amount), this.currency);
  }

  multiply(factor: number): Money {
    return Money.fromDecimal(this._amount.times(factor), this.currency);
  }

  divide(divisor: number): Money {
    if (divisor === 0) throw new Error("Cannot divide Money by zero");
    return Money.fromDecimal(this._amount.dividedBy(divisor), this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this._assertSameCurrency(other);
    return this._amount.greaterThan(other._amount);
  }

  isLessThan(other: Money): boolean {
    this._assertSameCurrency(other);
    return this._amount.lessThan(other._amount);
  }

  isZero(): boolean {
    return this._amount.isZero();
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this._amount.equals(other._amount);
  }

  private _assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  toString(): string {
    return `${this.currency} ${this._amount.toFixed(2)}`;
  }

  toJSON(): { amount: number; currency: string } {
    return { amount: this.amount, currency: this.currency };
  }
}
