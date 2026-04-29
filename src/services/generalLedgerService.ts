import {
  DomainConflictError,
  DomainValidationError,
  UpstreamServiceError,
} from "../domain/errors.js";
import { prisma, type PrismaTransactionClient } from "../db/prismaClient.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";
import { Decimal } from "decimal.js";

const ACCOUNT_CODES = Object.freeze({
  CASH: "CASH",
  LOAN_RECEIVABLE: "LOAN_RECEIVABLE",
  INTEREST_INCOME: "INTEREST_INCOME",
  UNEARNED_INTEREST: "UNEARNED_INTEREST",
  FEE_INCOME: "FEE_INCOME",
  WRITE_OFF_EXPENSE: "WRITE_OFF_EXPENSE",
  PENALTY_INCOME: "PENALTY_INCOME",
  SUSPENSE_FUNDS: "SUSPENSE_FUNDS",
  FX_GAIN_LOSS: "FX_GAIN_LOSS",
});

interface LedgerLine {
  accountCode: string;
  side: "debit" | "credit";
  amount: number;
  transactionAmount?: number | null | undefined;
  transactionCurrency?: string | null | undefined;
  memo?: string | null | undefined;
}

interface PostJournalOptions {
  run?: (sql: string, params?: unknown[]) => Promise<{ lastID?: number }>;
  get?: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
  tx?: PrismaTransactionClient;
  referenceType: string;
  // Idempotency key component. Must be a positive integer per source event.
  referenceId: number | null | undefined;
  loanId: number | null | undefined;
  clientId: number | null | undefined;
  branchId: number | null | undefined;
  description: string;
  note?: string | null | undefined;
  postedByUserId: number | null | undefined;
  postedAt?: string | Date | null | undefined;
  baseCurrency?: string | null | undefined;
  transactionCurrency?: string | null | undefined;
  exchangeRate?: number | null | undefined;
  fxRateSource?: string | null | undefined;
  fxRateTimestamp?: string | Date | null | undefined;
  coaVersionId?: number | null | undefined;
  externalReferenceId?: string | null | undefined;
  lines: LedgerLine[];
  writeAuditLog?: (payload: {
    userId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: number | null;
    details?: string | null;
    ipAddress?: string | null;
  }) => Promise<void> | void;
}

interface ReverseJournalOptions {
  run?: (sql: string, params?: unknown[]) => Promise<{ lastID?: number }>;
  get?: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
  // `all` is required when using the raw-SQL path (run/get) rather than a
  // Prisma transaction, because fetching the original journal's entries needs
  // a multi-row query. Callers that supply `tx` do not need to provide `all`.
  all?: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  tx?: PrismaTransactionClient;
  originalJournalId: number;
  reversalReason: string;
  reversedByUserId: number | null | undefined;
  postedAt?: string | Date | null | undefined;
  writeAuditLog?: (payload: {
    userId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: number | null;
    details?: string | null;
    ipAddress?: string | null;
  }) => Promise<void> | void;
}

interface GlEntryRow {
  id: number | bigint;
  account_id: number | bigint;
  side: string;
  amount: number | string | bigint;
  transaction_amount?: number | string | bigint | null;
  transaction_currency?: string | null;
  memo?: string | null;
}

interface ReversalLine {
  accountId: number;
  side: "debit" | "credit";
  amount: number;
  transactionAmount: number | undefined;
  transactionCurrency: string | null | undefined;
  memo: string;
}

