/**
 * Onboarding status value object.
 * Values: registered -> kyc_pending -> kyc_verified -> complete
 * Mirrors deriveOnboardingStatus() in clientRouteService.ts
 */
export type OnboardingStatusValue = "registered" | "kyc_pending" | "kyc_verified" | "complete";

export class OnboardingStatus {
  private constructor(private readonly _value: OnboardingStatusValue) {}

  static registered(): OnboardingStatus   { return new OnboardingStatus("registered"); }
  static kycPending(): OnboardingStatus   { return new OnboardingStatus("kyc_pending"); }
  static kycVerified(): OnboardingStatus  { return new OnboardingStatus("kyc_verified"); }
  static complete(): OnboardingStatus     { return new OnboardingStatus("complete"); }

  static fromString(value: string): OnboardingStatus {
    const v = (value || "").trim().toLowerCase();
    const valid: OnboardingStatusValue[] = ["registered", "kyc_pending", "kyc_verified", "complete"];
    if (!valid.includes(v as OnboardingStatusValue)) {
      throw new Error(`Invalid onboarding status: "${value}"`);
    }
    return new OnboardingStatus(v as OnboardingStatusValue);
  }

  /**
   * Derives the onboarding status from component booleans.
   * Mirrors the logic in clientRouteService.deriveOnboardingStatus().
   */
  static derive(params: {
    kycStatus: string;
    hasGuarantor: boolean;
    hasCollateral: boolean;
    feesPaid: boolean;
  }): OnboardingStatus {
    const kyc = (params.kycStatus || "pending").toLowerCase();
    if (kyc === "verified" && params.hasGuarantor && params.hasCollateral && params.feesPaid) {
      return OnboardingStatus.complete();
    }
    if (kyc === "verified") return OnboardingStatus.kycVerified();
    if (["in_review", "rejected", "suspended"].includes(kyc)) return OnboardingStatus.kycPending();
    return OnboardingStatus.registered();
  }

  get value(): OnboardingStatusValue { return this._value; }

  isRegistered(): boolean  { return this._value === "registered"; }
  isKycPending(): boolean  { return this._value === "kyc_pending"; }
  isKycVerified(): boolean { return this._value === "kyc_verified"; }
  isComplete(): boolean    { return this._value === "complete"; }

  equals(other: OnboardingStatus): boolean { return this._value === other._value; }
  toString(): string { return this._value; }
}
