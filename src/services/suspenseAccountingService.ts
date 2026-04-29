import { Decimal } from "decimal.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";
import { createFxRateService } from "./fxRateService.js";
import type { DbRunResult, DbTransactionContext } from "../types/dataLayer.js";
import type { LoggerLike } from "../types/runtime.js";
import { ACCOUNT_CODES } from "./generalLedgerService.js";
import { DomainConflictError } from "../domain/errors.js";

type SuspenseAccountingServiceOptions = {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  executeTransaction: (callback: (tx: DbTransactionContext) => Promise<unknown> | unknown) => Promise<unknown>;
  logger?: LoggerLike | null;
};

function normalizeCurrency(value: unknown, fallback = "KES"): string {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || fallback;
}

function toMoney(value: Decimal.Value): Decimal {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function toIsoDateTime(value: unknown, fallback = new Date().toISOString()): string {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function createSuspenseAccountingService(options: SuspenseAccountingServiceOptions) {
  const {
    get,
    all,
    run,
    executeTransaction,
    logger = null,
  } = options;

  const fxRateService = createFxRateService({ get, all, run, logger });

  async function resolveAccountId(tx: DbTransactionContext, accountCode: string): Promise<number> {
    const account = await tx.get(
      `
        SELECT id
        FROM gl_accounts
        WHERE code = ?
          AND is_active = 1
        LIMIT 1
      `,
      [accountCode],
    );
    const accountId = Number(account?.id || 0);
    if (!accountId) {
      throw new Error(`Missing active GL account: ${accountCode}`);
    }
    return accountId;
  }

  async function postJournal(tx: DbTransactionContext, payload: {
    referenceType: string;
    referenceId: number | null;
    loanId?: number | null;
    clientId?: number | null;
    branchId?: number | null;
    description: string;
    note?: string | null;
    postedByUserId?: number | null;
    postedAt?: string | Date | null;
    baseCurrency: string;
    transactionCurrency: string;
    exchangeRate: number;
    lines: Array<{
      accountCode: string;
      side: "debit" | "credit";
      amount: number;
      transactionAmount?: number | null;
      transactionCurrency?: string | null;
      memo?: string | null;
    }>;
  }): Promise<number> {
    const postedAtIso = toIsoDateTime(payload.postedAt);
    const lines = payload.lines || [];
    if (lines.length < 2) {
      throw new Error("Suspense journal must contain at least two lines");
    }

    const accountIdByCode: Record<string, number> = {};
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    for (const line of lines) {
      const accountCode = String(line.accountCode || "").trim().toUpperCase();
      if (!accountCode) {
        throw new Error("Ledger line account code is required");
      }
      if (line.side !== "debit" && line.side !== "credit") {
        throw new Error(`Invalid ledger side for ${accountCode}`);
      }
      const amount = toMoney(line.amount || 0);
      if (!amount.isFinite() || amount.lte(0)) {
        throw new Error(`Invalid ledger amount for ${accountCode}`);
      }
      if (!accountIdByCode[accountCode]) {
        accountIdByCode[accountCode] = await resolveAccountId(tx, accountCode);
      }

      if (line.side === "debit") {
        totalDebit = totalDebit.plus(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else {
        totalCredit = totalCredit.plus(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
    }

    if (totalDebit.minus(totalCredit).abs().greaterThan(0.005)) {
      throw new Error("Suspense journal is not balanced");
    }

    const postingDateOnly = postedAtIso.slice(0, 10);
    const periodLock = await tx.get(
      `
          SELECT id, lock_type
          FROM gl_period_locks
          WHERE LOWER(TRIM(COALESCE(status, ''))) = 'locked'
            AND (
              (LOWER(TRIM(COALESCE(lock_type, ''))) = 'eod' AND lock_date = ?) OR
              (LOWER(TRIM(COALESCE(lock_type, ''))) = 'eom' AND lock_date LIKE ?) OR
              (LOWER(TRIM(COALESCE(lock_type, ''))) = 'eoy' AND lock_date LIKE ?)
            )
          LIMIT 1
        `,
      [postingDateOnly, `${postingDateOnly.slice(0, 7)}%`, `${postingDateOnly.slice(0, 4)}%`],
    );
    if (periodLock) {
      throw new DomainConflictError(`General ledger posting date is locked by ${periodLock?.lock_type || 'period'} close`);
    }

    const insertedJournal = await tx.run(
      `
        INSERT INTO gl_journals (
          tenant_id,
          reference_type,
          reference_id,
          loan_id,
          client_id,
          branch_id,
          base_currency,
          transaction_currency,
          exchange_rate,
          fx_rate_source,
          fx_rate_timestamp,
          description,
          note,
          posted_by_user_id,
          total_debit,
          total_credit,
          posted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [getCurrentTenantId(), 
        String(payload.referenceType || "").trim().toLowerCase(),
        payload.referenceId ?? null,
        Number(payload.loanId || 0) || null,
        Number(payload.clientId || 0) || null,
        Number(payload.branchId || 0) || null,
        normalizeCurrency(payload.baseCurrency),
        normalizeCurrency(payload.transactionCurrency),
        Number(payload.exchangeRate || 1),
        "suspense_workflow",
        postedAtIso,
        payload.description,
        payload.note || null,
        Number(payload.postedByUserId || 0) || null,
        totalDebit.toNumber(),
        totalCredit.toNumber(),
        postedAtIso,
      ],
    );

    const journalId = Number(insertedJournal.lastID || 0);
    if (!journalId) {
      throw new Error("Failed to create suspense journal");
    }

    for (const line of lines) {
      const amount = toMoney(line.amount || 0).toNumber();
      const txnAmount = Number.isFinite(Number(line.transactionAmount))
        ? Number(new Decimal(line.transactionAmount || 0).toDecimalPlaces(6, Decimal.ROUND_HALF_UP))
        : amount;
      const txnCurrency = normalizeCurrency(line.transactionCurrency || payload.transactionCurrency);

      await tx.run(
        `
          INSERT INTO gl_entries (
          tenant_id,
            journal_id,
            account_id,
            side,
            amount,
            transaction_amount,
            transaction_currency,
            coa_version_id,
            coa_account_code,
            coa_account_name,
            memo,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
        `,
        [getCurrentTenantId(), 
          journalId,
          accountIdByCode[String(line.accountCode || "").trim().toUpperCase()],
          line.side,
          amount,
          txnAmount,
          txnCurrency,
          String(line.accountCode || "").trim().toUpperCase(),
          line.memo || null,
          postedAtIso,
        ],
      );
    }

    return journalId;
  }

  async function listCases(params: {
    status?: string | null;
    branchId?: number | null;
    limit?: number;
    offset?: number;
  } = {}) {
    const tenantId = getCurrentTenantId();
    const normalizedStatus = String(params.status || "").trim().toLowerCase();
    const hasStatus = ["open", "partially_allocated", "resolved"].includes(normalizedStatus);
    const branchId = Number(params.branchId || 0) || null;
    const limit = Math.max(1, Math.min(200, Math.floor(Number(params.limit || 50))));
    const offset = Math.max(0, Math.floor(Number(params.offset || 0)));

    const filters: string[] = ["sc.tenant_id = ?"];
    const queryParams: unknown[] = [tenantId];
    if (hasStatus) {
      filters.push("LOWER(TRIM(COALESCE(sc.status, ''))) = ?");
      queryParams.push(normalizedStatus);
    }
    if (branchId) {
      filters.push("sc.branch_id = ?");
      queryParams.push(branchId);
    }
    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    queryParams.push(limit, offset);

    return all(
      `
        SELECT
          sc.id,
          sc.external_reference,
          sc.source_channel,
          sc.status,
          sc.description,
          sc.branch_id,
          sc.client_id,
          sc.loan_id,
          sc.transaction_currency,
          sc.transaction_amount,
          sc.transaction_amount_remaining,
          sc.book_currency,
          sc.book_amount,
          sc.book_amount_remaining,
          sc.opening_fx_rate,
          sc.received_at,
          sc.created_by_user_id,
          sc.resolved_by_user_id,
          sc.resolved_at,
          sc.note,
          sc.created_at,
          sc.updated_at,
          ROUND(COALESCE(SUM(sa.allocated_transaction_amount), 0), 6) AS allocated_transaction_amount,
          ROUND(COALESCE(SUM(sa.carrying_book_amount), 0), 2) AS allocated_book_amount,
          ROUND(COALESCE(SUM(sa.fx_difference_amount), 0), 2) AS allocated_fx_difference
        FROM gl_suspense_cases sc
        LEFT JOIN gl_suspense_allocations sa
          ON sa.suspense_case_id = sc.id
         AND sa.tenant_id = sc.tenant_id
        ${whereSql}
        GROUP BY sc.id
        ORDER BY datetime(sc.created_at) DESC, sc.id DESC
        LIMIT ? OFFSET ?
      `,
      queryParams,
    );
  }

  async function createCase(payload: {
    externalReference?: string | null;
    sourceChannel?: string | null;
    description?: string | null;
    branchId?: number | null;
    clientId?: number | null;
    loanId?: number | null;
    transactionCurrency?: string | null;
    transactionAmount: number;
    bookCurrency?: string | null;
    fxRate?: number | null;
    receivedAt?: string | Date | null;
    note?: string | null;
    createdByUserId?: number | null;
  }) {
    const transactionCurrency = normalizeCurrency(payload.transactionCurrency, "KES");
    const bookCurrency = normalizeCurrency(payload.bookCurrency, "KES");
    const transactionAmount = toMoney(payload.transactionAmount || 0);
    if (transactionAmount.lte(0)) {
      throw new Error("Transaction amount must be greater than zero");
    }

    let fxRate = Number(payload.fxRate || 0);
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      const resolved = await fxRateService.resolveRate({
        baseCurrency: transactionCurrency,
        quoteCurrency: bookCurrency,
      });
      fxRate = Number(resolved.rate || 0);
    }
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      throw new Error("Unable to resolve valid FX rate for suspense case");
    }

    const bookAmount = transactionAmount.mul(fxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const nowIso = new Date().toISOString();
    const receivedAt = toIsoDateTime(payload.receivedAt, nowIso);
    const externalReference = String(payload.externalReference || "").trim() || null;
    const sourceChannel = String(payload.sourceChannel || "").trim() || null;
    const description = String(payload.description || "").trim() || null;
    const note = String(payload.note || "").trim() || null;
    const createdByUserId = Number(payload.createdByUserId || 0) || null;
    const branchId = Number(payload.branchId || 0) || null;
    const clientId = Number(payload.clientId || 0) || null;
    const loanId = Number(payload.loanId || 0) || null;

    const result = await executeTransaction(async (tx) => {
      const insertedCase = await tx.run(
        `
          INSERT INTO gl_suspense_cases (
          tenant_id,
            external_reference,
            source_channel,
            status,
            description,
            branch_id,
            client_id,
            loan_id,
            transaction_currency,
            transaction_amount,
            transaction_amount_remaining,
            book_currency,
            book_amount,
            book_amount_remaining,
            opening_fx_rate,
            received_at,
            created_by_user_id,
            resolved_by_user_id,
            resolved_at,
            note,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
        `,
        [getCurrentTenantId(), 
          externalReference,
          sourceChannel,
          description,
          branchId,
          clientId,
          loanId,
          transactionCurrency,
          transactionAmount.toNumber(),
          transactionAmount.toNumber(),
          bookCurrency,
          bookAmount.toNumber(),
          bookAmount.toNumber(),
          fxRate,
          receivedAt,
          createdByUserId,
          note,
          nowIso,
          nowIso,
        ],
      );
      const caseId = Number(insertedCase.lastID || 0);
      if (!caseId) {
        throw new Error("Failed to create suspense case");
      }

      const journalId = await postJournal(tx, {
        referenceType: "suspense_unallocated_receipt",
        referenceId: caseId,
        loanId,
        clientId,
        branchId,
        description: "Unallocated funds parked in suspense account",
        note: note || `Suspense case ${caseId}`,
        postedByUserId: createdByUserId,
        postedAt: receivedAt,
        baseCurrency: bookCurrency,
        transactionCurrency,
        exchangeRate: fxRate,
        lines: [
          {
            accountCode: ACCOUNT_CODES.CASH,
            side: "debit",
            amount: bookAmount.toNumber(),
            transactionAmount: transactionAmount.toNumber(),
            transactionCurrency,
            memo: "Funds received without final allocation",
          },
          {
            accountCode: ACCOUNT_CODES.SUSPENSE_FUNDS,
            side: "credit",
            amount: bookAmount.toNumber(),
            transactionAmount: transactionAmount.toNumber(),
            transactionCurrency,
            memo: "Hold funds pending finance reconciliation",
          },
        ],
      });

      return {
        caseId,
        journalId,
      };
    });

    const caseRow = await get(
      "SELECT * FROM gl_suspense_cases WHERE id = ? AND tenant_id = ? LIMIT 1",
      [Number((result as any).caseId || 0), getCurrentTenantId()],
    );
    return {
      suspense_case: caseRow,
      opening_journal_id: Number((result as any).journalId || 0),
    };
  }

  async function allocateCase(payload: {
    caseId: number;
    targetAccountCode: string;
    allocateTransactionAmount: number;
    fxRate?: number | null;
    note?: string | null;
    allocatedByUserId?: number | null;
  }) {
    const caseId = Number(payload.caseId || 0);
    if (!caseId) {
      throw new Error("Valid suspense case id is required");
    }

    const targetAccountCode = String(payload.targetAccountCode || "").trim().toUpperCase();
    if (!targetAccountCode) {
      throw new Error("Target account code is required");
    }

    const allocationTxnAmount = toMoney(payload.allocateTransactionAmount || 0);
    if (allocationTxnAmount.lte(0)) {
      throw new Error("Allocation amount must be greater than zero");
    }

    const result = await executeTransaction(async (tx) => {
      const suspenseCase = await tx.get(
        `
          SELECT *
          FROM gl_suspense_cases
          WHERE id = ?
            AND tenant_id = ?
          LIMIT 1
        `,
        [caseId, getCurrentTenantId()],
      );
      if (!suspenseCase) {
        throw new Error("Suspense case not found");
      }

      const status = String(suspenseCase.status || "").trim().toLowerCase();
      if (status === "resolved") {
        throw new Error("Suspense case is already resolved");
      }

      const remainingTxn = toMoney(suspenseCase.transaction_amount_remaining || 0);
      if (allocationTxnAmount.greaterThan(remainingTxn)) {
        throw new Error("Allocation amount exceeds remaining suspense balance");
      }

      const transactionCurrency = normalizeCurrency(suspenseCase.transaction_currency, "KES");
      const bookCurrency = normalizeCurrency(suspenseCase.book_currency, "KES");
      const openingFxRate = Number(suspenseCase.opening_fx_rate || 0) > 0
        ? Number(suspenseCase.opening_fx_rate)
        : Number(
          toMoney(suspenseCase.book_amount || 0)
            .div(toMoney(suspenseCase.transaction_amount || 0).greaterThan(0)
              ? toMoney(suspenseCase.transaction_amount || 0)
              : 1)
            .toDecimalPlaces(8, Decimal.ROUND_HALF_UP),
        );

      let settlementFxRate = Number(payload.fxRate || 0);
      if (!Number.isFinite(settlementFxRate) || settlementFxRate <= 0) {
        const resolvedRate = await fxRateService.resolveRate({
          baseCurrency: transactionCurrency,
          quoteCurrency: bookCurrency,
        });
        settlementFxRate = Number(resolvedRate.rate || 0);
      }
      if (!Number.isFinite(settlementFxRate) || settlementFxRate <= 0) {
        throw new Error("Unable to resolve valid FX rate for allocation");
      }

      const carryingBookAmount = allocationTxnAmount
        .mul(openingFxRate)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const settledBookAmount = allocationTxnAmount
        .mul(settlementFxRate)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const fxDifferenceAmount = settledBookAmount.minus(carryingBookAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      const lines: Array<{
        accountCode: string;
        side: "debit" | "credit";
        amount: number;
        transactionAmount?: number | null;
        transactionCurrency?: string | null;
        memo?: string | null;
      }> = [
        {
          accountCode: ACCOUNT_CODES.SUSPENSE_FUNDS,
          side: "debit",
          amount: carryingBookAmount.toNumber(),
          transactionAmount: allocationTxnAmount.toNumber(),
          transactionCurrency,
          memo: "Clear suspense liability at carrying amount",
        },
        {
          accountCode: targetAccountCode,
          side: "credit",
          amount: settledBookAmount.toNumber(),
          transactionAmount: allocationTxnAmount.toNumber(),
          transactionCurrency,
          memo: "Allocate suspense funds to target account",
        },
      ];
      if (fxDifferenceAmount.greaterThan(0)) {
        lines.push({
          accountCode: ACCOUNT_CODES.FX_GAIN_LOSS,
          side: "debit",
          amount: fxDifferenceAmount.toNumber(),
          memo: "Recognize FX loss on suspense reconciliation",
        });
      } else if (fxDifferenceAmount.lessThan(0)) {
        lines.push({
          accountCode: ACCOUNT_CODES.FX_GAIN_LOSS,
          side: "credit",
          amount: fxDifferenceAmount.abs().toNumber(),
          memo: "Recognize FX gain on suspense reconciliation",
        });
      }

      const nowIso = new Date().toISOString();
      const journalId = await postJournal(tx, {
        referenceType: "suspense_reconciliation",
        referenceId: null,
        loanId: Number(suspenseCase.loan_id || 0) || null,
        clientId: Number(suspenseCase.client_id || 0) || null,
        branchId: Number(suspenseCase.branch_id || 0) || null,
        description: "Manual suspense reconciliation by finance user",
        note: String(payload.note || "").trim() || null,
        postedByUserId: Number(payload.allocatedByUserId || 0) || null,
        postedAt: nowIso,
        baseCurrency: bookCurrency,
        transactionCurrency,
        exchangeRate: settlementFxRate,
        lines,
      });

      await tx.run(
        `
          INSERT INTO gl_suspense_allocations (
          tenant_id,
            suspense_case_id,
            journal_id,
            target_account_code,
            allocated_transaction_amount,
            carrying_book_amount,
            settled_book_amount,
            fx_difference_amount,
            transaction_currency,
            book_currency,
            fx_rate,
            note,
            allocated_by_user_id,
            allocated_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [getCurrentTenantId(), 
          caseId,
          journalId,
          targetAccountCode,
          allocationTxnAmount.toNumber(),
          carryingBookAmount.toNumber(),
          settledBookAmount.toNumber(),
          fxDifferenceAmount.toNumber(),
          transactionCurrency,
          bookCurrency,
          settlementFxRate,
          String(payload.note || "").trim() || null,
          Number(payload.allocatedByUserId || 0) || null,
          nowIso,
          nowIso,
        ],
      );

      const remainingTransaction = remainingTxn.minus(allocationTxnAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const remainingBook = toMoney(suspenseCase.book_amount_remaining || 0).minus(carryingBookAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const nextStatus = remainingTransaction.lte(0.0001)
        ? "resolved"
        : remainingTransaction.lessThan(toMoney(suspenseCase.transaction_amount || 0))
          ? "partially_allocated"
          : "open";

      await tx.run(
        `
          UPDATE gl_suspense_cases
          SET
            transaction_amount_remaining = ?,
            book_amount_remaining = ?,
            status = ?,
            resolved_by_user_id = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_by_user_id END,
            resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END,
            updated_at = ?
          WHERE id = ?
            AND tenant_id = ?
        `,
        [
          Math.max(0, remainingTransaction.toNumber()),
          Math.max(0, remainingBook.toNumber()),
          nextStatus,
          nextStatus,
          Number(payload.allocatedByUserId || 0) || null,
          nextStatus,
          nextStatus === "resolved" ? nowIso : null,
          nowIso,
          caseId,
          getCurrentTenantId(),
        ],
      );

      const updatedCase = await tx.get(
        "SELECT * FROM gl_suspense_cases WHERE id = ? AND tenant_id = ? LIMIT 1",
        [caseId, getCurrentTenantId()],
      );
      return {
        updatedCase,
        journalId,
      };
    });

    return {
      suspense_case: (result as any).updatedCase,
      allocation_journal_id: Number((result as any).journalId || 0),
    };
  }

  return {
    listCases,
    createCase,
    allocateCase,
  };
}

export {
  createSuspenseAccountingService,
};
