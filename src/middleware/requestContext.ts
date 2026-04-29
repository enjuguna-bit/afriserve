import crypto from "node:crypto";
import type { NextFunctionLike, RequestLike, ResponseLike } from "../types/runtime.js";
import { deriveRequestCategory, runWithRequestScope } from "../observability/requestScope.js";

function requestContext(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
  const incoming = req.headers?.["x-request-id"];
  // Validate: must be a non-empty string of ≤128 safe characters.
  // Rejects oversized or structurally suspicious values to prevent log injection.
  const incomingStr = typeof incoming === "string" ? incoming.trim() : "";
  const requestId = (incomingStr.length > 0 && incomingStr.length <= 128 && /^[\w.:-]+$/.test(incomingStr))
    ? incomingStr
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
