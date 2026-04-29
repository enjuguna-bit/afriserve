import type { RouteRegistrar } from "../../types/routeDeps.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";
import { requirePermission } from "../../middleware/permissions.js";
import { disbursementLimiter } from "../../middleware/userRateLimit.js";
import { applyRbacPolicy } from "../../middleware/rbacPolicy.js";
import { createHttpError, requireResourceInScope } from "../../middleware/scope.js";
import { validate } from "../../middleware/validate.js";
import { formatKenyanPhoneDisplay } from "../../utils/helpers.js";

interface HierarchyScopeLike {
  branchId?: number | null;
  regionId?: number | null;
  level?: string;
  role?: string;
}

interface HierarchyServiceLike {
  resolveHierarchyScope: (user: unknown) => Promise<HierarchyScopeLike>;
  isBranchInScope: (scope: HierarchyScopeLike, branchId: number | null | undefined) => boolean;
}

interface RepaymentServiceLike {
  recordRepayment: (options: {
    loanId: number;
    payload: Record<string, any>;
    user?: Record<string, any>;
    ipAddress: string | null | undefined;
  }) => Promise<Record<string, any>>;
}

interface LoanLifecycleServiceLike {
  writeOffLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  restructureLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  topUpLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  refinanceLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  extendLoanTerm: (options: Record<string, any>) => Promise<Record<string, any>>;
  approveLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  disburseLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  getDisbursementTranches: (options: Record<string, any>) => Promise<Record<string, any>>;
  getLoanContractVersions: (options: Record<string, any>) => Promise<Record<string, any>>;
}

interface MobileMoneyServiceLike {
  disburseLoanToWallet: (options: Record<string, any>) => Promise<Record<string, any>>;
}

type LoanExecutionRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  hierarchyService: HierarchyServiceLike;
  createRepaymentSchema: { parse: (value: unknown) => any };
  loanLifecycleActionSchema: { parse: (value: unknown) => any };
  restructureLoanSchema: { parse: (value: unknown) => any };
  topUpLoanSchema: { parse: (value: unknown) => any };
  refinanceLoanSchema: { parse: (value: unknown) => any };
  extendLoanTermSchema: { parse: (value: unknown) => any };
  approveLoanSchema: { parse: (value: unknown) => any };
  disburseLoanSchema: { parse: (value: unknown) => any };
  repaymentService: RepaymentServiceLike;
  loanLifecycleService: LoanLifecycleServiceLike;
  mobileMoneyService: MobileMoneyServiceLike | null;
  mapDomainErrorToHttpError: (error: unknown) => unknown;
};

