import { getCurrentTenantId } from "../../utils/tenantStore.js";
import { registerLoanProductRoutes } from "./loanProductRouteService.js";
import { registerMobileMoneyRoutes } from "./mobileMoneyRouteService.js";
import { registerLoanCollateralRoutes } from "./loanCollateralRouteService.js";
import { registerLoanLifecycleAdminRoutes } from "./loanLifecycleAdminRouteService.js";
import { registerLoanPortfolioRoutes } from "./loanPortfolioRouteService.js";
import { registerLoanStatementRoutes } from "./loanStatementRouteService.js";
import { registerLoanExecutionRoutes } from "./loanExecutionRouteService.js";
import { registerLoanApprovalRequestRoutes } from "./loanApprovalRequestRouteService.js";
import { resolveJsonResponseFormat } from "../../utils/responseFormat.js";
import { getDomainErrorHttpStatus } from "../../domain/errors.js";
import type { AuthSessionUser } from "../../types/auth.js";
import type { LoanRouteDeps, RouteRegistrar } from "../../types/routeDeps.js";
import { getRbacPolicy } from "../../config/rbacPolicies.js";

type RiskRouteUser = AuthSessionUser & Record<string, unknown>;

/**
 * @param {RouteRegistrar} app
 * @param {LoanRouteDeps} deps
 */
