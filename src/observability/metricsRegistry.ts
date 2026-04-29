import { deriveRequestCategory, getRequestScope } from "./requestScope.js";

type DbQueryObservation = { category: string; durationMs: number };
type DbQueryObserver = (payload: DbQueryObservation) => void;
type DbPoolSnapshot = {
  maxConnections: number;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  acquires: number;
  averageAcquireWaitMs: number;
  maxAcquireWaitMs: number;
  lastAcquireWaitMs: number;
  acquireTimeouts: number;
  alerts: {
    highAcquireWait: boolean;
    poolExhausted: boolean;
  };
};
type DbPoolSnapshotProvider = () => Record<string, DbPoolSnapshot>;

let dbQueryObserver: DbQueryObserver | null = null;
const dbPoolSnapshotProviders: Map<string, DbPoolSnapshotProvider> = new Map();

// ── Payment failure counters ────────────────────────────────────────────────
// Keyed by reason string (e.g. "b2c.core_failed", "b2c.callback_failed").
// Counters are process-lifetime accumulators — they reset on restart.
const paymentFailureCounts: Map<string, number> = new Map();

function setDbQueryObserver(observer: DbQueryObserver | null): void {
  dbQueryObserver = observer;
}

function registerDbPoolSnapshotProvider(providerId: string, provider: DbPoolSnapshotProvider | null): void {
  const normalizedId = String(providerId || "").trim();
  if (!normalizedId) {
    return;
  }
  if (!provider) {
    dbPoolSnapshotProviders.delete(normalizedId);
    return;
  }
  dbPoolSnapshotProviders.set(normalizedId, provider);
}

function getDbPoolSnapshots(): Record<string, DbPoolSnapshot> {
  const snapshots: Record<string, DbPoolSnapshot> = {};
  dbPoolSnapshotProviders.forEach((provider) => {
    const payload = provider();
    Object.entries(payload).forEach(([poolName, snapshot]) => {
      snapshots[poolName] = snapshot;
    });
  });
  return snapshots;
}

function resolveDbQueryCategory(): string {
  const scope = getRequestScope();
  if (scope?.requestCategory) {
    return scope.requestCategory;
  }

  if (scope?.requestPath) {
    return deriveRequestCategory(scope.requestPath);
  }

  return "unknown";
}

function observeDbQuery(durationMs: number, category?: string): void {
  if (!dbQueryObserver) {
    return;
  }

  const resolvedCategory = category || resolveDbQueryCategory();
  dbQueryObserver({
    category: resolvedCategory,
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
  });
}

/**
 * Increment the payment failure counter for a given reason label.
 * This feeds into the Prometheus `microfinance_payment_failure_total` metric.
 *
 * @example
 * recordPaymentFailure("b2c.core_failed");
 * recordPaymentFailure("b2c.callback_failed");
 */
function recordPaymentFailure(reason: string): void {
  const normalizedReason = String(reason || "unknown").trim().toLowerCase().replace(/[^a-z0-9_.]/g, "_");
  const current = paymentFailureCounts.get(normalizedReason) ?? 0;
  paymentFailureCounts.set(normalizedReason, current + 1);
}

/**
 * Return a snapshot of all payment failure counts keyed by reason.
 * Used by prometheus.ts when building the metrics scrape payload.
 */
function getPaymentFailureSnapshot(): Record<string, number> {
  const snapshot: Record<string, number> = {};
  paymentFailureCounts.forEach((count, reason) => {
    snapshot[reason] = count;
  });
  return snapshot;
}

export {
  getDbPoolSnapshots,
  observeDbQuery,
  recordPaymentFailure,
  getPaymentFailureSnapshot,
  registerDbPoolSnapshotProvider,
  resolveDbQueryCategory,
  setDbQueryObserver,
};
