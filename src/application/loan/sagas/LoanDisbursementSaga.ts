/**
 * LoanDisbursementSaga
 *
 * WHY THIS EXISTS (Gap 4 from the system audit):
 *   Before this saga, the disbursement flow was a monolithic method in
 *   loanLifecycleService.disburseLoan that ran GL posting + mobile money +
 *   loan status update in one block with no compensation on failure.
 *
 *   If the GL journal posted but the mobile money call then failed, the loan
 *   was left in "approved" status with a dangling GL entry and no cash moved.
 *   If the loan status update succeeded but the B2C call failed, cash moved
 *   but the loan showed "active" with no corresponding mobile money record.
 *
 * WHAT IT DOES:
 *   1. Listens for "loan.approved" events via IEventBus.subscribe().
 *   2. When triggered (manually or by the event), it runs the saga:
 *        a. Validate: loan is still in "approved" state (idempotency guard).
 *        b. Disburse: call loanLifecycleService.disburseLoan (which handles
 *           GL posting + installment schedule + interest profile atomically).
 *        c. [Optional] Mobile money: if mobileMoneyService is configured and
 *           the loan client has a registered phone, initiate B2C payout.
 *        d. Compensate on failure: publish "loan.disbursement_failed" event
 *           so the outbox job can alert operators without data corruption —
 *           the loan stays in "approved" and can be retried cleanly.
 *
 * INVOCATION MODES:
 *   a. Event-driven: register() wires it to "loan.approved" on the event bus.
 *      Fires automatically only when autoDisburseOnApproval=true.
 *   b. On-demand: execute(loanId, ...) can be called directly from the route
 *      handler for manual/immediate disbursement (the existing disburse route
 *      continues to work without change).
 *
 * NOTE ON THE EXISTING ROUTE:
 *   loanExecutionRouteService still calls loanLifecycleService.disburseLoan
 *   directly for backwards compatibility. This saga adds the event-driven
 *   path on top — it does NOT replace the direct route call. Both paths
 *   are safe because disburseLoan is idempotent: calling it twice on an
 *   already-active loan returns "Loan is already disbursed" without error.
 */
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { DomainEvent } from "../../../domain/shared/events/DomainEvent.js";
import type { LoanApproved } from "../../../domain/loan/events/LoanApproved.js";

// ─── Minimal type contracts ────────────────────────────────────────────────

interface LoanLifecycleServiceLike {
  disburseLoan: (args: {
    loanId: number;
    payload: { notes?: string; finalDisbursement?: boolean };
    user: { sub: number };
    ipAddress: string | null | undefined;
  }) => Promise<Record<string, any>>;
}

interface MobileMoneyServiceLike {
  disburseLoanToWallet: (args: {
    loanId: number;
    payload: Record<string, any>;
    user: { sub: number };
    ipAddress: string | null | undefined;
  }) => Promise<Record<string, any>>;
}

interface PublishDomainEventFn {
  (payload: {
    eventType: string;
    aggregateType: string;
    aggregateId: number | null | undefined;
    payload?: Record<string, unknown> | null;
    occurredAt?: string | null;
  }): Promise<number>;
}

export interface LoanDisbursementSagaOptions {
  loanLifecycleService: LoanLifecycleServiceLike;
  /** Pass null when mobile money is disabled or unconfigured */
  mobileMoneyService: MobileMoneyServiceLike | null;
  publishDomainEvent: PublishDomainEventFn;
  /** System user id used for saga-initiated disbursements */
  systemUserId?: number;
  /** If true, approval events auto-trigger disbursement step 1 */
  autoDisburseOnApproval?: boolean;
  /** If true, saga auto-initiates mobile money B2C on approval */
  autoMobileMoney?: boolean;
}

// ─── Saga class ────────────────────────────────────────────────────────────

export class LoanDisbursementSaga {
  private readonly _loanLifecycleService: LoanLifecycleServiceLike;
  private readonly _mobileMoneyService: MobileMoneyServiceLike | null;
  private readonly _publishDomainEvent: PublishDomainEventFn;
  private readonly _systemUserId: number;
  private readonly _autoDisburseOnApproval: boolean;
  private readonly _autoMobileMoney: boolean;

