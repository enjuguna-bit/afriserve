import { Money } from "../../shared/value-objects/Money.js";
import { InterestRate } from "../value-objects/InterestRate.js";
import { LoanTerm } from "../value-objects/LoanTerm.js";
import type { ILoanRepository } from "../repositories/ILoanRepository.js";
import type { LoanId } from "../value-objects/LoanId.js";

export interface UnderwritingResult {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
  suggestedMaxPrincipal: number | null;
}

/**
 * Domain service: loan underwriting rules.
 * Wraps the eligibility checks currently scattered across loanLifecycleService
 * and loanUnderwritingService.ts into a single domain-layer service.
 */
export class LoanUnderwritingService {
  constructor(private readonly loanRepository: ILoanRepository) {}

  /**
   * Assesses whether a client can take a new loan.
   * @param clientOnboardingComplete - pre-fetched from client aggregate
   * @param clientIsActive - pre-fetched from client aggregate
   * @param clientKycVerified - pre-fetched from client aggregate
   */
  async assessNewLoanEligibility(params: {
    clientId: number;
    clientIsActive: boolean;
    clientKycVerified: boolean;
    clientOnboardingComplete: boolean;
    requestedPrincipal: Money;
    maxAllowedPrincipal?: number | null;
  }): Promise<UnderwritingResult> {
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!params.clientIsActive) {
      blockers.push("client_inactive");
    }
    if (!params.clientKycVerified) {
      blockers.push("kyc_not_verified");
    }
    if (!params.clientOnboardingComplete) {
      blockers.push("onboarding_incomplete");
    }

    const activeCount = await this.loanRepository.countActiveLoansByClientId(params.clientId);
    if (activeCount > 0) {
      blockers.push("existing_active_loan");
    }

    if (params.maxAllowedPrincipal != null) {
      if (params.requestedPrincipal.amount > params.maxAllowedPrincipal) {
        blockers.push("principal_exceeds_limit");
      }
    }

    return {
      eligible: blockers.length === 0,
      blockers,
      warnings,
      suggestedMaxPrincipal: params.maxAllowedPrincipal ?? null,
    };
  }
}
