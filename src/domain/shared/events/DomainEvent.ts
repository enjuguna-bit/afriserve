/**
 * Base class for all domain events.
 * Keeps the shape consistent with the existing domainEventService outbox.
 */
export abstract class DomainEvent {
  abstract readonly eventType: string;
  abstract readonly aggregateType: string;
  readonly aggregateId: number | null;
  readonly occurredAt: string;

  constructor(aggregateId: number | null, occurredAt?: Date) {
    this.aggregateId = aggregateId;
    this.occurredAt = (occurredAt ?? new Date()).toISOString();
  }

  toOutboxPayload(): {
    eventType: string;
    aggregateType: string;
    aggregateId: number | null;
    payload: Record<string, unknown>;
    occurredAt: string;
  } {
    const { eventType, aggregateType, aggregateId, occurredAt, ...rest } = this as any;
    return { eventType, aggregateType, aggregateId, payload: rest, occurredAt };
  }
}
