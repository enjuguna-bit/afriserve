import { DomainEvent } from "../../shared/events/DomainEvent.js";

export class LoanFullyRepaid extends DomainEvent {
  readonly eventType = "loan.fully_repaid";
  readonly aggregateType = "loan";
  readonly loanId: number;
  readonly clientId: number;
  readonly totalRepaid: number;
  readonly closedAt: string;

  constructor(params: {
    loanId: number;
    clientId: number;
    totalRepaid: number;
    closedAt: Date;
    occurredAt?: Date;
  }) {
    super(params.loanId, params.occurredAt);
    this.loanId = params.loanId;
    this.clientId = params.clientId;
    this.totalRepaid = params.totalRepaid;
    this.closedAt = params.closedAt.toISOString();
  }
}