function createGeneralLedgerService() {
  function toMoneyDecimal(value: Decimal.Value): Decimal {
    return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  function toIsoDateTime(value: unknown, fallback = new Date().toISOString()): string {
    if (!value) return fallback;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return fallback;
    }
    return date.toISOString();
  }

  async function postJournal(options: PostJournalOptions): Promise<number> {
    const {
      referenceType,
      referenceId,
      loanId,
      clientId,
      branchId,
      description,
      note,
      postedByUserId,
      externalReferenceId,
      lines,
      tx,
      run,
      get,
      postedAt,
      writeAuditLog,
    } = options;
    const db = tx || prisma;

    if (!Array.isArray(lines) || lines.length < 2) {
      throw new DomainValidationError("General ledger posting must contain at least two lines");
    }

    const referenceTypeValue = String(referenceType || "").trim().toLowerCase();
    if (!referenceTypeValue) {
      throw new DomainValidationError("General ledger posting reference type is required");
    }
    const normalizedReferenceId = Number(referenceId);
    if (!Number.isInteger(normalizedReferenceId) || normalizedReferenceId <= 0) {
      throw new DomainValidationError(
        "General ledger posting reference id must be a positive integer for idempotency",
      );
    }

    const accountIdByCode: Map<string, number> = new Map();
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    const tenantId = getCurrentTenantId();
    const postingAtIso = toIsoDateTime(postedAt);
    const postingDateOnly = postingAtIso.slice(0, 10);

    const eodLockDate = new Date(`${postingDateOnly}T00:00:00.000Z`);
    const eomLockStart = new Date(`${postingDateOnly.slice(0, 7)}-01T00:00:00.000Z`);
    const eomLockEnd = new Date(eomLockStart);
    eomLockEnd.setUTCMonth(eomLockEnd.getUTCMonth() + 1);
    const eoyLockStart = new Date(`${postingDateOnly.slice(0, 4)}-01-01T00:00:00.000Z`);
    const eoyLockEnd = new Date(`${Number(postingDateOnly.slice(0, 4)) + 1}-01-01T00:00:00.000Z`);

    if (tx || (!run && !get)) {
      const seenReference = await db.gl_journals.findFirst({
        where: {
          tenant_id: tenantId,
          reference_type: referenceTypeValue,
          reference_id: normalizedReferenceId,
        },
        select: { id: true },
      });
      if (seenReference) {
        throw new DomainConflictError("General ledger journal already exists for this source event");
      }

      const periodLock = await db.gl_period_locks.findFirst({
        where: {
          status: "locked",
          OR: [
            { lock_type: "eod", lock_date: eodLockDate },
            { lock_type: "eom", lock_date: { gte: eomLockStart, lt: eomLockEnd } },
            { lock_type: "eoy", lock_date: { gte: eoyLockStart, lt: eoyLockEnd } }
          ],
        },
        select: { id: true, lock_type: true },
      });
      if (periodLock) {
        throw new DomainConflictError(`General ledger posting date is locked by ${periodLock.lock_type} close`);
      }
    } else {
      if (typeof run !== "function" || typeof get !== "function") {
        throw new DomainValidationError("General ledger posting requires either a Prisma transaction or raw run/get functions");
      }

      const seenReference = await get(
        `
          SELECT id
          FROM gl_journals
          WHERE reference_type = ?
            AND reference_id = ?
            AND tenant_id = ?
          LIMIT 1
        `,
        [referenceTypeValue, normalizedReferenceId, tenantId],
      );
      if (seenReference) {
        throw new DomainConflictError("General ledger journal already exists for this source event");
      }

      const periodLock = await get(
        `
          SELECT id, lock_type
          FROM gl_period_locks
          WHERE LOWER(TRIM(COALESCE(status, ''))) = 'locked'
            AND (
              (LOWER(TRIM(COALESCE(lock_type, ''))) = 'eod' AND CAST(lock_date AS TEXT) LIKE ?) OR
              (LOWER(TRIM(COALESCE(lock_type, ''))) = 'eom' AND CAST(lock_date AS TEXT) LIKE ?) OR
              (LOWER(TRIM(COALESCE(lock_type, ''))) = 'eoy' AND CAST(lock_date AS TEXT) LIKE ?)
            )
          LIMIT 1
        `,
        [`${postingDateOnly}%`, `${postingDateOnly.slice(0, 7)}%`, `${postingDateOnly.slice(0, 4)}%`],
      );
      if (periodLock) {
        throw new DomainConflictError(`General ledger posting date is locked by ${periodLock?.lock_type || 'period'} close`);
      }
    }

    for (const line of lines) {
      const accountCode = String(line.accountCode || "").trim().toUpperCase();
      const side = String(line.side || "").trim().toLowerCase();
      const amount = toMoneyDecimal(line.amount || 0);

      if (!accountCode) {
        throw new DomainValidationError("General ledger line account code is required");
      }
      if (side !== "debit" && side !== "credit") {
        throw new DomainValidationError(`Invalid ledger side for account ${accountCode}`);
      }
      if (!amount.isFinite() || amount.lte(0)) {
        throw new DomainValidationError(`Invalid ledger amount for account ${accountCode}`);
      }

      if (!accountIdByCode.has(accountCode)) {
        const account = tx || (!run && !get)
          ? await db.gl_accounts.findFirst({
            where: {
              code: accountCode,
              is_active: 1,
            },
            select: { id: true, name: true },
          })
          : await get!(
            `
              SELECT id, name
              FROM gl_accounts
              WHERE code = ?
                AND is_active = 1
              LIMIT 1
            `,
            [accountCode],
          );
        if (!account) {
          throw new UpstreamServiceError(`Missing active GL account: ${accountCode}`);
        }
        accountIdByCode.set(accountCode, Number(account.id));
      }

      if (side === "debit") {
        totalDebit = totalDebit.plus(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else {
        totalCredit = totalCredit.plus(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
    }

    // Tolerance is 0.001 (one-tenth of a cent). All amounts entering this
    // function are pre-rounded to 2dp via toMoneyDecimal, so in practice the
    // difference should always be exactly 0. A residual > 0.001 means a
    // genuine calculation error and must be rejected unconditionally.
    if (totalDebit.minus(totalCredit).abs().greaterThan(0.001)) {
      throw new DomainValidationError("General ledger journal is not balanced");
    }

    const journalId = tx || (!run && !get)
      ? Number((await db.gl_journals.create({
        data: {
          tenant_id: tenantId,
          reference_type: referenceTypeValue,
          reference_id: normalizedReferenceId,
          loan_id: loanId ?? null,
          client_id: clientId ?? null,
          branch_id: branchId ?? null,
          description,
          note: note || null,
          posted_by_user_id: postedByUserId ?? null,
          total_debit: totalDebit.toNumber(),
          total_credit: totalCredit.toNumber(),
          posted_at: postingAtIso,
          external_reference_id: externalReferenceId || null,
        },
        select: { id: true },
      })).id || 0)
      : Number((await run!(
        `
          INSERT INTO gl_journals (tenant_id, 
            reference_type,
            reference_id,
            loan_id,
            client_id,
            branch_id,
            description,
            note,
            posted_by_user_id,
            total_debit,
            total_credit,
            posted_at,
            external_reference_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          tenantId,
          referenceTypeValue,
          normalizedReferenceId,
          loanId ?? null,
          clientId ?? null,
          branchId ?? null,
          description,
          note || null,
          postedByUserId ?? null,
          totalDebit.toNumber(),
          totalCredit.toNumber(),
          postingAtIso,
          externalReferenceId || null,
        ],
      )).lastID || 0);
    if (!journalId) {
      throw new UpstreamServiceError("Failed to create general ledger journal");
    }

    for (const line of lines) {
      const accountCode = String(line.accountCode || "").trim().toUpperCase();
      const side = String(line.side || "").trim().toLowerCase() as "debit" | "credit";
      const amount = toMoneyDecimal(line.amount || 0).toNumber();
      const accountId = Number(accountIdByCode.get(accountCode));
      if (tx || (!run && !get)) {
        await db.gl_entries.create({
          data: {
            tenant_id: tenantId,
            journal_id: journalId,
            account_id: accountId,
            side,
            amount,
            memo: line.memo || null,
            created_at: postingAtIso,
          },
        });
      } else {
        await run!(
          `
            INSERT INTO gl_entries (tenant_id, 
              journal_id,
              account_id,
              side,
              amount,
              memo,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [getCurrentTenantId(), journalId, accountId, side, amount, line.memo || null, postingAtIso],
        );
      }
    }

    // Audit log for financial transaction
    if (writeAuditLog) {
      const debitTotal = totalDebit.toNumber();
      const creditTotal = totalCredit.toNumber();
      await writeAuditLog({
        userId: postedByUserId ?? null,
        action: "gl_journal_posted",
        targetType: "gl_journal",
        targetId: journalId,
        details: JSON.stringify({
          referenceType: referenceTypeValue,
          referenceId: normalizedReferenceId,
          loanId,
          clientId,
          branchId,
          totalDebit: debitTotal,
          totalCredit: creditTotal,
          description,
        }),
      });
    }

    return journalId;
  }

  async function reverseJournal(options: ReverseJournalOptions): Promise<number> {
    const {
      originalJournalId,
      reversalReason,
      reversedByUserId,
      tx,
      run,
      get,
      postedAt,
      writeAuditLog,
    } = options;
    const db = tx || prisma;

    if (!originalJournalId) {
      throw new DomainValidationError("Original journal ID is required for reversal");
    }

    const orgJournalIdNum = Number(originalJournalId);
    const { all } = options;
    const tenantId = getCurrentTenantId();

    // Fetch original journal and its entries
    const originalJournal = tx || (!run && !get)
      ? await db.gl_journals.findFirst({
          where: {
            id: orgJournalIdNum,
            tenant_id: tenantId,
          },
          include: { entries: true },
        })
      : await (async () => {
          if (typeof get !== "function") {
            throw new DomainValidationError("reverseJournal raw-SQL path requires a get function");
          }
          if (typeof all !== "function") {
            throw new DomainValidationError(
              "reverseJournal raw-SQL path requires an all function to fetch journal entries. "
              + "Pass options.all when not using a Prisma transaction.",
            );
          }
          const j = await get(`SELECT * FROM gl_journals WHERE id = ? AND tenant_id = ?`, [orgJournalIdNum, tenantId]);
          if (!j) return null;
          const e = await all(`SELECT * FROM gl_entries WHERE journal_id = ? AND tenant_id = ?`, [orgJournalIdNum, tenantId]);
          return { ...j, entries: e };
        })();

    if (!originalJournal) {
        throw new DomainValidationError("Original journal not found");
    }

    // Check if already reversed
    const alreadyReversed = tx || (!run && !get)
      ? await db.gl_journals.findFirst({
        where: {
          reference_type: "reversal",
          reference_id: orgJournalIdNum,
          tenant_id: tenantId,
        }
      }) : await get!(
        `SELECT id FROM gl_journals WHERE reference_type = 'reversal' AND reference_id = ? AND tenant_id = ? LIMIT 1`,
        [orgJournalIdNum, tenantId]
      );

    if (alreadyReversed) {
        throw new DomainConflictError("Journal has already been reversed");
    }
    
    const rawEntries = (originalJournal as { entries?: GlEntryRow[] }).entries ?? [];
    if (rawEntries.length === 0) {
      throw new DomainValidationError("Original journal has no entries to reverse");
    }

    // Validate every account is still active before writing any reversal line.
    // Previously this was bypassed by using account IDs directly — that skipped
    // the is_active guard that postJournal enforces on the forward path.
    const lines: ReversalLine[] = [];
    for (const entry of rawEntries) {
      const entryAccountId = Number(entry.account_id);
      if (!Number.isInteger(entryAccountId) || entryAccountId <= 0) {
        throw new DomainValidationError(
          `Reversal entry has invalid account id: ${String(entry.account_id)}`,
        );
      }

      const activeAccount = (tx !== undefined || (run === undefined && get === undefined))
        ? await db.gl_accounts.findFirst({
            where: { id: entryAccountId, is_active: 1 },
            select: { id: true },
          })
        : typeof get === "function"
          ? await get(
              `SELECT id FROM gl_accounts WHERE id = ? AND is_active = 1 LIMIT 1`,
              [entryAccountId],
            )
          : null;

      if (!activeAccount) {
        throw new UpstreamServiceError(
          `GL account id ${entryAccountId} is no longer active — reversal of journal ${orgJournalIdNum} is blocked`,
        );
      }

      const rawSide = String(entry.side || "").trim().toLowerCase();
      const reversedSide: "debit" | "credit" = rawSide === "debit" ? "credit" : "debit";

      lines.push({
        accountId: entryAccountId,
        side: reversedSide,
        amount: Number(entry.amount),
        transactionAmount: entry.transaction_amount != null ? Number(entry.transaction_amount) : undefined,
        transactionCurrency: entry.transaction_currency ?? null,
        memo: `Reversal of entry ${Number(entry.id)}: ${reversalReason}`,
      });
    }

    const postingAtIso = toIsoDateTime(postedAt);
    const postingDateOnly = postingAtIso.slice(0, 10);
    
    const eodLockDate = new Date(`${postingDateOnly}T00:00:00.000Z`);
    const eomLockStart = new Date(`${postingDateOnly.slice(0, 7)}-01T00:00:00.000Z`);
    const eomLockEnd = new Date(eomLockStart);
    eomLockEnd.setUTCMonth(eomLockEnd.getUTCMonth() + 1);
    const eoyLockStart = new Date(`${postingDateOnly.slice(0, 4)}-01-01T00:00:00.000Z`);
    const eoyLockEnd = new Date(`${Number(postingDateOnly.slice(0, 4)) + 1}-01-01T00:00:00.000Z`);
    
    // Check period lock
    const periodLock = tx || (!run && !get) ? await db.gl_period_locks.findFirst({
      where: {
        status: "locked",
        OR: [
          { lock_type: "eod", lock_date: eodLockDate },
          { lock_type: "eom", lock_date: { gte: eomLockStart, lt: eomLockEnd } },
          { lock_type: "eoy", lock_date: { gte: eoyLockStart, lt: eoyLockEnd } }
        ],
      },
      select: { id: true, lock_type: true },
    }) : await get!(
      `
        SELECT id, lock_type
        FROM gl_period_locks
        WHERE LOWER(TRIM(COALESCE(status, ''))) = 'locked'
          AND (
            (LOWER(TRIM(COALESCE(lock_type, ''))) = 'eod' AND CAST(lock_date AS TEXT) LIKE ?) OR
            (LOWER(TRIM(COALESCE(lock_type, ''))) = 'eom' AND CAST(lock_date AS TEXT) LIKE ?) OR
            (LOWER(TRIM(COALESCE(lock_type, ''))) = 'eoy' AND CAST(lock_date AS TEXT) LIKE ?)
          )
        LIMIT 1
      `,
      [`${postingDateOnly}%`, `${postingDateOnly.slice(0, 7)}%`, `${postingDateOnly.slice(0, 4)}%`]
    );
    
    if (periodLock) {
      throw new DomainConflictError(`General ledger posting date is locked by ${periodLock.lock_type || 'period'} close`);
    }

    const totalDebit = originalJournal.total_credit; 
    const totalCredit = originalJournal.total_debit;

    const journalId = tx || (!run && !get)
      ? Number((await db.gl_journals.create({
        data: {
          tenant_id: tenantId,
          reference_type: "reversal",
          reference_id: orgJournalIdNum,
          loan_id: originalJournal.loan_id,
          client_id: originalJournal.client_id,
          branch_id: originalJournal.branch_id,
          base_currency: originalJournal.base_currency,
          transaction_currency: originalJournal.transaction_currency,
          exchange_rate: originalJournal.exchange_rate,
          description: `Reversal of journal ${orgJournalIdNum}`,
          note: reversalReason,
          posted_by_user_id: reversedByUserId ?? null,
          total_debit: Number(totalDebit),
          total_credit: Number(totalCredit),
          posted_at: postingAtIso,
        },
        select: { id: true },
      })).id || 0) 
      : Number((await run!(
        `
          INSERT INTO gl_journals (tenant_id, 
            reference_type,
            reference_id,
            loan_id,
            client_id,
            branch_id,
            base_currency,
            transaction_currency,
            exchange_rate,
            description,
            note,
            posted_by_user_id,
            total_debit,
            total_credit,
            posted_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          tenantId,
          "reversal",
          orgJournalIdNum,
          originalJournal.loan_id ?? null,
          originalJournal.client_id ?? null,
          originalJournal.branch_id ?? null,
          originalJournal.base_currency ?? null,
          originalJournal.transaction_currency ?? null,
          originalJournal.exchange_rate ?? null,
          `Reversal of journal ${orgJournalIdNum}`,
          reversalReason,
          reversedByUserId ?? null,
          Number(totalDebit),
          Number(totalCredit),
          postingAtIso,
        ]
      )).lastID || 0);

    if (!journalId) {
       throw new UpstreamServiceError("Failed to create reversing journal");
    }

    for (const line of lines) {
      if (tx || (!run && !get)) {
        await db.gl_entries.create({
          data: {
            tenant_id: tenantId,
            journal_id: journalId,
            account_id: line.accountId,
            side: line.side,
            amount: line.amount,
            transaction_amount: line.transactionAmount,
            transaction_currency: line.transactionCurrency,
            memo: line.memo || null,
            created_at: postingAtIso,
          },
        });
      } else {
        await run!(
          `
            INSERT INTO gl_entries (tenant_id, 
              journal_id,
              account_id,
              side,
              amount,
              transaction_amount,
              transaction_currency,
              memo,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            tenantId,
            journalId,
            line.accountId,
            line.side,
            line.amount,
            line.transactionAmount ?? null,
            line.transactionCurrency ?? null,
            line.memo || null,
            postingAtIso
          ]
        );
      }
    }

    // Audit log for journal reversal
    if (writeAuditLog) {
      await writeAuditLog({
        userId: reversedByUserId ?? null,
        action: "gl_journal_reversed",
        targetType: "gl_journal",
        targetId: journalId,
        details: JSON.stringify({
          originalJournalId: orgJournalIdNum,
          reversalReason,
          totalDebit: Number(totalDebit),
          totalCredit: Number(totalCredit),
        }),
      });
    }

    return journalId;
  }

  return {
    ACCOUNT_CODES,
    postJournal,
    reverseJournal,
  };
}

export {
  ACCOUNT_CODES,
  createGeneralLedgerService,
};
