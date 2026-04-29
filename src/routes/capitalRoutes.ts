import type { ClientHierarchyServiceLike, RouteRegistrar } from "../types/routeDeps.js";
import type { CapitalTransactionType, CapitalTransactionStatus } from "../services/capitalTransactionService.js";
import { createCapitalTransactionService } from "../services/capitalTransactionService.js";

interface CapitalRouteContext {
  authenticate:       any;
  authorize:          (...roles: string[]) => any;
  parseId:            (id: unknown) => number | null;
  writeAuditLog:      (payload: Record<string, any>) => Promise<void> | void;
  hierarchyService:   ClientHierarchyServiceLike;
  // NOTE: generalLedgerService is NOT listed here — the capital service
  // instantiates it directly. Injecting it caused the
  // "Cannot read properties of undefined (reading 'postJournal')" crash
  // whenever the route was registered before serviceRegistry was ready.
  get:                (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all:                (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run:                (sql: string, params?: unknown[]) => Promise<any>;
  executeTransaction: (cb: (tx: any) => Promise<any>) => Promise<any>;
}

// ── RBAC role sets ─────────────────────────────────────────────────────────────

const SUBMITTER_ROLES = ["investor", "partner", "owner", "ceo", "admin"] as const;
const APPROVER_ROLES  = ["finance", "admin"]                              as const;
const READER_ROLES    = ["investor", "partner", "owner", "ceo", "admin", "finance"] as const;

export function registerCapitalRoutes(app: RouteRegistrar, context: CapitalRouteContext) {
  const {
    authenticate, authorize, parseId, writeAuditLog,
    hierarchyService, get, all, run, executeTransaction,
  } = context;

  // capitalService instantiates its own GL service internally —
  // no generalLedgerService injection required or accepted.
  const capitalService = createCapitalTransactionService({
    get,
    all,
    run,
    executeTransaction,
    hierarchyService,
    writeAuditLog,
  });

  // ── Resolve branch scope for submitters ────────────────────────────────────
  // Partners are locked to their own branch_id.
  // Returns -1 as a "forbidden" sentinel when they request the wrong branch.
  function resolveSubmitterBranch(
    user: Record<string, any>,
    scope: any,
    requestedBranchId: number | null,
  ): number | null | -1 {
    const role = String(user?.role || "").trim().toLowerCase();
    if (role === "partner") {
      const partnerBranch = Number(user?.branch_id || scope?.branchId || 0);
      if (!partnerBranch) return null;
      if (requestedBranchId && requestedBranchId !== partnerBranch) return -1;
      return partnerBranch;
    }
    return requestedBranchId;
  }

  // ── GET /api/capital/cashflow-position ─────────────────────────────────────
  app.get(
    "/api/capital/cashflow-position",
    authenticate,
    authorize(...READER_ROLES),
    async (req: any, res: any, next: any) => {
      try {
        const scope    = await hierarchyService.resolveHierarchyScope(req.user);
        const rawBranchId = req.query.branchId ? parseId(req.query.branchId) : null;

        if (rawBranchId && !hierarchyService.isBranchInScope(scope, rawBranchId)) {
          res.status(403).json({ message: "Forbidden: branchId is outside your scope." });
          return;
        }

        const role     = String(req.user?.role || "").toLowerCase();
        const branchId = role === "partner"
          ? Number(req.user?.branch_id || scope?.branchId || 0) || null
          : rawBranchId;

        const position = await capitalService.getCashflowPosition(branchId);
        res.status(200).json({ branchId, ...position });
      } catch (err) { next(err); }
    },
  );

  // ── GET /api/capital/transactions ──────────────────────────────────────────
  app.get(
    "/api/capital/transactions",
    authenticate,
    authorize(...READER_ROLES),
    async (req: any, res: any, next: any) => {
      try {
        const scope  = await hierarchyService.resolveHierarchyScope(req.user);
        const role   = String(req.user?.role || "").toLowerCase();

        let branchId: number | null = req.query.branchId ? parseId(req.query.branchId) : null;
        if (role === "partner") {
          branchId = Number(req.user?.branch_id || scope?.branchId || 0) || null;
        } else if (branchId && !hierarchyService.isBranchInScope(scope, branchId)) {
          res.status(403).json({ message: "Forbidden: branchId is outside your scope." });
          return;
        }

        const limit  = Math.min(Number(req.query.limit  || 50),  200);
        const offset = Math.max(Number(req.query.offset || 0),   0);

        const result = await capitalService.listTransactions(scope, {
          branchId,
          type:   req.query.type   ? String(req.query.type)   as CapitalTransactionType   : null,
          status: req.query.status ? String(req.query.status) as CapitalTransactionStatus : null,
          limit,
          offset,
        });

        res.status(200).json({ data: result.data, paging: { total: result.total, limit, offset } });
      } catch (err) { next(err); }
    },
  );

  // ── POST /api/capital/deposits ─────────────────────────────────────────────
  app.post(
    "/api/capital/deposits",
    authenticate,
    authorize(...SUBMITTER_ROLES),
    async (req: any, res: any, next: any) => {
      try {
        const scope  = await hierarchyService.resolveHierarchyScope(req.user);
        const body   = req.body || {};
        const amount = Number(body.amount);

        if (!Number.isFinite(amount) || amount <= 0) {
          res.status(400).json({ message: "amount must be a positive number." });
          return;
        }

        const resolvedBranch = resolveSubmitterBranch(
          req.user, scope, body.branchId ? parseId(body.branchId) : null,
        );
        if (resolvedBranch === -1) {
          res.status(403).json({ message: "Partners may only deposit to their own assigned branch." });
          return;
        }

        const tx = await capitalService.createDeposit({
          amount,
          currency:          String(body.currency || "KES").toUpperCase(),
          branchId:          resolvedBranch as number | null,
          submittedByUserId: Number(req.user.sub || req.user.id),
          submittedByRole:   String(req.user.role || ""),
          reference:         body.reference ? String(body.reference) : null,
          note:              body.note      ? String(body.note)      : null,
        });

        res.status(201).json(tx);
      } catch (err: any) {
        if (err?.status) { res.status(err.status).json({ message: err.message }); return; }
        next(err);
      }
    },
  );

  // ── POST /api/capital/withdrawals ──────────────────────────────────────────
  app.post(
    "/api/capital/withdrawals",
    authenticate,
    authorize(...SUBMITTER_ROLES),
    async (req: any, res: any, next: any) => {
      try {
        const scope  = await hierarchyService.resolveHierarchyScope(req.user);
        const body   = req.body || {};
        const amount = Number(body.amount);

        if (!Number.isFinite(amount) || amount <= 0) {
          res.status(400).json({ message: "amount must be a positive number." });
          return;
        }

        const resolvedBranch = resolveSubmitterBranch(
          req.user, scope, body.branchId ? parseId(body.branchId) : null,
        );
        if (resolvedBranch === -1) {
          res.status(403).json({ message: "Partners may only withdraw from their own assigned branch." });
          return;
        }

        const tx       = await capitalService.createWithdrawal({
          amount,
          currency:          String(body.currency || "KES").toUpperCase(),
          branchId:          resolvedBranch as number | null,
          submittedByUserId: Number(req.user.sub || req.user.id),
          submittedByRole:   String(req.user.role || ""),
          reference:         body.reference ? String(body.reference) : null,
          note:              body.note      ? String(body.note)      : null,
        });
        const cashflow = await capitalService.getCashflowPosition(resolvedBranch as number | null);

        res.status(201).json({
          transaction:            tx,
          cashflow_at_submission: cashflow,
          cashflow_warning:
            cashflow.net < amount
              ? `Net cashflow (${cashflow.net.toFixed(2)}) is below the requested withdrawal ` +
                `(${amount.toFixed(2)}). Finance approval required to override.`
              : null,
        });
      } catch (err: any) {
        if (err?.status) { res.status(err.status).json({ message: err.message }); return; }
        next(err);
      }
    },
  );

  // ── POST /api/capital/transactions/:id/approve ─────────────────────────────
  app.post(
    "/api/capital/transactions/:id/approve",
    authenticate,
    authorize(...APPROVER_ROLES),
    async (req: any, res: any, next: any) => {
      try {
        const transactionId = parseId(req.params.id);
        if (!transactionId) { res.status(400).json({ message: "Invalid transaction id." }); return; }

        const tx = await capitalService.approveTransaction({
          transactionId,
          approvedByUserId:    Number(req.user.sub || req.user.id),
          cashflowOverrideNote: req.body?.cashflowOverrideNote
            ? String(req.body.cashflowOverrideNote).trim()
            : null,
        });

        res.status(200).json(tx);
      } catch (err: any) {
        if (err?.status) { res.status(err.status).json({ message: err.message }); return; }
        next(err);
      }
    },
  );

  // ── POST /api/capital/transactions/:id/reject ──────────────────────────────
  app.post(
    "/api/capital/transactions/:id/reject",
    authenticate,
    authorize(...APPROVER_ROLES),
    async (req: any, res: any, next: any) => {
      try {
        const transactionId = parseId(req.params.id);
        if (!transactionId) { res.status(400).json({ message: "Invalid transaction id." }); return; }

        const reason = req.body?.reason ? String(req.body.reason).trim() : "";
        if (!reason) { res.status(400).json({ message: "A rejection reason is required." }); return; }

        const tx = await capitalService.rejectTransaction({
          transactionId,
          rejectedByUserId: Number(req.user.sub || req.user.id),
          reason,
        });

        res.status(200).json(tx);
      } catch (err: any) {
        if (err?.status) { res.status(err.status).json({ message: err.message }); return; }
        next(err);
      }
    },
  );
}
