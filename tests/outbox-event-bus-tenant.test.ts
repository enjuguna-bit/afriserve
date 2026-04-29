import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OutboxEventBus } from "../src/infrastructure/events/OutboxEventBus.js";
import type { DomainEvent } from "../src/domain/shared/events/DomainEvent.js";

// Minimal DomainEvent stub
function makeFakeEvent(overrides: Partial<{
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  occurredAt: string;
  tenantId: string;
}> = {}): DomainEvent {
  return {
    eventType: overrides.eventType ?? "loan.test_event",
    aggregateType: overrides.aggregateType ?? "loan",
    aggregateId: overrides.aggregateId ?? 42,
    occurredAt: overrides.occurredAt ?? new Date().toISOString(),
    toOutboxPayload: () => ({
      eventType: overrides.eventType ?? "loan.test_event",
      aggregateType: overrides.aggregateType ?? "loan",
      aggregateId: overrides.aggregateId ?? 42,
      payload: overrides.tenantId ? { tenantId: overrides.tenantId } : {},
    }),
  } as unknown as DomainEvent;
}

describe("OutboxEventBus tenant propagation", () => {
  it("propagates tenantId from event payload when present", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const bus = new OutboxEventBus(async (payload) => {
      captured.push(payload as Record<string, unknown>);
      return 1;
    });

    const event = makeFakeEvent({ tenantId: "acme-corp" });
    await bus.publish(event);

    assert.equal(captured.length, 1);
    assert.equal(captured[0]!["tenantId"], "acme-corp");
  });

  it("falls back to getCurrentTenantId() when payload has no tenantId", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const bus = new OutboxEventBus(async (payload) => {
      captured.push(payload as Record<string, unknown>);
      return 1;
    });

    const event = makeFakeEvent();
    await bus.publish(event);

    assert.equal(captured.length, 1);
    // getCurrentTenantId() returns the AsyncLocalStorage value or "default"
    assert.ok(
      typeof captured[0]!["tenantId"] === "string" && captured[0]!["tenantId"] !== "",
      `expected a non-empty tenantId string, got: ${String(captured[0]!["tenantId"])}`,
    );
  });

  it("publishes all events in order via publishAll", async () => {
    const captured: Array<string> = [];
    const bus = new OutboxEventBus(async (payload) => {
      captured.push(String(payload.eventType));
      return 1;
    });

    await bus.publishAll([
      makeFakeEvent({ eventType: "loan.created" }),
      makeFakeEvent({ eventType: "loan.approved" }),
      makeFakeEvent({ eventType: "loan.disbursed" }),
    ]);

    assert.deepEqual(captured, ["loan.created", "loan.approved", "loan.disbursed"]);
  });

  it("calls in-process subscribers after outbox write", async () => {
    const outboxOrder: string[] = [];
    const subscriberOrder: string[] = [];

    const bus = new OutboxEventBus(async (payload) => {
      outboxOrder.push(String(payload.eventType));
      return 1;
    });

    bus.subscribe("loan.approved", async () => {
      subscriberOrder.push("subscriber");
    });

    await bus.publish(makeFakeEvent({ eventType: "loan.approved" }));

    assert.deepEqual(outboxOrder, ["loan.approved"]);
    assert.deepEqual(subscriberOrder, ["subscriber"]);
  });

  it("does not suppress outbox write when a subscriber throws", async () => {
    const outboxWrites: number[] = [];
    const bus = new OutboxEventBus(async () => {
      outboxWrites.push(1);
      return 1;
    });

    bus.subscribe("loan.approved", async () => {
      throw new Error("subscriber bug");
    });

    // Should not throw; outbox write must still complete
    await assert.doesNotReject(() => bus.publish(makeFakeEvent({ eventType: "loan.approved" })));
    assert.equal(outboxWrites.length, 1);
  });
});
