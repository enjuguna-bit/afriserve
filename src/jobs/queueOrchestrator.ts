import type { LoggerLike, MetricsLike } from "../types/runtime.js";
import type { Job, Queue, QueueEvents, Worker } from "bullmq";

type QueueJob = {
  name: string;
  intervalMs: number;
  enabled?: boolean;
  runOnce: () => Promise<unknown>;
};

type QueueOrchestratorOptions = {
  enabled: boolean;
  redisUrl: string;
  queueName: string;
  deadLetterQueueName: string;
  concurrency: number;
  attempts: number;
  schedulerEnabled?: boolean;
  workerEnabled?: boolean;
  bullmq?: {
    Queue: typeof Queue;
    Worker: typeof Worker;
    QueueEvents: typeof QueueEvents;
  } | null;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  jobs: QueueJob[];
  deadLetterInspectIntervalMs?: number;
  deadLetterAlertThreshold?: number;
  deadLetterAutoRetryBatchSize?: number;
  deadLetterAlertRepeatWindowMs?: number;
};

function createQueueOrchestrator(options: QueueOrchestratorOptions) {
  const {
    enabled,
    redisUrl,
    queueName,
    deadLetterQueueName,
    concurrency,
    attempts,
    schedulerEnabled = true,
    workerEnabled = true,
    bullmq = null,
    logger,
    metrics = null,
    jobs,
    deadLetterInspectIntervalMs = 60000,
    deadLetterAlertThreshold = 1,
    deadLetterAutoRetryBatchSize = 0,
    deadLetterAlertRepeatWindowMs = 15 * 60 * 1000,
  } = options;

  /** @type {import("bullmq").Queue | null} */
  let queue: Queue | null = null;
  /** @type {import("bullmq").Queue | null} */
  let deadLetterQueue: Queue | null = null;
  /** @type {import("bullmq").Worker | null} */
  let worker: Worker | null = null;
  /** @type {import("bullmq").QueueEvents | null} */
  let events: QueueEvents | null = null;
  /** @type {import("bullmq").QueueEvents | null} */
  let deadLetterEvents: QueueEvents | null = null;
  /** @type {NodeJS.Timeout | null} */
  let deadLetterInspectorTimer: NodeJS.Timeout | null = null;
  let lastDeadLetterAlertSignature: string | null = null;
  let lastDeadLetterAlertAtMs = 0;
  const byName = new Map<string, QueueJob>(jobs.map((job) => [job.name, job]));

  function shouldSkipBullMqVersionCheck(url: string): boolean {
    try {
      const hostname = new URL(String(url || "")).hostname;
      return /(?:^|\.)redis\.cache\.windows\.net$/i.test(hostname)
        || /(?:^|\.)redisenterprise\.cache\.azure\.net$/i.test(hostname);
    } catch (_error) {
      return false;
    }
  }

  function observeDeadLetterFailureMetric(failedReason: string) {
    if (metrics && typeof metrics.observeBackgroundTask === "function") {
      metrics.observeBackgroundTask("dlq.job.failed", {
        success: true,
        durationMs: 0,
        errorMessage: failedReason,
      });
    }
  }

  /**
   * @param {import("bullmq").Job} job
   * @param {Error | undefined} error
   * @returns {Promise<void>}
   */
  async function pushToDeadLetterQueue(job: Job, error: Error | undefined): Promise<void> {
    if (!deadLetterQueue) {
      return;
    }

    await deadLetterQueue.add(
      `${String(job.name)}:dead-letter`,
      {
        originalQueue: queueName,
        originalJobId: String(job.id || ""),
        originalJobName: String(job.name || ""),
        originalData: job.data,
        originalTimestamp: job.timestamp,
        attemptsMade: job.attemptsMade,
        failedReason: error?.message || job.failedReason || "unknown_failure",
        stacktrace: Array.isArray(job.stacktrace) ? job.stacktrace : [],
        movedAt: new Date().toISOString(),
      },
      {
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    );
  }

  /**
   * @returns {Promise<void>}
   */
  async function inspectDeadLetterQueue(): Promise<void> {
    if (!deadLetterQueue) {
      return;
    }

    const waitingCount = await deadLetterQueue.getWaitingCount();
    const failedCount = await deadLetterQueue.getFailedCount();
    const totalCount = Number(waitingCount || 0) + Number(failedCount || 0);
    const threshold = Math.max(0, Math.floor(deadLetterAlertThreshold));
    const sampleDeadLetterJobs = totalCount > 0
      ? await deadLetterQueue.getJobs(["waiting", "failed"], 0, 2, false)
      : [];
    const sampleJobs = sampleDeadLetterJobs.map((job) => {
      const payload = (job.data || {}) as Record<string, unknown>;
      return {
        originalJobName: String(payload.originalJobName || job.name || ""),
        failedReason: String(payload.failedReason || job.failedReason || "unknown_failure"),
        attemptsMade: Number(payload.attemptsMade || job.attemptsMade || 0),
      };
    });

    if (totalCount < threshold) {
      lastDeadLetterAlertSignature = null;
      lastDeadLetterAlertAtMs = 0;
    } else {
      const nowMs = Date.now();
      const alertSignature = JSON.stringify({
        waitingCount,
        failedCount,
        sampleJobs,
      });
      const repeatWindowMs = Math.max(60000, Math.floor(deadLetterAlertRepeatWindowMs || 0));
      const shouldAlert = alertSignature !== lastDeadLetterAlertSignature
        || (nowMs - lastDeadLetterAlertAtMs) >= repeatWindowMs;

      if (shouldAlert && logger && typeof logger.warn === "function") {
        logger.warn("jobs.queue.dead_letter_detected", {
          queueName,
          deadLetterQueueName,
          waitingCount,
          failedCount,
          totalCount,
          sampleJobs,
        });
        lastDeadLetterAlertSignature = alertSignature;
        lastDeadLetterAlertAtMs = nowMs;
      }
    }

    const retryBatchSize = Math.max(0, Math.floor(deadLetterAutoRetryBatchSize || 0));
    if (!queue || retryBatchSize <= 0 || totalCount <= 0) {
      return;
    }

    const retryJobs = await deadLetterQueue.getJobs(["waiting", "failed"], 0, retryBatchSize - 1, false);
    let requeuedCount = 0;

    for (const deadLetterJob of retryJobs) {
      const payload = (deadLetterJob.data || {}) as Record<string, any>;
      const originalJobName = String(payload.originalJobName || "").trim();
      if (!originalJobName || !byName.has(originalJobName)) {
        continue;
      }

      await queue.add(originalJobName, payload.originalData || {}, {
        attempts: Math.max(1, Math.floor(attempts || 1)),
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: 1000,
        removeOnFail: false,
      });

      await deadLetterJob.remove();
      requeuedCount += 1;
    }

    if (requeuedCount > 0 && logger && typeof logger.warn === "function") {
      logger.warn("jobs.queue.dead_letter_requeued", {
        queueName,
        deadLetterQueueName,
        requeuedCount,
      });
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async function start() {
    if (!enabled) {
      return;
    }
    if (!schedulerEnabled && !workerEnabled) {
      return;
    }
    if (queue || worker || events || deadLetterQueue || deadLetterEvents) {
      return;
    }
    if (!redisUrl) {
      throw new Error("Queue mode requires JOB_QUEUE_REDIS_URL.");
    }

    const { Queue, Worker, QueueEvents } = bullmq || await import("bullmq");
    const connection = {
      url: redisUrl,
    };
    const skipVersionCheck = shouldSkipBullMqVersionCheck(redisUrl);

    queue = new Queue(queueName, { connection, skipVersionCheck });
    deadLetterQueue = new Queue(deadLetterQueueName, { connection, skipVersionCheck });
    events = new QueueEvents(queueName, { connection, skipVersionCheck });
    deadLetterEvents = new QueueEvents(deadLetterQueueName, { connection, skipVersionCheck });
    if (workerEnabled) {
      worker = new Worker(
        queueName,
        async (job: Job) => {
          const target = byName.get(String(job.name));
          if (!target) {
            throw new Error(`Unknown queued job "${job.name}"`);
          }
          await target.runOnce();
        },
        {
          connection,
          concurrency: Math.max(1, Math.floor(concurrency || 1)),
          skipVersionCheck,
        },
      );

      worker.on("failed", (job: Job | undefined, error: Error) => {
        if (!job) {
          return;
        }
        const configuredAttempts = Math.max(1, Number(job.opts?.attempts || attempts || 1));
        if (job.attemptsMade < configuredAttempts) {
          return;
        }
        pushToDeadLetterQueue(job, error)
          .then(async () => {
            try {
              await job.remove();
            } catch (_removeError) {
              // Ignore remove failures; failed jobs are retained by BullMQ anyway.
            }
            if (logger && typeof logger.error === "function") {
              logger.error("jobs.queue.moved_to_dead_letter", {
                queueName,
                deadLetterQueueName,
                jobId: String(job.id || ""),
                jobName: String(job.name || ""),
                attemptsMade: job.attemptsMade,
                failedReason: error?.message || job.failedReason || "unknown_failure",
              });
            }
          })
          .catch((deadLetterError) => {
            if (logger && typeof logger.error === "function") {
              logger.error("jobs.queue.dead_letter_failed", {
                queueName,
                deadLetterQueueName,
                jobId: String(job.id || ""),
                jobName: String(job.name || ""),
                attemptsMade: job.attemptsMade,
                failedReason: error?.message || job.failedReason || "unknown_failure",
                error: deadLetterError,
              });
            }
          });
      });
    }

    events.on("error", (queueError: unknown) => {
      if (logger && typeof logger.error === "function") {
        logger.error("jobs.queue.events_error", {
          queueName,
          error: queueError,
        });
      }
    });
    deadLetterEvents.on("error", (queueError: unknown) => {
      if (logger && typeof logger.error === "function") {
        logger.error("jobs.queue.dead_letter_events_error", {
          queueName,
          deadLetterQueueName,
          error: queueError,
        });
      }
    });
    deadLetterEvents.on("waiting", (event: Record<string, unknown>) => {
      if (!deadLetterQueue) {
        return;
      }
      const deadLetterJobId = String(event?.jobId || "").trim();
      if (!deadLetterJobId) {
        return;
      }

      deadLetterQueue.getJob(deadLetterJobId)
        .then((deadLetterJob) => {
          const payload = (deadLetterJob?.data || {}) as Record<string, unknown>;
          const failedReason = String(payload.failedReason || deadLetterJob?.failedReason || "unknown_failure");

          observeDeadLetterFailureMetric(failedReason);

          if (logger && typeof logger.error === "function") {
            logger.error("jobs.queue.dead_letter_job_failed", {
              queueName,
              deadLetterQueueName,
              deadLetterJobId,
              deadLetterJobName: String(deadLetterJob?.name || ""),
              originalJobId: String(payload.originalJobId || ""),
              originalJobName: String(payload.originalJobName || ""),
              attemptsMade: Number(payload.attemptsMade || deadLetterJob?.attemptsMade || 0),
              failedReason,
              movedAt: payload.movedAt || null,
            });
          }
        })
        .catch((deadLetterLookupError) => {
          if (logger && typeof logger.error === "function") {
            logger.error("jobs.queue.dead_letter_listener_failed", {
              queueName,
              deadLetterQueueName,
              deadLetterJobId,
              error: deadLetterLookupError,
            });
          }
        });
    });

    if (schedulerEnabled) {
      for (const job of jobs) {
        if (job.enabled === false) {
          continue;
        }
        await queue.add(
          job.name,
          {},
          {
            jobId: job.name,
            repeat: {
              every: Math.max(100, Math.floor(job.intervalMs || 1000)),
            },
            attempts: Math.max(1, Math.floor(attempts || 1)),
            backoff: {
              type: "exponential",
              delay: 1000,
            },
            removeOnComplete: 1000,
            removeOnFail: false,
          },
        );
      }
    }

    if (logger && typeof logger.info === "function") {
      logger.info("jobs.queue.started", {
        queueName,
        deadLetterQueueName,
        configuredJobs: jobs.length,
        schedulerEnabled,
        workerEnabled,
      });
    }

    const monitorIntervalMs = Math.max(1000, Math.floor(deadLetterInspectIntervalMs || 60000));
    deadLetterInspectorTimer = setInterval(() => {
      inspectDeadLetterQueue().catch((deadLetterInspectError) => {
        if (logger && typeof logger.error === "function") {
          logger.error("jobs.queue.dead_letter_inspect_failed", {
            queueName,
            deadLetterQueueName,
            error: deadLetterInspectError,
          });
        }
      });
    }, monitorIntervalMs);
    deadLetterInspectorTimer.unref();
  }

  /**
   * @returns {Promise<void>}
   */
  async function stop() {
    const closeOps: Promise<unknown>[] = [];
    if (deadLetterInspectorTimer) {
      clearInterval(deadLetterInspectorTimer);
      deadLetterInspectorTimer = null;
    }
    if (worker) {
      closeOps.push(worker.close());
      worker = null;
    }
    if (events) {
      closeOps.push(events.close());
      events = null;
    }
    if (deadLetterEvents) {
      closeOps.push(deadLetterEvents.close());
      deadLetterEvents = null;
    }
    if (queue) {
      closeOps.push(queue.close());
      queue = null;
    }
    if (deadLetterQueue) {
      closeOps.push(deadLetterQueue.close());
      deadLetterQueue = null;
    }
    await Promise.allSettled(closeOps);
  }

  return {
    start,
    stop,
  };
}

export {
  createQueueOrchestrator,
};