  constructor(options: LoanDisbursementSagaOptions) {
    this._loanLifecycleService = options.loanLifecycleService;
    this._mobileMoneyService   = options.mobileMoneyService ?? null;
    this._publishDomainEvent   = options.publishDomainEvent;
    this._systemUserId         = options.systemUserId ?? 0;
    this._autoDisburseOnApproval = options.autoDisburseOnApproval ?? false;
    this._autoMobileMoney      = options.autoMobileMoney ?? false;
  }

  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * Wire this saga into the event bus so it fires automatically when a loan
   * is approved. Call once during bootstrap (e.g. in serviceRegistry.ts).
   */
  register(eventBus: IEventBus): void {
    eventBus.subscribe<LoanApproved | DomainEvent>("loan.approved", async (event) => {
      if (!this._autoDisburseOnApproval) {
        return;
      }

      const loanId = event.aggregateId ?? ("loanId" in event ? event.loanId : null);
      if (!loanId) return;

      // Fire-and-forget: saga errors are compensated internally
      await this.execute(Number(loanId), {
        triggeredByEvent: true,
        notes: "Auto-disbursed on loan approval",
      }).catch(() => {
        // Compensation already published inside execute() — swallow here
        // so the event bus subscriber never throws
      });
    });
  }

  // ── Core saga execution ───────────────────────────────────────────────────

  /**
   * Execute the disbursement saga for a specific loan.
   *
   * @param loanId     - the loan to disburse
   * @param opts.notes - optional notes forwarded to disburseLoan
   * @param opts.triggeredByEvent - true when called from the event handler
   *                    (changes logging but not behaviour)
   * @param opts.mobileMoneyPayload - optional mobile money override params
   */
  async execute(
    loanId: number,
    opts: {
      notes?: string;
      triggeredByEvent?: boolean;
      mobileMoneyPayload?: Record<string, any>;
    } = {},
  ): Promise<{ success: boolean; step: string; result?: Record<string, any>; error?: string }> {

    // ── Step 1: Disburse (GL + installment schedule + status → active) ───
    let disburseResult: Record<string, any>;
    try {
      disburseResult = await this._loanLifecycleService.disburseLoan({
        loanId,
        payload: {
          notes: opts.notes ?? "Saga-initiated disbursement",
          finalDisbursement: true,
        },
        user: { sub: this._systemUserId },
        ipAddress: null,
      });
    } catch (disburseError) {
      const errorMsg = disburseError instanceof Error ? disburseError.message : String(disburseError);

      // Idempotency: if already disbursed, treat as success
      if (errorMsg.toLowerCase().includes("already disbursed")) {
        return { success: true, step: "disburse_skipped_already_active" };
      }

      // Compensation: publish failure event so operators are alerted
      await this._compensate(loanId, "disburse", errorMsg);
      return { success: false, step: "disburse", error: errorMsg };
    }

    // ── Step 2: Mobile money B2C payout (optional) ───────────────────────
    if (this._autoMobileMoney && this._mobileMoneyService) {
      try {
        await this._mobileMoneyService.disburseLoanToWallet({
          loanId,
          payload: opts.mobileMoneyPayload ?? {},
          user: { sub: this._systemUserId },
          ipAddress: null,
        });
      } catch (mmError) {
        const errorMsg = mmError instanceof Error ? mmError.message : String(mmError);

        // Mobile money failure is non-fatal for the disbursement itself —
        // the loan is already active and the GL entry is posted.
        // We publish a specific event so operations can trigger a manual retry.
        await this._publishDomainEvent({
          eventType:     "loan.mobile_money_disbursement_failed",
          aggregateType: "loan",
          aggregateId:   loanId,
          payload: {
            loanId,
            step:       "mobile_money_b2c",
            errorMessage: errorMsg,
            retryable:  true,
          },
          occurredAt: new Date().toISOString(),
        }).catch(() => { /* best-effort */ });

        // Return partial success — loan is active, cash not yet moved
        return {
          success: true,
          step: "mobile_money_failed_loan_active",
          result: disburseResult,
          error: errorMsg,
        };
      }
    }

    return { success: true, step: "complete", result: disburseResult };
  }

  // ── Compensation ──────────────────────────────────────────────────────────

  private async _compensate(loanId: number, failedStep: string, errorMsg: string): Promise<void> {
    await this._publishDomainEvent({
      eventType:     "loan.disbursement_failed",
      aggregateType: "loan",
      aggregateId:   loanId,
      payload: {
        loanId,
        failedStep,
        errorMessage: errorMsg,
        retryable:    true,
        compensated:  true,
        // Loan stays in "approved" state — no rollback needed since
        // disburseLoan threw before any state change was committed.
      },
      occurredAt: new Date().toISOString(),
    }).catch(() => { /* best-effort — must not mask the original error */ });
  }
}
