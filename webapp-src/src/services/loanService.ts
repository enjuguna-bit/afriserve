import { prisma } from "../db/prismaClient.js";
import { Prisma } from "../db/prismaClient.js";
import type { DbRunResult } from "../types/dataLayer.js";
import {
  ClientNotFoundError,
  DomainValidationError,
  ForbiddenActionError,
  ForbiddenScopeError,
  LoanNotFoundError,
  LoanStateConflictError,
} from "../domain/errors.js";
import { getClientOnboardingSnapshot } from "./loanWorkflowSnapshotService.js";
import { buildLoanContractSnapshotTx, recordLoanContractVersionTx } from "./loanContractVersioning.js";
import { calculateLoanProductPricing } from "./loanProductPricing.js";
import { checkUserPermission } from "./permissionService.js";

interface LoanServiceDeps {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  run: (sql: string, params?: unknown[]) => Promise<unknown>;
  executeTransaction: (callback: (tx: { run: (sql: string, params?: unknown[]) => Promise<DbRunResult> }) => Promise<any>) => Promise<any>;
  hierarchyService: any;
  calculateExpectedTotal: (principal: number, interestRate: number, termWeeks: number) => number;
  resolveLoanProduct: (payload: { productId?: number }) => Promise<Record<string, any>>;
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
  loanUnderwritingService?: {
    refreshLoanAssessment: (loanId: number) => Promise<unknown>;
  } | null;
}

