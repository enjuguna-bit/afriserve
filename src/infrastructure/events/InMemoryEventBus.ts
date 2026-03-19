import type { DomainEvent } from "../../domain/shared/events/DomainEvent.js";
import type { EventHandler, IEventBus } from "./IEventBus.js";

/**
 * In-memory event bus — suitable for development, unit tests, and single-process deployments.
 *
 * For production use the OutboxEventBus wrapper (which delegates to domainEventService)
 * to guarantee at-least-once delivery via the outbox table.
 *
 * Handlers are executed sequentially in registration order. Any handler that throws
 * will propagate the error to the caller of publish().
 */
export class InMemoryEventBus implements IEventBus {
  private readonly _handlers = new Map<string, EventHandler[]>();

  // ------------------------------------------------------------------
  // IEventBus
  // ------------------------------------------------------------------

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this._handlers.get(event.eventType) ?? [];
    for (const handler of handlers) {
      await handler(event);
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void {
    const existing = this._handlers.get(eventType) ?? [];
    this._handlers.set(eventType, [...existing, handler as EventHandler]);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const existing = this._handlers.get(eventType);
    if (!existing) return;
    this._handlers.set(
      eventType,
      existing.filter((h) => h !== handler),
    );
  }

  // ------------------------------------------------------------------
  // Helpers (useful in tests)
  // ------------------------------------------------------------------

  /** Returns the number of registered handlers for a given event type. */
  handlerCount(eventType: string): number {
    return this._handlers.get(eventType)?.length ?? 0;
  }

  /** Clears all registered handlers. */
  clearAll(): void {
    this._handlers.clear();
  }
}
