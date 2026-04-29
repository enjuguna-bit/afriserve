import type { DbRunResult, DbTransactionContext } from "../types/dataLayer.js";
import {
  ClientNotFoundError,
  DomainValidationError,
  ForbiddenActionError,
  ForbiddenScopeError,
  LoanNotFoundError,
  LoanStateConflictError,
} from "../domain/errors.js";
import { LoanApplicationSubmitted } from "../domain/loan/events/LoanApplicationSubmitted.js";
import type { DomainEventPublisher, HierarchyServiceLike } from "../types/serviceContracts.js";
import { getClientOnboardingSnapshot } from "./loanWorkflowSnapshotService.js";
import { buildLoanContractSnapshotTx, recordLoanContractVersionTx } from "./loanContractVersioning.js";
import { calculateLoanProductPricing } from "./loanProductPricing.js";
import { checkUserPermission } from "./permissionService.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

type LoanApplicationSubmittedTxHandler = {
  handle: (event: LoanApplicationSubmitted, tx?: DbTransactionContext) => Promise<void>;
};

type LoanApplicationSubmittedAsyncHandler = {
  handle: (event: LoanApplicationSubmitted) => Promise<void>;
};

interface LoanServiceDeps {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  executeTransaction: (callback: (tx: DbTransactionContext) => Promise<unknown>) => Promise<unknown>;
  hierarchyService: HierarchyServiceLike;
  calculateExpectedTotal: (principal: number, interestRate: number, termWeeks: number) => number;
  resolveLoanProduct: (payload: { productId?: number }) => Promise<Record<string, unknown>>;
  writeAuditLog: (payload: {
    userId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: number | null;
    details?: string | null;
    ipAddress?: string | null;
  }) => Promise<void> | void;
  invalidateReportCaches: () => Promise<void>;
  allowConcurrentLoans: boolean;
  publishDomainEvent?: DomainEventPublisher;
  loanUnderwritingService?: {
    refreshLoanAssessment: (loanId: number) => Promise<unknown>;
  } | null;
  loanOnboardingLinkSaga?: LoanApplicationSubmittedTxHandler | null;
  loanContractVersionSaga?: LoanApplicationSubmittedTxHandler | null;
  loanUnderwritingRefreshSaga?: LoanApplicationSubmittedAsyncHandler | null;
}

