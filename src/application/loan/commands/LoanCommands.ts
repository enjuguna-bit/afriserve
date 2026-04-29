// ── CreateLoanApplicationCommand ─────────────────────────────────────────────
export interface CreateLoanApplicationCommand {
  /**
   * Not required for creation — present for future event-sourced replay support.
   * Leave undefined when submitting a new loan application.
   */
  id?: number | null;
  clientId: number;
  productId?: number | null;
  branchId?: number | null;
  purpose?: string | null;
  principal: number;
  termWeeks: number;
  termMonths?: number | null;
  /**
   * Pricing overrides — all optional.
   * When absent the handler delegates to loanService which derives pricing
   * from the loan product configuration.  When present they are forwarded as
   * explicit overrides (requires loan.approve permission — enforced in loanService).
   */
  interestRate?: number | null;
  registrationFee?: number | null;
  processingFee?: number | null;
  /** Computed by loanService; not accepted as a command input. */
  expectedTotal?: number | null;
  officerId?: number | null;
  createdByUserId: number;
  createdByRole?: string | null;
  createdByRoles?: string[];
  createdByPermissions?: string[];
  createdByBranchId?: number | null;
  ipAddress?: string | null;
}

// ── ApproveLoanCommand ────────────────────────────────────────────────────────
export interface ApproveLoanCommand {
  loanId: number;
  approvedByUserId: number;
  approvedByRole?: string | null;
}

// ── RejectLoanCommand ─────────────────────────────────────────────────────────
export interface RejectLoanCommand {
  loanId: number;
  rejectedByUserId: number;
  rejectedByRole?: string | null;
  reason: string;
}

// ── DisburseLoanCommand ───────────────────────────────────────────────────────
export interface DisburseLoanCommand {
  loanId: number;
  disbursedByUserId: number;
  disbursementNote?: string | null;
  externalReference?: string | null;
  disbursedAt?: Date;
}

// ── RecordRepaymentCommand ────────────────────────────────────────────────────
export interface RecordRepaymentCommand {
  loanId: number;
  amount: number;
  recordedByUserId: number;
  externalReference?: string | null;
  occurredAt?: Date;
}
