import { all } from "../db/connection.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";
import { buildTabularExport } from "./reportExportService.js";

function createScheduledReportService() {

  async function getPortfolioSummary(): Promise<Record<string, number>> {
    const tenantId = getCurrentTenantId();
    const loans = await all(
      "SELECT id, status, principal, expected_total, repaid_total, balance FROM loans WHERE tenant_id = ?",
      [tenantId],
    );

    const activeStatuses = new Set(["active", "restructured"]);
    const activeLoanIds = loans
      .filter((loan) => activeStatuses.has(String(loan["status"] || "").toLowerCase()))
      .map((loan) => Number(loan["id"]))
      .filter((id) => Number.isInteger(id) && id > 0);

    let overdueInstallments: Array<Record<string, unknown>> = [];
    if (activeLoanIds.length > 0) {
      const placeholders = activeLoanIds.map(() => "?").join(", ");
      overdueInstallments = await all(
        `SELECT amount_due, amount_paid
         FROM loan_installments
         WHERE loan_id IN (${placeholders})
           AND status != 'paid'
           AND date(due_date) < date('now')`,
        activeLoanIds,
      );
    }

    const totalLoans = loans.length;
    const activeLoans = loans.filter((loan) => activeStatuses.has(String(loan["status"] || "").toLowerCase())).length;
    const restructuredLoans = loans.filter((loan) => String(loan["status"] || "").toLowerCase() === "restructured").length;
    const writtenOffLoans = loans.filter((loan) => String(loan["status"] || "").toLowerCase() === "written_off").length;

    const principalDisbursed = Number(loans.reduce((sum, loan) => sum + Number(loan["principal"] || 0), 0).toFixed(2));
    const expectedTotal = Number(loans.reduce((sum, loan) => sum + Number(loan["expected_total"] || 0), 0).toFixed(2));
    const repaidTotal = Number(loans.reduce((sum, loan) => sum + Number(loan["repaid_total"] || 0), 0).toFixed(2));
    const outstandingBalance = Number(
      loans
        .filter((loan) => activeStatuses.has(String(loan["status"] || "").toLowerCase()))
        .reduce((sum, loan) => sum + Number(loan["balance"] || 0), 0)
        .toFixed(2),
    );
    const overdueInstallmentsCount = overdueInstallments.length;
    const overdueAmount = Number(
      overdueInstallments
        .reduce((sum, installment) => sum + Number(installment["amount_due"] || 0) - Number(installment["amount_paid"] || 0), 0)
        .toFixed(2),
    );

    return {
      total_loans: totalLoans,
      active_loans: activeLoans,
      restructured_loans: restructuredLoans,
      written_off_loans: writtenOffLoans,
      overdue_installments: overdueInstallmentsCount,
      principal_disbursed: principalDisbursed,
      expected_total: expectedTotal,
      repaid_total: repaidTotal,
      outstanding_balance: outstandingBalance,
      overdue_amount: overdueAmount,
    };
  }

  async function createDailyPortfolioDigest(): Promise<{
    generatedAt: string;
    title: string;
    headers: string[];
    rows: Array<Record<string, unknown>>;
    summary: Record<string, unknown>;
  }> {
    const summary = await getPortfolioSummary();
    const generatedAt = new Date().toISOString();
    const headers = [
      "generated_at",
      "total_loans",
      "active_loans",
      "restructured_loans",
      "written_off_loans",
      "overdue_installments",
      "overdue_amount",
      "principal_disbursed",
      "expected_total",
      "repaid_total",
      "outstanding_balance",
    ];
    const rows = [
      {
        generated_at: generatedAt,
        ...summary,
      },
    ];

    return {
      generatedAt,
      title: "Daily Portfolio Digest",
      headers,
      rows,
      summary: rows[0]!,
    };
  }

  async function createDailyPortfolioCsvAttachment(): Promise<{ filename: string; contentType: string; content: string }> {
    const digest = await createDailyPortfolioDigest();
    const exportPayload = buildTabularExport({
      format: "csv",
      filenameBase: "daily-portfolio-digest",
      title: digest.title,
      headers: digest.headers,
      rows: digest.rows,
    });
    return {
      filename: exportPayload.filename || "daily-portfolio-digest.csv",
      contentType: exportPayload.contentType || "text/csv; charset=utf-8",
      content: String(exportPayload.body || ""),
    };
  }

  return {
    createDailyPortfolioDigest,
    createDailyPortfolioCsvAttachment,
  };
}

export {
  createScheduledReportService,
};
