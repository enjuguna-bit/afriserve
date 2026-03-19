/**
 * Base Domain Event
 * All domain events should extend this class
 */

export interface DomainEventData {
  eventId?: string;
  occurredAt?: Date;
  aggregateId?: number;
  [key: string]: any;
}

export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly eventType: string;
  public readonly occurredAt: Date;
  public readonly aggregateId?: number;
  public readonly payload: Record<string, any>;

  constructor(eventType: string, data: DomainEventData) {
    this.eventId = data.eventId || this.generateEventId();
    this.eventType = eventType;
    this.occurredAt = data.occurredAt || new Date();
    this.aggregateId = data.aggregateId;
    this.payload = { ...data };
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON(): Record<string, any> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      occurredAt: this.occurredAt.toISOString(),
      aggregateId: this.aggregateId,
      payload: this.payload,
    };
  }
}
