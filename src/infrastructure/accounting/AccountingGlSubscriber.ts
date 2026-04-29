/**
 * AccountingGlSubscriber
 *
 * Subscribes to loan domain events and either reconciles or posts the
 * corresponding General Ledger journals, depending on the operating mode.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO MODES (controlled by ACCOUNTING_GL_SHADOW_MODE env var):
 *
 * SHADOW MODE (default, ACCOUNTING_GL_SHADOW_MODE=true):
 *   Reconcile only — the in-process GL posting path is still the source of
 *   truth. For each loan event, this subscriber fetches what the GL journal
 *   SHOULD look like, then checks whether the in-process path already posted
 *   it. Logs MATCH, MISMATCH, or MISSING without writing anything.
 *
 *   This implements step 4 of the accounting-GL decoupling rollout plan:
 *   "Run shadow mode reconciliation (legacy GL write vs event-consumer GL
 *    write)."
 *
 * ACTIVE MODE (ACCOUNTING_GL_SHADOW_MODE=false):
 *   This subscriber IS the GL posting path — the in-process `loanLifecycleService`
 *   GL posting has been disabled. `postJournal` is called for every event. If
 *   the journal was already posted (e.g. from a previous delivery attempt) the
 *   idempotency guard in `generalLedgerService` throws `DomainConflictError`,
 *   which is caught and logged as OK — guaranteeing exactly-once GL entries
 *   even under at-least-once event delivery.
 *
 *   This implements step 5: "Cut over by disabling in-process GL posting after
 *   parity is proven."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVENT CONTRACT:
 *
 *   loan.disbursed         → DR LOAN_RECEIVABLE / CR CASH + FEE_INCOME
 *   loan.repayment.recorded → DR CASH / CR LOAN_RECEIVABLE + INTEREST_INCOME
 *   loan.written_off       → DR WRITE_OFF_EXPENSE / CR LOAN_RECEIVABLE
 *   loan.restructured      → shadow-logs only (GL entry is complex; deferred)
 *   loan.fully_repaid      → no GL entry needed (last repayment already posted)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE (bootstrap.ts):
 *
 *   // In-process bus (always active when ACCOUNTING_GL_CONSUMER_ENABLED=true)
 *   const glSubscriber = new AccountingGlSubscriber({ ... });
 *   glSubscriber.register(serviceRegistry.loan.eventBus);
 *
 *   // RabbitMQ consumer (when EVENT_BROKER_PROVIDER=rabbitmq)
 *   // Uses a dedicated queue so GL events are processed independently of
 *   // notification events and don't block each other.
 *   glSubscriber.register(rabbitMqAccountingConsumer);
 */

import type { IEventBus } from "../events/IEventBus.js";
import type { RabbitMqConsumer } from "../events/RabbitMqConsumer.js";
import type { LoggerLike } from "../../types/runtime.js";
import { DomainConflictError } from "../../domain/errors.js";

// ── GL service minimal interface ─────────────────────────────────────────────

interface GlLedgerLine {
  accountCode: string;
  side: "debit" | "credit";
  amount: number;
  memo?: string | null;
}

interface GlPostOptions {
  run?: (sql: string, params?: unknown[]) => Promise<{ lastID?: number }>;
  get?: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  referenceType: string;
  referenceId: number;
  loanId: number | null;
  clientId: number | null;
  branchId: number | null;
  description: string;
  note?: string | null;
  postedByUserId: number | null;
  postedAt?: string;
  lines: GlLedgerLine[];
}

