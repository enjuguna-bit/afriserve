import { DomainEvent } from "../../shared/events/DomainEvent.js";

export class LoanRejected extends DomainEvent {
  readonly eventType = "loan.rejected";
  readonly aggregateType = "loan";
  readonly loanId: number;
  readonly clientId: number;
  readonly rejectedByUserId: number;
  readonly rejectedAt: string;
  readonly reason: string;

  constructor(params: {
    loanId: number;
    clientId: number;
    rejectedByUserId: number;
    rejectedAt: Date;
    reason: string;
    occurredAt?: Date;
  }) {
    super(params.loanId, params.occurredAt);
    this.loanId = params.loanId;
    this.clientId = params.clientId;
    this.rejectedByUserId = params.rejectedByUserId;
    this.rejectedAt = params.rejectedAt.toISOString();
    this.reason = params.reason;
  }
}
