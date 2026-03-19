import { DomainEvent } from "../../shared/events/DomainEvent.js";

export class ClientKycUpdated extends DomainEvent {
  readonly eventType = "client.kyc_status.updated";
  readonly aggregateType = "client";
  readonly clientId: number;
  readonly previousStatus: string;
  readonly nextStatus: string;
  readonly updatedByUserId: number;
  readonly note: string | null;

  constructor(params: {
    clientId: number;
    previousStatus: string;
    nextStatus: string;
    updatedByUserId: number;
    note?: string | null;
    occurredAt?: Date;
  }) {
    super(params.clientId, params.occurredAt);
    this.clientId = params.clientId;
    this.previousStatus = params.previousStatus;
    this.nextStatus = params.nextStatus;
    this.updatedByUserId = params.updatedByUserId;
    this.note = params.note ?? null;
  }
}