function createLoanService(deps: LoanServiceDeps) {
  const {
    get,
    hierarchyService,
    calculateExpectedTotal,
    resolveLoanProduct,
    writeAuditLog,
    invalidateReportCaches,
    allowConcurrentLoans,
    loanUnderwritingService = null,
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

  function isSerializableConflictError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return true;
    }

    const message = String((error as { message?: unknown })?.message || "").toLowerCase();
    return message.includes("serialization")
      || message.includes("deadlock")
      || message.includes("transaction conflict");
  }

  function isUnsupportedIsolationLevelError(error: unknown): boolean {
    const message = String((error as { message?: unknown })?.message || "").toLowerCase();
    return message.includes("isolation level") && message.includes("not supported");
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
    };
    user: { sub: number; role?: string; roles?: string[]; permissions?: string[]; branchId?: number | null };
    ipAddress: string | null | undefined;
  }) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const client = await prisma.clients.findUnique({
      where: { id: payload.clientId },
      select: {
        id: true,
        branch_id: true,
        is_active: true,
        officer_id: true,
        created_by_user_id: true,
        fee_payment_status: true,
      },
    });

    if (!client) {
      throw new ClientNotFoundError();
    }

    if (Number(client.is_active || 0) !== 1) {
      throw new DomainValidationError("Cannot create a loan for an inactive client");
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

    const normalizedUserRole = String(user.role || "").trim().toLowerCase();
    if (normalizedUserRole === "loan_officer") {
      const clientOfficerId = Number(client.officer_id || 0) || null;
      const clientCreatedByUserId = Number(client.created_by_user_id || 0) || null;
      const canAccessClient = (
        (Number.isInteger(clientOfficerId) && Number(clientOfficerId) > 0 && Number(clientOfficerId) === Number(user.sub))
        || (Number.isInteger(clientCreatedByUserId) && Number(clientCreatedByUserId) > 0 && Number(clientCreatedByUserId) === Number(user.sub))
      );
      if (!canAccessClient) {
        throw new ForbiddenActionError("Forbidden: client is outside your assignment");
      }
    }

    let branchId = client.branch_id || payload.branchId || null;
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

    if (client.branch_id && Number(client.branch_id) !== Number(branchId)) {
      throw new DomainValidationError("Loan branch must match client branch assignment");
    }

    if (!client.branch_id) {
      await prisma.clients.update({
        where: { id: payload.clientId },
        data: {
          branch_id: Number(branchId),
          updated_at: new Date().toISOString(),
        },
      });
    }

    const selectedProduct = await resolveLoanProduct(payload);
    const minTermWeeks = Number(selectedProduct.min_term_weeks || 0);
    const maxTermWeeks = Number(selectedProduct.max_term_weeks || 0);
    if (payload.termWeeks < minTermWeeks || payload.termWeeks > maxTermWeeks) {
      throw new DomainValidationError(
        `termWeeks must be between ${minTermWeeks} and ${maxTermWeeks} for the selected loan product`,
      );
    }

    const rawMinPrincipal = Number(selectedProduct.min_principal);
    const rawMaxPrincipal = Number(selectedProduct.max_principal);
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
    const clientOfficerId = Number(client.officer_id || 0) || null;
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
      const selectedOfficer = await prisma.users.findUnique({
        where: { id: Number(selectedOfficerId) },
        select: {
          id: true,
          role: true,
          is_active: true,
          branch_id: true,
        },
      });

      if (!selectedOfficer) {
        throw new DomainValidationError("Selected loan officer was not found");
      }

      if (String(selectedOfficer.role || "").trim().toLowerCase() !== "loan_officer") {
        throw new DomainValidationError("Selected user is not a loan officer");
      }

      if (Number(selectedOfficer.is_active || 0) !== 1) {
        throw new DomainValidationError("Selected loan officer is inactive");
      }

      if (!Number.isInteger(Number(selectedOfficer.branch_id)) || Number(selectedOfficer.branch_id) <= 0) {
        throw new DomainValidationError("Selected loan officer has no branch assignment");
      }

      if (Number(selectedOfficer.branch_id) !== Number(branchId)) {
        throw new DomainValidationError("Selected loan officer belongs to a different branch");
      }
    }

    const executeCreateLoanTransaction = async (isolationLevel?: Prisma.TransactionIsolationLevel) => prisma.$transaction(async (tx) => {
      // Acquire a write lock for this client before checking/creating loans to avoid concurrent TOCTOU races.
      await tx.$executeRaw`
        UPDATE clients
        SET updated_at = COALESCE(updated_at, created_at)
        WHERE id = ${Number(payload.clientId)}
      `;

      if (!allowConcurrentLoans) {
        const activeLoanCount = await tx.loans.count({
          where: {
            client_id: payload.clientId,
            status: {
              in: ["active", "restructured"],
            },
          },
        });
        if (Number(activeLoanCount || 0) > 0) {
          throw new LoanStateConflictError("Client already has an active loan. Concurrent active loans are not allowed.");
        }
      }

      const existingLoanCount = await tx.loans.count({
        where: {
          client_id: payload.clientId,
        },
      });
      const isFirstLoan = Number(existingLoanCount || 0) === 0;

      if (hasPricingOverride) {
        interestRate = typeof payload.interestRate === "number"
          ? Number(payload.interestRate)
          : Number(selectedProduct.interest_rate || 0);
        registrationFee = isFirstLoan
          ? (typeof payload.registrationFee === "number"
            ? Number(payload.registrationFee)
            : Number(selectedProduct.registration_fee || 0))
          : 0;
        processingFee = typeof payload.processingFee === "number"
          ? Number(payload.processingFee)
          : Number(selectedProduct.processing_fee || 0);
        const scheduledRepaymentTotal = calculateExpectedTotal(payload.principal, interestRate, payload.termWeeks);
        expectedTotal = Number(scheduledRepaymentTotal.toFixed(2));
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
        } catch (error) {
          throw new DomainValidationError(error instanceof Error ? error.message : "Invalid loan product pricing configuration");
        }
      }

      const createdLoan = await tx.loans.create({
        data: {
          client_id: payload.clientId,
          product_id: selectedProduct.id,
          branch_id: Number(branchId),
          created_by_user_id: user.sub,
          principal: payload.principal,
          interest_rate: interestRate,
          term_months: termMonths,
          term_weeks: payload.termWeeks,
          registration_fee: registrationFee,
          processing_fee: processingFee,
          expected_total: expectedTotal,
          balance: expectedTotal,
          status: "pending_approval",
          officer_id: selectedOfficerId,
          created_at: new Date().toISOString(),
        },
      });

      const [clientGuarantors, clientCollaterals] = await Promise.all([
        tx.$queryRaw<Array<{ id: number; guarantee_amount: number }>>`
          SELECT id, guarantee_amount
          FROM guarantors
          WHERE client_id = ${Number(payload.clientId)}
            AND is_active = 1
        `,
        tx.collateral_assets.findMany({
          where: {
            client_id: payload.clientId,
            status: "active",
          },
          select: {
            id: true,
          },
        }),
      ]);

      if (clientGuarantors.length > 0) {
        const guarantorsMissingCoverage = clientGuarantors
          .filter((guarantor) => Number(guarantor.guarantee_amount || 0) <= 0)
          .map((guarantor) => Number(guarantor.id));
        if (guarantorsMissingCoverage.length > 0) {
          throw new DomainValidationError("All onboarding guarantors must have a positive guarantee amount before loan creation", {
            guarantorIds: guarantorsMissingCoverage,
          });
        }

        await tx.loan_guarantors.createMany({
          data: clientGuarantors.map((guarantor) => ({
            loan_id: createdLoan.id,
            guarantor_id: guarantor.id,
            guarantee_amount: Number(guarantor.guarantee_amount || 0),
            liability_type: "individual",
            note: "Auto-linked from client onboarding guarantor",
            created_by_user_id: user.sub,
            created_at: new Date().toISOString(),
          })),
        });
      }

      if (clientCollaterals.length > 0) {
        await tx.loan_collaterals.createMany({
          data: clientCollaterals.map((collateral) => ({
            loan_id: createdLoan.id,
            collateral_asset_id: collateral.id,
            forced_sale_value: null,
            lien_rank: 1,
            note: "Auto-linked from client onboarding collateral",
            created_by_user_id: user.sub,
            created_at: new Date().toISOString(),
          })),
        });
      }

      const creationSnapshot = await buildLoanContractSnapshotTx(tx, createdLoan.id, {
        onboarding: {
          status: clientOnboarding.onboarding_status,
          blockers: clientOnboarding.blockers,
          guarantorCount: clientOnboarding.guarantor_count,
          collateralCount: clientOnboarding.collateral_count,
          readyForLoanApplication: clientOnboarding.ready_for_loan_application,
        },
        product: {
          id: selectedProduct.id,
          name: selectedProduct.name,
        },
        branchId: Number(branchId),
        officerId: selectedOfficerId,
      });

      await recordLoanContractVersionTx(tx, {
        loanId: createdLoan.id,
        eventType: "creation",
        note: "Loan application created",
        createdByUserId: user.sub,
        snapshotJson: creationSnapshot,
        principal: payload.principal,
        interestRate,
        termWeeks: payload.termWeeks,
        expectedTotal,
        repaidTotal: 0,
        balance: expectedTotal,
      });

      return createdLoan.id;
    }, isolationLevel ? { isolationLevel } : undefined);

    const maxLoanCreationAttempts = 3;
    let createdLoanId = 0;
    for (let attempt = 1; attempt <= maxLoanCreationAttempts; attempt += 1) {
      try {
        createdLoanId = await executeCreateLoanTransaction(Prisma.TransactionIsolationLevel.Serializable);
        break;
      } catch (error) {
        if (isUnsupportedIsolationLevelError(error)) {
          createdLoanId = await executeCreateLoanTransaction();
          break;
        }
        if (attempt >= maxLoanCreationAttempts || !isSerializableConflictError(error)) {
          throw error;
        }
      }
    }

    await writeAuditLog({
      userId: user.sub,
      action: "loan.created",
      targetType: "loan",
      targetId: createdLoanId,
      details: JSON.stringify({
        clientId: payload.clientId,
        principal: payload.principal,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        interestRate,
        termWeeks: payload.termWeeks,
        pricingOverridesApplied: hasPricingOverride,
        registrationFee,
        processingFee,
        branchId,
        officerId: selectedOfficerId,
        onboardingStatus: clientOnboarding.onboarding_status,
        autoLinkedGuarantors: clientOnboarding.guarantor_count,
        autoLinkedCollaterals: clientOnboarding.collateral_count,
      }),
      ipAddress: ipAddress || null,
    });

    const createdLoan = await prisma.loans.findUnique({
      where: { id: Number(createdLoanId) },
    });
    if (loanUnderwritingService) {
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
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const updateResult = await prisma.$transaction(async (tx) => {
      const loan = await tx.loans.findUnique({
        where: { id: Number(loanId) },
      });

      if (!loan) {
        throw new LoanNotFoundError();
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        throw new ForbiddenScopeError("Forbidden: loan is outside your scope");
      }
      if (String(loan.status || "").trim().toLowerCase() !== "pending_approval") {
        throw new LoanStateConflictError(
          "Only loans in pending_approval can be edited. Use loan lifecycle actions after approval or disbursement.",
          {
            loanId,
            status: loan.status,
          },
        );
      }

      const [installmentCount, repaymentCount, trancheCount] = await Promise.all([
        tx.loan_installments.count({ where: { loan_id: Number(loanId) } }),
        tx.repayments.count({ where: { loan_id: Number(loanId) } }),
        tx.loan_disbursement_tranches.count({ where: { loan_id: Number(loanId) } }),
      ]);
      if (Number(installmentCount || 0) > 0 || Number(repaymentCount || 0) > 0 || Number(trancheCount || 0) > 0) {
        throw new LoanStateConflictError("Loan details cannot be edited after financial execution records exist", {
          loanId,
          installmentCount,
          repaymentCount,
          trancheCount,
        });
      }

      const currentPrincipal = Number(loan.principal || 0);
      const currentTermWeeks = Number(loan.term_weeks || 0);
      const currentInterestRate = Number(loan.interest_rate || 0);
      const currentRegistrationFee = Number(loan.registration_fee || 0);
      const currentProcessingFee = Number(loan.processing_fee || 0);
      const currentExpectedTotal = Number(loan.expected_total || 0);
      const currentBalance = Number(loan.balance || 0);
      const repaidTotal = Number(loan.repaid_total || 0);

      const nextPrincipal = typeof payload.principal === "number" ? Number(payload.principal) : currentPrincipal;
      const nextTermWeeks = typeof payload.termWeeks === "number" ? Number(payload.termWeeks) : currentTermWeeks;
      const nextInterestRate = typeof payload.interestRate === "number" ? Number(payload.interestRate) : currentInterestRate;
      const nextRegistrationFee = typeof payload.registrationFee === "number" ? Number(payload.registrationFee) : currentRegistrationFee;
      const nextProcessingFee = typeof payload.processingFee === "number" ? Number(payload.processingFee) : currentProcessingFee;
      const nextExpectedTotal = Number(
        calculateExpectedTotal(nextPrincipal, nextInterestRate, nextTermWeeks).toFixed(2),
      );
      const nextBalance = Number(Math.max(0, nextExpectedTotal - repaidTotal).toFixed(2));
      const nextTermMonths = Math.max(1, Math.ceil(nextTermWeeks / 4));

      const changedFields: Record<string, { previous: number; next: number }> = {};
      if (nextPrincipal !== currentPrincipal) {
        changedFields.principal = { previous: currentPrincipal, next: nextPrincipal };
      }
      if (nextTermWeeks !== currentTermWeeks) {
        changedFields.termWeeks = { previous: currentTermWeeks, next: nextTermWeeks };
      }
      if (nextInterestRate !== currentInterestRate) {
        changedFields.interestRate = { previous: currentInterestRate, next: nextInterestRate };
      }
      if (nextRegistrationFee !== currentRegistrationFee) {
        changedFields.registrationFee = { previous: currentRegistrationFee, next: nextRegistrationFee };
      }
      if (nextProcessingFee !== currentProcessingFee) {
        changedFields.processingFee = { previous: currentProcessingFee, next: nextProcessingFee };
      }
      if (nextExpectedTotal !== currentExpectedTotal) {
        changedFields.expectedTotal = { previous: currentExpectedTotal, next: nextExpectedTotal };
      }
      if (nextBalance !== currentBalance) {
        changedFields.balance = { previous: currentBalance, next: nextBalance };
      }

      if (Object.keys(changedFields).length === 0) {
        return {
          updatedLoan: loan,
          changedFields,
          applied: false,
        };
      }

      const updatedLoan = await tx.loans.update({
        where: { id: Number(loanId) },
        data: {
          principal: nextPrincipal,
          interest_rate: nextInterestRate,
          term_weeks: nextTermWeeks,
          term_months: nextTermMonths,
          registration_fee: nextRegistrationFee,
          processing_fee: nextProcessingFee,
          expected_total: nextExpectedTotal,
          balance: nextBalance,
        },
      });

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

      return {
        updatedLoan,
        changedFields,
        applied: true,
      };
    }, { maxWait: 10000, timeout: 20000 });

    if (!updateResult.applied) {
      return {
        loan: updateResult.updatedLoan,
        applied: false,
        changedFields: updateResult.changedFields,
      };
    }

    if (loanUnderwritingService) {
      await loanUnderwritingService.refreshLoanAssessment(Number(loanId));
    }

    await writeAuditLog({
      userId: Number(user.sub),
      action: "loan.details.updated",
      targetType: "loan",
      targetId: Number(loanId),
      details: JSON.stringify({
        changes: updateResult.changedFields,
      }),
      ipAddress: ipAddress || null,
    });

    await invalidateReportCaches();
    return {
      loan: updateResult.updatedLoan,
      applied: true,
      changedFields: updateResult.changedFields,
    };
  }

  return {
    createLoan,
    updateLoanDetails,
  };
}

export {
  createLoanService,
};
