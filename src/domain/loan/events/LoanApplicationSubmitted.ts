import { DomainEvent } from "../../shared/events/DomainEvent.js";

export class LoanApplicationSubmitted extends DomainEvent {
  readonly eventType = "loan.application.submitted";
  readonly aggregateType = "loan";
  readonly loanId: number;
  readonly clientId: number;
  readonly principal: number;
  readonly termWeeks: number;
  readonly branchId: number | null;
  readonly createdByUserId: number;

  constructor(params: {
    loanId: number;
    clientId: number;
    principal: number;
    termWeeks: number;
    branchId?: number | null;
    createdByUserId: number;
    occurredAt?: Date;
  }) {
    super(params.loanId, params.occurredAt);
    this.loanId = params.loanId;
    this.clientId = params.clientId;
    this.principal = params.principal;
    this.termWeeks = params.termWeeks;
    this.branchId = params.branchId ?? null;
    this.createdByUserId = params.createdByUserId;
  }
}
