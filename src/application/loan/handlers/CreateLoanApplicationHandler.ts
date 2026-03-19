import type { ILoanRepository } from "../../../domain/loan/repositories/ILoanRepository.js";
import type { IClientRepository } from "../../../domain/client/repositories/IClientRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { CreateLoanApplicationCommand } from "../commands/LoanCommands.js";
import { Loan } from "../../../domain/loan/entities/Loan.js";
import { LoanId } from "../../../domain/loan/value-objects/LoanId.js";
import { Money } from "../../../domain/shared/value-objects/Money.js";
import { InterestRate } from "../../../domain/loan/value-objects/InterestRate.js";
import { LoanTerm } from "../../../domain/loan/value-objects/LoanTerm.js";
import { ClientId } from "../../../domain/client/value-objects/ClientId.js";

export interface CreateLoanApplicationResult {
  loanId: number;
}

/**
 * Command handler: CreateLoanApplication
 *
 * Validates client eligibility, builds the Loan aggregate, persists it,
 * and publishes the uncommitted domain events to the event bus.
 */
export class CreateLoanApplicationHandler {
  constructor(
    private readonly loanRepository: ILoanRepository,
    private readonly clientRepository: IClientRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: CreateLoanApplicationCommand): Promise<CreateLoanApplicationResult> {
    // 1. Verify client exists and is ready for a loan
    const client = await this.clientRepository.findById(
      ClientId.fromNumber(command.clientId),
    );
    if (!client) {
      throw new Error(`Client ${command.clientId} not found`);
    }
    if (!client.isReadyForLoan()) {
      throw new Error(
        `Client ${command.clientId} is not eligible for a loan ` +
        `(KYC status: ${client.kycStatus.value}, onboarding: ${client.onboardingStatus.value})`,
      );
    }

    // 2. Build the aggregate
    const loan = Loan.createApplication({
      id: command.id,
      clientId: command.clientId,
      productId: command.productId ?? null,
      branchId: command.branchId ?? null,
      createdByUserId: command.createdByUserId,
      officerId: command.officerId ?? null,
      principal: Money.fromNumber(command.principal),
      interestRate: InterestRate.fromPercentage(command.interestRate),
      term: LoanTerm.fromWeeks(command.termWeeks, command.termMonths),
      registrationFee: Money.fromNumber(command.registrationFee),
      processingFee: Money.fromNumber(command.processingFee),
      expectedTotal: Money.fromNumber(command.expectedTotal),
    });

    // 3. Persist
    await this.loanRepository.save(loan);

    // 4. Publish domain events
    await this.eventBus.publishAll(loan.getUncommittedEvents());
    loan.clearEvents();

    return { loanId: loan.id.value };
  }
}
