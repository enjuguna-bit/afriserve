/**
 * LoanStatus value object.
 * Mirrors all actual status values found in loanLifecycleService.ts:
 *   pending_approval -> approved -> active -> closed
 *                    -> rejected
 *                    active -> overdue
 *                    active -> restructured
 *                    active -> written_off
 */
export type LoanStatusValue =
  | "pending_approval"
  | "approved"
  | "active"
  | "overdue"
  | "closed"
  | "rejected"
  | "restructured"
  | "written_off";

const VALID_LOAN_STATUSES: LoanStatusValue[] = [
  "pending_approval", "approved", "active", "overdue", "closed",
  "rejected", "restructured", "written_off",
];

/** Statuses that mean the loan has been disbursed (accepting repayments). */
const DISBURSED_STATUSES: LoanStatusValue[] = ["active", "overdue", "restructured"];

/** Statuses from which no further mutations are allowed. */
const TERMINAL_STATUSES: LoanStatusValue[] = ["closed", "written_off", "rejected"];

export class LoanStatus {
  private constructor(private readonly _value: LoanStatusValue) {}

  static pendingApproval(): LoanStatus { return new LoanStatus("pending_approval"); }
  static approved(): LoanStatus        { return new LoanStatus("approved"); }
  static active(): LoanStatus          { return new LoanStatus("active"); }
  static overdue(): LoanStatus         { return new LoanStatus("overdue"); }
  static closed(): LoanStatus          { return new LoanStatus("closed"); }
  static rejected(): LoanStatus        { return new LoanStatus("rejected"); }
  static restructured(): LoanStatus    { return new LoanStatus("restructured"); }
  static writtenOff(): LoanStatus      { return new LoanStatus("written_off"); }

  static fromString(value: string): LoanStatus {
    const v = (value || "").trim().toLowerCase();
    if (!VALID_LOAN_STATUSES.includes(v as LoanStatusValue)) {
      throw new Error(`Invalid loan status: "${value}". Valid values: ${VALID_LOAN_STATUSES.join(", ")}`);
    }
    return new LoanStatus(v as LoanStatusValue);
  }

  get value(): LoanStatusValue { return this._value; }

  isPendingApproval(): boolean { return this._value === "pending_approval"; }
  isApproved(): boolean        { return this._value === "approved"; }
  isActive(): boolean          { return this._value === "active"; }
  isOverdue(): boolean         { return this._value === "overdue"; }
  isClosed(): boolean          { return this._value === "closed"; }
  isRejected(): boolean        { return this._value === "rejected"; }
  isRestructured(): boolean    { return this._value === "restructured"; }
  isWrittenOff(): boolean      { return this._value === "written_off"; }

  /** True for active, overdue, or restructured (disbursed; accepting repayments). */
  isDisbursed(): boolean       { return DISBURSED_STATUSES.includes(this._value); }

  /** True for closed, written_off, rejected — no further mutations allowed. */
  isTerminal(): boolean        { return TERMINAL_STATUSES.includes(this._value); }

  equals(other: LoanStatus): boolean { return this._value === other._value; }
  toString(): string { return this._value; }
}
