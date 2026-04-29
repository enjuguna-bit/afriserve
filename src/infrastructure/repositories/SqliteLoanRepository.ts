import type { DbRunResult } from "../../types/dataLayer.js";
import type { ILoanRepository } from "../../domain/loan/repositories/ILoanRepository.js";
import { Loan, type LoanProps } from "../../domain/loan/entities/Loan.js";
import { LoanId } from "../../domain/loan/value-objects/LoanId.js";
import { LoanStatus } from "../../domain/loan/value-objects/LoanStatus.js";
import { InterestRate } from "../../domain/loan/value-objects/InterestRate.js";
import { LoanTerm } from "../../domain/loan/value-objects/LoanTerm.js";
import { Money } from "../../domain/shared/value-objects/Money.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";

type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbRun = (sql: string, params?: unknown[]) => Promise<DbRunResult>;

export interface SqliteLoanRepositoryDeps {
  get: DbGet;
  all: DbAll;
  run: DbRun;
  executeTransaction?: (callback: (tx: { get: DbGet; run: DbRun }) => Promise<unknown>) => Promise<unknown>;
}

/**
 * SQLite adapter for ILoanRepository.
 * Follows the same get/all/run injection pattern as the rest of the service layer.
 */
export class SqliteLoanRepository implements ILoanRepository {
  constructor(private readonly deps: SqliteLoanRepositoryDeps) {}

