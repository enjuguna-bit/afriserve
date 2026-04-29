import { Money } from "../../shared/value-objects/Money.js";
import { LoanId } from "../value-objects/LoanId.js";
import { LoanTerm } from "../value-objects/LoanTerm.js";
import { Decimal } from "decimal.js";

export type InstallmentStatus = "pending" | "paid" | "overdue" | "partial";
export type RepaymentScheduleCadence = "weekly" | "business_daily";

export interface Installment {
  readonly installmentNumber: number;
  readonly dueDate: string;       // ISO date string
  readonly amountDue: number;
  readonly amountPaid: number;
  readonly status: InstallmentStatus;
}

export interface RepaymentScheduleProps {
  loanId: LoanId;
  installments: Installment[];
  generatedAt: Date;
}

/**
 * RepaymentSchedule entity — owned by the Loan aggregate.
 * Immutable snapshot of expected instalments; status updates are applied by
 * the application layer after repayment events are processed.
 */
export class RepaymentSchedule {
  private constructor(private readonly _props: RepaymentScheduleProps) {}

  private static getInstallmentCount(term: LoanTerm, cadence: RepaymentScheduleCadence): number {
    return cadence === "business_daily" ? term.weeks * 6 : term.weeks;
  }

  // ------------------------------------------------------------------
  // Factory
  // ------------------------------------------------------------------

  /**
   * Generate an equal-weekly-instalment schedule.
   * The last instalment absorbs any rounding delta so that the sum equals
   * expectedTotal exactly — matching RepaymentScheduleService.buildInstallmentAmounts().
   */
  static generate(params: {
    loanId: LoanId;
    expectedTotal: Money;
    term: LoanTerm;
    startDate: Date;
    addWeeksIso: (isoDate: string, weeks: number) => string;
    cadence?: RepaymentScheduleCadence;
    addBusinessDaysIso?: (isoDate: string, businessDays: number) => string;
  }): RepaymentSchedule {
    const cadence = params.cadence || "weekly";
    const installmentCount = RepaymentSchedule.getInstallmentCount(params.term, cadence);
    const total = params.expectedTotal.decimal;
    const baseAmount = total
      .dividedBy(installmentCount)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const amounts: number[] = Array.from({ length: installmentCount }, () =>
      baseAmount.toNumber(),
    );

    // Absorb rounding delta in the last instalment
    const assigned = baseAmount.times(installmentCount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const delta = total.minus(assigned).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    amounts[installmentCount - 1] = baseAmount
      .plus(delta)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();

    const startIso = params.startDate.toISOString();
    const installments: Installment[] = amounts.map((amountDue, i) => ({
      installmentNumber: i + 1,
      dueDate: cadence === "business_daily" && params.addBusinessDaysIso
        ? params.addBusinessDaysIso(startIso, i + 1)
        : params.addWeeksIso(startIso, i + 1),
      amountDue,
      amountPaid: 0,
      status: "pending" as InstallmentStatus,
    }));

    return new RepaymentSchedule({
      loanId: params.loanId,
      installments,
      generatedAt: new Date(),
    });
  }

  // ------------------------------------------------------------------
  // Reconstitute from persistence
  // ------------------------------------------------------------------

  static reconstitute(props: RepaymentScheduleProps): RepaymentSchedule {
    return new RepaymentSchedule(props);
  }

  // ------------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------------

  get loanId(): LoanId            { return this._props.loanId; }
  get installments(): Installment[] { return [...this._props.installments]; }
  get generatedAt(): Date         { return this._props.generatedAt; }

  get totalDue(): number {
    return this._props.installments.reduce((s, i) => s + i.amountDue, 0);
  }

  get totalPaid(): number {
    return this._props.installments.reduce((s, i) => s + i.amountPaid, 0);
  }

  get pendingInstallments(): Installment[] {
    return this._props.installments.filter((i) => i.status !== "paid");
  }

  get overdueInstallments(): Installment[] {
    return this._props.installments.filter((i) => i.status === "overdue");
  }

  hasOverdueInstallments(): boolean {
    return this._props.installments.some((i) => i.status === "overdue");
  }

  // ------------------------------------------------------------------
  // Persistence
  // ------------------------------------------------------------------

  toPersistence(): {
    loanId: number;
    installments: Installment[];
    generatedAt: string;
  } {
    return {
      loanId: this._props.loanId.value,
      installments: this.installments,
      generatedAt: this._props.generatedAt.toISOString(),
    };
  }
}
