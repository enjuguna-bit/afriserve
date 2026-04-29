import assert from "node:assert/strict";
import test from "node:test";
import { OutboxEventBus } from "../src/infrastructure/events/OutboxEventBus.js";
import { DomainEvent } from "../src/domain/shared/events/DomainEvent.js";
import { runWithTenant } from "../src/utils/tenantStore.js";

class TestDomainEvent extends DomainEvent {
  readonly eventType = "test.event";
  readonly aggregateType = "test";
  readonly detail = "payload";
}

test("OutboxEventBus persists the current tenant context with domain events", async () => {
  const published: Array<Record<string, unknown>> = [];
  const bus = new OutboxEventBus(async (payload) => {
    published.push(payload as Record<string, unknown>);
    return 1;
  });

  await runWithTenant("tenant-acme", async () => {
    await bus.publish(new TestDomainEvent(42));
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].tenantId, "tenant-acme");
  assert.equal(published[0].eventType, "test.event");
  assert.deepEqual(published[0].payload, { detail: "payload" });
});
