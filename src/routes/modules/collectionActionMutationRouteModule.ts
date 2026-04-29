import type { CollectionManagementRouteOptions } from "./collectionManagementRouteTypes.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";

function registerCollectionActionMutationRoutes(options: CollectionManagementRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    collectionManageRoles,
    createCollectionActionSchema,
    updateCollectionActionSchema,
    hierarchyService,
    parseId,
    hasOwn,
    invalidateReportCaches,
    run,
    get,
    writeAuditLog,
  } = options;

  app.post(
    "/api/collections/actions",
    authenticate,
    authorize(...collectionManageRoles),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const payload = createCollectionActionSchema.parse(req.body);
        const loan = await get("SELECT id, branch_id FROM loans WHERE id = ? AND tenant_id = ?", [payload.loanId, getCurrentTenantId()]);
        if (!loan) {
          res.status(404).json({ message: "Loan not found" });
          return;
        }
        if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
          res.status(403).json({ message: "Forbidden: loan is outside your scope" });
          return;
        }

        if (payload.installmentId) {
          const installment = await get(
            "SELECT id, loan_id FROM loan_installments WHERE id = ?",
            [payload.installmentId],
          );
          if (!installment || installment.loan_id !== payload.loanId) {
            res.status(400).json({ message: "installmentId does not belong to the selected loan" });
            return;
          }
        }

        const actionInsert = await run(
          `
            INSERT INTO collection_actions (
              tenant_id,
              loan_id,
              branch_id,
              installment_id,
              action_type,
              action_note,
              promise_date,
              next_follow_up_date,
              action_status,
              created_by_user_id,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `,
          [
            getCurrentTenantId(),
            payload.loanId,
            loan.branch_id,
            payload.installmentId || null,
            payload.actionType,
            payload.actionNote || null,
            payload.promiseDate || null,
            payload.nextFollowUpDate || null,
            payload.actionStatus || "open",
            req.user.sub,
          ],
        );

        const createdAction = await get(
          `
            SELECT id, loan_id, branch_id, installment_id, action_type, action_note, promise_date, next_follow_up_date, action_status, created_by_user_id, created_at
            FROM collection_actions
            WHERE id = ?
          `,
          [actionInsert.lastID],
        );

        await writeAuditLog({
          userId: req.user.sub,
          action: "collections.action.created",
          targetType: "loan",
          targetId: payload.loanId,
          details: JSON.stringify({
            collectionActionId: actionInsert.lastID,
            actionType: payload.actionType,
            actionStatus: payload.actionStatus || "open",
          }),
          ipAddress: req.ip,
        });
        await invalidateReportCaches();

        res.status(201).json(createdAction);
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch(
    "/api/collections/actions/:id",
    authenticate,
    authorize(...collectionManageRoles),
    async (req, res, next) => {
      try {
        const actionId = parseId(req.params.id);
        if (!actionId) {
          res.status(400).json({ message: "Invalid collection action id" });
          return;
        }

        const payload = updateCollectionActionSchema.parse(req.body);
        const existingAction = await get(
          `
            SELECT id, loan_id, branch_id, installment_id, action_type, action_note, promise_date, next_follow_up_date, action_status, created_by_user_id, created_at
            FROM collection_actions
            WHERE id = ?
          `,
          [actionId],
        );
        if (!existingAction) {
          res.status(404).json({ message: "Collection action not found" });
          return;
        }

        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        if (!hierarchyService.isBranchInScope(scope, existingAction.branch_id)) {
          res.status(403).json({ message: "Forbidden: collection action is outside your scope" });
          return;
        }

        const setClauses = [];
        const queryParams = [];
        const changedFields: Record<string, unknown> = {};

        if (hasOwn(payload, "actionNote")) {
          const nextActionNote = payload.actionNote ? payload.actionNote : null;
          const currentActionNote = existingAction.action_note || null;
          if (nextActionNote !== currentActionNote) {
            setClauses.push("action_note = ?");
            queryParams.push(nextActionNote);
            changedFields.actionNote = nextActionNote;
          }
        }

        if (hasOwn(payload, "promiseDate")) {
          const nextPromiseDate = payload.promiseDate || null;
          const currentPromiseDate = existingAction.promise_date || null;
          if (nextPromiseDate !== currentPromiseDate) {
            setClauses.push("promise_date = ?");
            queryParams.push(nextPromiseDate);
            changedFields.promiseDate = nextPromiseDate;
          }
        }

        if (hasOwn(payload, "nextFollowUpDate")) {
          const nextFollowUpDate = payload.nextFollowUpDate || null;
          const currentFollowUpDate = existingAction.next_follow_up_date || null;
          if (nextFollowUpDate !== currentFollowUpDate) {
            setClauses.push("next_follow_up_date = ?");
            queryParams.push(nextFollowUpDate);
            changedFields.nextFollowUpDate = nextFollowUpDate;
          }
        }

        if (hasOwn(payload, "actionStatus")) {
          const nextStatus = payload.actionStatus;
          if (nextStatus !== existingAction.action_status) {
            setClauses.push("action_status = ?");
            queryParams.push(nextStatus);
            changedFields.actionStatus = nextStatus;
          }
        }

        if (setClauses.length === 0) {
          res.status(200).json({ message: "No collection action changes were applied", action: existingAction });
          return;
        }

        await run(
          `
            UPDATE collection_actions
            SET ${setClauses.join(", ")}
            WHERE id = ?
          `,
          [...queryParams, actionId],
        );

        const updatedAction = await get(
          `
            SELECT
              ca.id,
              ca.loan_id,
              ca.installment_id,
              ca.action_type,
              ca.action_note,
              ca.promise_date,
              ca.next_follow_up_date,
              ca.action_status,
              ca.created_by_user_id,
              ca.created_at,
              u.full_name AS created_by_name
            FROM collection_actions ca
            LEFT JOIN users u ON u.id = ca.created_by_user_id
            WHERE ca.id = ?
          `,
          [actionId],
        );
        if (!updatedAction) {
          res.status(500).json({ message: "Collection action update could not be verified" });
          return;
        }

        await writeAuditLog({
          userId: req.user.sub,
          action: "collections.action.updated",
          targetType: "loan",
          targetId: existingAction.loan_id,
          details: JSON.stringify({
            collectionActionId: actionId,
            previousStatus: existingAction.action_status,
            nextStatus: updatedAction.action_status,
            changedFields,
          }),
          ipAddress: req.ip,
        });
        await invalidateReportCaches();

        res.status(200).json({ message: "Collection action updated", action: updatedAction });
      } catch (error) {
        next(error);
      }
    },
  );
}

export {
  registerCollectionActionMutationRoutes,
};
