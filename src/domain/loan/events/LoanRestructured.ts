import { DomainEvent } from "../../shared/events/DomainEvent.js";

/**
 * Emitted when an active loan is restructured — a new repayment schedule
 * replaces the old one.
 *
 * The `previousBalance` and `newPrincipal` fields are used by
 * AccountingGlSubscriber to compute any GL adjustments required.
 */
export class LoanRestructured extends DomainEvent {
  readonly eventType = "loan.restructured";
  readonly aggregateType = "loan";
  readonly loanId: number;
  readonly clientId: number;
  readonly branchId: number | null;
  readonly previousBalance: number;
  readonly newPrincipal: number;
  readonly newTermWeeks: number;
  readonly restructuredByUserId: number;
  readonly restructuredAt: string;
  readonly reason: string | null;

  constructor(params: {
    loanId: number;
    clientId: number;
    branchId?: number | null;
    previousBalance: number;
    newPrincipal: number;
    newTermWeeks: number;
    restructuredByUserId: number;
    restructuredAt: Date;
    reason?: string | null;
    occurredAt?: Date;
  }) {
    super(params.loanId, params.occurredAt);
    this.loanId = params.loanId;
    this.clientId = params.clientId;
    this.branchId = params.branchId ?? null;
    this.previousBalance = params.previousBalance;
    this.newPrincipal = params.newPrincipal;
    this.newTermWeeks = params.newTermWeeks;
    this.restructuredByUserId = params.restructuredByUserId;
    this.restructuredAt = params.restructuredAt.toISOString();
    this.reason = params.reason ?? null;
  }
}
