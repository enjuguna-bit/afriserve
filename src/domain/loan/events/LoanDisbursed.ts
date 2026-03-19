import { DomainEvent } from "../../shared/events/DomainEvent.js";

export class LoanDisbursed extends DomainEvent {
  readonly eventType = "loan.disbursed";
  readonly aggregateType = "loan";
  readonly loanId: number;
  readonly clientId: number;
  readonly principal: number;
  readonly disbursedByUserId: number;
  readonly disbursedAt: string;
  readonly externalReference: string | null;
  /** True when this is a partial tranche, false on final/full disbursement. */
  readonly isTranche: boolean;
  readonly trancheNumber: number | null;
  readonly trancheAmount: number | null;

  constructor(params: {
    loanId: number;
    clientId: number;
    principal: number;
    disbursedByUserId: number;
    disbursedAt: Date;
    externalReference?: string | null;
    isTranche?: boolean;
    trancheNumber?: number | null;
    trancheAmount?: number | null;
    occurredAt?: Date;
  }) {
    super(params.loanId, params.occurredAt);
    this.loanId = params.loanId;
    this.clientId = params.clientId;
    this.principal = params.principal;
    this.disbursedByUserId = params.disbursedByUserId;
    this.disbursedAt = params.disbursedAt.toISOString();
    this.externalReference = params.externalReference ?? null;
    this.isTranche = params.isTranche ?? false;
    this.trancheNumber = params.trancheNumber ?? null;
    this.trancheAmount = params.trancheAmount ?? null;
  }
}
