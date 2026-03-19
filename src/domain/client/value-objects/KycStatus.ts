/**
 * KYC status value object.
 * Statuses mirror the actual DB values: pending | in_review | verified | rejected | suspended
 * Note: the plan document used "expired" which does NOT exist in this codebase. "suspended" is correct.
 */
export type KycStatusValue = "pending" | "in_review" | "verified" | "rejected" | "suspended";

const VALID_KYC_STATUSES: KycStatusValue[] = ["pending", "in_review", "verified", "rejected", "suspended"];

const KYC_TRANSITIONS: Record<KycStatusValue, KycStatusValue[]> = {
  pending:    ["in_review", "rejected"],
  in_review:  ["verified", "rejected", "suspended"],
  verified:   ["suspended"],
  rejected:   ["pending"],
  suspended:  ["pending"],
};

export class KycStatus {
  private constructor(private readonly _value: KycStatusValue) {}

  static pending(): KycStatus   { return new KycStatus("pending"); }
  static inReview(): KycStatus  { return new KycStatus("in_review"); }
  static verified(): KycStatus  { return new KycStatus("verified"); }
  static rejected(): KycStatus  { return new KycStatus("rejected"); }
  static suspended(): KycStatus { return new KycStatus("suspended"); }

  static fromString(value: string): KycStatus {
    const v = (value || "").trim().toLowerCase();
    if (!VALID_KYC_STATUSES.includes(v as KycStatusValue)) {
      throw new Error(`Invalid KYC status: "${value}". Valid values: ${VALID_KYC_STATUSES.join(", ")}`);
    }
    return new KycStatus(v as KycStatusValue);
  }

  get value(): KycStatusValue { return this._value; }

  isPending(): boolean   { return this._value === "pending"; }
  isInReview(): boolean  { return this._value === "in_review"; }
  isVerified(): boolean  { return this._value === "verified"; }
  isRejected(): boolean  { return this._value === "rejected"; }
  isSuspended(): boolean { return this._value === "suspended"; }

  canTransitionTo(next: KycStatus): boolean {
    return KYC_TRANSITIONS[this._value]?.includes(next._value) ?? false;
  }

  equals(other: KycStatus): boolean { return this._value === other._value; }
  toString(): string { return this._value; }
}
