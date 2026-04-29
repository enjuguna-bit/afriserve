import { getCurrentTenantId } from "../../utils/tenantStore.js";
import { parsePaginationQuery, parseSortQuery, createPagedResponse } from "../../utils/http.js";
import type { ClientHierarchyServiceLike, RouteRegistrar } from "../../types/routeDeps.js";
import { createLoanReadRepository } from "../../repositories/loanReadRepository.js";
import { getLoanWorkflowSnapshot } from "../../services/loanWorkflowSnapshotService.js";
import { getRbacPolicy } from "../../config/rbacPolicies.js";

type LoanPortfolioRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  createLoanSchema: { parse: (value: unknown) => any };
  assignLoanOfficerSchema: { parse: (value: unknown) => any };
  updateLoanDetailsSchema: { parse: (value: unknown) => any };
  loanService: any;
  /** CQRS command handler for loan creation — preferred over calling loanService directly. */
  createLoanApplicationCommand: {
    handle: (command: {
      clientId: number;
      principal: number;
      termWeeks: number;
      productId?: number | null;
      interestRate?: number | null;
      registrationFee?: number | null;
      processingFee?: number | null;
      branchId?: number | null;
      officerId?: number | null;
      purpose?: string | null;
      createdByUserId: number;
      createdByRole?: string | null;
      createdByRoles?: string[];
      createdByPermissions?: string[];
      createdByBranchId?: number | null;
      ipAddress?: string | null;
    }) => Promise<{ loanId: number }>;
  };
  mapDomainErrorToHttpError: (error: unknown) => unknown;
  hierarchyService: ClientHierarchyServiceLike;
  loanStatusValues: string[];
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  run: (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number; [key: string]: unknown }>;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  invalidateReportCaches: () => Promise<void>;
  getLoanBreakdown: (loanId: number) => Promise<Record<string, any> | null | undefined>;
};

