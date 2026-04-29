export class InterestRate {
  private constructor(readonly percentage: number) {
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new Error(`Invalid interest rate: ${percentage}. Must be between 0 and 100.`);
    }
    Object.freeze(this);
  }
  static fromPercentage(value: number): InterestRate { return new InterestRate(value); }
  asFactor(): number { return this.percentage / 100; }
  equals(other: InterestRate): boolean { return this.percentage === other.percentage; }
  toString(): string { return `${this.percentage}%`; }
}
