import type { LoggerLike, MetricsLike } from "../types/runtime.js";

type ReportDeliveryJobOptions = {
  scheduledReportService: {
    createDailyPortfolioDigest: () => Promise<{ generatedAt: string; summary: Record<string, any> }>;
    createDailyPortfolioCsvAttachment: () => Promise<{ filename: string; contentType: string; content: string }>;
  };
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  enabled: boolean;
  requested: boolean;
  intervalMs: number;
  recipientEmail: string;
  webhookUrl: string;
  webhookTimeoutMs: number;
};

function createReportDeliveryJob(options: ReportDeliveryJobOptions) {
  const {
    scheduledReportService,
    logger,
    metrics,
    enabled,
    requested,
    intervalMs,
    recipientEmail,
    webhookUrl,
    webhookTimeoutMs,
  } = options;

  const baseIntervalMs = Math.max(100, Math.floor(intervalMs || (24 * 60 * 60 * 1000)));
  const maxBackoffMs = Math.max(baseIntervalMs, 6 * 60 * 60 * 1000);

  const runtimeState: {
    enabled: boolean;
    inProgress: boolean;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastDurationMs: number | null;
    nextRunAt: string | null;
    consecutiveFailures: number;
    lastError: string | null;
    lastDeliveredVia: string | null;
  } = {
    enabled: Boolean(enabled),
    inProgress: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastDurationMs: null,
    nextRunAt: null,
    consecutiveFailures: 0,
    lastError: null,
    lastDeliveredVia: null,
  };

  /** @type {NodeJS.Timeout | null} */
  let timer: NodeJS.Timeout | null = null;
  let consecutiveFailures = 0;

  /**
   * @returns {Promise<Record<string, any>>}
   */
  async function runOnce() {
    if (!runtimeState.enabled) {
      return {
        skipped: true,
        reason: requested ? "report_delivery_missing_recipient" : "report_delivery_disabled",
      };
    }

    if (runtimeState.inProgress) {
      return {
        skipped: true,
        reason: "report_delivery_in_progress",
      };
    }

    runtimeState.inProgress = true;
    const startedAtMs = Date.now();

    try {
      const digest = await scheduledReportService.createDailyPortfolioDigest();
      const attachment = await scheduledReportService.createDailyPortfolioCsvAttachment();
      let deliveredVia = "log";

      if (webhookUrl) {
        const payload = {
          event: "daily_portfolio_digest",
          recipientEmail,
          generatedAt: digest.generatedAt,
          subject: `Daily Portfolio Digest - ${digest.generatedAt.slice(0, 10)}`,
          summary: digest.summary,
          attachment: {
            filename: attachment.filename,
            contentType: attachment.contentType,
            contentBase64: Buffer.from(attachment.content, "utf8").toString("base64"),
          },
        };
        const abortController = new AbortController();
        const timeoutHandle = setTimeout(() => {
          abortController.abort();
        }, webhookTimeoutMs);

        let response;
        try {
          response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: abortController.signal,
          });
        } finally {
          clearTimeout(timeoutHandle);
        }

        if (!response.ok) {
          const responseBody = await response.text();
          throw new Error(
            `Report delivery webhook failed (${response.status} ${response.statusText}): ${responseBody.slice(0, 500)}`,
          );
        }
        deliveredVia = "webhook";
      } else if (logger && typeof logger.info === "function") {
        logger.info("reports.delivery.generated", {
          recipientEmail,
          generatedAt: digest.generatedAt,
          summary: digest.summary,
        });
      }

      const durationMs = Date.now() - startedAtMs;
      runtimeState.lastRunAt = new Date().toISOString();
      runtimeState.lastSuccessAt = runtimeState.lastRunAt;
      runtimeState.lastDurationMs = durationMs;
      runtimeState.lastError = null;
      runtimeState.consecutiveFailures = 0;
      runtimeState.lastDeliveredVia = deliveredVia;

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("scheduled_report_delivery", {
          success: true,
          durationMs,
        });
      }

      return {
        skipped: false,
        success: true,
        durationMs,
        deliveredVia,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      runtimeState.lastRunAt = new Date().toISOString();
      runtimeState.lastFailureAt = runtimeState.lastRunAt;
      runtimeState.lastDurationMs = durationMs;
      runtimeState.lastError = error instanceof Error ? error.message : String(error);
      runtimeState.consecutiveFailures += 1;

      if (metrics && typeof metrics.observeBackgroundTask === "function") {
        metrics.observeBackgroundTask("scheduled_report_delivery", {
          success: false,
          durationMs,
          errorMessage: runtimeState.lastError,
        });
      }

      throw error;
    } finally {
      runtimeState.inProgress = false;
    }
  }

  /**
   * @param {number} [delayMs]
   * @returns {void}
   */
  function schedule(delayMs = baseIntervalMs) {
    const normalizedDelayMs = Math.max(100, Math.floor(delayMs));
    runtimeState.nextRunAt = new Date(Date.now() + normalizedDelayMs).toISOString();
    timer = setTimeout(() => {
      runOnce()
        .then((deliveryResult) => {
          consecutiveFailures = 0;
          if (!deliveryResult.skipped && logger && typeof logger.info === "function") {
            logger.info("reports.delivery.scheduled_completed", {
              deliveredVia: deliveryResult.deliveredVia,
              durationMs: deliveryResult.durationMs,
            });
          }
          schedule(baseIntervalMs);
        })
        .catch((deliveryError) => {
          consecutiveFailures += 1;
          const retryDelayMs = Math.min(
            baseIntervalMs * (2 ** Math.min(consecutiveFailures, 5)),
            maxBackoffMs,
          );
          if (logger && typeof logger.error === "function") {
            logger.error("reports.delivery.scheduled_failed", {
              consecutiveFailures,
              nextRetryInMs: retryDelayMs,
              error: deliveryError,
            });
          }
          schedule(retryDelayMs);
        });
    }, normalizedDelayMs);
    timer.unref();
  }

  /**
   * @returns {void}
   */
  function start() {
    if (!runtimeState.enabled) {
      return;
    }
    stop();
    consecutiveFailures = 0;
    schedule(baseIntervalMs);
  }

  /**
   * @returns {void}
   */
  function stop() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    runtimeState.nextRunAt = null;
  }

  /**
   * @returns {Record<string, any>}
   */
  function getState() {
    return {
      ...runtimeState,
    };
  }

  return {
    runOnce,
    start,
    stop,
    getState,
  };
}

export {
  createReportDeliveryJob,
};
