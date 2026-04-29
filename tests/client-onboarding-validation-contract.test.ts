import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveOnboardingNextStep,
  deriveOnboardingStatus,
} from "../src/services/client/clientValidation.js";

const basePayload = {
  hasProfilePhoto: true,
  hasPinnedLocation: true,
  kycStatus: "verified",
  hasGuarantor: true,
  guarantorDocumentsComplete: true,
  hasCollateral: true,
  collateralDocumentsComplete: true,
  feesPaid: true,
};

describe("client onboarding validation contract", () => {
  it("only marks onboarding complete when profile, KYC, documents, and fees are all present", () => {
    assert.equal(deriveOnboardingStatus(basePayload), "complete");
    assert.equal(
      deriveOnboardingStatus({
        ...basePayload,
        hasProfilePhoto: false,
      }),
      "kyc_verified",
    );
    assert.equal(
      deriveOnboardingStatus({
        ...basePayload,
        hasPinnedLocation: false,
      }),
      "kyc_verified",
    );
    assert.equal(
      deriveOnboardingStatus({
        ...basePayload,
        guarantorDocumentsComplete: false,
      }),
      "kyc_verified",
    );
    assert.equal(
      deriveOnboardingStatus({
        ...basePayload,
        collateralDocumentsComplete: false,
      }),
      "kyc_verified",
    );
  });

  it("surfaces the next blocking onboarding step in the same order the mobile flow expects", () => {
    assert.equal(
      deriveOnboardingNextStep({
        ...basePayload,
        hasPinnedLocation: false,
      }),
      "capture_location",
    );
    assert.equal(
      deriveOnboardingNextStep({
        ...basePayload,
        kycStatus: "pending",
        hasProfilePhoto: false,
      }),
      "start_kyc",
    );
    assert.equal(
      deriveOnboardingNextStep({
        ...basePayload,
        hasGuarantor: true,
        guarantorDocumentsComplete: false,
      }),
      "complete_guarantor_documents",
    );
    assert.equal(
      deriveOnboardingNextStep({
        ...basePayload,
        hasCollateral: true,
        collateralDocumentsComplete: false,
      }),
      "complete_collateral_documents",
    );
    assert.equal(
      deriveOnboardingNextStep({
        ...basePayload,
        feesPaid: false,
      }),
      "record_fee_payment",
    );
  });
});
