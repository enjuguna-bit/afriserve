const RATE_LIMITS = {
  login: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 20,
  },
  api: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 100,
  },
  admin: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 500,
  },
} as const;

function isAdminRateLimitedPath(pathname: string): boolean {
  return pathname.startsWith("/users")
    || pathname.startsWith("/system")
    || pathname.startsWith("/audit-logs");
}

function resolveRateLimitBucket(pathname: string): keyof typeof RATE_LIMITS {
  if (pathname.startsWith("/auth/login")) {
    return "login";
  }

  if (isAdminRateLimitedPath(pathname)) {
    return "admin";
  }

  return "api";
}

export {
  RATE_LIMITS,
  isAdminRateLimitedPath,
  resolveRateLimitBucket,
};
