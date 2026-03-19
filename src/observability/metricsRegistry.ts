import { deriveRequestCategory, getRequestScope } from "./requestScope.js";

type DbQueryObservation = { category: string; durationMs: number };
type DbQueryObserver = (payload: DbQueryObservation) => void;

let dbQueryObserver: DbQueryObserver | null = null;

function setDbQueryObserver(observer: DbQueryObserver | null): void {
  dbQueryObserver = observer;
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

export {
  observeDbQuery,
  resolveDbQueryCategory,
  setDbQueryObserver,
};
