import test from "node:test";
import assert from "node:assert/strict";
import { createDomainEventDispatchJob } from "../src/jobs/domainEventDispatch.js";

test("domain event dispatch logs idle runs at debug instead of info", async () => {
  const infoCalls = [];
  const debugCalls = [];
  const job = createDomainEventDispatchJob({
    enabled: true,
    intervalMs: 10000,
    domainEventService: {
      dispatchPendingEvents: async () => ({
        published: 0,
        failed: 0,
      }),
    },
    logger: {
      info: (message, meta) => {
        infoCalls.push({ message, meta });
      },
      debug: (message, meta) => {
        debugCalls.push({ message, meta });
      },
    },
  });

  const result = await job.runOnce();
  assert.equal(result.skipped, false);
  assert.equal(infoCalls.length, 0);
  assert.equal(debugCalls.length, 1);
  assert.equal(debugCalls[0].message, "domain_events.dispatch.idle");
});

test("domain event dispatch keeps info logging when work is published", async () => {
  const infoCalls = [];
  const debugCalls = [];
  const job = createDomainEventDispatchJob({
    enabled: true,
    intervalMs: 10000,
    domainEventService: {
      dispatchPendingEvents: async () => ({
        published: 4,
        failed: 0,
      }),
    },
    logger: {
      info: (message, meta) => {
        infoCalls.push({ message, meta });
      },
      debug: (message, meta) => {
        debugCalls.push({ message, meta });
      },
    },
  });

  await job.runOnce();
  assert.equal(infoCalls.length, 1);
  assert.equal(infoCalls[0].message, "domain_events.dispatch.completed");
  assert.equal(infoCalls[0].meta.published, 4);
  assert.equal(debugCalls.length, 0);
});
