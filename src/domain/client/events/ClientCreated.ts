import { DomainEvent } from "../../shared/events/DomainEvent.js";

export class ClientCreated extends DomainEvent {
  readonly eventType = "client.created";
  readonly aggregateType = "client";
  readonly clientId: number;
  readonly fullName: string;
  readonly branchId: number;
  readonly officerId: number | null;
  readonly createdByUserId: number;

  constructor(params: {
    clientId: number;
    fullName: string;
    branchId: number;
    officerId?: number | null;
    createdByUserId: number;
    occurredAt?: Date;
  }) {
    super(params.clientId, params.occurredAt);
    this.clientId = params.clientId;
    this.fullName = params.fullName;
    this.branchId = params.branchId;
    this.officerId = params.officerId ?? null;
    this.createdByUserId = params.createdByUserId;
  }
}
