import type { LoanApplicationSubmitted } from "../../../domain/loan/events/LoanApplicationSubmitted.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";

type LoanApplicationSubmittedLike = Pick<LoanApplicationSubmitted, "loanId">;

type LoanUnderwritingRefreshSagaDeps = {
  loanUnderwritingService: {
    refreshLoanAssessment: (loanId: number) => Promise<unknown>;
  };
};

export class LoanUnderwritingRefreshSaga {
  constructor(private readonly deps: LoanUnderwritingRefreshSagaDeps) {}

  register(eventBus: IEventBus): void {
    eventBus.subscribe<LoanApplicationSubmitted>("loan.application.submitted", async (event) => {
      await this.handle(event);
    });
  }

  async handle(event: LoanApplicationSubmittedLike): Promise<void> {
    await this.deps.loanUnderwritingService.refreshLoanAssessment(Number(event.loanId));
  }
}
