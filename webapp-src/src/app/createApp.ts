import path from "node:path";
import compression from "compression";
import express from "express";
import type { Request, Response } from "express";
import type { LoggerLike, MetricsLike } from "../types/runtime.js";
import { applySecurityMiddleware, resolveStaticAppIndexPath } from "../config/security.js";
import { enforceHttps } from "../middleware/https.js";
import { enforceAdminIpWhitelist } from "../middleware/ipWhitelist.js";
import { sanitizeRequest } from "../middleware/sanitize.js";
import { sanitizeResponseMiddleware } from "../middleware/sanitizeResponse.js";
import { userRateLimit } from "../middleware/userRateLimit.js";
import { registerOpenApiDocs } from "../config/openapi.js";
import { registerSystemRoutes } from "../routes/systemRoutes.js";
import { registerAuthRoutes } from "../routes/authRoutes.js";
import { registerUserRoutes } from "../routes/userRoutes.js";
import { registerClientRoutes } from "../routes/clientRoutes.js";
import { registerLoanRoutes } from "../routes/loanRoutes.js";
import { registerCollectionRoutes } from "../routes/collectionRoutes.js";
import { registerBranchRoutes } from "../routes/branchRoutes.js";
import { registerReportRoutes } from "../routes/reportRoutes.js";
import registerSimplifiedReportingRoutes from "../routes/simplifiedReportingRoutes.js";
import { registerUploadRoutes } from "../routes/uploadRoutes.js";
type CreateAppOptions = {
  logger: LoggerLike | null;
  metrics: MetricsLike | null;
  documentStorage: {
    driver: string;
    localPublicBasePath: string;
    localDirectory: string;
  };
  generalApiLimiter: any;
  errorHandler: any;
  routeDeps: Record<string, any>;
};

type RequestWithContext = Request & {
  requestId?: string | null;
  responseBodyPreview?: unknown;
};

function createApp(options: CreateAppOptions) {
  const {
    logger,
    metrics,
    documentStorage,
    generalApiLimiter,
    errorHandler,
    routeDeps,
  } = options;

  const app = express();
  const staticAppIndexPath = resolveStaticAppIndexPath();
  app.locals.logger = logger;
  app.locals.metrics = metrics;

  applySecurityMiddleware(app, { logger, metrics });
  app.use(compression());
  app.use(enforceHttps);
  app.use(sanitizeRequest);
  app.use(sanitizeResponseMiddleware);
  app.use("/api", enforceAdminIpWhitelist);
  app.use("/api", userRateLimit);
  if (documentStorage.driver === "local") {
    app.use(documentStorage.localPublicBasePath, express.static(documentStorage.localDirectory, {
      setHeaders: (res) => {
        res.setHeader("Content-Disposition", "attachment");
        res.setHeader("Content-Security-Policy", "default-src 'none'");
        res.setHeader("X-Content-Type-Options", "nosniff");
      }
    }));
  }

  app.use((req: RequestWithContext, res: Response, next) => {
    if (req.url === "/api/v1" || req.url.startsWith("/api/v1/")) {
      req.url = req.url.replace(/^\/api\/v1(?=\/|$)/, "/api");
      res.setHeader("X-API-Version", "v1");
    } else if (req.url.startsWith("/api/")) {
      res.setHeader("X-API-Version", "v1");
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      req.responseBodyPreview = payload;
      if (
        res.statusCode >= 400 &&
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        !Object.prototype.hasOwnProperty.call(payload, "requestId")
      ) {
        return originalJson({
          ...payload,
          requestId: req.requestId || null,
        });
      }

      return originalJson(payload);
    };

    next();
  });

  app.use("/api/", generalApiLimiter);
  registerOpenApiDocs(app);

  registerSystemRoutes(app, routeDeps as any);
  registerAuthRoutes(app, routeDeps as any);
  registerUserRoutes(app, routeDeps as any);
  registerClientRoutes(app, routeDeps as any);
  registerUploadRoutes(app, routeDeps as any);
  registerLoanRoutes(app, routeDeps as any);
  registerCollectionRoutes(app, routeDeps as any);
  registerBranchRoutes(app, routeDeps as any);
  registerReportRoutes(app, routeDeps as any);
  registerSimplifiedReportingRoutes(app, routeDeps as any);

  app.use((req: Request, res: Response, next) => {
    if (!staticAppIndexPath) {
      next();
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    if (req.path === documentStorage.localPublicBasePath || req.path.startsWith(`${documentStorage.localPublicBasePath}/`)) {
      next();
      return;
    }

    if (req.path === "/api" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    if (path.extname(req.path)) {
      next();
      return;
    }

    if (req.accepts(["html", "json"]) !== "html") {
      next();
      return;
    }

    res.sendFile(staticAppIndexPath);
  });

  app.use(errorHandler);

  return app;
}

export {
  createApp,
};
