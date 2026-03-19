import { DomainEvent } from "../../shared/events/DomainEvent.js";

export class LoanApproved extends DomainEvent {
  readonly eventType = "loan.approved";
  readonly aggregateType = "loan";
  readonly loanId: number;
  readonly clientId: number;
  readonly approvedByUserId: number;
  readonly approvedAt: string;

  constructor(params: {
    loanId: number;
    clientId: number;
    approvedByUserId: number;
    approvedAt: Date;
    occurredAt?: Date;
  }) {
    super(params.loanId, params.occurredAt);
    this.loanId = params.loanId;
    this.clientId = params.clientId;
    this.approvedByUserId = params.approvedByUserId;
    this.approvedAt = params.approvedAt.toISOString();
  }
}
