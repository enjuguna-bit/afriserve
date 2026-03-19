/**
 * Client Domain Events
 */

import { DomainEvent } from '../../shared/events/DomainEvent';

export class ClientCreated extends DomainEvent {
  constructor(data: {
    clientId: number;
    fullName: string;
    branchId: number;
    createdByUserId: number;
    occurredAt: Date;
  }) {
    super('ClientCreated', data);
  }

  get clientId(): number {
    return this.payload.clientId;
  }

  get fullName(): string {
    return this.payload.fullName;
  }

  get branchId(): number {
    return this.payload.branchId;
  }

  get createdByUserId(): number {
    return this.payload.createdByUserId;
  }
}

export class ClientKycCompleted extends DomainEvent {
  constructor(data: {
    clientId: number;
    verifiedByUserId: number;
    occurredAt: Date;
  }) {
    super('ClientKycCompleted', data);
  }

  get clientId(): number {
    return this.payload.clientId;
  }

  get verifiedByUserId(): number {
    return this.payload.verifiedByUserId;
  }
}

export class ClientFeesPaid extends DomainEvent {
  constructor(data: {
    clientId: number;
    amount: number;
    paymentMethod: string;
    recordedByUserId: number;
    occurredAt: Date;
  }) {
    super('ClientFeesPaid', data);
  }

  get clientId(): number {
    return this.payload.clientId;
  }

  get amount(): number {
    return this.payload.amount;
  }

  get paymentMethod(): string {
    return this.payload.paymentMethod;
  }

  get recordedByUserId(): number {
    return this.payload.recordedByUserId;
  }
}

export class ClientDeactivated extends DomainEvent {
  constructor(data: {
    clientId: number;
    reason?: string;
    deactivatedByUserId: number;
    occurredAt: Date;
  }) {
    super('ClientDeactivated', data);
  }

  get clientId(): number {
    return this.payload.clientId;
  }

  get reason(): string | undefined {
    return this.payload.reason;
  }

  get deactivatedByUserId(): number {
    return this.payload.deactivatedByUserId;
  }
}
