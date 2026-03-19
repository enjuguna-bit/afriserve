/**
 * Domain service: loan graduation rules for repeat borrowers.
 * Extracted from computeGraduatedLimitForClient() in clientRouteService.ts.
 *
 * Rule summary:
 *   - No prior closed loans        ? 0 (not yet graduated)
 *   - 1 closed loan, excellent repayment (ratio >= 98%, avg days between payments <= 8) ? KES 3,000
 *   - 1 closed loan, good repayment (ratio >= 95%) ? KES 2,000
 *   - 1 closed loan, otherwise ? original principal
 *   - 2+ closed loans, last two excellent ? KES 3,000
 *   - 2+ closed loans, otherwise ? KES 2,000
 */
export interface ClosedLoanRepaymentStat {
  principal: number;
  expectedTotal: number;
  totalRepaid: number;
  repaymentCount: number;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
}

export class ClientGraduationService {
  /**
   * Computes the graduated loan limit in KES based on repayment history.
   * Returns 0 if the client has no closed loans yet.
   */
  computeGraduatedLimit(closedLoans: ClosedLoanRepaymentStat[]): number {
    if (closedLoans.length === 0) return 0;

    const lastLoan = closedLoans[closedLoans.length - 1]!;

    if (closedLoans.length === 1) {
      const ratio = lastLoan.expectedTotal > 0 ? lastLoan.totalRepaid / lastLoan.expectedTotal : 0;
      const avgDays = this._avgDaysBetweenPayments(lastLoan);
      if (ratio >= 0.98 && avgDays !== null && avgDays <= 8) return 3000;
      if (ratio >= 0.95) return 2000;
      return lastLoan.principal;
    }

    const lastTwo = closedLoans.slice(-2);
    const allGood = lastTwo.every((loan) => {
      const ratio = loan.expectedTotal > 0 ? loan.totalRepaid / loan.expectedTotal : 0;
      const avgDays = this._avgDaysBetweenPayments(loan);
      return ratio >= 0.97 && avgDays !== null && avgDays <= 8;
    });

    return allGood ? 3000 : 2000;
  }

  private _avgDaysBetweenPayments(stat: ClosedLoanRepaymentStat): number | null {
    if (stat.repaymentCount < 2 || !stat.firstPaidAt || !stat.lastPaidAt) return null;
    const ms = new Date(stat.lastPaidAt).getTime() - new Date(stat.firstPaidAt).getTime();
    return ms / (1000 * 60 * 60 * 24) / (stat.repaymentCount - 1);
  }
}
