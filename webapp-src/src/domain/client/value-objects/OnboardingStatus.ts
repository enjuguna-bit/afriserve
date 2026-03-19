/**
 * Onboarding Status Value Object
 * Tracks client onboarding progress
 */

export type OnboardingStatusType =
  | 'registered'
  | 'kyc_pending'
  | 'kyc_completed'
  | 'fee_pending'
  | 'active'
  | 'inactive';

export class OnboardingStatus {
  private readonly _value: OnboardingStatusType;

  private constructor(value: OnboardingStatusType) {
    this._value = value;
  }

  static registered(): OnboardingStatus {
    return new OnboardingStatus('registered');
  }

  static kycPending(): OnboardingStatus {
    return new OnboardingStatus('kyc_pending');
  }

  static kycCompleted(): OnboardingStatus {
    return new OnboardingStatus('kyc_completed');
  }

  static feePending(): OnboardingStatus {
    return new OnboardingStatus('fee_pending');
  }

  static active(): OnboardingStatus {
    return new OnboardingStatus('active');
  }

  static inactive(): OnboardingStatus {
    return new OnboardingStatus('inactive');
  }

  static fromString(value: string): OnboardingStatus {
    const validStatuses: OnboardingStatusType[] = [
      'registered',
      'kyc_pending',
      'kyc_completed',
      'fee_pending',
      'active',
      'inactive',
    ];

    if (!validStatuses.includes(value as OnboardingStatusType)) {
      throw new Error(`Invalid onboarding status: ${value}`);
    }

    return new OnboardingStatus(value as OnboardingStatusType);
  }

  get value(): OnboardingStatusType {
    return this._value;
  }

  isActive(): boolean {
    return this._value === 'active';
  }

  isInactive(): boolean {
    return this._value === 'inactive';
  }

  equals(other: OnboardingStatus): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
