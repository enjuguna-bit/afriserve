import { AsyncLocalStorage } from "node:async_hooks";

type RequestScope = {
  requestId: string | null;
  requestPath?: string | null;
  requestMethod?: string | null;
  requestCategory?: string | null;
};

const requestScopeStorage = new AsyncLocalStorage<RequestScope>();

function deriveRequestCategory(pathname: string | null | undefined): string {
  const raw = String(pathname || "").trim();
  if (!raw) {
    return "unknown";
  }

  const pathOnly = raw.split("?")[0] ?? "";
  const segments = pathOnly.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return "root";
  }

  if (segments[0] === "api") {
    let index = 1;
    if (segments[index] && /^v\d+$/i.test(segments[index]!)) {
      index += 1;
    }
    const resource = segments[index] ?? "root";
    return `api.${resource}`;
  }

  return `web.${segments[0]}`;
}

function runWithRequestScope<T>(scope: RequestScope, callback: () => T): T {
  return requestScopeStorage.run(scope, callback);
}

function getRequestScope(): RequestScope | undefined {
  return requestScopeStorage.getStore();
}

export {
  deriveRequestCategory,
  runWithRequestScope,
  getRequestScope,
};
