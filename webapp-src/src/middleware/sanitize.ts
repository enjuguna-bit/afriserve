import type { NextFunction, Request, Response } from "express";

function sanitizeString(value: string): string {
  return value.trim().replace(/[<>"']/g, "");
}

function sanitizeObject(value: unknown, skipKeys: Set<string> = new Set()): unknown {
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeObject(entry, skipKeys));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    if (skipKeys.has(key)) {
      return [key, entry];
    }
    return [key, sanitizeObject(entry, skipKeys)];
  });

  return Object.fromEntries(sanitizedEntries);
}

function sanitizeRequest(req: Request, _res: Response, next: NextFunction) {
  const skipKeys = new Set(["password", "newPassword", "currentPassword", "token"]);
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body, skipKeys);
  }

  if (req.query && typeof req.query === "object") {
    const sanitizedQuery = sanitizeObject(req.query, skipKeys);
    if (sanitizedQuery && typeof sanitizedQuery === "object") {
      const mutableQuery = req.query as Record<string, unknown>;
      for (const key of Object.keys(mutableQuery)) {
        delete mutableQuery[key];
      }
      Object.assign(mutableQuery, sanitizedQuery as Record<string, unknown>);
    }
  }

  next();
}

export {
  sanitizeRequest,
  sanitizeObject,
};
