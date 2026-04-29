/**
 * OutboxEventBus — production-safe IEventBus implementation.
 *
 * Why this exists (Gap 9 from the system audit):
 *   InMemoryEventBus holds events only in process memory. If the process
 *   restarts between a domain operation and event dispatch, the events are
 *   silently lost. The existing `domain_events` outbox table + the
 *   `domainEventDispatch` job already provide at-least-once delivery, but
 *   they were only wired to the *legacy* publishDomainEvent calls, not to
 *   the new CQRS handlers that go through the IEventBus port.
 *
 * How it works:
 *   - publish() writes the event to the `domain_events` outbox table via
 *     publishDomainEvent (same function used by all legacy services).
 *   - In-process subscribers (registered via subscribe()) are ALSO called
 *     immediately for low-latency local reactions (e.g. cache invalidation).
 *   - The domainEventDispatch job polls the outbox table and forwards to any
 *     configured external broker (RabbitMQ / Kafka / none).
 *   - If the outbox write fails, publish() throws — the caller's transaction
 *     rolls back and the event is never silently dropped.
 *
 * Usage (serviceRegistry.ts):
 *   Replace `new InMemoryEventBus()` with `new OutboxEventBus(publishDomainEvent)`.
 *   The bridge monkey-patch in serviceRegistry can then be removed.
 */
import type { DomainEvent } from "../../domain/shared/events/DomainEvent.js";
import type { LoggerLike } from "../../types/runtime.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";
import type { IEventBus, EventHandler } from "./IEventBus.js";

type PublishDomainEventFn = (payload: {
  eventType: string;
  aggregateType: string;
  aggregateId: number | null | undefined;
  tenantId?: string | null | undefined;
  payload?: Record<string, unknown> | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  occurredAt?: string | null | undefined;
}) => Promise<number>;

export class OutboxEventBus implements IEventBus {
  private readonly _handlers = new Map<string, Set<EventHandler>>();

  constructor(
    private readonly publishDomainEvent: PublishDomainEventFn,
    private readonly logger: LoggerLike | null = null,
  ) {}

  // -------------------------------------------------------------------------
  // IEventBus
  // -------------------------------------------------------------------------

  async publish(event: DomainEvent): Promise<void> {
    const outboxEvent = event.toOutboxPayload();
    const payloadTenantId = typeof outboxEvent.payload?.tenantId === "string"
      ? outboxEvent.payload.tenantId
      : null;
    const eventTenantIdValue = (event as { tenantId?: unknown }).tenantId;
    const eventTenantId = typeof eventTenantIdValue === "string"
      ? eventTenantIdValue
      : null;
    const tenantId = payloadTenantId || eventTenantId || getCurrentTenantId();

    // 1. Write to outbox for guaranteed at-least-once delivery
    await this.publishDomainEvent({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      tenantId,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      // Spread remaining event fields as payload so subscribers have full context.
      payload: outboxEvent.payload,
    });

    // 2. Call any in-process subscribers immediately (best-effort — errors
    //    are caught and logged so they never suppress the outbox write above)
    const handlers = this._handlers.get(event.eventType);
    if (handlers && handlers.size > 0) {
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (err) {
          // Subscriber errors must not fail the publish call — the outbox
          // guarantees delivery; a subscriber bug should not create data loss.
          this.logger?.error?.("outbox_event_bus.subscriber_error", {
            eventType: event.eventType,
            error: err,
          });
        }
      }
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void {
    if (!this._handlers.has(eventType)) {
      this._handlers.set(eventType, new Set());
    }
    this._handlers.get(eventType)!.add(handler as EventHandler);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    this._handlers.get(eventType)?.delete(handler);
  }

  // -------------------------------------------------------------------------
  // Test helpers (mirror InMemoryEventBus API so test code is portable)
  // -------------------------------------------------------------------------

  handlerCount(eventType?: string): number {
    if (eventType) return this._handlers.get(eventType)?.size ?? 0;
    let total = 0;
    for (const s of this._handlers.values()) total += s.size;
    return total;
  }

  clearAll(): void {
    this._handlers.clear();
  }
}
