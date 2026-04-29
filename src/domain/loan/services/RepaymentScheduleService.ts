import { Money } from "../../shared/value-objects/Money.js";
import { InterestRate } from "../value-objects/InterestRate.js";
import { LoanTerm } from "../value-objects/LoanTerm.js";
import { Decimal } from "decimal.js";

export type RepaymentScheduleCadence = "weekly" | "business_daily";

export interface InstallmentScheduleEntry {
  installmentNumber: number;
  dueDate: string;  // ISO date string
  amountDue: number;
  status: "pending" | "paid" | "overdue";
}

/**
 * Domain service: repayment schedule generation.
 * Mirrors buildInstallmentAmounts() in loanLifecycleService.ts exactly:
 * - Equal weekly instalments, last instalment absorbs rounding delta.
 */
export class RepaymentScheduleService {
  private getInstallmentCount(term: LoanTerm, cadence: RepaymentScheduleCadence): number {
    return cadence === "business_daily" ? term.weeks * 6 : term.weeks;
  }

  /**
   * Builds an array of instalment amounts.
   * The last entry is adjusted so sum equals expectedTotal exactly.
   */
  buildInstallmentAmounts(
    expectedTotal: Money,
    term: LoanTerm,
    cadence: RepaymentScheduleCadence = "weekly",
  ): number[] {
    const installmentCount = this.getInstallmentCount(term, cadence);
    const total = expectedTotal.decimal;
    const baseAmount = total
      .dividedBy(installmentCount)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const amounts = Array.from({ length: installmentCount }, () => baseAmount.toNumber());
    const assigned = baseAmount.times(installmentCount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const delta = total.minus(assigned).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    amounts[installmentCount - 1] = baseAmount.plus(delta).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    return amounts;
  }

  /**
   * Generates a full schedule given a start date and term.
   * @param startDate - disbursement date (first due is startDate + 1 week)
   * @param addWeeksIso - date helper injected from app layer (same signature as in loanLifecycleService)
   */
  generateSchedule(params: {
    expectedTotal: Money;
    term: LoanTerm;
    startDate: Date;
    addWeeksIso: (isoDate: string, weeks: number) => string;
    cadence?: RepaymentScheduleCadence;
    addBusinessDaysIso?: (isoDate: string, businessDays: number) => string;
  }): InstallmentScheduleEntry[] {
    const cadence = params.cadence || "weekly";
    const amounts = this.buildInstallmentAmounts(params.expectedTotal, params.term, cadence);
    const startIso = params.startDate.toISOString();
    return amounts.map((amount, i) => ({
      installmentNumber: i + 1,
      dueDate: cadence === "business_daily" && params.addBusinessDaysIso
        ? params.addBusinessDaysIso(startIso, i + 1)
        : params.addWeeksIso(startIso, i + 1),
      amountDue: amount,
      status: "pending" as const,
    }));
  }

  /**
   * Simple flat interest calculation: P * R * T
   * where R is the annual interest rate fraction and T is the year fraction.
   * Matches calculateExpectedTotal() and loanProductPricing.ts.
   */
  calculateFlatInterest(principal: Money, rate: InterestRate, term: LoanTerm): Money {
    const interestFactor = rate.asFactor() * (term.weeks / 52);
    return principal.multiply(interestFactor);
  }
}
