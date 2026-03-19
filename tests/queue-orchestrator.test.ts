import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createQueueOrchestrator } from "../src/jobs/queueOrchestrator.js";
function createFakeBullmq() {
  const queues = [];
  const workers = [];
  const queueEvents = [];

  class FakeQueue {
    constructor(name, options) {
      this.name = name;
      this.options = options;
      this.addCalls = [];
      this.closed = false;
      queues.push(this);
    }

    async add(name, data, options) {
      this.addCalls.push({ name, data, options });
      return { id: `${name}-${this.addCalls.length}` };
    }

    async close() {
      this.closed = true;
    }
  }

  class FakeWorker extends EventEmitter {
    constructor(name, processor, options) {
      super();
      this.name = name;
      this.processor = processor;
      this.options = options;
      this.closed = false;
      workers.push(this);
    }

    async close() {
      this.closed = true;
    }
  }

  class FakeQueueEvents extends EventEmitter {
    constructor(name, options) {
      super();
      this.name = name;
      this.options = options;
      this.closed = false;
      queueEvents.push(this);
    }

    async close() {
      this.closed = true;
    }
  }

  return {
    Queue: FakeQueue,
    Worker: FakeWorker,
    QueueEvents: FakeQueueEvents,
    _instances: {
      queues,
      workers,
      queueEvents,
    },
  };
}

test("queue orchestrator schedules enabled repeatable jobs", async () => {
  const fakeBullmq = createFakeBullmq();
  const calls = [];
  const orchestrator = createQueueOrchestrator({
    enabled: true,
    redisUrl: "redis://localhost:6379",
    queueName: "system-jobs",
    deadLetterQueueName: "system-jobs:dead-letter",
    concurrency: 3,
    attempts: 7,
    bullmq: fakeBullmq,
    jobs: [
      {
        name: "overdue-sync",
        intervalMs: 1000,
        enabled: true,
        runOnce: async () => {
          calls.push("overdue-sync");
          return {};
        },
      },
      {
        name: "database-backup",
        intervalMs: 60000,
        enabled: false,
        runOnce: async () => {
          calls.push("database-backup");
          return {};
        },
      },
    ],
  });

  await orchestrator.start();

  assert.equal(fakeBullmq._instances.queues.length, 2);
  const [mainQueue] = fakeBullmq._instances.queues;
  assert.equal(mainQueue.name, "system-jobs");
  assert.equal(mainQueue.addCalls.length, 1);
  assert.equal(mainQueue.addCalls[0].name, "overdue-sync");
  assert.equal(mainQueue.addCalls[0].options.repeat.every, 1000);
  assert.equal(mainQueue.addCalls[0].options.attempts, 7);
  assert.equal(fakeBullmq._instances.workers.length, 1);
  assert.equal(fakeBullmq._instances.workers[0].options.concurrency, 3);
  assert.equal(calls.length, 0);

  await orchestrator.stop();
});

test("queue orchestrator can run in scheduler-only mode without creating a worker", async () => {
  const fakeBullmq = createFakeBullmq();
  const orchestrator = createQueueOrchestrator({
    enabled: true,
    redisUrl: "redis://localhost:6379",
    queueName: "system-jobs",
    deadLetterQueueName: "system-jobs:dead-letter",
    concurrency: 2,
    attempts: 3,
    schedulerEnabled: true,
    workerEnabled: false,
    bullmq: fakeBullmq,
    jobs: [
      {
        name: "overdue-sync",
        intervalMs: 1000,
        runOnce: async () => ({}),
      },
    ],
  });

  await orchestrator.start();

  assert.equal(fakeBullmq._instances.queues.length, 2);
  assert.equal(fakeBullmq._instances.workers.length, 0);
  assert.equal(fakeBullmq._instances.queues[0].addCalls.length, 1);

  await orchestrator.stop();
});

test("queue worker dispatches known job and moves exhausted failures to dead-letter queue", async () => {
  const fakeBullmq = createFakeBullmq();
  let runCount = 0;
  const orchestrator = createQueueOrchestrator({
    enabled: true,
    redisUrl: "redis://localhost:6379",
    queueName: "system-jobs",
    deadLetterQueueName: "system-jobs:dead-letter",
    concurrency: 1,
    attempts: 2,
    bullmq: fakeBullmq,
    jobs: [
      {
        name: "overdue-sync",
        intervalMs: 1000,
        runOnce: async () => {
          runCount += 1;
          return {};
        },
      },
    ],
  });

  await orchestrator.start();

  const worker = fakeBullmq._instances.workers[0];
  await worker.processor({ name: "overdue-sync" });
  assert.equal(runCount, 1);

  const simulatedFailure = {
    id: "job-1",
    name: "overdue-sync",
    data: { loanId: 10 },
    timestamp: Date.now(),
    attemptsMade: 2,
    failedReason: "db timeout",
    stacktrace: ["Error: db timeout"],
    opts: { attempts: 2 },
    remove: async () => {},
  };
  worker.emit("failed", simulatedFailure, new Error("db timeout"));
  await new Promise((resolve) => setImmediate(resolve));

  const [, deadLetterQueue] = fakeBullmq._instances.queues;
  assert.equal(deadLetterQueue.name, "system-jobs:dead-letter");
  assert.equal(deadLetterQueue.addCalls.length, 1);
  assert.equal(deadLetterQueue.addCalls[0].name, "overdue-sync:dead-letter");
  assert.equal(deadLetterQueue.addCalls[0].data.originalJobId, "job-1");
  assert.equal(deadLetterQueue.addCalls[0].data.failedReason, "db timeout");
  assert.equal(deadLetterQueue.addCalls[0].data.attemptsMade, 2);

  await orchestrator.stop();
});

test("queue orchestrator can run in worker-only mode without rescheduling repeatable jobs", async () => {
  const fakeBullmq = createFakeBullmq();
  let runCount = 0;
  const orchestrator = createQueueOrchestrator({
    enabled: true,
    redisUrl: "redis://localhost:6379",
    queueName: "system-jobs",
    deadLetterQueueName: "system-jobs:dead-letter",
    concurrency: 1,
    attempts: 2,
    schedulerEnabled: false,
    workerEnabled: true,
    bullmq: fakeBullmq,
    jobs: [
      {
        name: "overdue-sync",
        intervalMs: 1000,
        runOnce: async () => {
          runCount += 1;
          return {};
        },
      },
    ],
  });

  await orchestrator.start();

  assert.equal(fakeBullmq._instances.queues.length, 2);
  assert.equal(fakeBullmq._instances.queues[0].addCalls.length, 0);
  assert.equal(fakeBullmq._instances.workers.length, 1);

  const worker = fakeBullmq._instances.workers[0];
  await worker.processor({ name: "overdue-sync" });
  assert.equal(runCount, 1);

  await orchestrator.stop();
});
