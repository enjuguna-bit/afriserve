import type { GetLoanDetailsQuery, LoanDetailsDto, LoanInstallmentDto } from "../queries/LoanQueries.js";

type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;

/**
 * Query handler: GetLoanDetails
 *
 * Uses raw SQL (read-side) — no aggregate loading overhead.
 * Joins loan with repayment_schedule installments where they exist.
 */
export class GetLoanDetailsHandler {
  constructor(
    private readonly get: DbGet,
    private readonly all: DbAll,
  ) {}

  async handle(query: GetLoanDetailsQuery): Promise<LoanDetailsDto | null> {
    const row = await this.get(
      `SELECT
        l.id, l.client_id, l.product_id, l.branch_id,
        l.principal, l.interest_rate, l.term_weeks, l.term_months,
        l.registration_fee, l.processing_fee,
        l.expected_total, l.balance, l.repaid_total, l.status,
        l.officer_id, l.created_by_user_id,
        l.approved_by_user_id, l.approved_at,
        l.disbursed_by_user_id, l.disbursed_at,
        l.disbursement_note, l.external_reference,
        l.rejected_by_user_id, l.rejected_at, l.rejection_reason,
        l.archived_at, l.created_at
       FROM loans l
       WHERE l.id = ?`,
      [query.loanId],
    );

    if (!row) return null;

    // Fetch instalment schedule if it exists (stored in repayment_schedule table or
    // derived from the repayments table — use whichever is available in this project)
    const scheduleRows = await this.all(
      `SELECT
        installment_number, due_date, amount_due,
        COALESCE(amount_paid, 0) AS amount_paid, status
       FROM repayment_schedule
       WHERE loan_id = ?
       ORDER BY installment_number ASC`,
      [query.loanId],
    ).catch(() => [] as Array<Record<string, any>>);   // graceful if table absent

    const schedule: LoanInstallmentDto[] = scheduleRows.map((s) => ({
      installmentNumber: Number(s["installment_number"]),
      dueDate: String(s["due_date"]),
      amountDue: Number(s["amount_due"]),
      amountPaid: Number(s["amount_paid"] ?? 0),
      status: String(s["status"] ?? "pending"),
    }));

    return {
      id: Number(row["id"]),
      clientId: Number(row["client_id"]),
      productId: row["product_id"] != null ? Number(row["product_id"]) : null,
      branchId: row["branch_id"] != null ? Number(row["branch_id"]) : null,
      principal: Number(row["principal"]),
      interestRate: Number(row["interest_rate"]),
      termWeeks: Number(row["term_weeks"]),
      termMonths: row["term_months"] != null ? Number(row["term_months"]) : null,
      registrationFee: Number(row["registration_fee"]),
      processingFee: Number(row["processing_fee"]),
      expectedTotal: Number(row["expected_total"]),
      balance: Number(row["balance"]),
      repaidTotal: Number(row["repaid_total"]),
      status: String(row["status"]),
      officerId: row["officer_id"] != null ? Number(row["officer_id"]) : null,
      createdByUserId: row["created_by_user_id"] != null ? Number(row["created_by_user_id"]) : null,
      approvedByUserId: row["approved_by_user_id"] != null ? Number(row["approved_by_user_id"]) : null,
      approvedAt: row["approved_at"] ? String(row["approved_at"]) : null,
      disbursedByUserId: row["disbursed_by_user_id"] != null ? Number(row["disbursed_by_user_id"]) : null,
      disbursedAt: row["disbursed_at"] ? String(row["disbursed_at"]) : null,
      disbursementNote: row["disbursement_note"] ? String(row["disbursement_note"]) : null,
      externalReference: row["external_reference"] ? String(row["external_reference"]) : null,
      rejectedByUserId: row["rejected_by_user_id"] != null ? Number(row["rejected_by_user_id"]) : null,
      rejectedAt: row["rejected_at"] ? String(row["rejected_at"]) : null,
      rejectionReason: row["rejection_reason"] ? String(row["rejection_reason"]) : null,
      archivedAt: row["archived_at"] ? String(row["archived_at"]) : null,
      createdAt: String(row["created_at"]),
      schedule,
    };
  }
}
