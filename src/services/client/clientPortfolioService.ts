import type { AuthSessionUser } from "../../types/auth.js";
import type { HierarchyServiceLike } from "../../types/serviceContracts.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";

type UserLike = AuthSessionUser & Record<string, unknown>;
type DbRow = Record<string, any>;
type DbGetLike = (sql: string, params?: unknown[]) => Promise<DbRow | null | undefined>;
type DbAllLike = (sql: string, params?: unknown[]) => Promise<DbRow[]>;
type DbRunLike = (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number }>;

/**
 * Maximum rows returned by the repayment history and collection actions
 * queries in getClientHistory (Customer 360).
 * Override with env var CUSTOMER_360_HISTORY_LIMIT.
 */
const HISTORY_QUERY_LIMIT = Math.max(
  1,
  Math.min(
    1000,
    parseInt(String(process.env["CUSTOMER_360_HISTORY_LIMIT"] || "200"), 10) || 200,
  ),
);

/**
 * Maximum graduated credit limit cap (KES).
 * Override via env var MAX_GRADUATED_LOAN_LIMIT (e.g. 50000).
 * Default 3000 KES preserves the previous behaviour.
 */
const MAX_GRADUATED_LIMIT = Math.max(
  1,
  parseInt(String(process.env["MAX_GRADUATED_LOAN_LIMIT"] || "3000"), 10) || 3000,
);

