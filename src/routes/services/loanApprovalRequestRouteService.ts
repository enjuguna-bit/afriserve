import type { RouteRegistrar } from "../../types/routeDeps.js";
import type { ClientHierarchyServiceLike } from "../../types/routeDeps.js";
import { createLoanApprovalRequestReadRepository } from "../../repositories/loanApprovalRequestReadRepository.js";
import { applyRbacPolicy } from "../../middleware/rbacPolicy.js";

type LoanApprovalRequestRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  hierarchyService: ClientHierarchyServiceLike;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  loanLifecycleService: any;
  mapDomainErrorToHttpError: (error: unknown) => unknown;
};

function registerLoanApprovalRequestRoutes(options: LoanApprovalRequestRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    parseId,
    hierarchyService,
    all,
    loanLifecycleService,
    mapDomainErrorToHttpError,
  } = options;
  const loanApprovalRequestReadRepository = createLoanApprovalRequestReadRepository({ all });

  app.get(
    "/api/approval-requests",
    authenticate,
    authorize("admin", "finance", "operations_manager", "area_manager"),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const requestedStatus = String(req.query.status || "pending").trim().toLowerCase();
        const requestedType = String(req.query.requestType || "").trim().toLowerCase();
        const requestedLoanId = parseId(req.query.loanId);
        const allowedStatuses = ["pending", "approved", "rejected", "cancelled", "expired"];
        const allowedTypes = ["loan_restructure", "loan_write_off", "loan_top_up", "loan_refinance", "loan_term_extension"];

        if (!allowedStatuses.includes(requestedStatus)) {
          res.status(400).json({ message: "Invalid status query. Allowed: pending, approved, rejected, cancelled, expired" });
          return;
        }
        if (requestedType && !allowedTypes.includes(requestedType)) {
          res.status(400).json({ message: "Invalid requestType query. Allowed: loan_restructure, loan_write_off, loan_top_up, loan_refinance, loan_term_extension" });
          return;
        }

        const rows = await loanApprovalRequestReadRepository.listApprovalRequests({
          status: requestedStatus as "pending" | "approved" | "rejected" | "cancelled" | "expired",
          requestType: (requestedType || undefined) as
            | "loan_restructure"
            | "loan_write_off"
            | "loan_top_up"
            | "loan_refinance"
            | "loan_term_extension"
            | undefined,
          loanId: requestedLoanId || undefined,
        });

        const inScopeRows = rows.filter((row) => hierarchyService.isBranchInScope(scope, row.branch_id));
        const responseRows = inScopeRows.map((row) => ({
          ...row,
          request_payload: (() => {
            const raw = String(row.request_payload || "").trim();
            if (!raw) {
              return null;
            }
            try {
              return JSON.parse(raw);
            } catch (_error) {
              return raw;
            }
          })(),
        }));

        res.status(200).json({
          status: requestedStatus,
          total: responseRows.length,
          rows: responseRows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/approval-requests/:id/review",
    authenticate,
    ...applyRbacPolicy("loan.approval_request.review", authorize),
    async (req, res, next) => {
      try {
        const requestId = parseId(req.params.id);
        if (!requestId) {
          res.status(400).json({ message: "Invalid approval request id" });
          return;
        }

        const decision = String(req.body?.decision || "").trim().toLowerCase();
        const reviewNote = typeof req.body?.note === "string"
          ? req.body.note.trim()
          : undefined;

        if (decision !== "approve" && decision !== "reject") {
          res.status(400).json({ message: "decision must be either 'approve' or 'reject'" });
          return;
        }

        const result = await loanLifecycleService.reviewHighRiskApprovalRequest({
          requestId,
          payload: {
            decision,
            note: reviewNote,
          },
          user: req.user,
          ipAddress: req.ip,
        });

        res.status(200).json(result);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );

  app.get(
    "/api/approval-requests/:id",
    authenticate,
    authorize("admin", "finance", "operations_manager", "area_manager"),
    async (req, res, next) => {
      try {
        const requestId = parseId(req.params.id);
        if (!requestId) {
          res.status(400).json({ message: "Invalid approval request id" });
          return;
        }

        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const rows = await all(
          `
            SELECT
              ar.id,
              ar.request_type,
              ar.target_type,
              ar.target_id,
              ar.loan_id,
              l.status AS loan_status,
              l.principal AS loan_principal,
              ar.branch_id,
              b.name AS branch_name,
              b.code AS branch_code,
              c.id AS client_id,
              c.full_name AS client_name,
              ar.requested_by_user_id,
              maker.full_name AS requested_by_name,
              ar.checker_user_id,
              checker.full_name AS checker_name,
              ar.status,
              CASE
                WHEN ar.executed_at IS NOT NULL THEN 'executed'
                WHEN ar.status = 'approved' THEN 'awaiting_execution'
                WHEN ar.status = 'rejected' THEN 'rejected'
                WHEN ar.status = 'cancelled' THEN 'cancelled'
                WHEN ar.status = 'expired' THEN 'expired'
                ELSE 'pending'
              END AS execution_state,
              ar.request_payload,
              ar.request_note,
              ar.review_note,
              ar.requested_at,
              ar.reviewed_at,
              ar.approved_at,
              ar.rejected_at,
              ar.executed_at,
              ar.expires_at,
              ar.created_at,
              ar.updated_at
            FROM approval_requests ar
            INNER JOIN loans l ON l.id = ar.loan_id
            LEFT JOIN clients c ON c.id = l.client_id
            LEFT JOIN branches b ON b.id = ar.branch_id
            INNER JOIN users maker ON maker.id = ar.requested_by_user_id
            LEFT JOIN users checker ON checker.id = ar.checker_user_id
            WHERE ar.id = ?
            LIMIT 1
          `,
          [requestId],
        );
        const row = rows[0];
        if (!row || !hierarchyService.isBranchInScope(scope, row.branch_id)) {
          res.status(404).json({ message: "Approval request not found" });
          return;
        }

        res.status(200).json({
          ...row,
          request_payload: (() => {
            const raw = String(row.request_payload || "").trim();
            if (!raw) {
              return null;
            }
            try {
              return JSON.parse(raw);
            } catch (_error) {
              return raw;
            }
          })(),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/approval-requests/:id/approve",
    authenticate,
    ...applyRbacPolicy("loan.approval_request.review", authorize),
    async (req, res, next) => {
      try {
        const requestId = parseId(req.params.id);
        if (!requestId) {
          res.status(400).json({ message: "Invalid approval request id" });
          return;
        }

        const reviewNote = typeof req.body?.note === "string" ? req.body.note.trim() : undefined;
        const result = await loanLifecycleService.reviewHighRiskApprovalRequest({
          requestId,
          payload: {
            decision: "approve",
            note: reviewNote,
          },
          user: req.user,
          ipAddress: req.ip,
        });

        res.status(200).json(result);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );

  app.post(
    "/api/approval-requests/:id/reject",
    authenticate,
    ...applyRbacPolicy("loan.approval_request.review", authorize),
    async (req, res, next) => {
      try {
        const requestId = parseId(req.params.id);
        if (!requestId) {
          res.status(400).json({ message: "Invalid approval request id" });
          return;
        }

        const reviewNote = typeof req.body?.note === "string" ? req.body.note.trim() : undefined;
        const result = await loanLifecycleService.reviewHighRiskApprovalRequest({
          requestId,
          payload: {
            decision: "reject",
            note: reviewNote,
          },
          user: req.user,
          ipAddress: req.ip,
        });

        res.status(200).json(result);
      } catch (error) {
        next(mapDomainErrorToHttpError(error));
      }
    },
  );
}

export {
  registerLoanApprovalRequestRoutes,
};

