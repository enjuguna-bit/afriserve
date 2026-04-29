import type { RouteRegistrar } from "../../types/routeDeps.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";
import { applyRbacPolicy } from "../../middleware/rbacPolicy.js";
import type { ClientHierarchyServiceLike } from "../../types/routeDeps.js";

type LoanLifecycleAdminRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  loanLifecycleActionSchema: { parse: (value: unknown) => any };
  rejectLoanSchema: { parse: (value: unknown) => any };
  loanLifecycleService: any;
  hierarchyService: ClientHierarchyServiceLike;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  run: (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number; [key: string]: unknown }>;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  mapDomainErrorToHttpError: (error: unknown) => unknown;
  invalidateReportCaches: () => Promise<void>;
};

function registerLoanLifecycleAdminRoutes(options: LoanLifecycleAdminRouteOptions) {
  const {
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
  } = options;
  app.post("/api/loans/:id/reject", authenticate, ...applyRbacPolicy("loan.reject.standard", authorize), async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }
      const payload = rejectLoanSchema.parse(req.body);
      const updatedLoan = await loanLifecycleService.rejectLoan({
        loanId,
        payload,
        user: req.user,
        ipAddress: req.ip,
      });
      res.status(200).json(updatedLoan);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post("/api/loans/:id/archive", authenticate, authorize("admin", "finance", "operations_manager"), async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }
      const payload = loanLifecycleActionSchema.parse(req.body || {});
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const loan = await get("SELECT id, branch_id, status, archived_at FROM loans WHERE id = ?", [loanId]);
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }
      if (loan.archived_at) {
        res.status(200).json({ message: "Loan is already archived", loan });
        return;
      }
      if (!["closed", "written_off", "rejected"].includes(String(loan.status || "").toLowerCase())) {
        res.status(409).json({ message: "Only closed, written-off, or rejected loans can be archived" });
        return;
      }

      await run("UPDATE loans SET archived_at = datetime('now') WHERE id = ?", [loanId]);
      await writeAuditLog({
        userId: req.user.sub,
        action: "loan.archived",
        targetType: "loan",
        targetId: loanId,
        details: JSON.stringify({ previousStatus: loan.status, note: payload.note || null }),
        ipAddress: req.ip,
      });
      await invalidateReportCaches();

      const updatedLoan = await get("SELECT * FROM loans WHERE id = ? AND tenant_id = ?", [loanId, getCurrentTenantId()]);
      res.status(200).json({ message: "Loan archived", loan: updatedLoan });
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerLoanLifecycleAdminRoutes,
};

