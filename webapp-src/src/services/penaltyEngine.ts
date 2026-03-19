import type { DbRunResult } from "../types/dataLayer.js";
import type { LoggerLike, MetricsLike } from "../types/runtime.js";
import { Decimal } from "decimal.js";
import { createGeneralLedgerService } from "./generalLedgerService.js";

type PenaltyEngineOptions = {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (
    callback: (tx: {
      run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
      get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
      all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
    }) => Promise<unknown> | unknown,
  ) => Promise<unknown>;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
};

type CandidateInstallment = {
  installmentId: number;
  loanId: number;
};

type PenaltyResult = {
  scannedInstallments: number;
  chargedInstallments: number;
  chargedAmount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toMoneyDecimal(value: Decimal.Value): Decimal {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function roundMoney(value: Decimal.Value): number {
  return toMoneyDecimal(value).toNumber();
}

function parseIsoMs(value: unknown): number | null {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function createPenaltyEngine(options: PenaltyEngineOptions) {
  const {
    get,
    all,
    executeTransaction,
    logger,
    metrics,
  } = options;
  const generalLedgerService = createGeneralLedgerService();

  async function resolveActiveAccountAvailability() {
    const receivable = await get(
      "SELECT id FROM gl_accounts WHERE code = ? AND is_active = 1 LIMIT 1",
      ["LOAN_RECEIVABLE"],
    );
    const penaltyIncome = await get(
      "SELECT id FROM gl_accounts WHERE code = ? AND is_active = 1 LIMIT 1",
      ["PENALTY_INCOME"],
    );

    return {
      hasReceivableAccount: Number(receivable?.id || 0) > 0,
      hasPenaltyIncomeAccount: Number(penaltyIncome?.id || 0) > 0,
    };
  }

  async function getPenaltyCandidatesBatch(limit: number, afterInstallmentId: number): Promise<CandidateInstallment[]> {
    const rows = await all(
      `
        SELECT
          i.id AS installment_id,
          i.loan_id
        FROM loan_installments i
        INNER JOIN loans l ON l.id = i.loan_id
        INNER JOIN loan_products p ON p.id = l.product_id
        WHERE i.status = 'overdue'
          AND i.id > ?
          AND l.status IN ('active', 'restructured')
          AND (COALESCE(i.amount_due, 0) - COALESCE(i.amount_paid, 0)) > 0
          AND (
            COALESCE(i.penalty_rate_daily, p.penalty_rate_daily, 0) > 0
            OR COALESCE(i.penalty_flat_amount, p.penalty_flat_amount, 0) > 0
          )
        ORDER BY i.id ASC
        LIMIT ?
      `,
      [afterInstallmentId, limit],
    );

    return rows.map((row) => ({
      installmentId: Number(row.installment_id || 0),
      loanId: Number(row.loan_id || 0),
    })).filter((row) => row.installmentId > 0 && row.loanId > 0);
  }

  async function applyPenaltyToInstallment(
    installmentId: number,
  ): Promise<number> {
    const chargeApplied = await executeTransaction(async (tx) => {
      const installment = await tx.get(
        `
          SELECT
            i.id,
            i.loan_id,
            i.installment_number,
            i.due_date,
            i.status,
            i.amount_due,
            i.amount_paid,
            COALESCE(i.penalty_amount_accrued, 0) AS penalty_amount_accrued,
            i.penalty_last_applied_at,
            COALESCE(i.penalty_rate_daily, p.penalty_rate_daily, 0) AS penalty_rate_daily,
            COALESCE(i.penalty_flat_amount, p.penalty_flat_amount, 0) AS penalty_flat_amount,
            COALESCE(i.penalty_grace_days, p.penalty_grace_days, 0) AS penalty_grace_days,
            COALESCE(i.penalty_cap_amount, p.penalty_cap_amount) AS penalty_cap_amount,
            LOWER(TRIM(COALESCE(i.penalty_compounding_method, p.penalty_compounding_method, 'simple'))) AS penalty_compounding_method,
            LOWER(TRIM(COALESCE(i.penalty_base_amount, p.penalty_base_amount, 'installment_outstanding'))) AS penalty_base_amount,
            COALESCE(i.penalty_cap_percent_of_outstanding, p.penalty_cap_percent_of_outstanding) AS penalty_cap_percent_of_outstanding,
            COALESCE(l.principal, 0) AS loan_principal,
            COALESCE(l.balance, 0) AS loan_balance,
            l.client_id,
            l.branch_id
          FROM loan_installments i
          INNER JOIN loans l ON l.id = i.loan_id
          INNER JOIN loan_products p ON p.id = l.product_id
          WHERE i.id = ?
            AND i.status = 'overdue'
            AND l.status IN ('active', 'restructured')
          LIMIT 1
        `,
        [installmentId],
      );

      if (!installment) {
        return 0;
      }

      const amountDue = toMoneyDecimal(installment.amount_due || 0);
      const amountPaid = toMoneyDecimal(installment.amount_paid || 0);
      const outstandingAmount = amountDue.minus(amountPaid).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      if (outstandingAmount.lte(0)) {
        return 0;
      }

      const penaltyAccrued = toMoneyDecimal(installment.penalty_amount_accrued || 0);
      const penaltyRateDaily = Math.max(0, Number(installment.penalty_rate_daily || 0));
      const penaltyFlatAmount = toMoneyDecimal(Math.max(0, Number(installment.penalty_flat_amount || 0)));
      const penaltyGraceDays = Math.max(0, Math.floor(Number(installment.penalty_grace_days || 0)));
      const penaltyCapAmountRaw = Number(installment.penalty_cap_amount);
      const penaltyCapAmount = Number.isFinite(penaltyCapAmountRaw) && penaltyCapAmountRaw > 0
        ? toMoneyDecimal(penaltyCapAmountRaw)
        : null;
      const penaltyCompoundingMethodRaw = String(installment.penalty_compounding_method || "simple").trim().toLowerCase();
      const penaltyCompoundingMethod = penaltyCompoundingMethodRaw === "compound" ? "compound" : "simple";
      const penaltyBaseAmountRaw = String(installment.penalty_base_amount || "installment_outstanding").trim().toLowerCase();
      const penaltyBaseAmount = penaltyBaseAmountRaw === "principal_outstanding"
        ? "principal_outstanding"
        : penaltyBaseAmountRaw === "full_balance"
          ? "full_balance"
          : "installment_outstanding";
      const loanBalance = toMoneyDecimal(installment.loan_balance || 0);
      const principalOutstanding = Decimal.max(
        0,
        Decimal.min(
          toMoneyDecimal(installment.loan_principal || 0),
          loanBalance,
        ),
      ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const penaltyCapPercentRaw = Number(installment.penalty_cap_percent_of_outstanding);
      const penaltyCapPercent = Number.isFinite(penaltyCapPercentRaw) && penaltyCapPercentRaw > 0
        ? penaltyCapPercentRaw
        : null;

      if (penaltyRateDaily <= 0 && penaltyFlatAmount.lte(0)) {
        return 0;
      }

      const now = new Date();
      const nowMs = now.getTime();
      const dueDateMs = parseIsoMs(installment.due_date);
      if (!dueDateMs) {
        return 0;
      }

      const graceBoundaryMs = dueDateMs + (penaltyGraceDays * DAY_MS);
      const lastAppliedMs = parseIsoMs(installment.penalty_last_applied_at);
      const accrualAnchorMs = lastAppliedMs ?? graceBoundaryMs;

      let dayCount = 0;
      if (nowMs > accrualAnchorMs) {
        dayCount = Math.max(0, Math.floor((nowMs - accrualAnchorMs) / DAY_MS));
      }

      const hasGraceElapsed = nowMs > graceBoundaryMs;
      const applyFlatPenalty = hasGraceElapsed && penaltyFlatAmount.gt(0) && penaltyAccrued.lte(0);
      const penaltyBase = penaltyBaseAmount === "principal_outstanding"
        ? principalOutstanding
        : penaltyBaseAmount === "full_balance"
          ? loanBalance
          : outstandingAmount;
      const compoundedBase = penaltyCompoundingMethod === "compound"
        ? penaltyBase.plus(penaltyAccrued).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : penaltyBase;

      const dailyPenalty = compoundedBase
        .mul(penaltyRateDaily)
        .mul(dayCount)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const flatPenalty = applyFlatPenalty ? penaltyFlatAmount : new Decimal(0);
      let chargeAmount = dailyPenalty.plus(flatPenalty).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      if (chargeAmount.lte(0)) {
        return 0;
      }

      const capByOutstandingPercent = penaltyCapPercent !== null
        ? loanBalance.mul(penaltyCapPercent).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : null;
      const resolvedCapAmount = penaltyCapAmount !== null && capByOutstandingPercent !== null
        ? Decimal.min(penaltyCapAmount, capByOutstandingPercent).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : (penaltyCapAmount || capByOutstandingPercent);

      if (resolvedCapAmount !== null) {
        const remainingCap = resolvedCapAmount.minus(penaltyAccrued).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        if (remainingCap.lte(0)) {
          return 0;
        }
        chargeAmount = Decimal.min(chargeAmount, remainingCap).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }

      if (chargeAmount.lte(0)) {
        return 0;
      }
      const chargeAmountNumber = chargeAmount.toNumber();

      const nowIso = now.toISOString();
      const updateInstallment = await tx.run(
        `
          UPDATE loan_installments
          SET
            amount_due = ROUND(amount_due + ?, 2),
            penalty_amount_accrued = ROUND(COALESCE(penalty_amount_accrued, 0) + ?, 2),
            penalty_last_applied_at = ?
          WHERE id = ?
            AND status = 'overdue'
        `,
        [chargeAmountNumber, chargeAmountNumber, nowIso, installmentId],
      );

      if (!Number(updateInstallment?.changes || 0)) {
        return 0;
      }

      await tx.run(
        `
          UPDATE loans
          SET
            expected_total = ROUND(expected_total + ?, 2),
            balance = ROUND(balance + ?, 2)
          WHERE id = ?
            AND status IN ('active', 'restructured')
        `,
        [chargeAmountNumber, chargeAmountNumber, Number(installment.loan_id)],
      );

      const txResult = await tx.run(
        `
          INSERT INTO transactions (
            loan_id,
            client_id,
            branch_id,
            tx_type,
            amount,
            occurred_at,
            note
          )
          VALUES (?, ?, ?, 'penalty_charge', ?, ?, ?)
        `,
        [
          Number(installment.loan_id),
          installment.client_id ?? null,
          installment.branch_id ?? null,
          chargeAmountNumber,
          nowIso,
          `Late penalty applied to installment #${Number(installment.installment_number || 0)}`,
        ],
      );

      const transactionId = Number(txResult?.lastID || 0);
      if (!transactionId) {
        throw new Error("Failed to create transaction for penalty charge");
      }

      await generalLedgerService.postJournal({
        run: tx.run,
        get,
        referenceType: "loan_penalty_charge",
        referenceId: transactionId,
        loanId: Number(installment.loan_id),
        clientId: installment.client_id ?? null,
        branchId: installment.branch_id ?? null,
        description: "Late payment penalty charged",
        note: `Installment #${Number(installment.installment_number || 0)}`,
        postedByUserId: null,
        postedAt: nowIso,
        lines: [
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.LOAN_RECEIVABLE,
            side: "debit",
            amount: chargeAmountNumber,
            memo: "Increase loan receivable from penalty",
          },
          {
            accountCode: generalLedgerService.ACCOUNT_CODES.PENALTY_INCOME,
            side: "credit",
            amount: chargeAmountNumber,
            memo: "Recognize penalty income",
          },
        ],
      });

      return chargeAmountNumber;
    });

    return roundMoney(Number(chargeApplied || 0));
  }

  async function applyPenalties(): Promise<PenaltyResult> {
    const batchSize = 500;
    let lastInstallmentId = 0;
    const accountAvailability = await resolveActiveAccountAvailability();

    if (!accountAvailability.hasReceivableAccount || !accountAvailability.hasPenaltyIncomeAccount) {
      if (logger && typeof logger.warn === "function") {
        logger.warn("penalty_engine.accounts_missing", {
          hasReceivable: accountAvailability.hasReceivableAccount,
          hasPenaltyIncome: accountAvailability.hasPenaltyIncomeAccount,
        });
      }
      return {
        scannedInstallments: 0,
        chargedInstallments: 0,
        chargedAmount: 0,
      };
    }

    let chargedInstallments = 0;
    let chargedAmount = new Decimal(0);
    let scannedInstallments = 0;

    while (true) {
      const batch = await getPenaltyCandidatesBatch(batchSize, lastInstallmentId);
      if (batch.length === 0) {
        break;
      }

      scannedInstallments += batch.length;
      for (const candidate of batch) {
        try {
          const penaltyAmount = await applyPenaltyToInstallment(candidate.installmentId);
          if (penaltyAmount > 0) {
            chargedInstallments += 1;
            chargedAmount = chargedAmount.plus(penaltyAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          }
        } catch (error) {
          if (logger && typeof logger.error === "function") {
            logger.error("penalty_engine.installment_failed", {
              installmentId: candidate.installmentId,
              loanId: candidate.loanId,
              error,
            });
          }
        }
      }

      const nextLastInstallmentId = Number(batch[batch.length - 1]?.installmentId || 0);
      if (!Number.isInteger(nextLastInstallmentId) || nextLastInstallmentId <= lastInstallmentId) {
        if (logger && typeof logger.warn === "function") {
          logger.warn("penalty_engine.cursor_not_advanced", {
            lastInstallmentId,
            nextLastInstallmentId,
            batchSize: batch.length,
          });
        }
        break;
      }

      lastInstallmentId = nextLastInstallmentId;
    }

    const summary: PenaltyResult = {
      scannedInstallments,
      chargedInstallments,
      chargedAmount: chargedAmount.toNumber(),
    };

    if (metrics && typeof metrics.observeBackgroundTask === "function") {
      metrics.observeBackgroundTask("installment_penalty_apply", {
        scannedInstallments: summary.scannedInstallments,
        chargedInstallments: summary.chargedInstallments,
        chargedAmount: summary.chargedAmount,
      });
    }

    return summary;
  }

  return {
    applyPenalties,
  };
}

export {
  createPenaltyEngine,
};
