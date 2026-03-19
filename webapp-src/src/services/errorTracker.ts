import type { LoggerLike } from "../types/runtime.js";

type ErrorTrackerContext = {
  [key: string]: unknown;
};

type ErrorTracker = {
  enabled: boolean;
  provider: "none" | "sentry";
  captureException: (error: unknown, context?: ErrorTrackerContext) => void;
};

type CreateErrorTrackerOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: LoggerLike | null;
};

function parseSampleRate(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

function createNoopErrorTracker(): ErrorTracker {
  return {
    enabled: false,
    provider: "none",
    captureException: () => {
    },
  };
}

async function createErrorTracker(options: CreateErrorTrackerOptions = {}): Promise<ErrorTracker> {
  const env = options.env || process.env;
  const logger = options.logger || null;
  const dsn = String(env.SENTRY_DSN || "").trim();

  if (!dsn) {
    return createNoopErrorTracker();
  }

  const tracesSampleRate = parseSampleRate(String(env.SENTRY_TRACES_SAMPLE_RATE || ""), 0);
  const profilesSampleRate = parseSampleRate(String(env.SENTRY_PROFILES_SAMPLE_RATE || ""), 0);
  const moduleName = "@sentry/node";
  let sentrySdk: any = null;

  try {
    sentrySdk = await import(moduleName);
  } catch (error) {
    if (logger && typeof logger.warn === "function") {
      logger.warn("observability.sentry.module_unavailable", {
        error,
      });
    }
    return createNoopErrorTracker();
  }

  const sentry = sentrySdk?.default || sentrySdk;
  if (!sentry || typeof sentry.init !== "function" || typeof sentry.captureException !== "function") {
    if (logger && typeof logger.warn === "function") {
      logger.warn("observability.sentry.invalid_sdk", {
        reason: "missing_expected_exports",
      });
    }
    return createNoopErrorTracker();
  }

  try {
    sentry.init({
      dsn,
      environment: String(env.NODE_ENV || "development").trim().toLowerCase() || "development",
      tracesSampleRate,
      profilesSampleRate,
    });
  } catch (error) {
    if (logger && typeof logger.warn === "function") {
      logger.warn("observability.sentry.init_failed", {
        error,
      });
    }
    return createNoopErrorTracker();
  }

  return {
    enabled: true,
    provider: "sentry",
    captureException(error: unknown, context: ErrorTrackerContext = {}) {
      try {
        if (typeof sentry.withScope === "function") {
          sentry.withScope((scope: any) => {
            Object.entries(context).forEach(([key, value]) => {
              scope.setExtra(String(key), value);
            });
            sentry.captureException(error);
          });
          return;
        }

        sentry.captureException(error);
      } catch (_error) {
      }
    },
  };
}

export type {
  ErrorTracker,
};

export {
  createErrorTracker,
};