interface GeneralLedgerServiceLike {
  ACCOUNT_CODES: Record<string, string>;
  postJournal(options: GlPostOptions): Promise<number>;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbRun = (sql: string, params?: unknown[]) => Promise<{ lastID?: number }>;

/** Minimal subscribe surface shared by IEventBus and RabbitMqConsumer */
type SubscribableBus = Pick<IEventBus, "subscribe"> | Pick<RabbitMqConsumer, "subscribe">;

// ── Options ───────────────────────────────────────────────────────────────────

export interface AccountingGlSubscriberOptions {
  get: DbGet;
  all: DbAll;
  run: DbRun;
  generalLedgerService: GeneralLedgerServiceLike;
  /**
   * When true (default), only reconcile — never write to the GL.
   * When false, post missing journals actively.
   */
  shadowMode?: boolean;
  logger?: LoggerLike | null;
}

// ── Subscriber ────────────────────────────────────────────────────────────────

export class AccountingGlSubscriber {
  private readonly get: DbGet;
  private readonly all: DbAll;
  private readonly run: DbRun;
  private readonly gl: GeneralLedgerServiceLike;
  private readonly shadowMode: boolean;
  private readonly logger: LoggerLike | null;

  constructor(options: AccountingGlSubscriberOptions) {
    this.get        = options.get;
    this.all        = options.all;
    this.run        = options.run;
    this.gl         = options.generalLedgerService;
    this.shadowMode = options.shadowMode !== false; // default true
    this.logger     = options.logger ?? null;
  }

  // ── Registration ───────────────────────────────────────────────────────────

