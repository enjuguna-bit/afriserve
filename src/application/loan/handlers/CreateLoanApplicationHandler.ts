import type { CreateLoanApplicationCommand } from "../commands/LoanCommands.js";

interface LoanCreationWorkflowLike {
  createLoan: (args: {
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
      purpose?: string | null;
    };
    user: {
      sub: number;
      role?: string;
      roles?: string[];
      permissions?: string[];
      branchId?: number | null;
    };
    ipAddress: string | null | undefined;
  }) => Promise<Record<string, unknown> | null | undefined>;
}

export interface CreateLoanApplicationResult {
  loanId: number;
}

/**
 * Command handler: CreateLoanApplication
 *
 * Today this is intentionally a thin adapter over the authoritative
 * loanService.createLoan workflow. The aggregate-first implementation is not
 * production-ready because it does not yet reproduce pricing, KYC, branch,
 * and concurrency checks performed by the service layer.
 */
export class CreateLoanApplicationHandler {
  constructor(private readonly loanCreationWorkflow: LoanCreationWorkflowLike) {}

  async handle(command: CreateLoanApplicationCommand): Promise<CreateLoanApplicationResult> {
    const createdLoan = await this.loanCreationWorkflow.createLoan({
      payload: {
        clientId: command.clientId,
        principal: command.principal,
        termWeeks: command.termWeeks,
        productId: command.productId ?? undefined,
        // Only forward pricing overrides when explicitly set — undefined means
        // "derive from loan product".  Passing 0 would trigger hasPricingOverride
        // in loanService and override with zero rates, which is almost never intended.
        ...(typeof command.interestRate === "number" ? { interestRate: command.interestRate } : {}),
        ...(typeof command.registrationFee === "number" ? { registrationFee: command.registrationFee } : {}),
        ...(typeof command.processingFee === "number" ? { processingFee: command.processingFee } : {}),
        branchId: command.branchId ?? undefined,
        officerId: command.officerId ?? undefined,
        purpose: command.purpose ?? null,
      },
      user: {
        sub: command.createdByUserId,
        role: command.createdByRole ?? undefined,
        roles: command.createdByRoles,
        permissions: command.createdByPermissions,
        branchId: command.createdByBranchId ?? null,
      },
      ipAddress: command.ipAddress ?? null,
    });

    const loanId = Number(createdLoan?.["id"] || 0);
    if (!Number.isInteger(loanId) || loanId <= 0) {
      throw new Error("Loan creation workflow did not return a valid loan id");
    }

    return { loanId };
  }
}
