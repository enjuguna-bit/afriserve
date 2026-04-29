import type { ILoanRepository } from "../../../domain/loan/repositories/ILoanRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { RejectLoanCommand } from "../commands/LoanCommands.js";
import { LoanId } from "../../../domain/loan/value-objects/LoanId.js";
import { ForbiddenActionError, LoanNotFoundError } from "../../../domain/errors.js";

export interface RejectLoanResult {
  loanId: number;
  rejectedAt: string;
  reason: string;
}

/**
 * Command handler: RejectLoan
 *
 * Loads the Loan aggregate, calls reject(), persists, and publishes events.
 */
export class RejectLoanHandler {
  constructor(
    private readonly loanRepository: ILoanRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: RejectLoanCommand): Promise<RejectLoanResult> {
    const loan = await this.loanRepository.findById(LoanId.fromNumber(command.loanId));
    if (!loan) {
      throw new LoanNotFoundError();
    }

    const rejectorRole = String(command.rejectedByRole || "").trim().toLowerCase();
    const isAdminRejector = rejectorRole === "admin";
    if (!isAdminRejector) {
      if (Number(loan.createdByUserId || 0) === Number(command.rejectedByUserId || 0)) {
        throw new ForbiddenActionError("Maker-Checker violation: You cannot reject a loan you created");
      }
      if (Number(loan.officerId || 0) > 0 && Number(loan.officerId || 0) === Number(command.rejectedByUserId || 0)) {
        throw new ForbiddenActionError("Maker-Checker violation: You cannot reject a loan you are assigned to as officer");
      }
    }

    loan.reject(command.rejectedByUserId, command.reason);

    await this.loanRepository.save(loan);
    await this.eventBus.publishAll(loan.getUncommittedEvents());
    loan.clearEvents();

    return {
      loanId: loan.id.value,
      rejectedAt: new Date().toISOString(),
      reason: command.reason,
    };
  }
}
