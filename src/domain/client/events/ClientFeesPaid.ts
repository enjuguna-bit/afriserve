import { DomainEvent } from "../../shared/events/DomainEvent.js";

export class ClientFeesPaid extends DomainEvent {
  readonly eventType = "client.fees.recorded";
  readonly aggregateType = "client";
  readonly clientId: number;
  readonly amount: number | null;
  readonly paymentReference: string | null;
  readonly paidAt: string;
  readonly recordedByUserId: number;

  constructor(params: {
    clientId: number;
    amount?: number | null;
    paymentReference?: string | null;
    paidAt: string;
    recordedByUserId: number;
    occurredAt?: Date;
  }) {
    super(params.clientId, params.occurredAt);
    this.clientId = params.clientId;
    this.amount = params.amount ?? null;
    this.paymentReference = params.paymentReference ?? null;
    this.paidAt = params.paidAt;
    this.recordedByUserId = params.recordedByUserId;
  }
}
