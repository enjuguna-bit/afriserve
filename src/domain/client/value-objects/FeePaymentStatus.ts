export type FeePaymentStatusValue = "unpaid" | "paid" | "waived";

export class FeePaymentStatus {
  private constructor(private readonly _value: FeePaymentStatusValue) {}

  static unpaid(): FeePaymentStatus { return new FeePaymentStatus("unpaid"); }
  static paid(): FeePaymentStatus   { return new FeePaymentStatus("paid"); }
  static waived(): FeePaymentStatus { return new FeePaymentStatus("waived"); }

  static fromString(value: string): FeePaymentStatus {
    const v = (value || "unpaid").trim().toLowerCase();
    const valid: FeePaymentStatusValue[] = ["unpaid", "paid", "waived"];
    if (!valid.includes(v as FeePaymentStatusValue)) {
      throw new Error(`Invalid fee payment status: "${value}"`);
    }
    return new FeePaymentStatus(v as FeePaymentStatusValue);
  }

  get value(): FeePaymentStatusValue { return this._value; }

  isUnpaid(): boolean { return this._value === "unpaid"; }
  isPaid(): boolean   { return this._value === "paid"; }
  isWaived(): boolean { return this._value === "waived"; }
  isSettled(): boolean { return this._value === "paid" || this._value === "waived"; }

  equals(other: FeePaymentStatus): boolean { return this._value === other._value; }
  toString(): string { return this._value; }
}