  async save(loan: Loan): Promise<void> {
    const d = loan.toPersistence();
    const tenantId = getCurrentTenantId();
    const persist = async (db: { get: DbGet; run: DbRun }) => {
      const existing = await db.get(
        "SELECT id FROM loans WHERE id = ? AND tenant_id = ?",
        [d["id"], tenantId],
      );

      if (existing) {
        await db.run(
          `UPDATE loans SET
            client_id = ?, product_id = ?, branch_id = ?, purpose = ?, created_by_user_id = ?, officer_id = ?,
            principal = ?, interest_rate = ?, term_weeks = ?, term_months = ?,
            registration_fee = ?, processing_fee = ?,
            expected_total = ?, balance = ?, repaid_total = ?, status = ?,
            approved_by_user_id = ?, approved_at = ?,
            disbursed_by_user_id = ?, disbursed_at = ?, disbursement_note = ?, external_reference = ?,
            rejected_by_user_id = ?, rejected_at = ?, rejection_reason = ?, archived_at = ?
          WHERE id = ? AND tenant_id = ?`,
          [
            d["client_id"], d["product_id"], d["branch_id"], d["purpose"], d["created_by_user_id"], d["officer_id"],
            d["principal"], d["interest_rate"], d["term_weeks"], d["term_months"],
            d["registration_fee"], d["processing_fee"],
            d["expected_total"], d["balance"], d["repaid_total"], d["status"],
            d["approved_by_user_id"], d["approved_at"],
            d["disbursed_by_user_id"], d["disbursed_at"], d["disbursement_note"], d["external_reference"],
            d["rejected_by_user_id"], d["rejected_at"], d["rejection_reason"], d["archived_at"],
            d["id"], tenantId,
          ],
        );
        return;
      }

      await db.run(
        `INSERT INTO loans (
          id, tenant_id, client_id, product_id, branch_id, purpose, created_by_user_id, officer_id,
          principal, interest_rate, term_weeks, term_months,
          registration_fee, processing_fee,
          expected_total, balance, repaid_total, status,
          approved_by_user_id, approved_at,
          disbursed_by_user_id, disbursed_at, disbursement_note, external_reference,
          rejected_by_user_id, rejected_at, rejection_reason, archived_at, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          d["id"], tenantId, d["client_id"], d["product_id"], d["branch_id"], d["purpose"],
          d["created_by_user_id"], d["officer_id"],
          d["principal"], d["interest_rate"], d["term_weeks"], d["term_months"],
          d["registration_fee"], d["processing_fee"],
          d["expected_total"], d["balance"], d["repaid_total"], d["status"],
          d["approved_by_user_id"], d["approved_at"],
          d["disbursed_by_user_id"], d["disbursed_at"], d["disbursement_note"], d["external_reference"],
          d["rejected_by_user_id"], d["rejected_at"], d["rejection_reason"], d["archived_at"],
          d["created_at"],
        ],
      );
    };

    if (this.deps.executeTransaction) {
      await this.deps.executeTransaction((tx) => persist(tx as { get: DbGet; run: DbRun }));
      return;
    }

    await persist(this.deps);
  }

  async findById(id: LoanId): Promise<Loan | null> {
    const row = await this.deps.get(
      "SELECT * FROM loans WHERE id = ? AND tenant_id = ?",
      [id.value, getCurrentTenantId()],
    );
    return row ? this._rowToLoan(row) : null;
  }

  async exists(id: LoanId): Promise<boolean> {
    const row = await this.deps.get(
      "SELECT id FROM loans WHERE id = ? AND tenant_id = ?",
      [id.value, getCurrentTenantId()],
    );
    return Boolean(row);
  }

  async findByClientId(clientId: number): Promise<Loan[]> {
    const rows = await this.deps.all(
      "SELECT * FROM loans WHERE client_id = ? AND tenant_id = ? ORDER BY id DESC",
      [clientId, getCurrentTenantId()],
    );
    return rows.map((r) => this._rowToLoan(r));
  }

  async findByBranchId(branchId: number, limit: number, offset: number): Promise<Loan[]> {
    const rows = await this.deps.all(
      "SELECT * FROM loans WHERE branch_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
      [branchId, getCurrentTenantId(), limit, offset],
    );
    return rows.map((r) => this._rowToLoan(r));
  }

  async countActiveLoansByClientId(clientId: number): Promise<number> {
    const row = await this.deps.get(
      "SELECT COUNT(*) AS total FROM loans WHERE client_id = ? AND tenant_id = ? AND status IN ('active', 'restructured', 'overdue')",
      [clientId, getCurrentTenantId()],
    );
    return Number(row?.["total"] || 0);
  }

  // ------------------------------------------------------------------
  // Row -> Domain mapping
  // ------------------------------------------------------------------

  private _rowToLoan(row: Record<string, any>): Loan {
    const safeDate = (v: unknown): Date | null => {
      if (!v) return null;
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? null : d;
    };

    const safeMoney = (v: unknown): Money => {
      const n = Number(v ?? 0);
      return Money.fromNumber(Number.isFinite(n) && n >= 0 ? n : 0);
    };

    const props: LoanProps = {
      id:                   LoanId.fromNumber(Number(row["id"])),
      clientId:             Number(row["client_id"]),
      productId:            row["product_id"] != null ? Number(row["product_id"]) : null,
      branchId:             row["branch_id"] != null ? Number(row["branch_id"]) : null,
      purpose:              row["purpose"] ? String(row["purpose"]) : null,
      createdByUserId:      row["created_by_user_id"] != null ? Number(row["created_by_user_id"]) : null,
      officerId:            row["officer_id"] != null ? Number(row["officer_id"]) : null,
      principal:            safeMoney(row["principal"]),
      interestRate:         this._safeInterestRate(Number(row["interest_rate"] ?? 0)),
      term:                 LoanTerm.fromWeeks(
                              Math.max(1, Number(row["term_weeks"] || row["term_months"] || 1)),
                              row["term_months"] != null ? Number(row["term_months"]) : null,
                            ),
      registrationFee:      safeMoney(row["registration_fee"]),
      processingFee:        safeMoney(row["processing_fee"]),
      expectedTotal:        safeMoney(row["expected_total"]),
      balance:              safeMoney(row["balance"]),
      repaidTotal:          safeMoney(row["repaid_total"]),
      status:               this._safeLoanStatus(String(row["status"] || "pending_approval")),
      approvedByUserId:     row["approved_by_user_id"] != null ? Number(row["approved_by_user_id"]) : null,
      approvedAt:           safeDate(row["approved_at"]),
      disbursedByUserId:    row["disbursed_by_user_id"] != null ? Number(row["disbursed_by_user_id"]) : null,
      disbursedAt:          safeDate(row["disbursed_at"]),
      disbursementNote:     row["disbursement_note"] ? String(row["disbursement_note"]) : null,
      externalReference:    row["external_reference"] ? String(row["external_reference"]) : null,
      rejectedByUserId:     row["rejected_by_user_id"] != null ? Number(row["rejected_by_user_id"]) : null,
      rejectedAt:           safeDate(row["rejected_at"]),
      rejectionReason:      row["rejection_reason"] ? String(row["rejection_reason"]) : null,
      archivedAt:           safeDate(row["archived_at"]),
      createdAt:            safeDate(row["created_at"]) ?? new Date(),
    };

    return Loan.reconstitute(props);
  }

  private _safeLoanStatus(v: string): LoanStatus {
    try { return LoanStatus.fromString(v); } catch { return LoanStatus.pendingApproval(); }
  }

  private _safeInterestRate(v: number): InterestRate {
    try { return InterestRate.fromPercentage(v); } catch { return InterestRate.fromPercentage(0); }
  }
}
