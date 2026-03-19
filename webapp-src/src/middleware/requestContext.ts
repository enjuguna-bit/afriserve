import crypto from "node:crypto";
import type { NextFunctionLike, RequestLike, ResponseLike } from "../types/runtime.js";
import { runWithRequestScope } from "../observability/requestScope.js";

function requestContext(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
  const incoming = req.headers?.["x-request-id"];
  const requestId = typeof incoming === "string" && incoming.trim()
    ? incoming.trim()
    : crypto.randomUUID();

  req.requestId = requestId;
  req.requestStartTimeMs = Date.now();
  if (typeof res.setHeader === "function") {
    res.setHeader("X-Request-Id", requestId);
  }
  runWithRequestScope({ requestId }, () => {
    next();
  });
}

export {
  requestContext,
};
