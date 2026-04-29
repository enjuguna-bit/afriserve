import type { Request, Response } from "express";
import { getCurrentTenantId } from "../utils/tenantStore.js";

type Deps = {
  authenticate: any;
  authorize: (...roles: string[]) => any;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
};

export default function registerSimplifiedReportingRoutes(app: any, deps: Deps) {
  const { authenticate, authorize, get } = deps;

  const allowedRoles = [
    "admin", "ceo", "finance", "investor", "partner",
    "operations_manager", "area_manager",
  ];

/**
 * GET /api/reports/simplified-accounting-dashboard
 *
 * Novice-friendly financial summary for executives and business operators.
 * Computes Cash in Bank, Outstanding Loans, and Revenue Earned directly
 * from gl_entries so no materialized balance table is required.
 */
  app.get(
    "/api/reports/simplified-accounting-dashboard",
    authenticate,
    authorize(...allowedRoles),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getCurrentTenantId();

        // Find active COA version — scoped to tenant
        const activeVersion = await get(
          `SELECT id FROM gl_coa_versions WHERE status = 'active' AND tenant_id = ? LIMIT 1`,
          [tenantId],
        );

        if (!activeVersion?.id) {
          return res.status(400).json({ status: "error", message: "No active COA version found." });
        }

        const versionId = Number(activeVersion.id);

        // Single aggregate query: cash balance, loan receivable balance, income balance
        // Uses account_type (the actual column name) not classification.
        // Normal balance rules: assets → debit - credit; revenue → credit - debit.
        const summary = await get(
          `
            SELECT
              ROUND(COALESCE(SUM(CASE
                WHEN LOWER(a.account_type) IN ('asset', 'expense') AND a.name LIKE '%Cash%'
                THEN e.debit_amount - e.credit_amount ELSE 0 END), 0), 2) AS total_cash,
              ROUND(COALESCE(SUM(CASE
                WHEN LOWER(a.account_type) IN ('asset', 'expense') AND a.name LIKE '%Loan%'
                THEN e.debit_amount - e.credit_amount ELSE 0 END), 0), 2) AS total_loans_receivable,
              ROUND(COALESCE(SUM(CASE
                WHEN LOWER(a.account_type) IN ('income', 'revenue')
                THEN e.credit_amount - e.debit_amount ELSE 0 END), 0), 2) AS total_income_earned
            FROM gl_accounts a
            INNER JOIN (
              SELECT
                account_id,
                ROUND(COALESCE(SUM(CASE WHEN side = 'debit'  THEN amount ELSE 0 END), 0), 2) AS debit_amount,
                ROUND(COALESCE(SUM(CASE WHEN side = 'credit' THEN amount ELSE 0 END), 0), 2) AS credit_amount
              FROM gl_entries
              WHERE tenant_id = ?
              GROUP BY account_id
            ) e ON e.account_id = a.id
            WHERE a.coa_version_id = ?
              AND a.tenant_id = ?
              AND a.is_active = 1
          `,
          [tenantId, versionId, tenantId],
        );

        return res.status(200).json({
          status: "success",
          data: {
            summaryAt: new Date().toISOString(),
            description: "Your business summary at a glance",
            metrics: {
              totalCashAvailable: Number(summary?.total_cash || 0),
              totalMoneyOwedByCustomers: Number(summary?.total_loans_receivable || 0),
              totalRevenueEarned: Number(summary?.total_income_earned || 0),
            },
            notice: "These simplified metrics are derived securely from your strict double-entry ledger without exposing the complex accounting details.",
          },
        });
      } catch {
        return res.status(500).json({ status: "error", message: "Internal server error analyzing dashboard data." });
      }
    },
  );
}
