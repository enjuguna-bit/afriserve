import type { ErrorHandlerOptions, HttpStatusErrorLike } from "../types/runtime.js";
import { getDomainErrorHttpStatus } from "../domain/errors.js";

function createErrorHandler({ ZodError, logger = null, metrics = null, errorTracker = null }: ErrorHandlerOptions) {
  /**
   * @param {unknown} error
   * @param {any} _req
   * @param {any} res
   * @param {(error?: any) => void} _next
   */
  return (error: unknown, _req: any, res: any, _next: (error?: any) => void) => {
    const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
    const typedError = error as HttpStatusErrorLike;
    const requestId = _req.requestId || null;
    const logContext = {
      requestId,
      method: _req.method,
      route: _req.path || _req.originalUrl || "unknown",
      ipAddress: _req.ip,
      error: typedError,
    };

    function buildDebugDetails() {
      if (isProduction || !(error instanceof Error)) {
        return undefined;
      }

      const errorWithCode = error as Error & { code?: unknown; cause?: unknown };
      const details: Record<string, unknown> = {
        errorName: error.name,
      };

      if (typeof errorWithCode.code !== "undefined") {
        details.errorCode = errorWithCode.code;
      }

      if (errorWithCode.cause instanceof Error && errorWithCode.cause.message.trim()) {
        details.cause = errorWithCode.cause.message;
      }

      return details;
    }

    if (typedError instanceof ZodError) {
      if (metrics && typeof metrics.observeError === "function") {
        metrics.observeError(400);
      }
      if (logger && typeof logger.warn === "function") {
        logger.warn("request.validation.failed", {
          ...logContext,
          issues: typedError.issues,
        });
      }

      res.status(400).json({
        message: "Validation failed",
        errorCode: "VALIDATION_ERROR",
        issues: typedError.issues,
        requestId,
      });
      return;
    }

    if (typedError && typedError.message === "CORS origin is not allowed") {
      if (metrics && typeof metrics.observeError === "function") {
        metrics.observeError(403);
      }
      if (logger && typeof logger.warn === "function") {
        logger.warn("request.cors.forbidden", logContext);
      }
      res.status(403).json({ message: "Forbidden by CORS policy", requestId });
      return;
    }

    const domainStatus = getDomainErrorHttpStatus(error);
    if (typeof domainStatus === "number") {
      if (metrics && typeof metrics.observeError === "function") {
        metrics.observeError(domainStatus);
      }
      if (logger && typeof logger.warn === "function") {
        logger.warn("request.domain_error", {
          ...logContext,
          statusCode: domainStatus,
        });
      }
      const message = error instanceof Error ? error.message : "Request failed";
      res.status(domainStatus).json({ message, requestId });
      return;
    }

    const statusCandidate = typedError?.status;
    if (typeof statusCandidate === "number" && Number.isInteger(statusCandidate) && statusCandidate >= 400 && statusCandidate < 600) {
      const statusCode = statusCandidate;
      if (metrics && typeof metrics.observeError === "function") {
        metrics.observeError(statusCode);
      }
      if (logger && typeof logger.warn === "function") {
        logger.warn("request.failed", {
          ...logContext,
          statusCode,
        });
      }
      const rawMessage = typedError.message || "Request failed";
      const message = isProduction
        ? "An unexpected error occurred"
        : rawMessage;
      const debugDetails = buildDebugDetails();
      if (statusCode >= 500 && errorTracker && typeof errorTracker.captureException === "function") {
        errorTracker.captureException(error, {
          requestId,
          method: _req.method,
          route: _req.path || _req.originalUrl || "unknown",
          statusCode,
        });
      }
      res.status(statusCode).json({
        message,
        requestId,
        ...(debugDetails ? { debugDetails } : {}),
      });
      return;
    }

    if (metrics && typeof metrics.observeError === "function") {
      metrics.observeError(500);
    }
    if (logger && typeof logger.error === "function") {
      logger.error("request.unhandled_error", logContext);
    }
    if (errorTracker && typeof errorTracker.captureException === "function") {
      errorTracker.captureException(error, {
        requestId,
        method: _req.method,
        route: _req.path || _req.originalUrl || "unknown",
        statusCode: 500,
      });
    }

    const rawMessage = error instanceof Error && error.message.trim()
      ? error.message
      : "Internal server error";
    const debugDetails = buildDebugDetails();

    res.status(500).json({
      message: isProduction ? "An unexpected error occurred" : rawMessage,
      requestId,
      ...(debugDetails ? { debugDetails } : {}),
    });
  };
}

export {
  createErrorHandler,
};
