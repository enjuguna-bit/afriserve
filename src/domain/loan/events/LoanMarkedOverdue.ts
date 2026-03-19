import { DomainEvent } from "../../shared/events/DomainEvent.js";

/**
 * Emitted when a loan's status transitions to "overdue" because it has at least
 * one installment past its due date and no full payment has been received.
 *
 * This event is raised by the Loan aggregate's markOverdue() method so that
 * downstream subscribers (notifications, collection queues, reporting) can
 * react without polling the database.
 */
export class LoanMarkedOverdue extends DomainEvent {
  readonly eventType   = "loan.marked_overdue";
  readonly aggregateType = "loan";

  readonly loanId:              number;
  readonly clientId:            number;
  readonly branchId:            number | null;
  readonly officerId:           number | null;
  readonly overdueInstallments: number;
  readonly markedAt:            string;

  constructor(params: {
    loanId:              number;
    clientId:            number;
    branchId?:           number | null;
    officerId?:          number | null;
    overdueInstallments: number;
    markedAt:            Date;
    occurredAt?:         Date;
  }) {
    super(params.loanId, params.occurredAt ?? params.markedAt);
    this.loanId              = params.loanId;
    this.clientId            = params.clientId;
    this.branchId            = params.branchId ?? null;
    this.officerId           = params.officerId ?? null;
    this.overdueInstallments = params.overdueInstallments;
    this.markedAt            = params.markedAt.toISOString();
  }
}
