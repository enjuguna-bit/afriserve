/**
 * KYC Status Value Object
 * Ensures valid KYC status transitions and business rules
 */

export type KycStatusType = 
  | 'pending'
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'expired';

export class KycStatus {
  private readonly _value: KycStatusType;

  private constructor(value: KycStatusType) {
    this._value = value;
  }

  static pending(): KycStatus {
    return new KycStatus('pending');
  }

  static inReview(): KycStatus {
    return new KycStatus('in_review');
  }

  static verified(): KycStatus {
    return new KycStatus('verified');
  }

  static rejected(): KycStatus {
    return new KycStatus('rejected');
  }

  static expired(): KycStatus {
    return new KycStatus('expired');
  }

  static fromString(value: string): KycStatus {
    const validStatuses: KycStatusType[] = [
      'pending',
      'in_review',
      'verified',
      'rejected',
      'expired',
    ];

    if (!validStatuses.includes(value as KycStatusType)) {
      throw new Error(`Invalid KYC status: ${value}`);
    }

    return new KycStatus(value as KycStatusType);
  }

  get value(): KycStatusType {
    return this._value;
  }

  isPending(): boolean {
    return this._value === 'pending';
  }

  isInReview(): boolean {
    return this._value === 'in_review';
  }

  isVerified(): boolean {
    return this._value === 'verified';
  }

  isRejected(): boolean {
    return this._value === 'rejected';
  }

  isExpired(): boolean {
    return this._value === 'expired';
  }

  canTransitionTo(newStatus: KycStatus): boolean {
    const transitions: Record<KycStatusType, KycStatusType[]> = {
      pending: ['in_review', 'rejected'],
      in_review: ['verified', 'rejected'],
      verified: ['expired'],
      rejected: ['pending'], // Can retry
      expired: ['pending'], // Can renew
    };

    return transitions[this._value]?.includes(newStatus._value) ?? false;
  }

  equals(other: KycStatus): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