function createLoanService(deps: LoanServiceDeps) {
  const {
    get,
    run,
    executeTransaction,
    hierarchyService,
    calculateExpectedTotal,
    resolveLoanProduct,
    writeAuditLog,
    invalidateReportCaches,
    allowConcurrentLoans,
    publishDomainEvent,
    loanUnderwritingService = null,
    loanOnboardingLinkSaga = null,
    loanContractVersionSaga = null,
    loanUnderwritingRefreshSaga = null,
  } = deps;

  async function canOverridePricing(user: {
    sub: number;
    role?: string;
    roles?: string[];
    permissions?: string[];
  }): Promise<boolean> {
    const normalizedRole = String(user.role || "").trim().toLowerCase();
    const normalizedRoles = Array.isArray(user.roles)
      ? user.roles.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const normalizedPermissions = Array.isArray(user.permissions)
      ? user.permissions.map((permission) => String(permission || "").trim().toLowerCase()).filter(Boolean)
      : [];

    if (normalizedPermissions.includes("loan.approve")) {
      return true;
    }

    const effectiveRoles = normalizedRoles.length > 0
      ? normalizedRoles
      : (normalizedRole ? [normalizedRole] : []);

    return checkUserPermission(Number(user.sub), effectiveRoles, "loan.approve");
  }

  async function createLoan({
    payload,
    user,
    ipAddress,
  }: {
    payload: {
      clientId: number;
      principal: number;
      termWeeks: number;
      productId?: number;
      interestRate?: number;
      registrationFee?: number;
      processingFee?: number;
      branchId?: number;
      officerId?: number;
      /** Loan purpose — stored for CBK reporting compliance */
      purpose?: string | null;
    };
    user: { sub: number; role?: string; roles?: string[]; permissions?: string[]; branchId?: number | null };
    ipAddress: string | null | undefined;
  }) {
    const tenantId = getCurrentTenantId();
    const scope = await hierarchyService.resolveHierarchyScope(user);

    const client = await get(
      `SELECT id, branch_id, is_active, officer_id, created_by_user_id, fee_payment_status
       FROM clients WHERE id = ? AND tenant_id = ?`,
      [payload.clientId, tenantId],
    );

    if (!client) {
      throw new ClientNotFoundError();
    }

    if (Number(client["is_active"] || 0) !== 1) {
      throw new DomainValidationError("Cannot create a loan for an inactive client");
    }

    const normalizedUserRole = String(user.role || "").trim().toLowerCase();
    if (normalizedUserRole === "loan_officer") {
      const clientOfficerId = Number(client["officer_id"] || 0) || null;
      const clientCreatedByUserId = Number(client["created_by_user_id"] || 0) || null;
      const canAccessClient = (
        (Number.isInteger(clientOfficerId) && Number(clientOfficerId) > 0 && Number(clientOfficerId) === Number(user.sub))
        || (Number.isInteger(clientCreatedByUserId) && Number(clientCreatedByUserId) > 0 && Number(clientCreatedByUserId) === Number(user.sub))
      );
      if (!canAccessClient) {
        throw new ForbiddenActionError("Forbidden: client is outside your assignment");
      }
    }

    let branchId: number | null = Number(client["branch_id"] || 0) || Number(payload.branchId || 0) || null;
    if (scope.level === "branch") {
      if (branchId && Number(branchId) !== Number(scope.branchId)) {
        throw new ForbiddenScopeError("Forbidden: selected branch is outside your scope");
      }
      branchId = scope.branchId;
    }

    if (!branchId) {
      branchId = user.branchId || null;
    }

    if (!branchId) {
      throw new DomainValidationError("Loan branch is required. Assign a client branch, pass branchId, or set your user branch.");
    }

    const branch = await hierarchyService.getBranchById(branchId, { requireActive: true });
    if (!branch) {
      throw new DomainValidationError("Selected branch was not found or is inactive");
    }

    if (!hierarchyService.isBranchInScope(scope, branchId)) {
      throw new ForbiddenScopeError("Forbidden: selected branch is outside your scope");
    }

    if (client["branch_id"] && Number(client["branch_id"]) !== Number(branchId)) {
      throw new DomainValidationError("Loan branch must match client branch assignment");
    }

    const clientOnboarding = await getClientOnboardingSnapshot({
      get,
      clientId: Number(payload.clientId),
    });
    if (!clientOnboarding) {
      throw new ClientNotFoundError();
    }
    if (!clientOnboarding.ready_for_loan_application) {
      throw new DomainValidationError("Cannot create loan: client onboarding is incomplete", {
        blockers: clientOnboarding.blockers,
        clientId: payload.clientId,
      });
    }

    // Assign branch to client if not yet set
    if (!client["branch_id"]) {
      await run(
        "UPDATE clients SET branch_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
        [Number(branchId), new Date().toISOString(), payload.clientId, tenantId],
      );
    }

    const selectedProduct = await resolveLoanProduct(payload);
    const minTermWeeks = Number(selectedProduct["min_term_weeks"] || 0);
    const maxTermWeeks = Number(selectedProduct["max_term_weeks"] || 0);
    if (payload.termWeeks < minTermWeeks || payload.termWeeks > maxTermWeeks) {
      throw new DomainValidationError(
        `termWeeks must be between ${minTermWeeks} and ${maxTermWeeks} for the selected loan product`,
      );
    }

    const rawMinPrincipal = Number(selectedProduct["min_principal"]);
    const rawMaxPrincipal = Number(selectedProduct["max_principal"]);
    const minPrincipal = Number.isFinite(rawMinPrincipal) && rawMinPrincipal > 0 ? rawMinPrincipal : 1;
    const maxPrincipal = Number.isFinite(rawMaxPrincipal) && rawMaxPrincipal >= minPrincipal ? rawMaxPrincipal : Number.MAX_SAFE_INTEGER;
    if (payload.principal < minPrincipal || payload.principal > maxPrincipal) {
      throw new DomainValidationError(
        `principal must be between ${minPrincipal} and ${maxPrincipal} for the selected loan product`,
      );
    }

    const hasPricingOverride = [payload.interestRate, payload.registrationFee, payload.processingFee]
      .some((value) => typeof value === "number");
    if (hasPricingOverride && !(await canOverridePricing(user))) {
      throw new ForbiddenActionError("Only users with loan approval permission can override loan product pricing fields");
    }

    let interestRate = 0;
    let registrationFee = 0;
    let processingFee = 0;
    let expectedTotal = 0;
    const termMonths = Math.max(1, Math.ceil(payload.termWeeks / 4));

    const payloadOfficerId = Number(payload.officerId || 0) || null;
    const hasPayloadOfficerId = payloadOfficerId !== null && Number.isInteger(payloadOfficerId) && payloadOfficerId > 0;
    const clientOfficerId = Number(client["officer_id"] || 0) || null;
    const hasClientOfficerId = clientOfficerId !== null && Number.isInteger(clientOfficerId) && clientOfficerId > 0;
    const selectedOfficerId = hasPayloadOfficerId
      ? payloadOfficerId
      : (hasClientOfficerId
        ? clientOfficerId
        : (normalizedUserRole === "loan_officer" ? Number(user.sub) : null));

    if (normalizedUserRole === "loan_officer" && Number(selectedOfficerId || 0) !== Number(user.sub)) {
      throw new ForbiddenActionError("Forbidden: loan officers cannot assign a loan to another officer");
    }

    if (selectedOfficerId) {
      const selectedOfficer = await get(
        "SELECT id, role, is_active, branch_id FROM users WHERE id = ? AND tenant_id = ?",
        [Number(selectedOfficerId), tenantId],
      );
      if (!selectedOfficer) {
        throw new DomainValidationError("Selected loan officer was not found");
      }
      if (String(selectedOfficer["role"] || "").trim().toLowerCase() !== "loan_officer") {
        throw new DomainValidationError("Selected user is not a loan officer");
      }
      if (Number(selectedOfficer["is_active"] || 0) !== 1) {
        throw new DomainValidationError("Selected loan officer is inactive");
      }
      if (!Number.isInteger(Number(selectedOfficer["branch_id"])) || Number(selectedOfficer["branch_id"]) <= 0) {
        throw new DomainValidationError("Selected loan officer has no branch assignment");
      }
      if (Number(selectedOfficer["branch_id"]) !== Number(branchId)) {
        throw new DomainValidationError("Selected loan officer belongs to a different branch");
      }
    }

    // Normalise purpose: trim to null when blank
    const loanPurpose = typeof payload.purpose === "string" && payload.purpose.trim()
      ? payload.purpose.trim()
      : null;

    const createResult = await executeTransaction(async (tx: DbTransactionContext) => {
      // Optimistic write-lock on the client row to prevent TOCTOU races
      await tx.run(
        "UPDATE clients SET updated_at = COALESCE(updated_at, created_at) WHERE id = ? AND tenant_id = ?",
        [Number(payload.clientId), tenantId],
      );

      if (!allowConcurrentLoans) {
        const inFlightRow = await tx.get(
          `SELECT status FROM loans
           WHERE client_id = ? AND tenant_id = ?
             AND status IN ('active', 'overdue', 'restructured')
           ORDER BY
             CASE
               WHEN status = 'active' THEN 0
               WHEN status = 'overdue' THEN 1
               WHEN status = 'restructured' THEN 2
               ELSE 99
             END,
             id DESC
           LIMIT 1`,
          [payload.clientId, tenantId],
        );
        const conflictingStatus = String(inFlightRow?.["status"] || "").trim().toLowerCase();
        if (conflictingStatus) {
          const message = conflictingStatus === "restructured"
            ? "Client already has a restructured loan. Concurrent active loans are not allowed."
            : "Client already has an active loan. Concurrent active loans are not allowed.";
          throw new LoanStateConflictError(
            message,
          );
        }
      }

      const disbursedRow = await tx.get(
        `SELECT COUNT(*) AS total FROM loans
         WHERE client_id = ? AND tenant_id = ?
           AND status IN ('active', 'restructured', 'closed', 'written_off')`,
        [payload.clientId, tenantId],
      );
      const isFirstLoan = Number(disbursedRow?.["total"] || 0) === 0;

      if (hasPricingOverride) {
        interestRate = typeof payload.interestRate === "number"
          ? Number(payload.interestRate)
          : Number(selectedProduct["interest_rate"] || 0);
        registrationFee = isFirstLoan
          ? (typeof payload.registrationFee === "number"
            ? Number(payload.registrationFee)
            : Number(selectedProduct["registration_fee"] || 0))
          : 0;
        processingFee = typeof payload.processingFee === "number"
          ? Number(payload.processingFee)
          : Number(selectedProduct["processing_fee"] || 0);
        expectedTotal = Number(calculateExpectedTotal(payload.principal, interestRate, payload.termWeeks).toFixed(2));
      } else {
        try {
          const derivedPricing = calculateLoanProductPricing({
            product: selectedProduct,
            principal: payload.principal,
            termWeeks: payload.termWeeks,
            isFirstLoan,
            calculateExpectedTotal,
          });
          interestRate = derivedPricing.interestRate;
          registrationFee = derivedPricing.registrationFee;
          processingFee = derivedPricing.processingFee;
          expectedTotal = derivedPricing.expectedTotal;
        } catch (pricingError) {
          throw new DomainValidationError(
            pricingError instanceof Error ? pricingError.message : "Invalid loan product pricing configuration",
          );
        }
      }

      const createdAt = new Date().toISOString();
      const insertResult = await tx.run(
        `INSERT INTO loans (
          client_id, product_id, branch_id, created_by_user_id,
          principal, interest_rate, term_months, term_weeks,
          registration_fee, processing_fee,
          expected_total, balance, repaid_total,
          status, officer_id, purpose,
          tenant_id, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          payload.clientId, selectedProduct["id"], Number(branchId), user.sub,
          payload.principal, interestRate, termMonths, payload.termWeeks,
          registrationFee, processingFee,
          expectedTotal, expectedTotal, 0,
          "pending_approval", selectedOfficerId, loanPurpose,
          tenantId, createdAt,
        ],
      );
      const newLoanId = Number(insertResult.lastID || 0);
      const submittedEvent = new LoanApplicationSubmitted({
        loanId: newLoanId,
        clientId: Number(payload.clientId),
        principal: Number(payload.principal),
        termWeeks: Number(payload.termWeeks),
        branchId: branchId ?? null,
        createdByUserId: Number(user.sub),
        occurredAt: new Date(createdAt),
      });

      if (loanOnboardingLinkSaga) {
        await loanOnboardingLinkSaga.handle(submittedEvent, tx);
      }

      if (loanContractVersionSaga) {
        await loanContractVersionSaga.handle(submittedEvent, tx);
      }

      if (publishDomainEvent) {
        await publishDomainEvent(
          {
            ...submittedEvent.toOutboxPayload(),
            tenantId,
          },
          tx,
        );
      }

      return { loanId: newLoanId, submittedEvent };
    }) as { loanId: number; submittedEvent: LoanApplicationSubmitted };
    const createdLoanId = createResult.loanId;

    await writeAuditLog({
      userId: user.sub,
      action: "loan.created",
      targetType: "loan",
      targetId: createdLoanId,
      details: JSON.stringify({
        clientId: payload.clientId,
        principal: payload.principal,
        productId: selectedProduct["id"],
        productName: selectedProduct["name"],
        interestRate,
        termWeeks: payload.termWeeks,
        pricingOverridesApplied: hasPricingOverride,
        registrationFee,
        processingFee,
        branchId,
        officerId: selectedOfficerId,
        purpose: loanPurpose,
        onboardingStatus: clientOnboarding.onboarding_status,
        autoLinkedGuarantors: clientOnboarding.guarantor_count,
        autoLinkedCollaterals: clientOnboarding.collateral_count,
      }),
      ipAddress: ipAddress || null,
    });

    const createdLoan = await get(
      "SELECT * FROM loans WHERE id = ? AND tenant_id = ?",
      [Number(createdLoanId), getCurrentTenantId()],
    );
    if (loanUnderwritingRefreshSaga) {
      await loanUnderwritingRefreshSaga.handle(createResult.submittedEvent);
    } else if (loanUnderwritingService) {
      await loanUnderwritingService.refreshLoanAssessment(Number(createdLoanId));
    }
    await invalidateReportCaches();
    return createdLoan;
  }

  async function updateLoanDetails({
    loanId,
    payload,
    user,
    ipAddress,
  }: {
    loanId: number;
    payload: {
      principal?: number;
      termWeeks?: number;
      interestRate?: number;
      registrationFee?: number;
      processingFee?: number;
    };
    user: { sub: number; role?: string; roles?: string[]; permissions?: string[] };
    ipAddress: string | null | undefined;
  }) {
    const tenantId = getCurrentTenantId();
    const scope = await hierarchyService.resolveHierarchyScope(user);

    const updateResult = await executeTransaction(async (tx: DbTransactionContext) => {
      const loan = await tx.get(
        "SELECT * FROM loans WHERE id = ? AND tenant_id = ?",
        [Number(loanId), tenantId],
      );

      if (!loan) { throw new LoanNotFoundError(); }
      if (!hierarchyService.isBranchInScope(scope, loan["branch_id"])) {
        throw new ForbiddenScopeError("Forbidden: loan is outside your scope");
      }
      if (String(loan["status"] || "").trim().toLowerCase() !== "pending_approval") {
        throw new LoanStateConflictError(
          "Only loans in pending_approval can be edited. Use loan lifecycle actions after approval or disbursement.",
          { loanId, status: loan["status"] },
        );
      }

      const [installmentRow, repaymentRow, trancheRow] = await Promise.all([
        tx.get("SELECT COUNT(*) AS total FROM loan_installments WHERE loan_id = ?", [Number(loanId)]),
        tx.get("SELECT COUNT(*) AS total FROM repayments WHERE loan_id = ?", [Number(loanId)]),
        tx.get("SELECT COUNT(*) AS total FROM loan_disbursement_tranches WHERE loan_id = ?", [Number(loanId)]),
      ]);
      const installmentCount = Number(installmentRow?.["total"] || 0);
      const repaymentCount = Number(repaymentRow?.["total"] || 0);
      const trancheCount = Number(trancheRow?.["total"] || 0);
      if (installmentCount > 0 || repaymentCount > 0 || trancheCount > 0) {
        throw new LoanStateConflictError("Loan details cannot be edited after financial execution records exist", {
          loanId, installmentCount, repaymentCount, trancheCount,
        });
      }

      const currentPrincipal = Number(loan["principal"] || 0);
      const currentTermWeeks = Number(loan["term_weeks"] || 0);
      const currentInterestRate = Number(loan["interest_rate"] || 0);
      const currentRegistrationFee = Number(loan["registration_fee"] || 0);
      const currentProcessingFee = Number(loan["processing_fee"] || 0);
      const currentExpectedTotal = Number(loan["expected_total"] || 0);
      const currentBalance = Number(loan["balance"] || 0);
      const repaidTotal = Number(loan["repaid_total"] || 0);

      const nextPrincipal = typeof payload.principal === "number" ? Number(payload.principal) : currentPrincipal;
      const nextTermWeeks = typeof payload.termWeeks === "number" ? Number(payload.termWeeks) : currentTermWeeks;
      const nextInterestRate = typeof payload.interestRate === "number" ? Number(payload.interestRate) : currentInterestRate;
      const nextRegistrationFee = typeof payload.registrationFee === "number" ? Number(payload.registrationFee) : currentRegistrationFee;
      const nextProcessingFee = typeof payload.processingFee === "number" ? Number(payload.processingFee) : currentProcessingFee;
      const nextExpectedTotal = Number(calculateExpectedTotal(nextPrincipal, nextInterestRate, nextTermWeeks).toFixed(2));
      const nextBalance = Number(Math.max(0, nextExpectedTotal - repaidTotal).toFixed(2));
      const nextTermMonths = Math.max(1, Math.ceil(nextTermWeeks / 4));

      const changedFields: Record<string, { previous: number; next: number }> = {};
      if (nextPrincipal !== currentPrincipal) changedFields["principal"] = { previous: currentPrincipal, next: nextPrincipal };
      if (nextTermWeeks !== currentTermWeeks) changedFields["termWeeks"] = { previous: currentTermWeeks, next: nextTermWeeks };
      if (nextInterestRate !== currentInterestRate) changedFields["interestRate"] = { previous: currentInterestRate, next: nextInterestRate };
      if (nextRegistrationFee !== currentRegistrationFee) changedFields["registrationFee"] = { previous: currentRegistrationFee, next: nextRegistrationFee };
      if (nextProcessingFee !== currentProcessingFee) changedFields["processingFee"] = { previous: currentProcessingFee, next: nextProcessingFee };
      if (nextExpectedTotal !== currentExpectedTotal) changedFields["expectedTotal"] = { previous: currentExpectedTotal, next: nextExpectedTotal };
      if (nextBalance !== currentBalance) changedFields["balance"] = { previous: currentBalance, next: nextBalance };

      if (Object.keys(changedFields).length === 0) {
        return { loan, changedFields, applied: false };
      }

      await tx.run(
        `UPDATE loans SET
          principal = ?, interest_rate = ?, term_weeks = ?, term_months = ?,
          registration_fee = ?, processing_fee = ?,
          expected_total = ?, balance = ?
        WHERE id = ? AND tenant_id = ?`,
        [
          nextPrincipal, nextInterestRate, nextTermWeeks, nextTermMonths,
          nextRegistrationFee, nextProcessingFee,
          nextExpectedTotal, nextBalance,
          Number(loanId), tenantId,
        ],
      );

      const updatedLoan = await tx.get(
        "SELECT * FROM loans WHERE id = ? AND tenant_id = ?",
        [Number(loanId), tenantId],
      );

      const contractSnapshot = await buildLoanContractSnapshotTx(tx, Number(loanId), {
        previousLoan: loan,
        changes: changedFields,
      });

      await recordLoanContractVersionTx(tx, {
        loanId: Number(loanId),
        eventType: "details_update",
        note: "Loan details edited before approval",
        createdByUserId: Number(user.sub),
        snapshotJson: contractSnapshot,
        principal: nextPrincipal,
        interestRate: nextInterestRate,
        termWeeks: nextTermWeeks,
        expectedTotal: nextExpectedTotal,
        repaidTotal,
        balance: nextBalance,
      });

      return { loan: updatedLoan, changedFields, applied: true };
    }) as { loan: Record<string, any> | null; changedFields: Record<string, any>; applied: boolean };

    if (!updateResult.applied) {
      return { loan: updateResult.loan, applied: false, changedFields: updateResult.changedFields };
    }

    if (loanUnderwritingService) {
      await loanUnderwritingService.refreshLoanAssessment(Number(loanId));
    }

    await writeAuditLog({
      userId: Number(user.sub),
      action: "loan.details.updated",
      targetType: "loan",
      targetId: Number(loanId),
      details: JSON.stringify({ changes: updateResult.changedFields }),
      ipAddress: ipAddress || null,
    });

    await invalidateReportCaches();
    return { loan: updateResult.loan, applied: true, changedFields: updateResult.changedFields };
  }

  return {
    createLoan,
    updateLoanDetails,
  };
}

export {
  createLoanService,
};
