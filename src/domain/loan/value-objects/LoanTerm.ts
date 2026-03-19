/**
 * Loan term value object. The system uses weeks as the primary unit.
 * term_months is kept for display but weeks drives all schedule generation.
 */
export class LoanTerm {
  readonly weeks: number;
  readonly months: number | null;

  private constructor(weeks: number, months: number | null) {
    if (!Number.isInteger(weeks) || weeks <= 0) throw new Error(`Invalid loan term: ${weeks} weeks`);
    this.weeks = weeks;
    this.months = months;
  }

  static fromWeeks(weeks: number, months?: number | null): LoanTerm {
    return new LoanTerm(weeks, months ?? null);
  }

  static fromMonths(months: number): LoanTerm {
    return new LoanTerm(Math.round(months * 4.33), months);
  }

  equals(other: LoanTerm): boolean { return this.weeks === other.weeks; }
  toString(): string { return `${this.weeks}w`; }
}
