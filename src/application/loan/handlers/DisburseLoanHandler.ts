import type { ILoanRepository } from "../../../domain/loan/repositories/ILoanRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { DisburseLoanCommand } from "../commands/LoanCommands.js";
import { LoanId } from "../../../domain/loan/value-objects/LoanId.js";

export interface DisburseLoanResult {
  loanId: number;
  disbursedAt: string;
  externalReference: string | null;
}

/**
 * Command handler: DisburseLoan
 *
 * Loads the Loan aggregate, calls disburse(), persists, and publishes events.
 * Mobile money and GL side-effects are handled by event subscribers
 * (see LoanDisbursementSaga) so this handler stays lean.
 */
export class DisburseLoanHandler {
  constructor(
    private readonly loanRepository: ILoanRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: DisburseLoanCommand): Promise<DisburseLoanResult> {
    const loan = await this.loanRepository.findById(LoanId.fromNumber(command.loanId));
    if (!loan) {
      throw new Error(`Loan ${command.loanId} not found`);
    }

    loan.disburse({
      disbursedByUserId: command.disbursedByUserId,
      disbursedAt: command.disbursedAt,
      disbursementNote: command.disbursementNote ?? null,
      externalReference: command.externalReference ?? null,
    });

    await this.loanRepository.save(loan);
    await this.eventBus.publishAll(loan.getUncommittedEvents());
    loan.clearEvents();

    return {
      loanId: loan.id.value,
      disbursedAt: loan.disbursedAt!.toISOString(),
      externalReference: command.externalReference ?? null,
    };
  }
}