function registerLoanServiceRoutes(app: RouteRegistrar, deps: LoanRouteDeps) {
  const {
    run,
    get,
    all,
    authenticate,
    authorize,
    writeAuditLog,
    parseId,
    createHttpError,
    createLoanSchema,
    createRepaymentSchema,
    createGuarantorSchema,
    createCollateralAssetSchema,
    updateCollateralAssetSchema,
    linkLoanGuarantorSchema,
    linkLoanCollateralSchema,
    loanLifecycleActionSchema,
    restructureLoanSchema,
    topUpLoanSchema,
    refinanceLoanSchema,
    extendLoanTermSchema,
    assignLoanOfficerSchema,
    updateLoanDetailsSchema,
    createLoanProductSchema,
    updateLoanProductSchema,
    approveLoanSchema,
    disburseLoanSchema,
    rejectLoanSchema,
    hierarchyService,
    reportCache = null,
    serviceRegistry = null,
  } = deps;

  const loanStatusValues = ["active", "closed", "written_off", "restructured", "pending_approval", "approved", "rejected"];
  const installmentStatusValues = ["overdue", "pending", "paid"];
  const collectibleLoanStatuses = ["active", "restructured", "overdue"];
  const collateralManageRoles = ["admin", "finance", "operations_manager", "loan_officer"];
  const collateralViewRoles = ["admin", "finance", "operations_manager", "area_manager", "loan_officer"];
  const glRedirectRoles = getRbacPolicy("reports.gl.legacy_redirect").roles;

  /**
   * @param {unknown} status
   * @returns {boolean}
   */
  function isCollectibleLoanStatus(status: unknown) {
    return collectibleLoanStatuses.includes(String(status || "").toLowerCase());
  }

  function mapDomainErrorToHttpError(error: unknown): unknown {
    const status = getDomainErrorHttpStatus(error);
    if (!status) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Request failed";
    return createHttpError(status, message);
  }

  /**
   * @returns {Promise<void>}
   */
  async function invalidateReportCaches() {
    if (!reportCache || !reportCache.enabled) {
      return;
    }
    try {
      await reportCache.invalidatePrefix("reports:");
    } catch (_error) {
      // Best-effort cache invalidation should not fail request writes.
    }
  }

  /**
   * @param {number} loanId
   * @returns {Promise<void>}
   */
  async function refreshOverdueInstallments(loanId: number) {
    await run(
      `
        UPDATE loan_installments
        SET status = 'overdue'
        WHERE loan_id = ?
          AND status = 'pending'
          AND date(due_date) < date('now')
          AND EXISTS (
            SELECT 1
            FROM loans l
            WHERE l.id = ?
              AND l.status IN ('active', 'restructured', 'overdue')
          )
      `,
      [loanId, loanId],
    );
  }

  /**
   * @param {number} loanId
   * @returns {Promise<Record<string, any> | null | undefined>}
   */
  async function getLoanBreakdown(loanId: number) {
    return get(
      `
        SELECT
          l.id AS loan_id,
          l.principal,
          l.interest_rate,
          ROUND(COALESCE(lip.total_contractual_interest, l.expected_total - l.principal), 2) AS interest_amount,
          COALESCE(l.registration_fee, 0) AS registration_fee,
          COALESCE(l.processing_fee, 0) AS processing_fee,
          l.expected_total,
          l.repaid_total,
          l.balance
        FROM loans l
        LEFT JOIN loan_interest_profiles lip ON lip.loan_id = l.id
        WHERE l.id = ?
      `,
      [loanId],
    );
  }

  /**
   * @param {number} loanId
   * @param {RiskRouteUser} user
   * @returns {Promise<{ scope: any; loan: Record<string, any> }>}
   */
  async function resolveLoanInScope(loanId: number, user: RiskRouteUser) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const loan = await get("SELECT * FROM loans WHERE id = ? AND tenant_id = ?", [loanId, getCurrentTenantId()]);
    if (!loan) {
      throw createHttpError(404, "Loan not found");
    }
    if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
      throw createHttpError(403, "Forbidden: loan is outside your scope");
    }
    return { scope, loan };
  }

  /**
   * @param {RiskRouteUser} user
   * @param {number | null | undefined} requestedBranchId
   * @returns {Promise<number>}
   */
  async function resolveRiskRecordBranchId(user: RiskRouteUser, requestedBranchId: number | null | undefined) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const parsedBranchId = requestedBranchId ? Number(requestedBranchId) : null;

    if (scope.level === "branch") {
      if (parsedBranchId && parsedBranchId !== Number(scope.branchId)) {
        throw createHttpError(403, "Forbidden: selected branch is outside your scope");
      }
      return Number(scope.branchId);
    }

    if (parsedBranchId) {
      if (!hierarchyService.isBranchInScope(scope, parsedBranchId)) {
        throw createHttpError(403, "Forbidden: selected branch is outside your scope");
      }
      return parsedBranchId;
    }

    if (user.branchId && hierarchyService.isBranchInScope(scope, Number(user.branchId))) {
      return Number(user.branchId);
    }

    const branches = await hierarchyService.getBranches({ includeInactive: false });
    const firstInScopeBranch = branches.find((branch) => hierarchyService.isBranchInScope(scope, Number(branch.id)));
    if (!firstInScopeBranch) {
      throw createHttpError(400, "No active branch available in your scope");
    }
    return Number(firstInScopeBranch.id);
  }

  const loanServices = serviceRegistry?.loan;
  if (!loanServices) {
    throw new Error("Loan routes require a shared serviceRegistry to avoid duplicate service initialization.");
  }

  const {
    loanUnderwritingService,
    loanService,
    repaymentService,
    loanLifecycleService,
    mobileMoneyService,
  } = loanServices;

  app.get("/api/gl/accounts", authenticate, authorize(...glRedirectRoles), async (_req, res) => {
    res.status(410).json({
      message: "Deprecated endpoint. Use /api/reports/gl/accounts instead.",
      replacementEndpoint: "/api/reports/gl/accounts",
    });
  });

  app.get("/api/gl/trial-balance", authenticate, authorize(...glRedirectRoles), async (req, res) => {
    const searchParams = new URLSearchParams();
    if (typeof req.query.dateFrom !== "undefined" && String(req.query.dateFrom).trim()) {
      searchParams.set("dateFrom", String(req.query.dateFrom).trim());
    }
    if (typeof req.query.dateTo !== "undefined" && String(req.query.dateTo).trim()) {
      searchParams.set("dateTo", String(req.query.dateTo).trim());
    }
    if (typeof req.query.branchId !== "undefined" && String(req.query.branchId).trim()) {
      searchParams.set("branchId", String(req.query.branchId).trim());
    }
    if (typeof req.query.format !== "undefined" && String(req.query.format).trim()) {
      searchParams.set("format", String(req.query.format).trim());
    }

    const replacementEndpoint = searchParams.toString()
      ? `/api/reports/gl/trial-balance?${searchParams.toString()}`
      : "/api/reports/gl/trial-balance";

    res.status(410).json({
      message: "Deprecated endpoint. Use /api/reports/gl/trial-balance instead.",
      replacementEndpoint,
    });
  });

  registerLoanProductRoutes({
    app,
    authenticate,
    authorize,
    all,
    get,
    run,
    parseId,
    createLoanProductSchema,
    updateLoanProductSchema,
    writeAuditLog,
  });

  registerLoanCollateralRoutes({
    app,
    authenticate,
    authorize,
    parseId,
    createGuarantorSchema,
    createCollateralAssetSchema,
    updateCollateralAssetSchema,
    linkLoanGuarantorSchema,
    linkLoanCollateralSchema,
    resolveRiskRecordBranchId,
    resolveLoanInScope,
    hierarchyService,
    get,
    all,
    run,
    writeAuditLog,
    collateralManageRoles,
    collateralViewRoles,
    loanUnderwritingService,
  });

  registerLoanPortfolioRoutes({
    app,
    authenticate,
    authorize,
    parseId,
    createLoanSchema,
    assignLoanOfficerSchema,
    updateLoanDetailsSchema,
    loanService,
    createLoanApplicationCommand: loanServices.commands.createLoanApplication,
    mapDomainErrorToHttpError,
    hierarchyService,
    loanStatusValues,
    all,
    get,
    run,
    writeAuditLog,
    invalidateReportCaches,
    getLoanBreakdown,
  });

  registerLoanStatementRoutes({
    app,
    authenticate,
    parseId,
    hierarchyService,
    resolveJsonResponseFormat,
    isCollectibleLoanStatus,
    refreshOverdueInstallments,
    getLoanBreakdown,
    installmentStatusValues,
    get,
    all,
    loanUnderwritingService,
  });

  registerLoanExecutionRoutes({
    app,
    authenticate,
    authorize,
    parseId,
    get,
    hierarchyService,
    createRepaymentSchema,
    loanLifecycleActionSchema,
    restructureLoanSchema,
    topUpLoanSchema,
    refinanceLoanSchema,
    extendLoanTermSchema,
    approveLoanSchema,
    disburseLoanSchema,
    repaymentService,
    loanLifecycleService,
    mobileMoneyService,
    mapDomainErrorToHttpError,
  });

  registerLoanApprovalRequestRoutes({
    app,
    authenticate,
    authorize,
    parseId,
    hierarchyService,
    all,
    loanLifecycleService,
    mapDomainErrorToHttpError,
  });

  registerMobileMoneyRoutes({
    app,
    authenticate,
    authorize,
    parseId,
    mobileMoneyService,
    mapDomainErrorToHttpError,
  });

  registerLoanLifecycleAdminRoutes({
    app,
    authenticate,
    authorize,
    parseId,
    loanLifecycleActionSchema,
    rejectLoanSchema,
    loanLifecycleService,
    hierarchyService,
    get,
    run,
    writeAuditLog,
    mapDomainErrorToHttpError,
    invalidateReportCaches,
  });

}

export {
  registerLoanServiceRoutes,
};

