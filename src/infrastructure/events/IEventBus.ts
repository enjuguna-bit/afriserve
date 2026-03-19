import type { DomainEvent } from "../../domain/shared/events/DomainEvent.js";

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;

/**
 * Port: event bus contract.
 * Implementations: InMemoryEventBus (dev/test), OutboxEventBus (production via domainEventService).
 */
export interface IEventBus {
  /**
   * Publish a single domain event to all registered handlers.
   * Handlers are called sequentially; errors are propagated to the caller.
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Publish multiple domain events in order.
   * Convenience wrapper — equivalent to calling publish() for each event.
   */
  publishAll(events: DomainEvent[]): Promise<void>;

  /**
   * Register a handler for a specific event type.
   * Multiple handlers per event type are supported.
   * @param eventType - the value of DomainEvent.eventType to subscribe to
   * @param handler   - async function called with the event
   */
  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void;

  /**
   * Remove a previously registered handler.
   * No-op if the handler was never registered.
   */
  unsubscribe(eventType: string, handler: EventHandler): void;
}
