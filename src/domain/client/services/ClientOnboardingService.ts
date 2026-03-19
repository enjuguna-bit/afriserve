import type { IClientRepository } from "../repositories/IClientRepository.js";
import { KycStatus } from "../value-objects/KycStatus.js";

/**
 * Domain service: rules around client onboarding readiness.
 * Does NOT touch persistence directly - uses the repository port.
 */
export class ClientOnboardingService {
  constructor(private readonly clientRepository: IClientRepository) {}

  /**
   * Checks whether national ID or phone already belongs to an existing client.
   * Returns an array of conflict descriptions (empty = no duplicates found).
   */
  async checkHardDuplicates(params: {
    nationalId?: string | null;
    phone?: string | null;
    excludeClientId?: number | null;
  }): Promise<Array<{ field: string; existingClientId: number }>> {
    const conflicts: Array<{ field: string; existingClientId: number }> = [];

    if (params.nationalId) {
      const match = await this.clientRepository.findByNationalId(params.nationalId);
      if (match && match.id.value !== (params.excludeClientId ?? -1)) {
        conflicts.push({ field: "nationalId", existingClientId: match.id.value });
      }
    }

    if (params.phone) {
      const match = await this.clientRepository.findByPhone(params.phone);
      if (match && match.id.value !== (params.excludeClientId ?? -1)) {
        conflicts.push({ field: "phone", existingClientId: match.id.value });
      }
    }

    return conflicts;
  }

  /**
   * Returns the next KYC step label for a client.
   * Mirrors the deriveOnboardingNextStep() logic in clientRouteService.
   */
  nextOnboardingStep(params: {
    kycStatus: KycStatus;
    hasGuarantor: boolean;
    hasCollateral: boolean;
    feesPaid: boolean;
  }): string | null {
    if (!params.kycStatus.isVerified()) {
      if (params.kycStatus.isInReview()) return "complete_kyc_review";
      if (params.kycStatus.isRejected()) return "resubmit_kyc";
      if (params.kycStatus.isSuspended()) return "resolve_kyc_hold";
      return "start_kyc";
    }
    if (!params.hasGuarantor) return "add_guarantor";
    if (!params.hasCollateral) return "add_collateral";
    if (!params.feesPaid) return "record_fee_payment";
    return null;
  }
}
