import type { Request, Response } from "express";
import { prisma as db } from "../db.js";
import { Decimal } from "decimal.js";

type Deps = {
  authenticate: any;
};

export default function registerSimplifiedReportingRoutes(app: any, deps: Deps) {
  const { authenticate } = deps;

/**
 * GET /api/reports/simplified-accounting-dashboard
 *
 * SIMPLIFIED ACCOUNTING VIEW
 * This endpoint abstracts away complex double-entry accounting attributes like 'debit', 'credit'
 * side 'balances' to provide a novice-friendly summary of the financial state, ideal for
 * executives or business operators who need answers without specialized accounting knowledge.
 */
  app.get("/api/reports/simplified-accounting-dashboard", authenticate, async (req: Request, res: Response) => {
  try {
    // 1) Get pure Cash in Bank & Outstanding Loans
    // We aggregate these from known control accounts in the active COA
    const activeVersion = await db.gl_coa_versions.findFirst({
      where: { status: "active" },
    });

    if (!activeVersion) {
      return res.status(400).json({ status: "error", message: "No active COA version found" });
    }

    // Cash Accounts (Asset)
    const cashAccounts = await db.gl_accounts.findMany({
      where: {
        coa_version_id: activeVersion.id,
        classification: "asset",
        category: "current_asset",
        // Often 'cash' or 'bank' is in the name/description
        name: { contains: "Cash",  },
      },
    });

    // Loan Receivables (Asset)
    const loanAccounts = await db.gl_accounts.findMany({
      where: {
        coa_version_id: activeVersion.id,
        classification: "asset",
        category: "current_asset",
        name: { contains: "Loan Portfolio" },
      },
    });

    const incomeAccounts = await db.gl_accounts.findMany({
      where: {
        coa_version_id: activeVersion.id,
        classification: "revenue",
      },
    });

    // Helper to calculate total balance intuitively (Positive for natural balances)
    const calculateBalance = async (accounts: any[], classification: "asset" | "liability" | "equity" | "revenue" | "expense") => {
      let total = new Decimal(0);
      for (const account of accounts) {
        const bal = await db.gl_account_balances.findFirst({
          where: { account_id: account.id },
          orderBy: { as_of_date: "desc" },
        });

        if (bal) {
          // Normal balance rules to render as "positive" value
          if (classification === "asset" || classification === "expense") {
             total = total.plus(bal.balance_debit).minus(bal.balance_credit);
          } else {
             total = total.plus(bal.balance_credit).minus(bal.balance_debit);
          }
        }
      }
      return total.toNumber();
    };

    const totalCashAvailableInBank = await calculateBalance(cashAccounts, "asset");
    const totalOutstandingLoans = await calculateBalance(loanAccounts, "asset");
    const totalIncomeEarned = await calculateBalance(incomeAccounts, "revenue");

    // Simplify the response extensively
    const simplifiedResponse = {
      status: "success",
      data: {
        summaryAt: new Date().toISOString(),
        description: "Your business summary at a glance",
        metrics: {
          totalCashAvailable: totalCashAvailableInBank,
          totalMoneyOwedByCustomers: totalOutstandingLoans,
          totalRevenueEarned: totalIncomeEarned,
        },
        notice: "These simplified metrics are derived securely from your strict double-entry ledger without exposing the complex accounting details."
      }
    };

    return res.status(200).json(simplifiedResponse);

  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error analyzing dashboard data." });
  }
});

}
