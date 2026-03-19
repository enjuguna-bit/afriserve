/**
 * sanitize.ts — request input sanitisation middleware.
 *
 * ── What this does ───────────────────────────────────────────────────────────
 * Strips characters that are structural HTML/XML injection vectors (<, >) from
 * every string value in req.body and req.query, except for a skip-list of
 * sensitive credential fields whose values must be passed through verbatim.
 *
 * ── What this deliberately does NOT do ──────────────────────────────────────
 * It does NOT strip apostrophes (') or double-quotes (").
 *
 * Rationale:
 *   - This is an API backend. All DB writes use parameterised queries (Prisma /
 *     better-sqlite3 prepared statements). SQL injection is prevented at the
 *     query layer, not by mangling input strings.
 *   - Apostrophes are valid and common in real names ("O'Brien", "Mama's
 *     Kitchen") and financial notes. Stripping them causes permanent, silent
 *     data corruption that is impossible to recover after commit.
 *   - Double-quotes appear in JSON values, addresses, and business names.
 *   - Output encoding at render time (handled by the React SPA) is the correct
 *     approach for XSS prevention; input mangling is not.
 *
 * ── req.query mutation ───────────────────────────────────────────────────────
 * Express's req.query is a parsed object whose reference is shared across
 * middleware. We replace it atomically using Object.defineProperty so the
 * reference never exists in a partially-mutated state during concurrent
 * middleware execution.
 */
import type { NextFunction, Request, Response } from "express";

/**
 * Removes only the characters that are structural HTML/XML injection vectors:
 * < and >.
 *
 * Apostrophes and double-quotes are left intact — they are legitimate
 * characters in names, notes, and financial data on this platform.
 */
function sanitizeString(value: string): string {
  return value.trim().replace(/[<>]/g, "");
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
  const skipKeys = new Set([
    "password",
    "newPassword",
    "currentPassword",
    "confirmPassword",
    "token",
    "refreshToken",
    "clientSecret",
  ]);

  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body, skipKeys);
  }

  if (req.query && typeof req.query === "object") {
    const sanitized = sanitizeObject(req.query, skipKeys);
    if (sanitized && typeof sanitized === "object") {
      // Atomic replacement via defineProperty — avoids the delete-then-assign
      // race where concurrent middleware could observe a half-cleared object.
      Object.defineProperty(req, "query", {
        value: sanitized,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }

  next();
}

export {
  sanitizeRequest,
  sanitizeObject,
};
