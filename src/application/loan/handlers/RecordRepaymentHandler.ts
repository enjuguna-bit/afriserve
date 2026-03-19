import type { ILoanRepository } from "../../../domain/loan/repositories/ILoanRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { RecordRepaymentCommand } from "../commands/LoanCommands.js";
import { LoanId } from "../../../domain/loan/value-objects/LoanId.js";
import { Money } from "../../../domain/shared/value-objects/Money.js";

export interface RecordRepaymentResult {
  loanId: number;
  remainingBalance: number;
  isFullyRepaid: boolean;
}

/**
 * Command handler: RecordRepayment
 *
 * Loads the Loan aggregate, calls recordRepayment(), persists, and publishes
 * events (RepaymentRecorded + LoanFullyRepaid when applicable).
 */
export class RecordRepaymentHandler {
  constructor(
    private readonly loanRepository: ILoanRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: RecordRepaymentCommand): Promise<RecordRepaymentResult> {
    const loan = await this.loanRepository.findById(LoanId.fromNumber(command.loanId));
    if (!loan) {
      throw new Error(`Loan ${command.loanId} not found`);
    }

    loan.recordRepayment({
      amount: Money.fromNumber(command.amount),
      recordedByUserId: command.recordedByUserId,
      externalReference: command.externalReference ?? null,
      occurredAt: command.occurredAt,
    });

    await this.loanRepository.save(loan);
    await this.eventBus.publishAll(loan.getUncommittedEvents());
    loan.clearEvents();

    return {
      loanId: loan.id.value,
      remainingBalance: loan.balance.amount,
      isFullyRepaid: loan.isFullyRepaid(),
    };
  }
}
