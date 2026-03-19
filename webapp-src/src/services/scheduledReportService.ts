import type { PrismaClientLike } from "../db/prismaClient.js";
import { buildTabularExport } from "./reportExportService.js";

interface ScheduledReportServiceDeps {
  prisma: PrismaClientLike;
}

function createScheduledReportService(deps: ScheduledReportServiceDeps) {
  const { prisma } = deps;

  async function getPortfolioSummary(): Promise<Record<string, number>> {
    const loans = await prisma.loans.findMany({
      select: {
        id: true,
        status: true,
        principal: true,
        expected_total: true,
        repaid_total: true,
        balance: true,
      },
    });

    const activeStatuses = new Set(["active", "restructured"]);
    const activeLoanIds = new Set(
      loans
        .filter((loan) => activeStatuses.has(String(loan.status || "").toLowerCase()))
        .map((loan) => Number(loan.id)),
    );

    const overdueInstallments = activeLoanIds.size > 0
      ? await prisma.loan_installments.findMany({
        where: {
          loan_id: { in: [...activeLoanIds] },
          status: {
            not: "paid",
          },
          due_date: {
            lt: new Date().toISOString(),
          },
        },
        select: {
          amount_due: true,
          amount_paid: true,
        },
      })
      : [];

    const totalLoans = loans.length;
    const activeLoans = loans.filter((loan) => activeStatuses.has(String(loan.status || "").toLowerCase())).length;
    const restructuredLoans = loans.filter((loan) => String(loan.status || "").toLowerCase() === "restructured").length;
    const writtenOffLoans = loans.filter((loan) => String(loan.status || "").toLowerCase() === "written_off").length;

    const principalDisbursed = Number(loans.reduce((sum, loan) => sum + Number(loan.principal || 0), 0).toFixed(2));
    const expectedTotal = Number(loans.reduce((sum, loan) => sum + Number(loan.expected_total || 0), 0).toFixed(2));
    const repaidTotal = Number(loans.reduce((sum, loan) => sum + Number(loan.repaid_total || 0), 0).toFixed(2));
    const outstandingBalance = Number(
      loans
        .filter((loan) => activeStatuses.has(String(loan.status || "").toLowerCase()))
        .reduce((sum, loan) => sum + Number(loan.balance || 0), 0)
        .toFixed(2),
    );
    const overdueInstallmentsCount = overdueInstallments.length;
    const overdueAmount = Number(
      overdueInstallments
        .reduce((sum, installment) => sum + Number(installment.amount_due || 0) - Number(installment.amount_paid || 0), 0)
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
      summary: rows[0],
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
