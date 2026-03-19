export class LoanId {
  private constructor(readonly value: number) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid LoanId: ${value}`);
  }
  static fromNumber(value: number): LoanId { return new LoanId(value); }
  equals(other: LoanId): boolean { return this.value === other.value; }
  toString(): string { return String(this.value); }
}
