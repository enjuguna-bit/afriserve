import type { NextFunction, Request, Response } from "express";

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function getForwardedProto(req: Request): string {
  const forwardedHeader = String(req.header("forwarded") || "").trim().toLowerCase();
  if (forwardedHeader) {
    const protoMatch = forwardedHeader.match(/proto=([^;,\s]+)/i);
    if (protoMatch && protoMatch[1]) {
      return String(protoMatch[1]).trim().toLowerCase();
    }
  }

  const forwardedProto = String(req.header("x-forwarded-proto") || "").trim().toLowerCase();
  if (forwardedProto.includes(",")) {
    return (forwardedProto.split(",")[0] ?? "").trim().toLowerCase();
  }

  return forwardedProto;
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }

  const trustForwardedProto = parseBoolean(process.env.HTTPS_TRUST_FORWARDED_PROTO, true);
  if (!trustForwardedProto) {
    return false;
  }

  const proto = getForwardedProto(req);
  return proto === "https";
}

function resolveRedirectHost(req: Request): string {
  const forwardedHost = String(req.header("x-forwarded-host") || "").trim();
  if (forwardedHost) {
    return (forwardedHost.split(",")[0] ?? "").trim();
  }

  return String(req.header("host") || "").trim();
}

function enforceHttps(req: Request, res: Response, next: NextFunction) {
  const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const enforceInProduction = parseBoolean(process.env.HTTPS_ENFORCE_IN_PRODUCTION, true);
  if (!isProduction || !enforceInProduction) {
    next();
    return;
  }

  const normalizedPath = String(req.path || req.originalUrl || "").trim();
  if (
    normalizedPath === "/health" ||
    normalizedPath === "/health/details" ||
    normalizedPath === "/ready" ||
    normalizedPath === "/metrics" ||
    normalizedPath === "/api/ready" ||
    normalizedPath === "/api/system/health"
  ) {
    next();
    return;
  }

  if (!isSecureRequest(req)) {
    const mode = String(process.env.HTTPS_ENFORCEMENT_MODE || "reject").trim().toLowerCase();
    if (mode === "redirect") {
      const host = resolveRedirectHost(req);
      if (host) {
        const configuredStatus = Number(process.env.HTTPS_REDIRECT_STATUS_CODE);
        const redirectStatus = [301, 302, 307, 308].includes(configuredStatus) ? configuredStatus : 308;
        res.redirect(redirectStatus, `https://${host}${req.originalUrl || req.url || "/"}`);
        return;
      }
    }

    res.status(403).json({
      message: "HTTPS is required",
      code: "HTTPS_REQUIRED",
    });
    return;
  }

  next();
}

export {
  enforceHttps,
};
