import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";
import { createReportQueryService } from "../services/reportQueryService.js";
import { buildTabularExport } from "../services/reportExportService.js";
import { createAppServiceRegistry } from "../services/serviceRegistry.js";
import { createLoanProductCatalogService } from "../services/loanProductCatalogService.js";
import { registerPortfolioReports } from "./reports/portfolioReports.js";
import { registerCollectionReports } from "./reports/collectionReports.js";
import { registerFinancialReports } from "./reports/financialReports.js";
import { registerOfficerReports } from "./reports/officerReports.js";
import { registerGlReports } from "./reports/glReports.js";
import type { ReportRouteDeps, RouteRegistrar } from "../types/routeDeps.js";

type ReportFormat = "json" | "csv" | "pdf" | "xlsx";

interface ReportResponse {
  status: (code: number) => {
    json: (payload: { message: string }) => unknown;
    send: (body: string | Buffer) => unknown;
  };
  setHeader: (name: string, value: string) => void;
}

interface ScopeCachePayload {
  level: string | null;
  role: string | null;
  branchId: number | null;
  regionId: number | null;
  branchIds: number[];
}

interface ReportFilterCatalogEntry {
  id: string;
  label: string;
  description: string;
  category: string;
  endpoint: string;
  allowedRoles: string[];
}

interface ReportFilterOfficeOption {
  id: number | string;
  name: string;
  code?: string | null;
  regionId?: number | null;
  regionName?: string | null;
  scopeType: "overall" | "region" | "branch";
}

interface ReportFilterAgentOption {
  id: number | string;
  name: string;
  role?: string | null;
  branchId?: number | null;
  branchName?: string | null;
  branchCode?: string | null;
  managedLoans?: number;
  scopeType?: "overall" | "user";
}

