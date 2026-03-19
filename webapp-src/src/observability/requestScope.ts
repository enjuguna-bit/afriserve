import { AsyncLocalStorage } from "node:async_hooks";

type RequestScope = {
  requestId: string | null;
};

const requestScopeStorage = new AsyncLocalStorage<RequestScope>();

function runWithRequestScope<T>(scope: RequestScope, callback: () => T): T {
  return requestScopeStorage.run(scope, callback);
}

function getRequestScope(): RequestScope | undefined {
  return requestScopeStorage.getStore();
}

export {
  runWithRequestScope,
  getRequestScope,
};