function registerLoanPortfolioRoutes(options: LoanPortfolioRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    parseId,
    createLoanSchema,
    assignLoanOfficerSchema,
    updateLoanDetailsSchema,
    loanService,
    createLoanApplicationCommand,
    mapDomainErrorToHttpError,
    hierarchyService,
    loanStatusValues,
    all,
    get,
    run,
    writeAuditLog,
    invalidateReportCaches,
    getLoanBreakdown,
  } = options;
  const loanReadRepository = createLoanReadRepository({ all, get });

  // All role lists derived from the central RBAC policy map — never hardcoded inline.
  const loanCreateRoles  = getRbacPolicy("loans.create").roles;
  const loanApproveRoles = getRbacPolicy("loan.approve.standard").roles;
  const loanAssignRoles  = ["admin", "operations_manager", "area_manager"] as const;

  app.post("/api/loans", authenticate, authorize(...loanCreateRoles), async (req, res, next) => {
    try {
      const payload = createLoanSchema.parse(req.body);
      const user = req.user;
      const { loanId } = await createLoanApplicationCommand.handle({
        clientId: Number(payload.clientId),
        principal: Number(payload.principal),
        termWeeks: Number(payload.termWeeks),
        productId: payload.productId ?? null,
        interestRate: typeof payload.interestRate === "number" ? payload.interestRate : null,
        registrationFee: typeof payload.registrationFee === "number" ? payload.registrationFee : null,
        processingFee: typeof payload.processingFee === "number" ? payload.processingFee : null,
        branchId: payload.branchId ?? null,
        officerId: payload.officerId ?? null,
        purpose: payload.purpose ?? null,
        createdByUserId: Number(user.sub),
        createdByRole: user.role ?? null,
        createdByRoles: Array.isArray(user.roles) ? user.roles : [],
        createdByPermissions: Array.isArray(user.permissions) ? user.permissions : [],
        createdByBranchId: user.branchId ?? null,
        ipAddress: req.ip ?? null,
      });
      const createdLoan = await get(
        "SELECT * FROM loans WHERE id = ? AND tenant_id = ?",
        [loanId, getCurrentTenantId()],
      );
      res.status(201).json(createdLoan);
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.patch("/api/loans/:id/details", authenticate, authorize("admin"), async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }

      const payload = updateLoanDetailsSchema.parse(req.body || {});
      const result = await loanService.updateLoanDetails({
        loanId,
        payload,
        user: req.user,
        ipAddress: req.ip,
      });
      const breakdown = await getLoanBreakdown(loanId);

      res.status(200).json({
        message: result.applied ? "Loan details updated" : "No loan detail changes were applied",
        loan: result.loan,
        changedFields: result.changedFields,
        breakdown,
      });
    } catch (error) {
      next(mapDomainErrorToHttpError(error));
    }
  });

  app.get("/api/loans", authenticate, async (req, res, next) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const includeBreakdown = ["1", "true", "yes"].includes(
        String(req.query.includeBreakdown || "").toLowerCase(),
      );

      const status = String(req.query.status || "").trim().toLowerCase();
      if (status) {
        if (!loanStatusValues.includes(status)) {
          res.status(400).json({
            message: "Invalid status filter. Use active, closed, written_off, restructured, pending_approval, approved, or rejected",
          });
          return;
        }
      }
      const statusGroup = String(req.query.statusGroup || "").trim().toLowerCase();
      if (statusGroup && statusGroup !== "active_portfolio") {
        res.status(400).json({ message: "Invalid statusGroup filter. Use active_portfolio." });
        return;
      }
      const workflowStage = String(req.query.workflowStage || "").trim().toLowerCase();
      if (workflowStage && workflowStage !== "arrears") {
        res.status(400).json({ message: "Invalid workflowStage filter. Use arrears." });
        return;
      }

      const rawLoanId = typeof req.query.loanId !== "undefined" ? req.query.loanId : req.query.id;
      const loanId = Number(rawLoanId);
      if (!(Number.isFinite(loanId) && Number.isInteger(loanId) && loanId > 0)
        && typeof rawLoanId !== "undefined"
        && String(rawLoanId).trim() !== "") {
        res.status(400).json({ message: "Invalid loanId filter" });
        return;
      }

      const clientId = Number(req.query.clientId);
      if (!(Number.isFinite(clientId) && Number.isInteger(clientId) && clientId > 0)
        && typeof req.query.clientId !== "undefined"
        && String(req.query.clientId).trim() !== "") {
        res.status(400).json({ message: "Invalid clientId filter" });
        return;
      }

      const branchId = parseId(req.query.branchId);
      if (!branchId && typeof req.query.branchId !== "undefined" && String(req.query.branchId).trim() !== "") {
        res.status(400).json({ message: "Invalid branchId filter" });
        return;
      }
      if (branchId && !hierarchyService.isBranchInScope(scope, branchId)) {
        res.status(403).json({ message: "Forbidden: branchId is outside your scope" });
        return;
      }

      const officerId = parseId(req.query.officerId);
      if (!officerId && typeof req.query.officerId !== "undefined" && String(req.query.officerId).trim() !== "") {
        res.status(400).json({ message: "Invalid officerId filter" });
        return;
      }
      const search = String(req.query.search || "").trim();

      const scopeCondition = hierarchyService.buildScopeCondition(scope, "l.branch_id");
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        requirePagination: false,
        strict: true,
      });
      const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
        sortFieldMap: {
          id: "id",
          disbursedAt: "disbursedAt",
          clientId: "clientId",
          principal: "principal",
          expectedTotal: "expectedTotal",
          balance: "balance",
          repaidTotal: "repaidTotal",
          status: "status",
          branchCode: "branchCode",
          officerName: "officerName",
        },
        defaultSortBy: "id",
        defaultSortOrder: "desc",
        sortByErrorMessage: "Invalid sortBy. Use one of: id, disbursedAt, clientId, principal, expectedTotal, balance, repaidTotal, status, branchCode, officerName",
      });

      const { rows: loans, total } = await loanReadRepository.listLoans({
        status: status || undefined,
        statusGroup: statusGroup === "active_portfolio" ? "active_portfolio" : undefined,
        workflowStage: workflowStage === "arrears" ? "arrears" : undefined,
        loanId: Number.isInteger(loanId) && loanId > 0 ? loanId : undefined,
        clientId: Number.isInteger(clientId) && clientId > 0 ? clientId : undefined,
        branchId: branchId || undefined,
        officerId: officerId || undefined,
        search: search || undefined,
        scopeCondition,
        limit,
        offset,
        sortBy: sortBy as "id" | "disbursedAt" | "clientId" | "principal" | "expectedTotal" | "balance" | "repaidTotal" | "status" | "branchCode" | "officerName",
        sortOrder,
      });

      if (!includeBreakdown) {
        res.status(200).json(
          createPagedResponse({
            data: loans,
            total,
            limit,
            offset,
            sortBy: requestedSortBy,
            sortOrder,
          }),
        );
        return;
      }

      const loansWithBreakdown = await Promise.all(
        loans.map(async (loan) => ({
          ...loan,
          breakdown: await getLoanBreakdown(Number(loan.id)),
        })),
      );

      res.status(200).json(
        createPagedResponse({
          data: loansWithBreakdown,
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

  app.get("/api/loans/my-pending", authenticate, authorize("admin", "loan_officer", "operations_manager"), async (req, res, next) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);

      const scopeCondition = hierarchyService.buildScopeCondition(scope, "l.branch_id");
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 20,
        maxLimit: 200,
        requirePagination: true,
        strict: true,
      });
      const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
        sortFieldMap: {
          id: "id",
          createdAt: "createdAt",
          principal: "principal",
          status: "status",
          client: "client",
        },
        defaultSortBy: "createdAt",
        defaultSortOrder: "desc",
        sortByErrorMessage: "Invalid sortBy. Use one of: id, createdAt, principal, status, client",
      });

      const { rows, total } = await loanReadRepository.listMyPendingLoans({
        createdByUserId: Number(req.user.sub),
        scopeCondition,
        limit,
        offset,
        sortBy: sortBy as "id" | "createdAt" | "principal" | "status" | "client",
        sortOrder,
      });

      res.status(200).json(
        createPagedResponse({
          data: rows,
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

  app.get("/api/loans/pending-approval", authenticate, authorize(...loanApproveRoles), async (req, res, next) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);

      const branchId = parseId(req.query.branchId);
      if (branchId) {
        if (!hierarchyService.isBranchInScope(scope, branchId)) {
          res.status(403).json({ message: "Forbidden: branchId is outside your scope" });
          return;
        }
      } else if (typeof req.query.branchId !== "undefined" && String(req.query.branchId).trim() !== "") {
        res.status(400).json({ message: "Invalid branchId filter" });
        return;
      }

      const officerId = parseId(req.query.officerId);
      if (!officerId && typeof req.query.officerId !== "undefined" && String(req.query.officerId).trim() !== "") {
        res.status(400).json({ message: "Invalid officerId filter" });
        return;
      }

      const dateFromRaw = String(req.query.dateFrom || "").trim();
      const dateToRaw = String(req.query.dateTo || "").trim();
      let dateFrom = null;
      let dateTo = null;
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

      const scopeCondition = hierarchyService.buildScopeCondition(scope, "l.branch_id");
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        requirePagination: true,
        strict: true,
      });
      const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(req.query, {
        sortFieldMap: {
          loanId: "loanId",
          submittedAt: "submittedAt",
          clientName: "clientName",
          principal: "principal",
          expectedTotal: "expectedTotal",
          branchCode: "branchCode",
          officerName: "officerName",
          createdByName: "createdByName",
        },
        defaultSortBy: "submittedAt",
        defaultSortOrder: "desc",
        sortByErrorMessage: "Invalid sortBy. Use one of: loanId, submittedAt, clientName, principal, expectedTotal, branchCode, officerName, createdByName",
      });

      const { rows, total } = await loanReadRepository.listPendingApprovalLoans({
        branchId: branchId || undefined,
        officerId: officerId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        scopeCondition,
        limit,
        offset,
        sortBy: sortBy as "loanId" | "submittedAt" | "clientName" | "principal" | "expectedTotal" | "branchCode" | "officerName" | "createdByName",
        sortOrder,
      });

      const workflowRows = await Promise.all(
        rows.map(async (row) => {
          const loanId = Number(row.loan_id || 0);
          if (!Number.isInteger(loanId) || loanId <= 0) {
            return {
              ...row,
              approval_ready: 0,
              workflow_stage: "loan_application",
              approval_blockers: [],
            };
          }

          const workflow = await getLoanWorkflowSnapshot({ get, loanId });
          if (!workflow) {
            return {
              ...row,
              approval_ready: 0,
              workflow_stage: "loan_application",
              approval_blockers: [],
            };
          }

          return {
            ...row,
            approval_ready: workflow.can_approve ? 1 : 0,
            workflow_stage: workflow.lifecycle_stage,
            approval_blockers: workflow.approval_blockers,
          };
        }),
      );

      res.status(200).json(
        createPagedResponse({
          data: workflowRows,
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

  app.patch("/api/loans/:id/assign-officer", authenticate, authorize(...loanAssignRoles), async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }

      const payload = assignLoanOfficerSchema.parse(req.body || {});
      const scope = await hierarchyService.resolveHierarchyScope(req.user);

      const loan = await get(
        `
          SELECT id, branch_id, officer_id
          FROM loans
          WHERE id = ? AND tenant_id = ?
        `,
        [loanId, getCurrentTenantId()],
      );
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      const previousOfficerId = Number.isInteger(Number(loan.officer_id))
        ? Number(loan.officer_id)
        : null;
      if (previousOfficerId === payload.officerId) {
        const unchangedLoan = await get("SELECT * FROM loans WHERE id = ? AND tenant_id = ?", [loanId, getCurrentTenantId()]);
        res.status(200).json({ message: "Loan is already assigned to this officer", loan: unchangedLoan });
        return;
      }

      const nextOfficer = await get(
        `
          SELECT id, role, is_active, branch_id
          FROM users
          WHERE id = ? AND tenant_id = ?
        `,
        [payload.officerId, getCurrentTenantId()],
      );
      if (!nextOfficer) {
        res.status(404).json({ message: "Loan officer not found" });
        return;
      }
      if (String(nextOfficer.role || "").toLowerCase() !== "loan_officer") {
        res.status(400).json({ message: "Selected user is not a loan officer" });
        return;
      }
      if (Number(nextOfficer.is_active || 0) !== 1) {
        res.status(400).json({ message: "Selected loan officer is inactive" });
        return;
      }
      if (!Number.isInteger(Number(nextOfficer.branch_id)) || Number(nextOfficer.branch_id) <= 0) {
        res.status(400).json({ message: "Selected loan officer has no branch assignment" });
        return;
      }

      const loanBranchId = Number.isInteger(Number(loan.branch_id)) ? Number(loan.branch_id) : null;
      if (loanBranchId && Number(nextOfficer.branch_id) !== loanBranchId) {
        res.status(400).json({ message: "Selected loan officer belongs to a different branch" });
        return;
      }

      await run(
        `
          UPDATE loans
          SET officer_id = ?
          WHERE id = ? AND tenant_id = ?
        `,
        [payload.officerId, loanId, getCurrentTenantId()],
      );

      await writeAuditLog({
        userId: req.user.sub,
        action: "loan.officer.reassigned",
        targetType: "loan",
        targetId: loanId,
        details: JSON.stringify({
          previousOfficerId,
          nextOfficerId: payload.officerId,
          loanBranchId,
        }),
        ipAddress: req.ip,
      });
      await invalidateReportCaches();

      const updatedLoan = await get(
        `
          SELECT
            l.*,
            u.full_name AS officer_name
          FROM loans l
          LEFT JOIN users u ON u.id = l.officer_id
          WHERE l.id = ? AND l.tenant_id = ?
        `,
        [loanId, getCurrentTenantId()],
      );

      res.status(200).json({ message: "Loan officer assignment updated", loan: updatedLoan });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/loans/:id", authenticate, async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }
      const scope = await hierarchyService.resolveHierarchyScope(req.user);

      const loan = await get(
        `
          SELECT l.*, c.full_name AS client_name, c.phone AS client_phone, c.branch_id AS client_branch_id
          FROM loans l
          INNER JOIN clients c ON c.id = l.client_id
          WHERE l.id = ? AND l.tenant_id = ?
        `,
        [loanId, getCurrentTenantId()],
      );

      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id || loan.client_branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      const repayments = await all(
        `
          SELECT id, amount, paid_at, note
          FROM repayments
          WHERE loan_id = ? AND tenant_id = ?
          ORDER BY id DESC
        `,
        [loanId, getCurrentTenantId()],
      );

      const breakdown = await getLoanBreakdown(loanId);
      const workflow = await getLoanWorkflowSnapshot({ get, loanId });

      res.status(200).json({ ...loan, breakdown, repayments, workflow });
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerLoanPortfolioRoutes,
};


