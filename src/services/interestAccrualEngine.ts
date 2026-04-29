import type { DbRunResult } from "../types/dataLayer.js";
import type { LoggerLike, MetricsLike } from "../types/runtime.js";
import { Decimal } from "decimal.js";
import { createGeneralLedgerService } from "./generalLedgerService.js";

type InterestAccrualEngineOptions = {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (
    callback: (tx: {
      run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
      get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
    }) => Promise<unknown> | unknown,
  ) => Promise<unknown>;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
};

type AccrualSummary = {
  scannedLoans: number;
  accruedLoans: number;
  accruedAmount: number;
  failedLoans: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toMoneyDecimal(value: Decimal.Value): Decimal {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function startOfUtcDayMs(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const date = new Date(parsed);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function utcDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function createInterestAccrualEngine(options: InterestAccrualEngineOptions) {
  const {
    get,
    all,
    executeTransaction,
    logger,
    metrics,
  } = options;
  const generalLedgerService = createGeneralLedgerService();

  async function resolveAccountAvailability() {
    const unearnedInterest = await get(
      "SELECT id FROM gl_accounts WHERE code = ? AND is_active = 1 LIMIT 1",
      ["UNEARNED_INTEREST"],
    );
    const interestIncome = await get(
      "SELECT id FROM gl_accounts WHERE code = ? AND is_active = 1 LIMIT 1",
      ["INTEREST_INCOME"],
    );

    return {
      hasUnearnedInterestAccount: Number(unearnedInterest?.id || 0) > 0,
      hasInterestIncomeAccount: Number(interestIncome?.id || 0) > 0,
    };
  }

  // FIX #6: Replaced OFFSET pagination with cursor-based (l.id > afterLoanId).
  // OFFSET forces the DB to scan and skip rows on every page; with large portfolios
  // this degrades to O(n) per page. Cursor is O(1) per page and cannot skip rows
  // if the result set changes between pages.
  async function getCandidates(limit: number, afterLoanId: number) {
    return all(
      `
        SELECT
          l.id AS loan_id,
          l.tenant_id,
          l.client_id,
          l.branch_id,
          l.balance,
          l.disbursed_at,
          p.accrual_start_at,
          p.maturity_at,
          p.total_contractual_interest,
          p.accrued_interest,
          p.last_accrual_at
        FROM loan_interest_profiles p
        INNER JOIN loans l ON l.id = p.loan_id
        WHERE l.id > ?
          AND LOWER(TRIM(COALESCE(p.accrual_method, 'upfront'))) = 'daily_eod'
          AND l.status IN ('active', 'restructured', 'overdue')
          AND COALESCE(p.total_contractual_interest, 0) > COALESCE(p.accrued_interest, 0)
        ORDER BY l.id ASC
        LIMIT ?
      `,
      [afterLoanId, limit],
    );
  }

  async function applyAccrualForLoan(
    candidate: Record<string, any>,
    asOfNow: Date,
  ): Promise<number> {
    const loanId = Number(candidate.loan_id || 0);
    if (!loanId) {
      return 0;
    }

    const accrualStartIso = String(candidate.accrual_start_at || candidate.disbursed_at || "").trim();
    const maturityIso = String(candidate.maturity_at || "").trim();
    const lastAccrualIso = String(candidate.last_accrual_at || "").trim();
    const asOfDayMs = startOfUtcDayMs(asOfNow.toISOString());
    const startMs = startOfUtcDayMs(accrualStartIso);
    const maturityMs = startOfUtcDayMs(maturityIso);
    const lastAccrualMs = lastAccrualIso ? startOfUtcDayMs(lastAccrualIso) : null;

    if (!startMs || !maturityMs || !asOfDayMs) {
      return 0;
    }
    if (maturityMs <= startMs) {
      return 0;
    }

    const totalInterest = toMoneyDecimal(candidate.total_contractual_interest || 0);
    const accruedInterest = toMoneyDecimal(candidate.accrued_interest || 0);
    if (totalInterest.lte(0) || accruedInterest.greaterThanOrEqualTo(totalInterest)) {
      return 0;
    }

    const accrualBoundaryMs = Math.min(asOfDayMs, maturityMs);
    const totalDays = Math.max(1, Math.floor((maturityMs - startMs) / DAY_MS));
    const elapsedDays = Math.max(0, Math.floor((accrualBoundaryMs - startMs) / DAY_MS));
    if (elapsedDays <= 0) {
      return 0;
    }

    const targetAccrued = totalInterest
      .mul(elapsedDays)
      .dividedBy(totalDays)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    let accrualAmount = targetAccrued.minus(accruedInterest).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (accrualAmount.lte(0)) {
      return 0;
    }

    const remainingInterest = totalInterest.minus(accruedInterest).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (remainingInterest.lte(0)) {
      return 0;
    }
    accrualAmount = Decimal.min(accrualAmount, remainingInterest).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (accrualAmount.lte(0)) {
      return 0;
    }

    const accrualDate = utcDateOnly(asOfNow);
    const nowIso = asOfNow.toISOString();
    const daysSinceLast = lastAccrualMs
      ? Math.max(1, Math.floor((asOfDayMs - lastAccrualMs) / DAY_MS))
      : Math.max(1, elapsedDays);
    const amountNumber = accrualAmount.toNumber();

    const appliedAmount = await executeTransaction(async (tx) => {
      const existingEvent = await tx.get(
        "SELECT id FROM loan_interest_accrual_events WHERE loan_id = ? AND accrual_date = ? LIMIT 1",
        [loanId, accrualDate],
      );
      if (existingEvent) {
        return 0;
      }

      const updateProfile = await tx.run(
        `
          UPDATE loan_interest_profiles
          SET
            accrued_interest = ROUND(COALESCE(accrued_interest, 0) + ?, 2),
            last_accrual_at = ?,
            updated_at = ?
          WHERE loan_id = ?
            AND LOWER(TRIM(COALESCE(accrual_method, 'upfront'))) = 'daily_eod'
        `,
        [amountNumber, nowIso, nowIso, loanId],
      );
      if (!Number(updateProfile?.changes || 0)) {
        return 0;
      }

      await tx.run(
        `
          INSERT INTO loan_interest_accrual_events (
            loan_id,
            accrual_date,
            amount,
            days_accrued,
            balance_snapshot,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          loanId,
          accrualDate,
          amountNumber,
          daysSinceLast,
          Number(candidate.balance || 0) || null,
          nowIso,
        ],
      );

      const txResult = await tx.run(
        `
          INSERT INTO transactions (
            tenant_id,
            loan_id,
            client_id,
            branch_id,
            tx_type,
            amount,
            occurred_at,
            note
          )
          VALUES (?, ?, ?, ?, 'interest_accrual', ?, ?, ?)
        `,
        [
          String(candidate.tenant_id || "").trim() || "default",
          loanId,
          Number(candidate.client_id || 0) || null,
          Number(candidate.branch_id || 0) || null,
          amountNumber,
          nowIso,
          `EOD interest accrual (${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"})`,
        ],
      );
      const transactionId = Number(txResult?.lastID || 0);
      if (!transactionId) {
        throw new Error("Failed to create transaction for interest accrual");
      }

      await generalLedgerService.postJournal({
        run: tx.run,
        get,
        referenceType: "loan_interest_accrual",
        referenceId: transactionId,
        loanId,
        clientId: Number(candidate.client_id || 0) || null,
        branchId: Number(candidate.branch_id || 0) || null,
        description: "Daily interest accrual posted",
        note: `Accrual date ${accrualDate}`,
        postedByUserId: null,
        postedAt: nowIso,
        lines: [
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.UNEARNED_INTEREST,
            side: "debit",
            amount: amountNumber,
            memo: "Recognize earned interest from deferred balance",
          },
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.INTEREST_INCOME,
            side: "credit",
            amount: amountNumber,
            memo: "Recognize daily interest income",
          },
        ],
      });

      return amountNumber;
    });

    return Number(appliedAmount || 0);
  }

  async function applyDailyAccruals(): Promise<AccrualSummary> {
    const startedAtMs = Date.now();
    const batchSize = 500;
    let lastLoanId = 0;
    let scannedLoans = 0;
    let accruedLoans = 0;
    let accruedAmount = new Decimal(0);
    const accountAvailability = await resolveAccountAvailability();

    if (!accountAvailability.hasUnearnedInterestAccount || !accountAvailability.hasInterestIncomeAccount) {
      if (logger && typeof logger.warn === "function") {
        logger.warn("interest_accrual_engine.accounts_missing", {
          hasUnearnedInterest: accountAvailability.hasUnearnedInterestAccount,
          hasInterestIncome: accountAvailability.hasInterestIncomeAccount,
        });
      }
      return {
        scannedLoans: 0,
        accruedLoans: 0,
        accruedAmount: 0,
        failedLoans: 0,
      };
    }
    let failedLoans = 0;
    let lastFailureMessage: string | null = null;

    while (true) {
      const batch = await getCandidates(batchSize, lastLoanId);
      if (batch.length === 0) {
        break;
      }

      scannedLoans += batch.length;
      for (const candidate of batch) {
        const candidateAsOfNow = new Date();
        try {
          const applied = await applyAccrualForLoan(candidate, candidateAsOfNow);
          if (applied > 0) {
            accruedLoans += 1;
            accruedAmount = accruedAmount.plus(applied).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          }
        } catch (error) {
          failedLoans += 1;
          lastFailureMessage = error instanceof Error ? error.message : String(error);
          if (logger && typeof logger.error === "function") {
            logger.error("interest_accrual_engine.loan_failed", {
              loanId: Number(candidate.loan_id || 0) || null,
              error,
            });
          }
        }
      }

      const nextLastLoanId = Number(batch[batch.length - 1]?.loan_id || 0);
      if (!Number.isInteger(nextLastLoanId) || nextLastLoanId <= lastLoanId) {
        if (logger && typeof logger.warn === "function") {
          logger.warn("interest_accrual_engine.cursor_not_advanced", {
            lastLoanId,
            nextLastLoanId,
            batchSize: batch.length,
          });
        }
        break;
      }
      lastLoanId = nextLastLoanId;
    }

    const summary: AccrualSummary = {
      scannedLoans,
      accruedLoans,
      accruedAmount: accruedAmount.toNumber(),
      failedLoans,
    };

    if (failedLoans > 0 && logger && typeof logger.warn === "function") {
      logger.warn("interest_accrual_engine.completed_with_failures", {
        ...summary,
        lastError: lastFailureMessage,
      });
    }

    if (metrics && typeof metrics.observeBackgroundTask === "function") {
      metrics.observeBackgroundTask("loan_interest_accrual_apply", {
        ...summary,
        success: failedLoans === 0,
        durationMs: Date.now() - startedAtMs,
        ...(lastFailureMessage ? { errorMessage: lastFailureMessage } : {}),
      });
    }

    return summary;
  }

  return {
    applyDailyAccruals,
  };
}

export {
  createInterestAccrualEngine,
};
