const RATE_LIMITS = {
  login: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 20,
  },
  reports: {
    // Dashboards and report workspaces fan out into several report calls at once.
    // Keep a dedicated bucket, but allow enough headroom for normal branch usage.
    windowMs: 5 * 60 * 1000,
    maxRequests: 120,
  },
  api: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 100,
  },
  admin: {
    windowMs: 5 * 60 * 1000,
    // Keep admin workflows usable, but tighten the bucket so a compromised
    // admin token cannot enumerate high-impact surfaces for too long unchecked.
    maxRequests: 100,
  },
} as const;

function isAdminRateLimitedPath(pathname: string): boolean {
  return pathname.startsWith("/admin/")
    || pathname.startsWith("/users")
    || pathname.startsWith("/branches")
    || pathname.startsWith("/permissions")
    || pathname.startsWith("/system")
    || pathname.startsWith("/audit-logs");
}

function isLightweightReportPath(pathname: string): boolean {
  return pathname === "/reports/filter-options";
}

function resolveRateLimitBucket(pathname: string): keyof typeof RATE_LIMITS {
  if (pathname.startsWith("/auth/login")) {
    return "login";
  }

  if (isAdminRateLimitedPath(pathname)) {
    return "admin";
  }
  if (isLightweightReportPath(pathname)) {
    return "api";
  }

  // Report generation endpoints are expensive — use a dedicated lower-limit bucket
  if (pathname.startsWith("/reports/")) {
    return "reports";
  }

  return "api";
}

export {
  RATE_LIMITS,
  isAdminRateLimitedPath,
  resolveRateLimitBucket,
};