function registerLoanExecutionRoutes(options: LoanExecutionRouteOptions) {
  const {
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
  } = options;

  const disburseLoanPermission = requirePermission("loan.disburse");

  function formatRepaymentResponse(result: Record<string, any>) {
    if (!result?.repayment) {
      return result;
    }
    return {
      ...result,
      repayment: {
        ...result.repayment,
        payer_phone: formatKenyanPhoneDisplay(result.repayment.payer_phone),
      },
    };
  }
  const requireLoanInScope = requireResourceInScope({
    resourceName: "loan",
    hierarchyService,
    resolveResource: async (req) => {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        throw createHttpError(400, "Invalid loan id");
      }
      const loan = await get("SELECT id, branch_id FROM loans WHERE id = ? AND tenant_id = ?", [loanId, getCurrentTenantId()]);
      if (!loan) {
        return null;
      }
      return {
        loanId,
        branchId: loan.branch_id,
      };
    },
  });

  app.post("/api/loans/:id/repayments", authenticate, authorize("admin", "cashier", "finance", "loan_officer"), requireLoanInScope, validate(createRepaymentSchema), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const payload = req.body;
      const result = await repaymentService.recordRepayment({
        loanId,
        payload,
        user: req.user,
        ipAddress: req.ip,
      });

      res.status(201).json(formatRepaymentResponse(result));
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post("/api/loans/:id/repay", authenticate, authorize("admin", "cashier", "finance", "loan_officer"), requireLoanInScope, validate(createRepaymentSchema), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const payload = req.body;
      const result = await repaymentService.recordRepayment({
        loanId,
        payload,
        user: req.user,
        ipAddress: req.ip,
      });

      res.status(200).json(formatRepaymentResponse(result));
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post("/api/loans/:id/submit", authenticate, authorize("admin", "loan_officer", "operations_manager", "area_manager"), requireLoanInScope, validate(loanLifecycleActionSchema), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const loan = await get("SELECT * FROM loans WHERE id = ? AND tenant_id = ?", [loanId, getCurrentTenantId()]);
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }

      const normalizedStatus = String(loan.status || "").trim().toLowerCase();
      if (normalizedStatus === "pending_approval") {
        res.status(200).json({
          message: "Loan submitted for approval",
          loan,
        });
        return;
      }

      if (["approved", "active", "rejected", "closed", "written_off", "restructured"].includes(normalizedStatus)) {
        res.status(409).json({
          message: `Loan cannot be submitted from status '${normalizedStatus}'`,
          loan,
        });
        return;
      }

      res.status(200).json({
        message: "Loan submission state resolved",
        loan,
      });
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post("/api/loans/:id/write-off", authenticate, ...applyRbacPolicy("loan.lifecycle.write_off", authorize), requireLoanInScope, validate(loanLifecycleActionSchema), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const payload = req.body;
      const result = await loanLifecycleService.writeOffLoan({
        loanId,
        payload,
        user: req.user,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post("/api/loans/:id/restructure", authenticate, ...applyRbacPolicy("loan.lifecycle.restructure", authorize), requireLoanInScope, validate(restructureLoanSchema), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const payload = req.body;
      const result = await loanLifecycleService.restructureLoan({
        loanId,
        payload,
        user: req.user,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post("/api/loans/:id/top-up", authenticate, ...applyRbacPolicy("loan.lifecycle.top_up", authorize), requireLoanInScope, validate(topUpLoanSchema), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const payload = req.body;
      const result = await loanLifecycleService.topUpLoan({
        loanId,
        payload,
        user: req.user,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post("/api/loans/:id/refinance", authenticate, ...applyRbacPolicy("loan.lifecycle.refinance", authorize), requireLoanInScope, validate(refinanceLoanSchema), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const payload = req.body;
      const result = await loanLifecycleService.refinanceLoan({
        loanId,
        payload,
        user: req.user,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post("/api/loans/:id/extend-term", authenticate, ...applyRbacPolicy("loan.lifecycle.extend_term", authorize), requireLoanInScope, validate(extendLoanTermSchema), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const payload = req.body;
      const result = await loanLifecycleService.extendLoanTerm({
        loanId,
        payload,
        user: req.user,
        ipAddress: req.ip,
      });
      res.status(200).json(result);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.post("/api/loans/:id/approve", authenticate, ...applyRbacPolicy("loan.approve.standard", authorize), requireLoanInScope, validate(approveLoanSchema), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const payload = req.body;
      const updatedLoan = await loanLifecycleService.approveLoan({
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

  app.post(
    "/api/loans/:id/disburse",
    authenticate,
    disbursementLimiter,
    requireLoanInScope,
    authorize("admin", "cashier", "finance", "operations_manager"),
    disburseLoanPermission,
    validate(disburseLoanSchema),
    async (req, res, next) => {
      try {
        const loanId = Number((req as any).scopeResource?.loanId || 0);
        const payload = req.body;
        const useMobileMoney = payload?.mobileMoney?.enabled === true;
        const result = useMobileMoney && mobileMoneyService
          ? await mobileMoneyService.disburseLoanToWallet({
            loanId,
            payload,
            user: req.user,
            ipAddress: req.ip,
          })
          : await loanLifecycleService.disburseLoan({
            loanId,
            payload,
            user: req.user,
            ipAddress: req.ip,
          });
        res.status(200).json(result);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );

  app.get("/api/loans/:id/disbursements", authenticate, requireLoanInScope, authorize("admin", "cashier", "finance", "operations_manager", "loan_officer", "area_manager"), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const rows = await loanLifecycleService.getDisbursementTranches({
        loanId,
        user: req.user,
      });
      res.status(200).json(rows);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.get("/api/loans/:id/contracts", authenticate, requireLoanInScope, authorize("admin", "finance", "operations_manager", "loan_officer", "area_manager"), async (req, res, next) => {
    try {
      const loanId = Number((req as any).scopeResource?.loanId || 0);
      const rows = await loanLifecycleService.getLoanContractVersions({
        loanId,
        user: req.user,
      });
      res.status(200).json(rows);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });
}

export {
  registerLoanExecutionRoutes,
};

