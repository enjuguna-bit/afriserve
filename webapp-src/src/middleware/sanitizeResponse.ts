import type { NextFunction, Request, Response } from "express";

const sensitiveKeys = new Set([
  "password_hash",
  "token_version",
  "locked_until",
  "failed_login_attempts",
]);

function isDecimalLike(value: unknown): value is { toString: () => string } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { constructor?: { name?: string }; toString?: () => string; toFixed?: () => string };
  return candidate.constructor?.name === "Decimal"
    || (typeof candidate.toString === "function" && typeof candidate.toFixed === "function");
}

function sanitizeResponsePayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeResponsePayload(item));
  }

  if (isDecimalLike(payload)) {
    return payload.toString();
  }

  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const source = payload as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  Object.entries(source).forEach(([key, value]) => {
    if (!sensitiveKeys.has(key)) {
      result[key] = sanitizeResponsePayload(value);
    }
  });

  return result;
}

function sanitizeResponseMiddleware(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = (payload: unknown) => originalJson(sanitizeResponsePayload(payload));
  next();
}

export {
  sanitizeResponsePayload,
  sanitizeResponseMiddleware,
};
