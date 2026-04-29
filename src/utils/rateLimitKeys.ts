import crypto from "node:crypto";

type RateLimitRequestLike = {
  ip?: string | null;
  body?: Record<string, unknown> | null;
  headers?: Record<string, unknown> | null;
  user?: {
    sub?: number | string;
  } | null;
};

function normalizeEmailForRateLimit(value: unknown): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function readHeaderValue(headers: Record<string, unknown> | null | undefined, headerName: string): string {
  if (!headers) {
    return "";
  }

  const directMatch = headers[headerName];
  if (typeof directMatch === "string") {
    return directMatch.trim();
  }

  const caseInsensitiveKey = Object.keys(headers).find((key) => key.toLowerCase() === headerName.toLowerCase());
  if (!caseInsensitiveKey) {
    return "";
  }

  const value = headers[caseInsensitiveKey];
  return typeof value === "string" ? value.trim() : "";
}

function extractBearerToken(req: RateLimitRequestLike): string {
  const authorization = readHeaderValue(req.headers, "authorization");
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

function getRateLimitIpKey(req: RateLimitRequestLike): string {
  return `ip:${String(req.ip || "unknown")}`;
}

function getApiRateLimitRequesterKey(req: RateLimitRequestLike): string {
  const userId = req.user?.sub;
  if ((typeof userId === "number" && Number.isFinite(userId)) || typeof userId === "string") {
    return `user:${String(userId)}`;
  }

  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    return `bearer:${hashIdentifier(bearerToken)}`;
  }

  return getRateLimitIpKey(req);
}

function getAuthRateLimitRequesterKey(req: RateLimitRequestLike): string {
  const refreshToken = String(req.body?.token || req.body?.refreshToken || "").trim();
  if (refreshToken) {
    return `refresh:${hashIdentifier(refreshToken)}`;
  }

  const email = normalizeEmailForRateLimit(req.body?.email);
  if (email) {
    return `email:${email}`;
  }

  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    return `bearer:${hashIdentifier(bearerToken)}`;
  }

  return getRateLimitIpKey(req);
}

export {
  getApiRateLimitRequesterKey,
  getAuthRateLimitRequesterKey,
  getRateLimitIpKey,
};
