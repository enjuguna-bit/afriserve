/**
 * Unit tests: domain services.
 * ClientGraduationService, ClientOnboardingService (stub repo), RepaymentScheduleService, PenaltyCalculationService.
 * Pure in-memory — no server, no DB.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ClientGraduationService } from "../src/domain/client/services/ClientGraduationService.js";
import { ClientOnboardingService } from "../src/domain/client/services/ClientOnboardingService.js";
import { RepaymentScheduleService } from "../src/domain/loan/services/RepaymentScheduleService.js";
import { PenaltyCalculationService } from "../src/domain/loan/services/PenaltyCalculationService.js";
import { Money } from "../src/domain/shared/value-objects/Money.js";
import { LoanTerm } from "../src/domain/loan/value-objects/LoanTerm.js";
import { KycStatus } from "../src/domain/client/value-objects/KycStatus.js";
import type { IClientRepository } from "../src/domain/client/repositories/IClientRepository.js";

// ── ClientGraduationService ───────────────────────────────────────────────────

const graduation = new ClientGraduationService();

test("computeGraduatedLimit returns 0 for empty history", () => {
  assert.equal(graduation.computeGraduatedLimit([]), 0);
});

test("computeGraduatedLimit returns 3000 for excellent first loan", () => {
  const result = graduation.computeGraduatedLimit([{
    principal: 1000, expectedTotal: 1200, totalRepaid: 1200,
    repaymentCount: 8, firstPaidAt: "2025-01-07", lastPaidAt: "2025-02-25",
  }]);
  assert.equal(result, 3000);
});

test("computeGraduatedLimit returns 2000 for good (>=95%) first loan", () => {
  const result = graduation.computeGraduatedLimit([{
    principal: 1000, expectedTotal: 1200, totalRepaid: 1160,
    repaymentCount: 4, firstPaidAt: "2025-01-07", lastPaidAt: "2025-02-25",
  }]);
  assert.equal(result, 2000);
});

test("computeGraduatedLimit returns principal for poor repayment first loan", () => {
  const result = graduation.computeGraduatedLimit([{
    principal: 1000, expectedTotal: 1200, totalRepaid: 900,
    repaymentCount: 3, firstPaidAt: "2025-01-07", lastPaidAt: "2025-03-01",
  }]);
  assert.equal(result, 1000);
});

test("computeGraduatedLimit returns 3000 for two consecutive excellent loans", () => {
  const excellentLoan = {
    principal: 2000, expectedTotal: 2400, totalRepaid: 2400,
    repaymentCount: 8, firstPaidAt: "2025-01-07", lastPaidAt: "2025-02-25",
  };
  assert.equal(graduation.computeGraduatedLimit([excellentLoan, excellentLoan]), 3000);
});

test("computeGraduatedLimit returns 2000 for two loans with only one excellent", () => {
  const excellentLoan = {
    principal: 2000, expectedTotal: 2400, totalRepaid: 2400,
    repaymentCount: 8, firstPaidAt: "2025-01-07", lastPaidAt: "2025-02-25",
  };
  const averageLoan = {
    principal: 2000, expectedTotal: 2400, totalRepaid: 2100,
    repaymentCount: 3, firstPaidAt: "2025-03-07", lastPaidAt: "2025-05-01",
  };
  assert.equal(graduation.computeGraduatedLimit([excellentLoan, averageLoan]), 2000);
});

test("computeGraduatedLimit returns 0 for zero expectedTotal", () => {
  const result = graduation.computeGraduatedLimit([{
    principal: 0, expectedTotal: 0, totalRepaid: 0,
    repaymentCount: 0, firstPaidAt: null, lastPaidAt: null,
  }]);
  assert.equal(result, 0);
});

// ── ClientOnboardingService ────────────────────────────────────────────────────

function makeStubRepo(overrides: Partial<IClientRepository> = {}): IClientRepository {
  return {
    create: async () => 0,
    save: async () => {},
    findById: async () => null,
    findByNationalId: async () => null,
    findByPhone: async () => null,
    exists: async () => false,
    findByBranch: async () => [],
    countByBranch: async () => 0,
    ...overrides,
  };
}

const onboarding = new ClientOnboardingService(makeStubRepo());

test("checkHardDuplicates returns empty array when no matches", async () => {
  const result = await onboarding.checkHardDuplicates({ nationalId: "12345678", phone: "+254700000001" });
  assert.equal(result.length, 0);
});

test("nextOnboardingStep returns start_kyc when pending", () => {
  const step = onboarding.nextOnboardingStep({
    kycStatus: KycStatus.pending(), hasGuarantor: false, hasCollateral: false, feesPaid: false,
  });
  assert.equal(step, "start_kyc");
});

test("nextOnboardingStep returns complete_kyc_review when in_review", () => {
  const step = onboarding.nextOnboardingStep({
    kycStatus: KycStatus.inReview(), hasGuarantor: false, hasCollateral: false, feesPaid: false,
  });
  assert.equal(step, "complete_kyc_review");
});

test("nextOnboardingStep returns resubmit_kyc when rejected", () => {
  const step = onboarding.nextOnboardingStep({
    kycStatus: KycStatus.rejected(), hasGuarantor: false, hasCollateral: false, feesPaid: false,
  });
  assert.equal(step, "resubmit_kyc");
});

test("nextOnboardingStep returns resolve_kyc_hold when suspended", () => {
  const step = onboarding.nextOnboardingStep({
    kycStatus: KycStatus.suspended(), hasGuarantor: false, hasCollateral: false, feesPaid: false,
  });
  assert.equal(step, "resolve_kyc_hold");
});

test("nextOnboardingStep returns add_guarantor after KYC verified", () => {
  const step = onboarding.nextOnboardingStep({
    kycStatus: KycStatus.verified(), hasGuarantor: false, hasCollateral: true, feesPaid: true,
  });
  assert.equal(step, "add_guarantor");
});

test("nextOnboardingStep returns add_collateral when guarantor present but no collateral", () => {
  const step = onboarding.nextOnboardingStep({
    kycStatus: KycStatus.verified(), hasGuarantor: true, hasCollateral: false, feesPaid: true,
  });
  assert.equal(step, "add_collateral");
});

test("nextOnboardingStep returns record_fee_payment when fees not paid", () => {
  const step = onboarding.nextOnboardingStep({
    kycStatus: KycStatus.verified(), hasGuarantor: true, hasCollateral: true, feesPaid: false,
  });
  assert.equal(step, "record_fee_payment");
});

test("nextOnboardingStep returns null when fully onboarded", () => {
  const step = onboarding.nextOnboardingStep({
    kycStatus: KycStatus.verified(), hasGuarantor: true, hasCollateral: true, feesPaid: true,
  });
  assert.equal(step, null);
});

test("checkHardDuplicates detects nationalId conflict", async () => {
  const fakeClient = { id: { value: 99 } } as any;
  const repo = makeStubRepo({ findByNationalId: async () => fakeClient });
  const svc = new ClientOnboardingService(repo);
  const result = await svc.checkHardDuplicates({ nationalId: "12345678" });
  assert.equal(result.length, 1);
  assert.equal(result[0].field, "nationalId");
  assert.equal(result[0].existingClientId, 99);
});

test("checkHardDuplicates excludes self when excludeClientId provided", async () => {
  const fakeClient = { id: { value: 99 } } as any;
  const repo = makeStubRepo({ findByNationalId: async () => fakeClient });
  const svc = new ClientOnboardingService(repo);
  const result = await svc.checkHardDuplicates({ nationalId: "12345678", excludeClientId: 99 });
  assert.equal(result.length, 0);
});

// ── RepaymentScheduleService ──────────────────────────────────────────────────

const schedule = new RepaymentScheduleService();

function addBusinessDaysIso(iso: string, businessDays: number) {
  const d = new Date(iso);
  let counted = 0;
  while (counted < businessDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0) {
      continue;
    }
    counted += 1;
  }
  return d.toISOString();
}

test("buildInstallmentAmounts returns correct number of entries", () => {
  const amounts = schedule.buildInstallmentAmounts(Money.fromNumber(1200), LoanTerm.fromWeeks(4));
  assert.equal(amounts.length, 4);
});

test("buildInstallmentAmounts sums to expectedTotal exactly", () => {
  const amounts = schedule.buildInstallmentAmounts(Money.fromNumber(1000), LoanTerm.fromWeeks(3));
  const sum = amounts.reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 100), Math.round(1000 * 100));
});

test("buildInstallmentAmounts handles indivisible amounts via last-entry delta", () => {
  // 1000 / 3 = 333.33... so last entry should compensate
  const amounts = schedule.buildInstallmentAmounts(Money.fromNumber(1000), LoanTerm.fromWeeks(3));
  const sum = amounts.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1000) < 0.01);
});

test("generateSchedule returns entries with correct installmentNumbers", () => {
  const addWeeksIso = (iso: string, w: number) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + w * 7);
    return d.toISOString();
  };
  const entries = schedule.generateSchedule({
    expectedTotal: Money.fromNumber(1200),
    term: LoanTerm.fromWeeks(4),
    startDate: new Date("2025-01-01"),
    addWeeksIso,
  });
  assert.equal(entries.length, 4);
  assert.equal(entries[0].installmentNumber, 1);
  assert.equal(entries[3].installmentNumber, 4);
  assert.equal(entries[0].status, "pending");
});

test("buildInstallmentAmounts supports business-daily cadence across the loan term", () => {
  const amounts = schedule.buildInstallmentAmounts(
    Money.fromNumber(1200),
    LoanTerm.fromWeeks(2),
    "business_daily",
  );
  assert.equal(amounts.length, 12);
  const sum = amounts.reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 100), Math.round(1200 * 100));
});

test("generateSchedule supports business-daily cadence and skips Sundays", () => {
  const addWeeksIso = (iso: string, w: number) => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + (w * 7));
    return d.toISOString();
  };

  const entries = schedule.generateSchedule({
    expectedTotal: Money.fromNumber(600),
    term: LoanTerm.fromWeeks(1),
    startDate: new Date("2025-06-20T08:00:00.000Z"),
    addWeeksIso,
    cadence: "business_daily",
    addBusinessDaysIso,
  });

  assert.equal(entries.length, 6);
  assert.equal(entries[0].dueDate.slice(0, 10), "2025-06-21");
  assert.equal(entries[1].dueDate.slice(0, 10), "2025-06-23");
  assert.equal(entries[5].dueDate.slice(0, 10), "2025-06-27");
});

test("calculateFlatInterest computes P * R * T", () => {
  const interest = schedule.calculateFlatInterest(
    Money.fromNumber(1000),
    { percentage: 10, asFactor: () => 0.1 } as any,
    LoanTerm.fromWeeks(4),
  );
  // 1000 * 0.1 * (4 / 52) = 7.69
  assert.equal(interest.amount, 7.69);
});

// ── PenaltyCalculationService ─────────────────────────────────────────────────

const penalty = new PenaltyCalculationService();

test("calculateDailyFlatPenalty returns zero for daysOverdue=0", () => {
  const result = penalty.calculateDailyFlatPenalty(Money.fromNumber(1000), 0.5, 0);
  assert.equal(result.penaltyAmount.amount, 0);
  assert.equal(result.basis, "no_overdue");
});

test("calculateDailyFlatPenalty computes correctly", () => {
  // 0.5% per day * 10 days * 1000 = 50
  const result = penalty.calculateDailyFlatPenalty(Money.fromNumber(1000), 0.5, 10);
  assert.equal(result.penaltyAmount.amount, 50);
  assert.equal(result.daysOverdue, 10);
});

test("totalOverdueBalance sums outstanding amounts", () => {
  const installments = [
    { installmentId: 1, dueDate: "2025-01-01", amountDue: 300, amountPaid: 100, daysOverdue: 5 },
    { installmentId: 2, dueDate: "2025-01-08", amountDue: 300, amountPaid: 0, daysOverdue: 3 },
  ];
  const total = penalty.totalOverdueBalance(installments);
  assert.equal(total.amount, 500);
});

test("totalOverdueBalance clamps negative partial-paid to zero", () => {
  const installments = [
    { installmentId: 1, dueDate: "2025-01-01", amountDue: 100, amountPaid: 200, daysOverdue: 1 },
  ];
  const total = penalty.totalOverdueBalance(installments);
  assert.equal(total.amount, 0);
});
