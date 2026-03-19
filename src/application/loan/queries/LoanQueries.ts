// ── GetLoanDetailsQuery ───────────────────────────────────────────────────────
export interface GetLoanDetailsQuery {
  loanId: number;
  /** Requesting user — used for scope enforcement by the handler. */
  userId: number;
}

// ── LoanDetailsDto ────────────────────────────────────────────────────────────
export interface LoanInstallmentDto {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: string;
}

export interface LoanDetailsDto {
  id: number;
  clientId: number;
  productId: number | null;
  branchId: number | null;
  principal: number;
  interestRate: number;
  termWeeks: number;
  termMonths: number | null;
  registrationFee: number;
  processingFee: number;
  expectedTotal: number;
  balance: number;
  repaidTotal: number;
  status: string;
  officerId: number | null;
  createdByUserId: number | null;
  approvedByUserId: number | null;
  approvedAt: string | null;
  disbursedByUserId: number | null;
  disbursedAt: string | null;
  disbursementNote: string | null;
  externalReference: string | null;
  rejectedByUserId: number | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  archivedAt: string | null;
  createdAt: string;
  schedule: LoanInstallmentDto[];
}
