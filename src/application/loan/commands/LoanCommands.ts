// ── CreateLoanApplicationCommand ─────────────────────────────────────────────
export interface CreateLoanApplicationCommand {
  /** Assigned by the persistence layer before calling the handler. */
  id: number;
  clientId: number;
  productId?: number | null;
  branchId?: number | null;
  principal: number;
  interestRate: number;
  termWeeks: number;
  termMonths?: number | null;
  registrationFee: number;
  processingFee: number;
  expectedTotal: number;
  officerId?: number | null;
  createdByUserId: number;
}

// ── ApproveLoanCommand ────────────────────────────────────────────────────────
export interface ApproveLoanCommand {
  loanId: number;
  approvedByUserId: number;
}

// ── RejectLoanCommand ─────────────────────────────────────────────────────────
export interface RejectLoanCommand {
  loanId: number;
  rejectedByUserId: number;
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