export function createClientPortfolioService(deps: {
  get: DbGetLike;
  all: DbAllLike;
  run: DbRunLike;
  hierarchyService: HierarchyServiceLike;
  writeAuditLog: any;
  invalidateReportCaches: any;
  resolveClientScopeClient: (clientId: number, user: UserLike) => Promise<{ status: number; body?: any; scope?: any; client?: any }>;
  canAccessClientByOwnership: (user: Record<string, unknown> | null | undefined, client: Record<string, unknown> | null | undefined) => boolean;
}) {
  const {
    get,
    all,
    run,
    hierarchyService,
    writeAuditLog,
    invalidateReportCaches,
    resolveClientScopeClient,
    canAccessClientByOwnership,
  } = deps;

  async function computeGraduatedLimitForClient(
    clientId: number,
  ): Promise<number> {
    const tenantId = getCurrentTenantId();
    const rows = await all(
      `
        SELECT
          l.id,
          l.principal,
          l.expected_total,
          COALESCE(SUM(r.amount), 0)  AS total_repaid,
          COUNT(r.id)                 AS repayment_count,
          MIN(r.paid_at)              AS first_paid_at,
          MAX(r.paid_at)              AS last_paid_at
        FROM loans l
        LEFT JOIN repayments r ON r.loan_id = l.id AND r.tenant_id = l.tenant_id
        WHERE l.client_id = ?
          AND l.tenant_id = ?
          AND l.status = 'closed'
        GROUP BY l.id, l.principal, l.expected_total
        ORDER BY l.disbursed_at ASC, l.id ASC
      `,
      [clientId, tenantId],
    );
    if (!rows || rows.length === 0) return 0;

    function calcAvgDaysBetweenPayments(count: number, first: string | null, last: string | null): number | null {
      if (count < 2 || !first || !last) return null;
      return (new Date(last).getTime() - new Date(first).getTime()) / (1000 * 60 * 60 * 24) / (count - 1);
    }

    const lastLoan = rows[rows.length - 1]!;
    const lastRatio = Number(lastLoan.expected_total) > 0 ? Number(lastLoan.total_repaid) / Number(lastLoan.expected_total) : 0;
    const lastAvg = calcAvgDaysBetweenPayments(Number(lastLoan.repayment_count), lastLoan.first_paid_at ? String(lastLoan.first_paid_at) : null, lastLoan.last_paid_at ? String(lastLoan.last_paid_at) : null);

    if (rows.length === 1) {
      if (lastRatio >= 0.98 && lastAvg !== null && lastAvg <= 8) return MAX_GRADUATED_LIMIT;
      if (lastRatio >= 0.95) return Math.round(MAX_GRADUATED_LIMIT * 0.666);
      return Number(lastLoan.principal);
    }

    const allGood = rows.slice(-2).every((loan) => {
      const ratio = Number(loan.expected_total) > 0 ? Number(loan.total_repaid) / Number(loan.expected_total) : 0;
      const avg = calcAvgDaysBetweenPayments(Number(loan.repayment_count), loan.first_paid_at ? String(loan.first_paid_at) : null, loan.last_paid_at ? String(loan.last_paid_at) : null);
      return ratio >= 0.97 && avg !== null && avg <= 8;
    });
    return allGood ? MAX_GRADUATED_LIMIT : Math.round(MAX_GRADUATED_LIMIT * 0.666);
  }

  async function listAssignableOfficers(user: UserLike) {
    const tenantId = getCurrentTenantId();
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const officers = await all(
      `
        SELECT
          u.id,
          u.full_name,
          u.branch_id,
          b.name AS branch_name,
          r.name AS region_name,
          COUNT(c.id) AS assigned_portfolio_count
        FROM users u
        LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN regions r ON r.id = COALESCE(u.primary_region_id, b.region_id)
        LEFT JOIN clients c ON c.officer_id = u.id AND c.deleted_at IS NULL AND c.tenant_id = u.tenant_id
        WHERE LOWER(u.role) = 'loan_officer'
          AND u.tenant_id = ?
          AND u.is_active = 1
        GROUP BY u.id, u.full_name, u.branch_id, b.name, r.name
        ORDER BY u.full_name ASC, u.id ASC
      `,
      [tenantId],
    );

    return {
      status: 200,
      body: officers
        .filter((officer) => hierarchyService.isBranchInScope(scope, officer.branch_id))
        .map((officer) => ({
          id: Number(officer.id),
          full_name: String(officer.full_name || '').trim(),
          branch_id: officer.branch_id == null ? null : Number(officer.branch_id),
          branch_name: officer.branch_name || null,
          region_name: officer.region_name || null,
          assigned_portfolio_count: Number(officer.assigned_portfolio_count || 0),
        }))
        .filter((officer) => officer.id > 0 && officer.full_name),
    };
  }

  async function reallocatePortfolio(payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const tenantId = getCurrentTenantId();
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const fromOfficerId = Number(payload.fromOfficerId || 0);
    const toOfficerId = Number(payload.toOfficerId || 0);
    const note = String(payload.note || '').trim() || null;

    const [fromOfficer, toOfficer] = await Promise.all([
      get(`SELECT id, full_name, role, is_active, branch_id FROM users WHERE id = ? AND tenant_id = ?`, [fromOfficerId, tenantId]),
      get(`SELECT id, full_name, role, is_active, branch_id FROM users WHERE id = ? AND tenant_id = ?`, [toOfficerId, tenantId]),
    ]);

    if (!fromOfficer || String(fromOfficer.role || '').trim().toLowerCase() !== 'loan_officer' || Number(fromOfficer.is_active || 0) !== 1) {
      return { status: 400, body: { message: 'Selected source agent is invalid.' } };
    }
    if (!toOfficer || String(toOfficer.role || '').trim().toLowerCase() !== 'loan_officer' || Number(toOfficer.is_active || 0) !== 1) {
      return { status: 400, body: { message: 'Selected target agent is invalid.' } };
    }
    if (!hierarchyService.isBranchInScope(scope, fromOfficer.branch_id) || !hierarchyService.isBranchInScope(scope, toOfficer.branch_id)) {
      return { status: 403, body: { message: 'Forbidden: one or more agents are outside your scope.' } };
    }
    if (Number(fromOfficer.branch_id || 0) !== Number(toOfficer.branch_id || 0)) {
      return { status: 400, body: { message: 'Portfolio reallocation requires both agents to belong to the same branch.' } };
    }

    const portfolioCountRow = await get(
      `SELECT COUNT(*) AS total FROM clients c WHERE c.officer_id = ? AND c.deleted_at IS NULL AND c.branch_id = ? AND c.tenant_id = ?`,
      [fromOfficerId, Number(fromOfficer.branch_id || 0), tenantId],
    );

    const totalClients = Number(portfolioCountRow?.total || 0);
    if (totalClients === 0) {
      return {
        status: 200,
        body: {
          message: 'No borrower portfolio was available to reallocate.',
          movedClients: 0,
          fromOfficer: { id: Number(fromOfficer.id), full_name: fromOfficer.full_name || null },
          toOfficer: { id: Number(toOfficer.id), full_name: toOfficer.full_name || null },
        },
      };
    }

    const updatedAt = new Date().toISOString();
    const updateResult = await run(
      `UPDATE clients SET officer_id = ?, updated_at = ? WHERE officer_id = ? AND deleted_at IS NULL AND branch_id = ? AND tenant_id = ?`,
      [toOfficerId, updatedAt, fromOfficerId, Number(fromOfficer.branch_id || 0), tenantId],
    );

    const movedClients = Number(updateResult?.changes || totalClients || 0);

    await writeAuditLog({
      userId: user.sub,
      action: 'client.portfolio_reallocated',
      targetType: 'user',
      targetId: toOfficerId,
      details: JSON.stringify({ fromOfficerId, fromOfficerName: fromOfficer.full_name || null, toOfficerId, toOfficerName: toOfficer.full_name || null, movedClients, note }),
      ipAddress,
    });
    await invalidateReportCaches();

    return {
      status: 200,
      body: {
        message: `Portfolio reallocated successfully from ${fromOfficer.full_name} to ${toOfficer.full_name}.`,
        movedClients,
        fromOfficer: { id: Number(fromOfficer.id), full_name: fromOfficer.full_name || null },
        toOfficer: { id: Number(toOfficer.id), full_name: toOfficer.full_name || null },
        note,
      },
    };
  }

  async function getClientWithLoans(clientId: number, user: UserLike) {
    const tenantId = getCurrentTenantId();
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const loans = await all(
      `
        SELECT id, principal, interest_rate, term_months, term_weeks, registration_fee, processing_fee, expected_total, repaid_total, balance, status, disbursed_at, branch_id
        FROM loans
        WHERE client_id = ? AND tenant_id = ?
        ORDER BY id DESC
      `,
      [clientId, tenantId],
    );

    return { status: 200, body: { ...resolved.client, loans } };
  }

  async function getClientHistory(clientId: number, user: UserLike) {
    const tenantId = getCurrentTenantId();
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const client = await get(
      `
        SELECT
          c.*,
          b.name AS branch_name,
          b.code AS branch_code,
          r.id AS region_id,
          r.name AS region_name,
          COALESCE(officer.full_name, creator.full_name) AS assigned_officer_name,
          COALESCE(c.officer_id, c.created_by_user_id) AS assigned_officer_id,
          creator.full_name AS created_by_name
        FROM clients c
        LEFT JOIN branches b ON b.id = c.branch_id
        LEFT JOIN regions r ON r.id = b.region_id
        LEFT JOIN users officer ON officer.id = c.officer_id AND officer.tenant_id = c.tenant_id
        LEFT JOIN users creator ON creator.id = c.created_by_user_id AND creator.tenant_id = c.tenant_id
        WHERE c.id = ? AND c.tenant_id = ?
      `,
      [clientId, tenantId],
    );

    if (!client) {
      return { status: 404, body: { message: "Client not found" } };
    }
    if (!hierarchyService.isBranchInScope(scope, client.branch_id)) {
      return { status: 403, body: { message: "Forbidden: client is outside your scope" } };
    }
    if (!canAccessClientByOwnership(user, client)) {
      return { status: 403, body: { message: "Forbidden: client is outside your assignment" } };
    }

    const [loanSummaryRow, overdueHistoryRow, loans, repaymentHistory, collectionActions] = await Promise.all([
      get(
        `
          SELECT
            COUNT(*) AS total_loans,
            SUM(CASE WHEN l.status IN ('active', 'restructured') THEN 1 ELSE 0 END) AS active_loans,
            SUM(CASE WHEN l.status = 'closed' THEN 1 ELSE 0 END) AS closed_loans,
            SUM(CASE WHEN l.status = 'restructured' THEN 1 ELSE 0 END) AS restructured_loans,
            SUM(CASE WHEN l.status = 'written_off' THEN 1 ELSE 0 END) AS written_off_loans,
            SUM(CASE WHEN l.status = 'pending_approval' THEN 1 ELSE 0 END) AS pending_approval_loans,
            SUM(CASE WHEN l.status = 'approved' THEN 1 ELSE 0 END) AS approved_loans,
            SUM(CASE WHEN l.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_loans,
            COALESCE(SUM(CASE WHEN l.disbursed_at IS NOT NULL THEN l.principal ELSE 0 END), 0) AS total_principal_disbursed,
            COALESCE(SUM(l.expected_total), 0) AS total_expected_total,
            COALESCE(SUM(l.repaid_total), 0) AS total_repaid,
            COALESCE(SUM(CASE WHEN l.status IN ('active', 'restructured') THEN l.balance ELSE 0 END), 0) AS total_outstanding_balance,
            MIN(l.disbursed_at) AS first_disbursed_at,
            MAX(l.disbursed_at) AS latest_disbursed_at
          FROM loans l
          WHERE l.client_id = ?
            AND l.tenant_id = ?
        `,
        [clientId, tenantId],
      ),
      get(
        `
          SELECT
            COUNT(i.id) AS total_installments,
            COUNT(DISTINCT CASE
              WHEN i.status != 'paid' AND date(i.due_date) < date('now') THEN l.id
              ELSE NULL
            END) AS currently_overdue_loans,
            SUM(CASE
              WHEN i.status != 'paid' AND date(i.due_date) < date('now') THEN 1
              ELSE 0
            END) AS currently_overdue_installments,
            COALESCE(SUM(CASE
              WHEN i.status != 'paid' AND date(i.due_date) < date('now')
                THEN i.amount_due - i.amount_paid
              ELSE 0
            END), 0) AS currently_overdue_amount,
            SUM(CASE
              WHEN i.paid_at IS NOT NULL AND datetime(i.paid_at) > datetime(i.due_date) THEN 1
              ELSE 0
            END) AS paid_late_installments,
            COALESCE(ROUND(AVG(CASE
              WHEN i.paid_at IS NOT NULL AND datetime(i.paid_at) > datetime(i.due_date)
                THEN julianday(i.paid_at) - julianday(i.due_date)
              ELSE NULL
            END), 2), 0) AS avg_days_late_paid_installments,
            COALESCE(MAX(CASE
              WHEN i.status != 'paid' AND date(i.due_date) < date('now')
                THEN CAST(julianday(date('now')) - julianday(date(i.due_date)) AS INTEGER)
              ELSE NULL
            END), 0) AS max_current_days_overdue
          FROM loans l
          LEFT JOIN loan_installments i ON i.loan_id = l.id AND i.tenant_id = l.tenant_id
          WHERE l.client_id = ?
            AND l.tenant_id = ?
        `,
        [clientId, tenantId],
      ),
      all(
        `
          SELECT
            l.id,
            l.client_id,
            l.principal,
            l.interest_rate,
            l.term_months,
            l.term_weeks,
            l.registration_fee,
            l.processing_fee,
            l.expected_total,
            l.repaid_total,
            l.balance,
            l.status,
            l.disbursed_at,
            l.approved_at,
            l.rejected_at,
            l.rejection_reason,
            l.officer_id,
            officer.full_name AS officer_name,
            COUNT(i.id) AS installment_count,
            SUM(CASE WHEN i.status = 'paid' THEN 1 ELSE 0 END) AS paid_installment_count,
            SUM(CASE WHEN i.status != 'paid' AND date(i.due_date) < date('now') THEN 1 ELSE 0 END) AS overdue_installment_count,
            COALESCE(SUM(CASE
              WHEN i.status != 'paid' AND date(i.due_date) < date('now')
                THEN i.amount_due - i.amount_paid
              ELSE 0
            END), 0) AS overdue_amount
          FROM loans l
          LEFT JOIN users officer ON officer.id = l.officer_id AND officer.tenant_id = l.tenant_id
          LEFT JOIN loan_installments i ON i.loan_id = l.id AND i.tenant_id = l.tenant_id
          WHERE l.client_id = ?
            AND l.tenant_id = ?
          GROUP BY l.id
          ORDER BY datetime(l.disbursed_at) DESC, l.id DESC
        `,
        [clientId, tenantId],
      ),
      // Bounded: never load more than HISTORY_QUERY_LIMIT rows (default 200, env-configurable)
      all(
        `
          SELECT
            r.id,
            r.loan_id,
            r.amount,
            r.paid_at,
            r.note,
            r.recorded_by_user_id,
            recorder.full_name AS recorded_by_name,
            l.status AS loan_status
          FROM repayments r
          INNER JOIN loans l ON l.id = r.loan_id
          LEFT JOIN users recorder ON recorder.id = r.recorded_by_user_id AND recorder.tenant_id = l.tenant_id
          WHERE l.client_id = ?
            AND l.tenant_id = ?
            AND r.tenant_id = l.tenant_id
          ORDER BY datetime(r.paid_at) DESC, r.id DESC
          LIMIT ?
        `,
        [clientId, tenantId, HISTORY_QUERY_LIMIT],
      ),
      // Bounded: never load more than HISTORY_QUERY_LIMIT rows (default 200, env-configurable)
      all(
        `
          SELECT
            ca.id,
            ca.loan_id,
            ca.installment_id,
            ca.action_type,
            ca.action_note,
            ca.promise_date,
            ca.next_follow_up_date,
            ca.action_status,
            ca.created_by_user_id,
            creator.full_name AS created_by_name,
            ca.created_at,
            l.status AS loan_status
          FROM collection_actions ca
          INNER JOIN loans l ON l.id = ca.loan_id
          LEFT JOIN users creator ON creator.id = ca.created_by_user_id AND creator.tenant_id = l.tenant_id
          WHERE l.client_id = ?
            AND l.tenant_id = ?
            AND ca.tenant_id = l.tenant_id
          ORDER BY datetime(ca.created_at) DESC, ca.id DESC
          LIMIT ?
        `,
        [clientId, tenantId, HISTORY_QUERY_LIMIT],
      ),
    ]);

    const profile = {
      id: Number(client.id),
      full_name: client.full_name,
      phone: client.phone || null,
      national_id: client.national_id || null,
      is_active: Number(client.is_active || 0),
      deleted_at: client.deleted_at || null,
      branch_id: client.branch_id == null ? null : Number(client.branch_id),
      branch_name: client.branch_name || null,
      branch_code: client.branch_code || null,
      region_id: client.region_id == null ? null : Number(client.region_id),
      region_name: client.region_name || null,
      created_by_user_id: client.created_by_user_id == null ? null : Number(client.created_by_user_id),
      created_by_name: client.created_by_name || null,
      assigned_officer_id: client.assigned_officer_id == null ? null : Number(client.assigned_officer_id),
      assigned_officer_name: client.assigned_officer_name || null,
      kra_pin: client.kra_pin || null,
      photo_url: client.photo_url || null,
      id_document_url: client.id_document_url || null,
      business_type: client.business_type || null,
      business_years: client.business_years == null ? null : Number(client.business_years),
      business_location: client.business_location || null,
      residential_address: client.residential_address || null,
      next_of_kin_name: client.next_of_kin_name || null,
      next_of_kin_phone: client.next_of_kin_phone || null,
      next_of_kin_relation: client.next_of_kin_relation || null,
      created_at: client.created_at || null,
      updated_at: client.updated_at || null,
    };

    const overdueHistory = {
      total_installments: Number(overdueHistoryRow?.total_installments || 0),
      currently_overdue_loans: Number(overdueHistoryRow?.currently_overdue_loans || 0),
      currently_overdue_installments: Number(overdueHistoryRow?.currently_overdue_installments || 0),
      currently_overdue_amount: Number(overdueHistoryRow?.currently_overdue_amount || 0),
      paid_late_installments: Number(overdueHistoryRow?.paid_late_installments || 0),
      avg_days_late_paid_installments: Number(overdueHistoryRow?.avg_days_late_paid_installments || 0),
      max_current_days_overdue: Number(overdueHistoryRow?.max_current_days_overdue || 0),
    };

    const loanSummary = {
      total_loans: Number(loanSummaryRow?.total_loans || 0),
      active_loans: Number(loanSummaryRow?.active_loans || 0),
      closed_loans: Number(loanSummaryRow?.closed_loans || 0),
      restructured_loans: Number(loanSummaryRow?.restructured_loans || 0),
      written_off_loans: Number(loanSummaryRow?.written_off_loans || 0),
      pending_approval_loans: Number(loanSummaryRow?.pending_approval_loans || 0),
      approved_loans: Number(loanSummaryRow?.approved_loans || 0),
      rejected_loans: Number(loanSummaryRow?.rejected_loans || 0),
      total_principal_disbursed: Number(loanSummaryRow?.total_principal_disbursed || 0),
      total_expected_total: Number(loanSummaryRow?.total_expected_total || 0),
      total_repaid: Number(loanSummaryRow?.total_repaid || 0),
      total_outstanding_balance: Number(loanSummaryRow?.total_outstanding_balance || 0),
      total_repayment_transactions: repaymentHistory.length,
      first_disbursed_at: loanSummaryRow?.first_disbursed_at || null,
      latest_disbursed_at: loanSummaryRow?.latest_disbursed_at || null,
      overdue_history: overdueHistory,
    };

    return {
      status: 200,
      body: {
        clientProfile: profile,
        kycStatus: {
          status: String(client.kyc_status || "pending").toLowerCase(),
          isVerified: String(client.kyc_status || "").toLowerCase() === "verified",
        },
        loanSummary,
        loans,
        repaymentHistory,
        collectionActions,
      },
    };
  }

  return {
    computeGraduatedLimitForClient,
    listAssignableOfficers,
    reallocatePortfolio,
    getClientWithLoans,
    getClientHistory,
  };
}
