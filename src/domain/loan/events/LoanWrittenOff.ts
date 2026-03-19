import { DomainEvent } from "../../shared/events/DomainEvent.js";

/**
 * Emitted when a loan is written off — the outstanding balance is moved to
 * write-off expense in the general ledger.
 *
 * The `writtenOffAmount` is the outstanding balance at the time of write-off,
 * and is used as the GL journal amount by AccountingGlSubscriber.
 */
export class LoanWrittenOff extends DomainEvent {
  readonly eventType = "loan.written_off";
  readonly aggregateType = "loan";
  readonly loanId: number;
  readonly clientId: number;
  readonly branchId: number | null;
  readonly writtenOffAmount: number;
  readonly writtenOffByUserId: number;
  readonly writtenOffAt: string;
  readonly reason: string | null;

  constructor(params: {
    loanId: number;
    clientId: number;
    branchId?: number | null;
    writtenOffAmount: number;
    writtenOffByUserId: number;
    writtenOffAt: Date;
    reason?: string | null;
    occurredAt?: Date;
  }) {
    super(params.loanId, params.occurredAt);
    this.loanId = params.loanId;
    this.clientId = params.clientId;
    this.branchId = params.branchId ?? null;
    this.writtenOffAmount = params.writtenOffAmount;
    this.writtenOffByUserId = params.writtenOffByUserId;
    this.writtenOffAt = params.writtenOffAt.toISOString();
    this.reason = params.reason ?? null;
  }
}