function registerReportRoutes(app: RouteRegistrar, deps: ReportRouteDeps) {
  const {
    run,
    get,
    all,
    reportGet,
    reportAll,
    executeTransaction,
    authenticate,
    authorize,
    parseId,
    writeAuditLog,
    hierarchyService,
    reportCache = null,
    serviceRegistry = null,
    logger = null,
    metrics = null,
  } = deps;

  const reportRoles = [
    "admin",
    "ceo",
    "finance",
    "investor",
    "partner",
    "it",
    "operations_manager",
    "area_manager",
    "loan_officer",
    "cashier",
  ];
  const hqReportRoles = new Set(["admin", "ceo", "finance", "it"]);
  const officerPerformanceRoles = [
    "admin",
    "ceo",
    "finance",
    "investor",
    "partner",
    "operations_manager",
    "area_manager",
  ];
  const financeReportRoles = [
    "admin",
    "ceo",
    "finance",
    "investor",
    "partner",
    "operations_manager",
    "area_manager",
  ];
  const reportCatalog: ReportFilterCatalogEntry[] = [
    {
      id: "operations-customers",
      label: "List of customers",
      description: "Customer register with branch, contact, status, and assigned officer context.",
      category: "operations",
      endpoint: "/api/reports/clients",
      allowedRoles: reportRoles,
    },
    {
      id: "operations-loans-due",
      label: "Loans Due Report",
      description: "Legacy Cemes loans-due export for unpaid installments on loans with scheduled dues inside the selected period.",
      category: "operations",
      endpoint: "/api/reports/dues",
      allowedRoles: reportRoles,
    },
    {
      id: "operations-disbursement",
      label: "Disbursment Report",
      description: "Legacy Cemes disbursment export for loans disbursed in the period with branch, product, officer, and new-versus-repeat borrower classification.",
      category: "operations",
      endpoint: "/api/reports/disbursements",
      allowedRoles: reportRoles,
    },
    {
      id: "operations-sms",
      label: "Daily Collections",
      description: "Daily collection totals and repayment counts across the selected period.",
      category: "operations",
      endpoint: "/api/reports/daily-collections",
      allowedRoles: reportRoles,
    },
    {
      id: "operations-olb",
      label: "Portfolio OLB",
      description: "Overall loan book position including active loans, outstanding balance, and overdue exposure.",
      category: "operations",
      endpoint: "/api/reports/portfolio",
      allowedRoles: reportRoles,
    },
    {
      id: "operations-mpesa-payments",
      label: "Mpesa Payments",
      description: "Mobile-money repayment activity with payer, branch, and officer details.",
      category: "operations",
      endpoint: "/api/reports/mpesa-payments",
      allowedRoles: reportRoles,
    },
    {
      id: "operations-guarantors",
      label: "List of Guarantors",
      description: "Guarantor register with guaranteed loans, amounts, and client linkage.",
      category: "operations",
      endpoint: "/api/reports/guarantors",
      allowedRoles: reportRoles,
    },
    {
      id: "operations-cumulative-branch",
      label: "Collections Summary by Branch",
      description: "Branch-level collections summary for the selected period.",
      category: "operations",
      endpoint: "/api/reports/collections",
      allowedRoles: reportRoles,
    },
    {
      id: "operations-cumulative-officer",
      label: "Collections Summary by Officer",
      description: "Officer-level disbursement, collection, and expected-due performance in one view.",
      category: "operations",
      endpoint: "/api/reports/officer-performance",
      allowedRoles: officerPerformanceRoles,
    },
    {
      id: "operations-red-flag",
      label: "Arrears Report",
      description: "Legacy Cemes arrears export for overdue borrowers with maturity, guarantees, and aging indicators for intervention.",
      category: "operations",
      endpoint: "/api/reports/arrears",
      allowedRoles: reportRoles,
    },
    {
      id: "operations-par",
      label: "PAR / Portfolio Aging",
      description: "Portfolio-at-risk buckets showing overdue balances by aging band.",
      category: "operations",
      endpoint: "/api/reports/aging",
      allowedRoles: reportRoles,
    },
    {
      id: "risk-arrears",
      label: "Arrears Report",
      description: "Legacy Cemes arrears export for all overdue loans as of the selected report snapshot date.",
      category: "risk",
      endpoint: "/api/reports/arrears",
      allowedRoles: reportRoles,
    },
    {
      id: "risk-npl",
      label: "Non-Performing Loans",
      description: "Risk-focused arrears view highlighting loans approaching or crossing non-performing thresholds.",
      category: "risk",
      endpoint: "/api/reports/arrears",
      allowedRoles: reportRoles,
    },
    {
      id: "risk-portfolio-aging",
      label: "Portfolio Aging",
      description: "Aging analysis of the portfolio by overdue bucket and branch.",
      category: "risk",
      endpoint: "/api/reports/aging",
      allowedRoles: reportRoles,
    },
    {
      id: "collections-summary",
      label: "Collections Summary",
      description: "Period collections totals, repayment counts, and branch-level breakdown.",
      category: "collections",
      endpoint: "/api/reports/collections",
      allowedRoles: reportRoles,
    },
    {
      id: "collections-dues",
      label: "Loans Due Report",
      description: "Legacy Cemes loans-due export for installments due in the selected window, including current arrears exposure.",
      category: "collections",
      endpoint: "/api/reports/dues",
      allowedRoles: reportRoles,
    },
    {
      id: "collections-daily",
      label: "Daily Collections",
      description: "Collections trend by day with loan and repayment counts.",
      category: "collections",
      endpoint: "/api/reports/daily-collections",
      allowedRoles: reportRoles,
    },
    {
      id: "finance-income-statement",
      label: "Income Statement",
      description: "Financial performance summary including disbursements, repayments, income, and cash position.",
      category: "finance",
      endpoint: "/api/reports/income-statement",
      allowedRoles: financeReportRoles,
    },
    {
      id: "finance-write-offs",
      label: "Write-offs",
      description: "Approved loan write-offs with branch, client, and write-off amount detail.",
      category: "finance",
      endpoint: "/api/reports/write-offs",
      allowedRoles: financeReportRoles,
    },
    {
      id: "executive-board-summary",
      label: "Board Summary",
      description: "Executive roll-up of portfolio size, collections, arrears, and top risk branches.",
      category: "executive",
      endpoint: "/api/reports/board-summary",
      allowedRoles: reportRoles,
    },
    {
      id: "executive-officer-performance",
      label: "Officer Performance",
      description: "Officer comparison view for disbursement volume, collections, and collection-rate performance.",
      category: "executive",
      endpoint: "/api/reports/officer-performance",
      allowedRoles: officerPerformanceRoles,
    },
  ];
  const allowedFormats = ["json", "csv", "pdf", "xlsx"];
  const readGet = reportGet || get;
  const readAll = reportAll || all;

  function parseDateParam(value: unknown, fieldName: string, res: ReportResponse): string | null | undefined {
    if (!value || !String(value).trim()) return null;
    const d = new Date(String(value).trim());
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ message: `Invalid ${fieldName}. Use ISO-8601 format.` });
      return undefined;
    }
    return d.toISOString();
  }

  function toScopeCachePayload(scope: any): ScopeCachePayload {
    const rawBranchIds: unknown[] = Array.isArray(scope?.branchIds) ? scope.branchIds : [];
    return {
      level: scope?.level || null,
      role: scope?.role || null,
      branchId: Number.isInteger(Number(scope?.branchId)) ? Number(scope.branchId) : null,
      regionId: Number.isInteger(Number(scope?.regionId)) ? Number(scope.regionId) : null,
      branchIds: rawBranchIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
        .sort((a, b) => a - b),
    };
  }

  async function resolveCachedReport<T>({
    namespace,
    user,
    scope,
    keyPayload = {},
    compute,
  }: {
    namespace: string;
    user: Record<string, any> | undefined;
    scope: any;
    keyPayload?: Record<string, unknown>;
    compute: () => Promise<T>;
  }): Promise<T> {
    if (!reportCache || !reportCache.enabled) {
      return compute();
    }

    const result = await reportCache.getOrSet({
      key: reportCache.buildKey(namespace, {
        userId: user?.sub || null,
        role: user?.role || null,
        scope: toScopeCachePayload(scope),
        ...keyPayload,
      }),
      compute,
    });

    return result.value;
  }

  const reportServices = serviceRegistry?.report || createAppServiceRegistry({
    get: readGet,
    all: readAll,
    run,
    executeTransaction,
    hierarchyService,
    calculateExpectedTotal: () => 0,
    addWeeksIso: (value) => value,
    writeAuditLog: writeAuditLog || (() => undefined),
    invalidateReportCaches: async () => undefined,
    requireVerifiedClientKycForLoanApproval: false,
    allowConcurrentLoans: false,
    reportCache,
    logger,
    metrics,
    loanProductCatalogService: createLoanProductCatalogService({
      get: readGet,
      createHttpError: (status: number, message: string) => Object.assign(new Error(message), { status }),
    }),
  }).report;

  const reportQueryService = reportServices.reportQueryService;

  function resolveFormat(rawFormat: unknown, res: ReportResponse): ReportFormat | null {
    const format = String(rawFormat || "json").trim().toLowerCase() || "json";
    if (!allowedFormats.includes(format)) {
      res.status(400).json({ message: "Invalid format. Use one of: json, csv, pdf, xlsx." });
      return null;
    }
    return format as ReportFormat;
  }

  function sendTabularExport(
    res: ReportResponse,
    { format, filenameBase, title, headers, rows, csvQuoteAllFields }: {
      format: ReportFormat;
      filenameBase: string;
      title: string;
      headers: string[];
      rows: Array<Record<string, unknown>>;
      csvQuoteAllFields?: boolean;
    },
  ): boolean {
    const exportPayload = buildTabularExport({
      format,
      filenameBase,
      title,
      headers,
      rows,
      csvQuoteAllFields,
    });
    if (!exportPayload.handled) {
      return false;
    }
    res.setHeader("Content-Type", exportPayload.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${exportPayload.filename || filenameBase}"`);
    res.status(200).send(exportPayload.body || "");
    return true;
  }

  app.get(
    "/api/reports/filter-options",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const userRole = String(scope?.role || req.user?.role || "").trim().toLowerCase();
        const rawBranchFilter = String(req.query.branchId || "").trim();
        const branchFilter = rawBranchFilter ? parseId(rawBranchFilter) : null;
        if (rawBranchFilter && !branchFilter) {
          res.status(400).json({ message: "Invalid branchId filter" });
          return;
        }
        if (branchFilter && !hierarchyService.isBranchInScope(scope, branchFilter)) {
          res.status(403).json({ message: "Forbidden: branchId is outside your scope." });
          return;
        }

        const officeWhereBuilder = createSqlWhereBuilder();
        officeWhereBuilder.addCondition(hierarchyService.buildScopeCondition(scope, "b.id"));
        if (branchFilter) {
          officeWhereBuilder.addEquals("b.id", branchFilter);
        }

        const offices = await readAll(
          `
            SELECT
              b.id AS branch_id,
              b.name AS branch_name,
              b.code AS branch_code,
              b.region_id,
              r.name AS region_name
            FROM branches b
            INNER JOIN regions r ON r.id = b.region_id
            ${officeWhereBuilder.buildWhere()}
            ORDER BY r.name ASC, b.name ASC
          `,
          officeWhereBuilder.getParams(),
        );

        const scopedOfficeIds = offices
          .map((row: Record<string, unknown>) => Number(row.branch_id || 0))
          .filter((branchId: number) => Number.isInteger(branchId) && branchId > 0);

        const rawAgentRole = String(req.query.agentRole || "").trim().toLowerCase();
        const allowedAgentRoles = new Set(["loan_officer", "operations_manager", "area_manager", "cashier", "admin"]);
        if (rawAgentRole && !allowedAgentRoles.has(rawAgentRole)) {
          res.status(400).json({ message: "Invalid agentRole filter. Use loan_officer, operations_manager, area_manager, cashier, or admin" });
          return;
        }
        const agentRoleSql = rawAgentRole ? "AND LOWER(TRIM(u.role)) = ?" : "";
        const agentRoleParams = rawAgentRole ? [rawAgentRole] : [];

        let agents: ReportFilterAgentOption[] = [];
        if (hqReportRoles.has(userRole)) {
          agents = [
            {
              id: "all",
              name: "All agents",
              scopeType: "overall",
            },
          ];
        } else if (scopedOfficeIds.length > 0) {
          const scopedOfficePlaceholders = scopedOfficeIds.map(() => "?").join(", ");
          const scopedAgents = await readAll(
            `
              SELECT
                u.id AS user_id,
                u.full_name AS full_name,
                u.role AS role,
                u.branch_id,
                b.name AS branch_name,
                b.code AS branch_code,
                COUNT(DISTINCT CASE WHEN l.status IN ('active', 'restructured', 'pending_approval', 'approved') THEN l.id END) AS managed_loans
              FROM users u
              LEFT JOIN branches b ON b.id = u.branch_id
              LEFT JOIN loans l ON l.officer_id = u.id
              WHERE u.is_active = 1
                ${agentRoleSql}
                AND (
                  (u.branch_id IN (${scopedOfficePlaceholders}))
                  OR EXISTS (
                    SELECT 1
                    FROM area_manager_branch_assignments am
                    WHERE am.user_id = u.id
                      AND am.branch_id IN (${scopedOfficePlaceholders})
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM loans lx
                    WHERE lx.officer_id = u.id
                      AND lx.branch_id IN (${scopedOfficePlaceholders})
                  )
                )
              GROUP BY u.id, u.full_name, u.role, u.branch_id, b.name, b.code
              ORDER BY u.full_name ASC, u.id ASC
            `,
            [...agentRoleParams, ...scopedOfficeIds, ...scopedOfficeIds, ...scopedOfficeIds],
          );
          agents = scopedAgents.map((row: Record<string, unknown>) => ({
            id: Number(row.user_id || 0),
            name: String(row.full_name || ""),
            role: String(row.role || ""),
            branchId: Number(row.branch_id || 0) || null,
            branchName: row.branch_name ? String(row.branch_name) : null,
            branchCode: row.branch_code ? String(row.branch_code) : null,
            managedLoans: Number(row.managed_loans || 0),
            scopeType: "user",
          }));
        }

        const scopeLevel = String(scope?.level || "hq").toLowerCase();
        const levels = hqReportRoles.has(userRole)
          ? ["hq"]
          : userRole === "area_manager"
            ? ["region"]
            : (scopeLevel === "hq"
              ? ["hq", "region", "branch"]
              : scopeLevel === "region"
                ? ["region", "branch"]
                : ["branch"]);

        const filteredReports = reportCatalog
          .filter((report) => report.allowedRoles.includes(userRole))
          .map(({ allowedRoles: _allowedRoles, ...report }) => report);
        const categoryCatalog = [
          { id: "operations", label: "Operations" },
          { id: "risk", label: "Risk" },
          { id: "collections", label: "Collections" },
          { id: "finance", label: "Finance" },
          { id: "executive", label: "Executive" },
        ];
        const availableCategories = new Set(filteredReports.map((report) => report.category));
        const categories = categoryCatalog.filter((category) => availableCategories.has(category.id));

        let officeOptions: ReportFilterOfficeOption[] = [];
        if (hqReportRoles.has(userRole)) {
          officeOptions = [
            {
              id: "overall",
              name: "Overall Portfolio",
              scopeType: "overall",
            },
          ];
        } else if (userRole === "area_manager") {
          const regions = new Map<number, ReportFilterOfficeOption>();
          offices.forEach((row: Record<string, unknown>) => {
            const regionId = Number(row.region_id || 0);
            if (!Number.isInteger(regionId) || regionId <= 0 || regions.has(regionId)) {
              return;
            }
            regions.set(regionId, {
              id: regionId,
              name: row.region_name ? String(row.region_name) : `Area ${regionId}`,
              regionId,
              regionName: row.region_name ? String(row.region_name) : null,
              scopeType: "region",
            });
          });
          officeOptions = [...regions.values()];
        } else {
          officeOptions = offices.map((row: Record<string, unknown>) => ({
            id: Number(row.branch_id || 0),
            name: String(row.branch_name || ""),
            code: String(row.branch_code || ""),
            regionId: Number(row.region_id || 0),
            regionName: row.region_name ? String(row.region_name) : null,
            scopeType: "branch",
          }));
        }

        res.status(200).json({
          scope: {
            level: scopeLevel,
            role: userRole,
            branchId: Number.isInteger(Number(scope?.branchId)) ? Number(scope.branchId) : null,
            regionId: Number.isInteger(Number(scope?.regionId)) ? Number(scope.regionId) : null,
          },
          levels,
          offices: officeOptions,
          agents,
          ui: {
            levelLocked: hqReportRoles.has(userRole) || userRole === "area_manager",
            officeLocked: hqReportRoles.has(userRole),
            agentLocked: hqReportRoles.has(userRole),
            officeLabel: userRole === "area_manager" ? "Area" : "Office",
            officePlaceholder: hqReportRoles.has(userRole)
              ? "Overall portfolio"
              : (userRole === "area_manager" ? "Select area..." : "Select office..."),
            agentLabel: "Agent",
            agentPlaceholder: hqReportRoles.has(userRole) ? "All agents" : "Select agent...",
          },
          categories,
          reports: filteredReports,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/reports/loans-due", authenticate, authorize(...reportRoles), async (req, res, next) => {
    req.url = req.originalUrl.replace("/api/reports/loans-due", "/api/reports/dues");
    next();
  });

  function applyScopeAndBranchFilter({
    whereBuilder,
    scope,
    branchColumnRef,
    branchFilter,
    res,
  }: {
    whereBuilder: ReturnType<typeof createSqlWhereBuilder>;
    scope: unknown;
    branchColumnRef: string;
    branchFilter: number | null;
    res: ReportResponse;
  }): boolean {
    const scopeCondition = hierarchyService.buildScopeCondition(scope, branchColumnRef);
    whereBuilder.addCondition(scopeCondition);

    if (!branchFilter) {
      return true;
    }

    if (!hierarchyService.isBranchInScope(scope, branchFilter)) {
      res.status(403).json({ message: "Forbidden: branchId is outside your scope." });
      return false;
    }

    whereBuilder.addEquals(branchColumnRef, branchFilter);
    return true;
  }

  const context = {
    run,
    get: readGet,
    all: readAll,
    executeTransaction,
    authenticate,
    authorize,
    parseId,
    writeAuditLog,
    hierarchyService,
    logger,
    metrics,
    reportRoles,
    resolveFormat,
    parseDateParam,
    applyScopeAndBranchFilter,
    resolveCachedReport: reportServices.resolveCachedReport,
    sendTabularExport,
    reportQueryService,
    fxRateService: reportServices.fxRateService,
    suspenseAccountingService: reportServices.suspenseAccountingService,
    coaVersioningService: reportServices.coaVersioningService,
    accountingBatchService: reportServices.accountingBatchService,
  };

  registerPortfolioReports(app, context);
  registerCollectionReports(app, context);
  registerFinancialReports(app, context);
  registerOfficerReports(app, context);
  registerGlReports(app, context);
}

export { registerReportRoutes };
