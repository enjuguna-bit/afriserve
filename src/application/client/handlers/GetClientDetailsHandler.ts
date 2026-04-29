import type {
  ClientDto,
  ClientOnboardingStatusDto,
  GetClientQuery,
  GetClientHistoryQuery,
  GetClientOnboardingStatusQuery,
} from "../queries/ClientQueries.js";
import { getCurrentTenantId } from "../../../utils/tenantStore.js";

type DbRow = Record<string, unknown>;
type DbGet = (sql: string, params?: unknown[]) => Promise<DbRow | null | undefined>;
type DbAll = (sql: string, params?: unknown[]) => Promise<DbRow[]>;

interface ClientHistoryDto {
  clientId: number;
  summary: DbRow;
  loans: DbRow[];
}

/**
 * Query handler: read-side client data.
 *
 * Reads directly from DB — does NOT load the domain aggregate. This is
 * intentional: query handlers bypass the aggregate to return raw row data
 * exactly as the API consumers expect (flat rows with joined names etc.).
 */
export class GetClientDetailsHandler {
  constructor(
    private readonly get: DbGet,
    private readonly all: DbAll,
  ) {}

  // -----------------------------------------------------------------------
  // GetClient — single client with branch + officer joins
  // -----------------------------------------------------------------------
  async getClient(query: GetClientQuery): Promise<ClientDto | null> {
    const tenantId = getCurrentTenantId();
    return this.get(
      `SELECT
         c.*,
         b.name AS branch_name,
         b.code AS branch_code,
         r.id   AS region_id,
         r.name AS region_name,
         COALESCE(officer.full_name, creator.full_name) AS assigned_officer_name,
         COALESCE(c.officer_id, c.created_by_user_id)   AS assigned_officer_id,
         creator.full_name AS created_by_name
       FROM clients c
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN regions  r ON r.id = b.region_id
       LEFT JOIN users officer ON officer.id = c.officer_id AND officer.tenant_id = c.tenant_id
       LEFT JOIN users creator ON creator.id = c.created_by_user_id AND creator.tenant_id = c.tenant_id
       WHERE c.id = ? AND c.tenant_id = ?`,
      [query.clientId, tenantId],
    ) as Promise<ClientDto | null>;
  }

  // -----------------------------------------------------------------------
  // GetClientOnboardingStatus — lightweight onboarding snapshot
  // -----------------------------------------------------------------------
  async getOnboardingStatus(query: GetClientOnboardingStatusQuery): Promise<ClientOnboardingStatusDto | null> {
    const tenantId = getCurrentTenantId();
    const client = await this.get(
      `SELECT id, kyc_status, onboarding_status, fee_payment_status, fees_paid_at
       FROM clients WHERE id = ? AND tenant_id = ?`,
      [query.clientId, tenantId],
    );
    if (!client) return null;

    const [guarantorRow, collateralRow] = await Promise.all([
      this.get("SELECT COUNT(*) AS cnt FROM guarantors WHERE client_id = ? AND tenant_id = ? AND is_active = 1", [query.clientId, tenantId]),
      this.get("SELECT COUNT(*) AS cnt FROM collateral_assets WHERE client_id = ? AND tenant_id = ? AND status = 'active'", [query.clientId, tenantId]),
    ]);

    const guarantorCount  = Number(guarantorRow?.cnt  ?? 0);
    const collateralCount = Number(collateralRow?.cnt ?? 0);
    const kycVerified     = String(client.kyc_status || "").toLowerCase() === "verified";
    const feesPaid        = String(client.fee_payment_status || "").toLowerCase() === "paid";
    const blockers: string[] = [];
    if (!kycVerified)     blockers.push("kyc_not_verified");
    if (!feesPaid)        blockers.push("fees_unpaid");
    if (guarantorCount === 0) blockers.push("no_guarantor");
    if (collateralCount === 0) blockers.push("no_collateral");

    return {
      clientId:               query.clientId,
      onboarding_status:      String(client.onboarding_status || "registered"),
      kyc_status:             String(client.kyc_status || "pending"),
      fee_payment_status:     String(client.fee_payment_status || "unpaid"),
      fees_paid_at:           client.fees_paid_at ? String(client.fees_paid_at) : null,
      ready_for_loan_application: blockers.length === 0,
      blockers,
      guarantor_count:        guarantorCount,
      collateral_count:       collateralCount,
    };
  }

  // -----------------------------------------------------------------------
  // GetClientHistory — loans, repayments, overdue summary
  // -----------------------------------------------------------------------
  async getClientHistory(query: GetClientHistoryQuery): Promise<ClientHistoryDto | null> {
    const tenantId = getCurrentTenantId();
    const client = await this.get("SELECT id, branch_id FROM clients WHERE id = ? AND tenant_id = ?", [query.clientId, tenantId]);
    if (!client) return null;

    const [loanSummary, loans] = await Promise.all([
      this.get(
        `SELECT
           COUNT(*) AS total_loans,
           SUM(CASE WHEN status IN ('active','restructured') THEN 1 ELSE 0 END) AS active_loans,
           SUM(CASE WHEN status = 'closed'        THEN 1 ELSE 0 END) AS closed_loans,
           SUM(CASE WHEN status = 'written_off'   THEN 1 ELSE 0 END) AS written_off_loans,
           SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS pending_approval_loans,
           COALESCE(SUM(CASE WHEN disbursed_at IS NOT NULL THEN principal ELSE 0 END), 0)
             AS total_principal_disbursed,
           COALESCE(SUM(repaid_total), 0) AS total_repaid,
           COALESCE(SUM(CASE WHEN status IN ('active','restructured') THEN balance ELSE 0 END), 0)
             AS total_outstanding_balance,
           MIN(disbursed_at) AS first_disbursed_at,
           MAX(disbursed_at) AS latest_disbursed_at
         FROM loans WHERE client_id = ? AND tenant_id = ?`,
        [query.clientId, tenantId],
      ),
      this.all(
        `SELECT id, status, principal, expected_total, repaid_total, balance,
                interest_rate, term_weeks, disbursed_at, created_at
         FROM loans WHERE client_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 50`,
        [query.clientId, tenantId],
      ),
    ]);

    return {
      clientId: query.clientId,
      summary:  loanSummary ?? {},
      loans:    loans ?? [],
    };
  }
}
