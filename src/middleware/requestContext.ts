import crypto from "node:crypto";
import type { NextFunctionLike, RequestLike, ResponseLike } from "../types/runtime.js";
import { deriveRequestCategory, runWithRequestScope } from "../observability/requestScope.js";

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
  const requestPath = typeof req.originalUrl === "string" ? req.originalUrl : (typeof req.url === "string" ? req.url : "");
  const requestMethod = typeof req.method === "string" ? req.method : "";
  const requestCategory = deriveRequestCategory(requestPath);
  runWithRequestScope({ requestId, requestPath, requestMethod, requestCategory }, () => {
    next();
  });
}

export {
  requestContext,
};
