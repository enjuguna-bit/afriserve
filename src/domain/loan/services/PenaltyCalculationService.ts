import { Money } from "../../shared/value-objects/Money.js";

export interface OverdueInstallment {
  installmentId: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  daysOverdue: number;
}

export interface PenaltyResult {
  penaltyAmount: Money;
  basis: string;
  daysOverdue: number;
}

/**
 * Domain service: penalty calculation rules.
 * The system currently uses flat daily penalty rates applied to overdue principal.
 * Extracted from penaltyEngine.ts logic for domain modelling.
 */
export class PenaltyCalculationService {
  /**
   * Calculates a flat daily penalty for a given overdue balance.
   * @param overdueAmount - the outstanding overdue balance
   * @param dailyRatePercent - e.g. 0.5 means 0.5% per day
   * @param daysOverdue - number of days past due date
   */
  calculateDailyFlatPenalty(
    overdueAmount: Money,
    dailyRatePercent: number,
    daysOverdue: number,
  ): PenaltyResult {
    if (daysOverdue <= 0) {
      return { penaltyAmount: Money.zero(), basis: "no_overdue", daysOverdue: 0 };
    }
    const penaltyFactor = (dailyRatePercent / 100) * daysOverdue;
    const penalty = overdueAmount.multiply(penaltyFactor);
    return {
      penaltyAmount: penalty,
      basis: `${dailyRatePercent}%/day * ${daysOverdue} days`,
      daysOverdue,
    };
  }

  /**
   * Given a list of overdue installments, computes total outstanding overdue amount.
   */
  totalOverdueBalance(installments: OverdueInstallment[]): Money {
    const total = installments.reduce((sum, i) => sum + Math.max(0, i.amountDue - i.amountPaid), 0);
    return Money.fromNumber(total);
  }
}
