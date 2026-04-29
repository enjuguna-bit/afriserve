import { parsePaginationQuery, parseSortQuery, createPagedResponse } from "../utils/http.js";
import type { NextFunction, Request, Response } from "express";
import type { RouteRegistrarApp, SystemRouteDeps } from "../types/systemRoutes.js";
import { createSystemReadRepository } from "../repositories/systemReadRepository.js";
import { requirePermission } from "../middleware/permissions.js";
import { buildPrometheusMetrics } from "../observability/prometheus.js";
import { applyRbacPolicy } from "../middleware/rbacPolicy.js";
import { getBackendServiceCatalog, getGroupedBackendServiceCatalog } from "../config/serviceCatalog.js";

type RequestWithUser = Request & { user?: unknown };

function registerSystemRoutes(app: RouteRegistrarApp, deps: SystemRouteDeps): void {
  const {
    all,
    get,
    authenticate,
    authorize,
    getConfigStatus,
    getRuntimeStatus,
    runDatabaseBackup,
    metrics,
    hierarchyService,
  } = deps;
  const systemReadRepository = createSystemReadRepository({ all, get });
  const transactionViewRoles = [
    "admin",
    "ceo",
    "finance",
    "operations_manager",
    "area_manager",
    "loan_officer",
    "cashier",
  ];
  const systemConfigPermission = requirePermission("system.config");

  async function sendLiveHealthStatus(res: Response) {
    try {
      const status = await Promise.resolve(getRuntimeStatus());
      const normalizedStatus = String(status?.status || "").trim().toLowerCase();
      const isHealthy = normalizedStatus === "ok";
      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? "ok" : (normalizedStatus || "degraded"),
        service: "microfinance-api",
        timestamp: new Date().toISOString(),
        checks: status?.checks || {},
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "unknown_error";
      res.status(503).json({
        status: "degraded",
        service: "microfinance-api",
        timestamp: new Date().toISOString(),
        message: "Health check failed",
        error: errorMessage,
      });
    }
  }

  async function sendLivenessStatus(res: Response) {
    try {
      const status = await Promise.resolve(getRuntimeStatus());
      const normalizedStatus = String(status?.status || "").trim().toLowerCase();
      const readiness = normalizedStatus === "ok"
        ? "ready"
        : (normalizedStatus || "degraded");

      res.status(200).json({
        status: "ok",
        service: "microfinance-api",
        timestamp: new Date().toISOString(),
        readiness,
        checks: status?.checks || {},
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "unknown_error";
      res.status(503).json({
        status: "degraded",
        service: "microfinance-api",
        timestamp: new Date().toISOString(),
        message: "Liveness check failed",
        error: errorMessage,
      });
    }
  }

  app.get("/health", async (_req: Request, res: Response) => {
    await sendLivenessStatus(res);
  });

  app.get("/metrics", (_req: Request, res: Response) => {
    if (!metrics || typeof metrics.getSnapshot !== "function") {
      res.status(503).send("# metrics_unavailable 1\n");
      return;
    }

    const snapshot = metrics.getSnapshot();
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.status(200).send(buildPrometheusMetrics(snapshot));
  });

  app.get("/health/details", (_req: Request, res: Response) => {
    Promise.resolve(getRuntimeStatus())
      .then((status) => {
        res.status(200).json(status);
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : "unknown_error";
        res.status(503).json({
          status: "degraded",
          message: "Runtime status unavailable",
          error: errorMessage,
        });
      });
  });

  app.get("/ready", (_req: Request, res: Response) => {
    Promise.resolve(getRuntimeStatus())
      .then((status) => {
        const isReady = String(status?.status || "").toLowerCase() === "ok";
        res.status(isReady ? 200 : 503).json({
          status: isReady ? "ready" : "not_ready",
          service: "microfinance-api",
          timestamp: new Date().toISOString(),
          checks: status?.checks || {},
        });
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : "unknown_error";
        res.status(503).json({
          status: "not_ready",
          service: "microfinance-api",
          message: "Readiness check failed",
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      });
  });

  app.get("/api/ready", (_req: Request, res: Response) => {
    Promise.resolve(getRuntimeStatus())
      .then((status) => {
        const isReady = String(status?.status || "").toLowerCase() === "ok";
        res.status(isReady ? 200 : 503).json({
          status: isReady ? "ready" : "not_ready",
          service: "microfinance-api",
          timestamp: new Date().toISOString(),
          checks: status?.checks || {},
        });
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : "unknown_error";
        res.status(503).json({
          status: "not_ready",
          service: "microfinance-api",
          message: "Readiness check failed",
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      });
  });

  app.get("/api/transactions", authenticate, authorize(...transactionViewRoles), async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);

      const txType = String(req.query.txType || "").trim().toLowerCase();
      const allowedTxTypes = [
        "disbursement",
        "disbursement_tranche",
        "repayment",
        "registration_fee",
        "processing_fee",
        "restructure",
        "top_up",
        "refinance",
        "term_extension",
        "interest_accrual",
      ];
      if (txType) {
        if (!allowedTxTypes.includes(txType)) {
          res.status(400).json({
            message: "Invalid txType. Use one of: disbursement, disbursement_tranche, repayment, registration_fee, processing_fee, restructure, top_up, refinance, term_extension, interest_accrual",
          });
          return;
        }
      }

      const clientId = Number(req.query.clientId);
      const hasValidClientId = Number.isFinite(clientId) && Number.isInteger(clientId) && clientId > 0;
      if (!hasValidClientId && typeof req.query.clientId !== "undefined" && String(req.query.clientId).trim() !== "") {
        res.status(400).json({ message: "Invalid clientId filter" });
        return;
      }

      const loanId = Number(req.query.loanId);
      const hasValidLoanId = Number.isFinite(loanId) && Number.isInteger(loanId) && loanId > 0;
      if (!hasValidLoanId && typeof req.query.loanId !== "undefined" && String(req.query.loanId).trim() !== "") {
        res.status(400).json({ message: "Invalid loanId filter" });
        return;
      }

      const scopeCondition = hierarchyService.buildScopeCondition(scope, "t.branch_id");
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 20,
        maxLimit: 200,
        requirePagination: true,
        strict: true,
      });
      const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
        sortFieldMap: {
          id: "id",
          occurredAt: "occurredAt",
          amount: "amount",
          txType: "txType",
        },
        defaultSortBy: "id",
        defaultSortOrder: "desc",
        sortByErrorMessage: "Invalid sortBy. Use one of: id, occurredAt, amount, txType",
      });

      const { rows: transactions, total } = await systemReadRepository.listTransactions({
        txType: txType || undefined,
        clientId: Number.isInteger(clientId) && clientId > 0 ? clientId : undefined,
        loanId: Number.isInteger(loanId) && loanId > 0 ? loanId : undefined,
        scopeCondition,
        limit,
        offset,
        sortBy: sortBy as "id" | "occurredAt" | "amount" | "txType",
        sortOrder,
      });

      res.status(200).json(
        createPagedResponse({
          data: transactions,
          total,
          limit,
          offset,
          sortBy: requestedSortBy,
          sortOrder,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/audit-logs", authenticate, ...applyRbacPolicy("audit.logs.read", authorize), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const action = String(req.query.action || "").trim().toLowerCase();

      const targetType = String(req.query.targetType || "").trim().toLowerCase();

      const userId = Number(req.query.userId);
      if (!(Number.isFinite(userId) && Number.isInteger(userId) && userId > 0)
        && typeof req.query.userId !== "undefined"
        && String(req.query.userId).trim() !== "") {
        res.status(400).json({ message: "Invalid userId filter" });
        return;
      }

      const targetId = Number(req.query.targetId);
      if (!(Number.isFinite(targetId) && Number.isInteger(targetId) && targetId > 0)
        && typeof req.query.targetId !== "undefined"
        && String(req.query.targetId).trim() !== "") {
        res.status(400).json({ message: "Invalid targetId filter" });
        return;
      }

      const dateFromRaw = String(req.query.dateFrom || "").trim();
      const dateToRaw = String(req.query.dateTo || "").trim();
      let dateFrom: string | null = null;
      let dateTo: string | null = null;
      if (dateFromRaw) {
        const parsedDateFrom = new Date(dateFromRaw);
        if (Number.isNaN(parsedDateFrom.getTime())) {
          res.status(400).json({ message: "Invalid dateFrom filter. Use ISO-8601 date/time." });
          return;
        }
        dateFrom = parsedDateFrom.toISOString();
      }
      if (dateToRaw) {
        const parsedDateTo = new Date(dateToRaw);
        if (Number.isNaN(parsedDateTo.getTime())) {
          res.status(400).json({ message: "Invalid dateTo filter. Use ISO-8601 date/time." });
          return;
        }
        dateTo = parsedDateTo.toISOString();
      }
      if (dateFrom && dateTo && new Date(dateFrom).getTime() > new Date(dateTo).getTime()) {
        res.status(400).json({ message: "Invalid date range. dateFrom must be before or equal to dateTo." });
        return;
      }
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        requirePagination: false,
        strict: true,
      });

      const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
        sortFieldMap: {
          id: "id",
          createdAt: "createdAt",
          userId: "userId",
          action: "action",
          targetType: "targetType",
          targetId: "targetId",
        },
        defaultSortBy: "id",
        defaultSortOrder: "desc",
        sortByErrorMessage: "Invalid sortBy. Use one of: id, createdAt, userId, action, targetType, targetId",
      });

      const { rows: logs, total } = await systemReadRepository.listAuditLogs({
        action: action || undefined,
        targetType: targetType || undefined,
        userId: Number.isInteger(userId) && userId > 0 ? userId : undefined,
        targetId: Number.isInteger(targetId) && targetId > 0 ? targetId : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
        offset,
        sortBy: sortBy as "id" | "createdAt" | "userId" | "action" | "targetType" | "targetId",
        sortOrder,
      });

      res.status(200).json(
        createPagedResponse({
          data: logs,
          total,
          limit,
          offset,
          sortBy: requestedSortBy,
          sortOrder,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/system/audit-trail", authenticate, ...applyRbacPolicy("audit.trail.read", authorize), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const action = String(req.query.action || "").trim().toLowerCase();

      const userId = Number(req.query.userId);
      if (!(Number.isFinite(userId) && Number.isInteger(userId) && userId > 0)
        && typeof req.query.userId !== "undefined"
        && String(req.query.userId).trim() !== "") {
        res.status(400).json({ message: "Invalid userId filter" });
        return;
      }

      const dateFromRaw = String(req.query.dateFrom || "").trim();
      const dateToRaw = String(req.query.dateTo || "").trim();
      let dateFrom: string | null = null;
      let dateTo: string | null = null;
      if (dateFromRaw) {
        const parsedDateFrom = new Date(dateFromRaw);
        if (Number.isNaN(parsedDateFrom.getTime())) {
          res.status(400).json({ message: "Invalid dateFrom filter. Use ISO-8601 date/time." });
          return;
        }
        dateFrom = parsedDateFrom.toISOString();
      }
      if (dateToRaw) {
        const parsedDateTo = new Date(dateToRaw);
        if (Number.isNaN(parsedDateTo.getTime())) {
          res.status(400).json({ message: "Invalid dateTo filter. Use ISO-8601 date/time." });
          return;
        }
        dateTo = parsedDateTo.toISOString();
      }
      if (dateFrom && dateTo && new Date(dateFrom).getTime() > new Date(dateTo).getTime()) {
        res.status(400).json({ message: "Invalid date range. dateFrom must be before or equal to dateTo." });
        return;
      }
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        requirePagination: false,
        strict: true,
      });

      const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
        sortFieldMap: {
          id: "id",
          createdAt: "createdAt",
          userId: "userId",
          userName: "userName",
          action: "action",
          targetType: "targetType",
          targetId: "targetId",
        },
        defaultSortBy: "id",
        defaultSortOrder: "desc",
        sortByErrorMessage: "Invalid sortBy. Use one of: id, createdAt, userId, userName, action, targetType, targetId",
      });

      const { rows: trailRows, total } = await systemReadRepository.listAuditTrail({
        action: action || undefined,
        userId: Number.isInteger(userId) && userId > 0 ? userId : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
        offset,
        sortBy: sortBy as "id" | "createdAt" | "userId" | "userName" | "action" | "targetType" | "targetId",
        sortOrder,
      });

      res.status(200).json(
        createPagedResponse({
          data: trailRows,
          total,
          limit,
          offset,
          sortBy: requestedSortBy,
          sortOrder,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/system/service-catalog", authenticate, systemConfigPermission, async (_req: Request, res: Response) => {
    const grouped = getGroupedBackendServiceCatalog();
    const services = getBackendServiceCatalog();
    res.status(200).json({
      summary: {
        totalCategories: grouped.length,
        totalServices: services.length,
      },
      categories: grouped,
      services,
    });
  });

  app.get("/api/system/health", async (_req: Request, res: Response) => {
    await sendLiveHealthStatus(res);
  });

  app.get("/api/system/status", authenticate, systemConfigPermission, async (_req: Request, res: Response) => {
    const runtimeStatus = await getRuntimeStatus();
    res.status(200).json(runtimeStatus);
  });

  app.get("/api/system/config", authenticate, systemConfigPermission, (_req: Request, res: Response) => {
    res.status(200).json(getConfigStatus());
  });

  app.get("/api/hierarchy-events", authenticate, authorize("admin"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventType = String(req.query.eventType || "").trim().toLowerCase();

      const scopeLevel = String(req.query.scopeLevel || "").trim().toLowerCase();
      if (scopeLevel) {
        const allowedScopeLevels = ["hq", "region", "branch"];
        if (!allowedScopeLevels.includes(scopeLevel)) {
          res.status(400).json({ message: "Invalid scopeLevel. Use one of: hq, region, branch" });
          return;
        }
      }

      const regionId = Number(req.query.regionId);
      if (!(Number.isFinite(regionId) && Number.isInteger(regionId) && regionId > 0)
        && typeof req.query.regionId !== "undefined"
        && String(req.query.regionId).trim() !== "") {
        res.status(400).json({ message: "Invalid regionId filter" });
        return;
      }

      const branchId = Number(req.query.branchId);
      if (!(Number.isFinite(branchId) && Number.isInteger(branchId) && branchId > 0)
        && typeof req.query.branchId !== "undefined"
        && String(req.query.branchId).trim() !== "") {
        res.status(400).json({ message: "Invalid branchId filter" });
        return;
      }

      const actorUserId = Number(req.query.actorUserId);
      if (!(Number.isFinite(actorUserId) && Number.isInteger(actorUserId) && actorUserId > 0)
        && typeof req.query.actorUserId !== "undefined"
        && String(req.query.actorUserId).trim() !== "") {
        res.status(400).json({ message: "Invalid actorUserId filter" });
        return;
      }

      const dateFromRaw = String(req.query.dateFrom || "").trim();
      const dateToRaw = String(req.query.dateTo || "").trim();
      let dateFrom: string | null = null;
      let dateTo: string | null = null;
      if (dateFromRaw) {
        const parsedDateFrom = new Date(dateFromRaw);
        if (Number.isNaN(parsedDateFrom.getTime())) {
          res.status(400).json({ message: "Invalid dateFrom filter. Use ISO-8601 date/time." });
          return;
        }
        dateFrom = parsedDateFrom.toISOString();
      }
      if (dateToRaw) {
        const parsedDateTo = new Date(dateToRaw);
        if (Number.isNaN(parsedDateTo.getTime())) {
          res.status(400).json({ message: "Invalid dateTo filter. Use ISO-8601 date/time." });
          return;
        }
        dateTo = parsedDateTo.toISOString();
      }
      if (dateFrom && dateTo && new Date(dateFrom).getTime() > new Date(dateTo).getTime()) {
        res.status(400).json({ message: "Invalid date range. dateFrom must be before or equal to dateTo." });
        return;
      }
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        requirePagination: false,
        strict: true,
      });

      const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
        sortFieldMap: {
          id: "id",
          createdAt: "createdAt",
          eventType: "eventType",
          scopeLevel: "scopeLevel",
          regionId: "regionId",
          branchId: "branchId",
          actorUserId: "actorUserId",
        },
        defaultSortBy: "id",
        defaultSortOrder: "desc",
        sortByErrorMessage: "Invalid sortBy. Use one of: id, createdAt, eventType, scopeLevel, regionId, branchId, actorUserId",
      });

      const { rows, total } = await systemReadRepository.listHierarchyEvents({
        eventType: eventType || undefined,
        scopeLevel: scopeLevel || undefined,
        regionId: Number.isInteger(regionId) && regionId > 0 ? regionId : undefined,
        branchId: Number.isInteger(branchId) && branchId > 0 ? branchId : undefined,
        actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
        offset,
        sortBy: sortBy as "id" | "createdAt" | "eventType" | "scopeLevel" | "regionId" | "branchId" | "actorUserId",
        sortOrder,
      });

      const events = rows.map((row: Record<string, any>) => ({
        ...row,
        details: row.details ? safeJsonParse(row.details) : null,
      }));

      res.status(200).json(
        createPagedResponse({
          data: events,
          total,
          limit,
          offset,
          sortBy: requestedSortBy,
          sortOrder,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/system/config-status", authenticate, systemConfigPermission, (_req: Request, res: Response) => {
    res.status(200).json(getConfigStatus());
  });

  app.get("/api/system/metrics", authenticate, systemConfigPermission, (_req: Request, res: Response) => {
    if (!metrics || typeof metrics.getSnapshot !== "function") {
      res.status(501).json({ message: "Metrics capability is not available." });
      return;
    }

    res.status(200).json(metrics.getSnapshot());
  });

  app.post("/api/system/backup", authenticate, authorize("admin"), systemConfigPermission, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (typeof runDatabaseBackup !== "function") {
        res.status(501).json({ message: "Database backup capability is not available." });
        return;
      }

      const result = await runDatabaseBackup();
      if (result?.skipped) {
        res.status(409).json({
          message: "Database backup was skipped.",
          reason: result.reason || "skipped",
        });
        return;
      }

      res.status(201).json({
        message: "Database backup completed.",
        backupPath: result.backupPath,
        createdAt: result.createdAt,
        deletedFiles: result.deletedFiles || [],
      });
    } catch (error) {
      next(error);
    }
  });
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

export {
  registerSystemRoutes,
};



