/**
 * Fee Payment Status Value Object
 * Tracks client fee payment status
 */

export type FeePaymentStatusType = 'unpaid' | 'paid' | 'waived' | 'refunded';

export class FeePaymentStatus {
  private readonly _value: FeePaymentStatusType;

  private constructor(value: FeePaymentStatusType) {
    this._value = value;
  }

  static unpaid(): FeePaymentStatus {
    return new FeePaymentStatus('unpaid');
  }

  static paid(): FeePaymentStatus {
    return new FeePaymentStatus('paid');
  }

  static waived(): FeePaymentStatus {
    return new FeePaymentStatus('waived');
  }

  static refunded(): FeePaymentStatus {
    return new FeePaymentStatus('refunded');
  }

  static fromString(value: string): FeePaymentStatus {
    const validStatuses: FeePaymentStatusType[] = ['unpaid', 'paid', 'waived', 'refunded'];

    if (!validStatuses.includes(value as FeePaymentStatusType)) {
      throw new Error(`Invalid fee payment status: ${value}`);
    }

    return new FeePaymentStatus(value as FeePaymentStatusType);
  }

  get value(): FeePaymentStatusType {
    return this._value;
  }

  isPaid(): boolean {
    return this._value === 'paid';
  }

  isUnpaid(): boolean {
    return this._value === 'unpaid';
  }

  isWaived(): boolean {
    return this._value === 'waived';
  }

  equals(other: FeePaymentStatus): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
