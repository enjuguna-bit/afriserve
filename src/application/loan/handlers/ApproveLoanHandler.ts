import type { ILoanRepository } from "../../../domain/loan/repositories/ILoanRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { ApproveLoanCommand } from "../commands/LoanCommands.js";
import { LoanId } from "../../../domain/loan/value-objects/LoanId.js";
import { ForbiddenActionError, LoanNotFoundError } from "../../../domain/errors.js";

export interface ApproveLoanResult {
  loanId: number;
  approvedAt: string;
}

/**
 * Command handler: ApproveLoan
 *
 * Loads the Loan aggregate, calls approve(), persists, and publishes events.
 */
export class ApproveLoanHandler {
  constructor(
    private readonly loanRepository: ILoanRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: ApproveLoanCommand): Promise<ApproveLoanResult> {
    const loan = await this.loanRepository.findById(LoanId.fromNumber(command.loanId));
    if (!loan) {
      throw new LoanNotFoundError();
    }

    const approverRole = String(command.approvedByRole || "").trim().toLowerCase();
    const isAdminApprover = approverRole === "admin";
    if (!isAdminApprover) {
      if (Number(loan.createdByUserId || 0) === Number(command.approvedByUserId || 0)) {
        throw new ForbiddenActionError("Maker-Checker violation: You cannot approve a loan you created");
      }
      if (Number(loan.officerId || 0) > 0 && Number(loan.officerId || 0) === Number(command.approvedByUserId || 0)) {
        throw new ForbiddenActionError("Maker-Checker violation: You cannot approve a loan you are assigned to as officer");
      }
    }

    loan.approve(command.approvedByUserId);

    await this.loanRepository.save(loan);
    await this.eventBus.publishAll(loan.getUncommittedEvents());
    loan.clearEvents();

    return {
      loanId: loan.id.value,
      approvedAt: loan.approvedAt!.toISOString(),
    };
  }
}
