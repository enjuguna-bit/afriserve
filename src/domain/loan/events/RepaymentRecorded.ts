import { DomainEvent } from "../../shared/events/DomainEvent.js";

export class RepaymentRecorded extends DomainEvent {
  readonly eventType = "loan.repayment.recorded";
  readonly aggregateType = "loan";
  readonly loanId: number;
  readonly clientId: number;
  readonly amount: number;
  readonly remainingBalance: number;
  readonly recordedByUserId: number;
  readonly isFullyRepaid: boolean;
  readonly externalReference: string | null;

  constructor(params: {
    loanId: number;
    clientId: number;
    amount: number;
    remainingBalance: number;
    recordedByUserId: number;
    isFullyRepaid: boolean;
    externalReference?: string | null;
    occurredAt?: Date;
  }) {
    super(params.loanId, params.occurredAt);
    this.loanId = params.loanId;
    this.clientId = params.clientId;
    this.amount = params.amount;
    this.remainingBalance = params.remainingBalance;
    this.recordedByUserId = params.recordedByUserId;
    this.isFullyRepaid = params.isFullyRepaid;
    this.externalReference = params.externalReference ?? null;
  }
}