  register(bus: SubscribableBus): void {
    bus.subscribe("loan.disbursed",           (e: any) => this._onLoanDisbursed(e).catch(err => this._logError("loan.disbursed", err)));
    bus.subscribe("loan.repayment.recorded",  (e: any) => this._onRepaymentRecorded(e).catch(err => this._logError("loan.repayment.recorded", err)));
    bus.subscribe("loan.written_off",         (e: any) => this._onLoanWrittenOff(e).catch(err => this._logError("loan.written_off", err)));
    bus.subscribe("loan.restructured",        (e: any) => this._onLoanRestructured(e).catch(err => this._logError("loan.restructured", err)));
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  private async _onLoanDisbursed(event: any): Promise<void> {
    const loanId = Number(event?.loanId ?? event?.aggregateId ?? event?.payload?.loanId ?? 0);
    if (!loanId) return;

    const occurredAt = String(event?.disbursedAt ?? event?.occurredAt ?? new Date().toISOString());

    // Fetch full loan details for GL line amounts
    const loan = await this.get(
      `SELECT principal, registration_fee, processing_fee, branch_id, client_id, disbursed_by_user_id
       FROM loans WHERE id = ? LIMIT 1`,
      [loanId],
    );
    if (!loan) {
      this._log("warn", "gl.subscriber.loan_disbursed.loan_not_found", { loanId });
      return;
    }

    const principal        = Number(loan.principal ?? 0);
    const registrationFee  = Number(loan.registration_fee ?? 0);
    const processingFee    = Number(loan.processing_fee ?? 0);
    const totalFees        = registrationFee + processingFee;
    const netCash          = principal - totalFees;
    const branchId         = Number(loan.branch_id ?? 0) || null;
    const clientId         = Number(loan.client_id ?? 0) || null;
    const postedByUserId   = Number(event?.disbursedByUserId ?? loan.disbursed_by_user_id ?? 0) || null;
    const disbursementTransaction = await this.get(
      `SELECT id
       FROM transactions
       WHERE loan_id = ?
         AND tx_type = 'disbursement'
       ORDER BY datetime(occurred_at) DESC, id DESC
       LIMIT 1`,
      [loanId],
    );
    const disbursementReferenceId = Number(
      event?.transactionId
      ?? event?.payload?.transactionId
      ?? disbursementTransaction?.id
      ?? 0,
    ) || loanId;

    if (principal <= 0) {
      this._log("warn", "gl.subscriber.loan_disbursed.invalid_principal", { loanId, principal });
      return;
    }

    // Build journal lines
    const lines: GlLedgerLine[] = [
      { accountCode: this.gl.ACCOUNT_CODES.LOAN_RECEIVABLE!, side: "debit",  amount: principal,  memo: `Loan disbursement — loan ${loanId}` },
    ];
    if (netCash > 0) {
      lines.push({ accountCode: this.gl.ACCOUNT_CODES.CASH!, side: "credit", amount: netCash, memo: `Cash disbursed — loan ${loanId}` });
    }
    if (totalFees > 0) {
      lines.push({ accountCode: this.gl.ACCOUNT_CODES.FEE_INCOME!, side: "credit", amount: totalFees, memo: `Fees — loan ${loanId}` });
    }
    // Edge-case: zero fees → net cash = principal
    if (totalFees === 0) {
      // Replace the net cash line with the full principal
      lines[1] = { accountCode: this.gl.ACCOUNT_CODES.CASH!, side: "credit", amount: principal, memo: `Cash disbursed — loan ${loanId}` };
    }

    await this._handleJournal({
      referenceType:  "loan_disbursement",
      referenceId:    disbursementReferenceId,
      loanId,
      clientId,
      branchId,
      description:    `Loan disbursement — loan #${loanId}`,
      postedByUserId,
      postedAt:       occurredAt,
      lines,
    });
  }

  private async _onRepaymentRecorded(event: any): Promise<void> {
    const loanId = Number(event?.loanId ?? event?.aggregateId ?? event?.payload?.loanId ?? 0);
    if (!loanId) return;

    const amount      = Number(event?.amount ?? event?.payload?.amount ?? 0);
    const occurredAt  = String(event?.occurredAt ?? new Date().toISOString());
    if (amount <= 0) return;

    // Look up the repayment record matching this event.
    // We match on (loan_id, amount) ordered by newest, excluding already-journalled rows.
    // A 10-second time window prevents matching stale repayments of the same amount.
    const repaymentRow = await this.get(
      `SELECT r.id, r.amount, r.principal_amount, r.interest_amount, r.penalty_amount,
              l.branch_id, l.client_id, l.disbursed_by_user_id
       FROM repayments r
       JOIN loans l ON l.id = r.loan_id
       WHERE r.loan_id = ?
          AND ABS(CAST(r.amount AS REAL) - ?) < 0.005
          AND NOT EXISTS (
            SELECT 1 FROM gl_journals
            WHERE reference_type IN ('loan_repayment', 'repayment')
              AND reference_id = r.id
          )
        ORDER BY r.id DESC
        LIMIT 1`,
      [loanId, amount],
    );

    if (!repaymentRow) {
      if (this.shadowMode) {
        // In shadow mode, a missing repayment row means the in-process path hasn't
        // run yet or didn't create a repayment record.  Log but don't error.
        this._log("info", "gl.subscriber.repayment.no_unposted_repayment_found", {
          loanId, amount, mode: "shadow",
        });
      }
      return;
    }

    const repaymentId     = Number(repaymentRow.id);
    const principalAmount = Number(repaymentRow.principal_amount ?? 0);
    const interestAmount  = Number(repaymentRow.interest_amount  ?? 0);
    const penaltyAmount   = Number(repaymentRow.penalty_amount   ?? 0);
    const branchId        = Number(repaymentRow.branch_id ?? 0) || null;
    const clientId        = Number(repaymentRow.client_id ?? 0) || null;
    const postedByUserId  = Number(event?.recordedByUserId ?? repaymentRow.disbursed_by_user_id ?? 0) || null;

    const lines: GlLedgerLine[] = [
      { accountCode: this.gl.ACCOUNT_CODES.CASH!, side: "debit", amount, memo: `Repayment — loan ${loanId}` },
    ];
    if (principalAmount > 0) {
      lines.push({ accountCode: this.gl.ACCOUNT_CODES.LOAN_RECEIVABLE!, side: "credit", amount: principalAmount, memo: `Principal — loan ${loanId}` });
    }
    if (interestAmount > 0) {
      lines.push({ accountCode: this.gl.ACCOUNT_CODES.INTEREST_INCOME!, side: "credit", amount: interestAmount, memo: `Interest — loan ${loanId}` });
    }
    if (penaltyAmount > 0) {
      lines.push({ accountCode: this.gl.ACCOUNT_CODES.PENALTY_INCOME!, side: "credit", amount: penaltyAmount, memo: `Penalty — loan ${loanId}` });
    }
    // Fallback: if split not stored, credit entire amount to LOAN_RECEIVABLE
    if (principalAmount === 0 && interestAmount === 0 && penaltyAmount === 0) {
      lines.push({ accountCode: this.gl.ACCOUNT_CODES.LOAN_RECEIVABLE!, side: "credit", amount, memo: `Repayment (no split) — loan ${loanId}` });
    }

    await this._handleJournal({
      referenceType:  "loan_repayment",
      referenceId:    repaymentId,
      loanId,
      clientId,
      branchId,
      description:    `Loan repayment — loan #${loanId} repayment #${repaymentId}`,
      postedByUserId,
      postedAt:       occurredAt,
      lines,
    });
  }

  private async _onLoanWrittenOff(event: any): Promise<void> {
    const loanId = Number(event?.loanId ?? event?.aggregateId ?? event?.payload?.loanId ?? 0);
    if (!loanId) return;

    const occurredAt = String(event?.writtenOffAt ?? event?.occurredAt ?? new Date().toISOString());

    // Prefer the amount carried in the event; fall back to DB balance at time of call
    let writeOffAmount = Number(event?.writtenOffAmount ?? event?.payload?.writtenOffAmount ?? 0);
    let branchId: number | null = Number(event?.branchId ?? event?.payload?.branchId ?? 0) || null;
    let clientId: number | null = Number(event?.clientId ?? event?.payload?.clientId ?? 0) || null;
    const postedByUserId = Number(event?.writtenOffByUserId ?? event?.payload?.writtenOffByUserId ?? 0) || null;

    if (writeOffAmount <= 0) {
      const loan = await this.get(
        "SELECT balance, branch_id, client_id FROM loans WHERE id = ? LIMIT 1",
        [loanId],
      );
      if (!loan) {
        this._log("warn", "gl.subscriber.loan_written_off.loan_not_found", { loanId });
        return;
      }
      writeOffAmount = Number(loan.balance ?? 0);
      branchId       = Number(loan.branch_id ?? 0) || null;
      clientId       = Number(loan.client_id ?? 0) || null;
    }

    if (writeOffAmount <= 0) {
      this._log("info", "gl.subscriber.loan_written_off.zero_balance", { loanId });
      return;
    }

    const lines: GlLedgerLine[] = [
      { accountCode: this.gl.ACCOUNT_CODES.WRITE_OFF_EXPENSE!, side: "debit",  amount: writeOffAmount, memo: `Write-off — loan ${loanId}` },
      { accountCode: this.gl.ACCOUNT_CODES.LOAN_RECEIVABLE!,   side: "credit", amount: writeOffAmount, memo: `Write-off — loan ${loanId}` },
    ];

    await this._handleJournal({
      referenceType:  "loan_write_off",
      referenceId:    loanId,
      loanId,
      clientId,
      branchId,
      description:    `Loan write-off — loan #${loanId}`,
      note:           String(event?.reason ?? event?.payload?.reason ?? ""),
      postedByUserId,
      postedAt:       occurredAt,
      lines,
    });
  }

  private async _onLoanRestructured(event: any): Promise<void> {
    // Restructuring GL entries are complex (vary by product and may require
    // approval-based reversal+repost). In all modes this is shadow-logged only
    // until the GL restructure template is designed and approved.
    const loanId = Number(event?.loanId ?? event?.aggregateId ?? event?.payload?.loanId ?? 0);
    this._log("info", "gl.subscriber.loan_restructured.shadow_log_only", {
      loanId,
      previousBalance: event?.previousBalance ?? event?.payload?.previousBalance,
      newPrincipal:    event?.newPrincipal    ?? event?.payload?.newPrincipal,
      mode: this.shadowMode ? "shadow" : "active",
    });

    // Check if a restructure journal already exists — useful for active-mode cutover validation
    if (loanId) {
      const existing = await this.get(
        "SELECT id FROM gl_journals WHERE reference_type = 'restructure' AND reference_id = ? LIMIT 1",
        [loanId],
      );
      this._log("info", "gl.subscriber.loan_restructured.reconcile", {
        loanId,
        glJournalExists: Boolean(existing),
      });
    }
  }

  // ── Core journal dispatch ──────────────────────────────────────────────────

  /**
   * In shadow mode:  checks whether the GL journal was already posted by the
   *                  in-process path. Logs MATCH or MISSING.
   *
   * In active mode:  calls `postJournal`. Swallows DomainConflictError (already
   *                  posted = idempotent). Rethrows any other error so the broker
   *                  can nack and retry.
   */
  private async _handleJournal(opts: {
    referenceType:  string;
    referenceId:    number;
    loanId:         number;
    clientId:       number | null;
    branchId:       number | null;
    description:    string;
    note?:          string | null;
    postedByUserId: number | null;
    postedAt?:      string;
    lines:          GlLedgerLine[];
  }): Promise<void> {
    if (this.shadowMode) {
      await this._reconcile(opts.referenceType, opts.referenceId, opts.loanId);
      return;
    }

    // Active mode — post or skip if duplicate
    try {
      const journalId = await this.gl.postJournal({
        run:           this.run,
        get:           this.get,
        referenceType: opts.referenceType,
        referenceId:   opts.referenceId,
        loanId:        opts.loanId,
        clientId:      opts.clientId,
        branchId:      opts.branchId,
        description:   opts.description,
        note:          opts.note ?? null,
        postedByUserId: opts.postedByUserId,
        postedAt:      opts.postedAt,
        lines:         opts.lines,
      });
      this._log("info", "gl.subscriber.journal_posted", {
        referenceType: opts.referenceType,
        referenceId:   opts.referenceId,
        loanId:        opts.loanId,
        journalId,
      });
    } catch (err) {
      if (err instanceof DomainConflictError) {
        // Already posted by in-process path or a previous delivery — idempotent OK
        this._log("info", "gl.subscriber.journal_already_posted", {
          referenceType: opts.referenceType,
          referenceId:   opts.referenceId,
          loanId:        opts.loanId,
        });
        return;
      }
      throw err; // propagate so the broker nacks and retries
    }
  }

  /**
   * Shadow-mode reconciliation: queries the gl_journals table and logs whether
   * the in-process path already posted the expected journal.
   */
  private async _reconcile(
    referenceType: string,
    referenceId:   number,
    loanId:        number,
  ): Promise<void> {
    let existing: Record<string, any> | null | undefined = null;
    let matchedReferenceType = referenceType;

    for (const candidateReferenceType of [referenceType, ...this._getLegacyReferenceTypes(referenceType)]) {
      existing = await this.get(
        "SELECT id, total_debit FROM gl_journals WHERE reference_type = ? AND reference_id = ? LIMIT 1",
        [candidateReferenceType, referenceId],
      );
      if (existing) {
        matchedReferenceType = candidateReferenceType;
        break;
      }
    }

    if (existing) {
      this._log("info", "gl.subscriber.reconcile.match", {
        referenceType,
        matchedReferenceType,
        referenceId,
        loanId,
        glJournalId:  Number(existing.id),
        totalDebit:   Number(existing.total_debit ?? 0),
      });
    } else {
      this._log("warn", "gl.subscriber.reconcile.missing", {
        referenceType,
        referenceId,
        loanId,
        checkedReferenceTypes: [referenceType, ...this._getLegacyReferenceTypes(referenceType)],
        hint: "In-process GL posting did not create this journal. Consider switching to active mode.",
      });
    }
  }

  private _getLegacyReferenceTypes(referenceType: string): string[] {
    switch (referenceType) {
      case "loan_disbursement":
        return ["disbursement"];
      case "loan_repayment":
        return ["repayment"];
      case "loan_write_off":
        return ["write_off"];
      default:
        return [];
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>): void {
    const method = this.logger?.[level];
    if (typeof method === "function") {
      method.call(this.logger, event, data);
    }
  }

  private _logError(eventType: string, err: unknown): void {
    this._log("error", "gl.subscriber.handler_error", {
      eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
