/**
 * Unit tests: shared and client/loan value objects.
 * Uses node:test — no server, no DB.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Money } from "../src/domain/shared/value-objects/Money.js";
import { DateRange } from "../src/domain/shared/value-objects/DateRange.js";
import { ClientId } from "../src/domain/client/value-objects/ClientId.js";
import { NationalId } from "../src/domain/client/value-objects/NationalId.js";
import { PhoneNumber } from "../src/domain/client/value-objects/PhoneNumber.js";
import { KycStatus } from "../src/domain/client/value-objects/KycStatus.js";
import { OnboardingStatus } from "../src/domain/client/value-objects/OnboardingStatus.js";
import { FeePaymentStatus } from "../src/domain/client/value-objects/FeePaymentStatus.js";
import { LoanId } from "../src/domain/loan/value-objects/LoanId.js";
import { InterestRate } from "../src/domain/loan/value-objects/InterestRate.js";
import { LoanTerm } from "../src/domain/loan/value-objects/LoanTerm.js";
import { LoanStatus } from "../src/domain/loan/value-objects/LoanStatus.js";

// ── Money ────────────────────────────────────────────────────────────────────

test("Money.fromNumber creates correct amount", () => {
  const m = Money.fromNumber(100);
  assert.equal(m.amount, 100);
  assert.equal(m.currency, "KES");
});

test("Money rounds to 2 decimal places on construction", () => {
  const m = Money.fromNumber(1.005);
  assert.equal(m.amount, 1.01);
});

test("Money.zero returns zero amount", () => {
  assert.equal(Money.zero().amount, 0);
});

test("Money.add produces correct sum", () => {
  const result = Money.fromNumber(100.50).add(Money.fromNumber(49.50));
  assert.equal(result.amount, 150);
});

test("Money.subtract works when result is positive", () => {
  const result = Money.fromNumber(200).subtract(Money.fromNumber(50));
  assert.equal(result.amount, 150);
});

test("Money.subtract throws when result would be negative", () => {
  assert.throws(
    () => Money.fromNumber(10).subtract(Money.fromNumber(20)),
    /negative/i,
  );
});

test("Money.multiply scales correctly", () => {
  assert.equal(Money.fromNumber(100).multiply(0.1).amount, 10);
});

test("Money.divide splits correctly", () => {
  assert.equal(Money.fromNumber(100).divide(4).amount, 25);
});

test("Money.divide throws on zero divisor", () => {
  assert.throws(() => Money.fromNumber(100).divide(0), /zero/i);
});

test("Money.isGreaterThan compares correctly", () => {
  assert.ok(Money.fromNumber(200).isGreaterThan(Money.fromNumber(100)));
  assert.ok(!Money.fromNumber(50).isGreaterThan(Money.fromNumber(100)));
});

test("Money.isZero returns true only for zero", () => {
  assert.ok(Money.zero().isZero());
  assert.ok(!Money.fromNumber(0.01).isZero());
});

test("Money.equals compares value and currency", () => {
  assert.ok(Money.fromNumber(100).equals(Money.fromNumber(100)));
  assert.ok(!Money.fromNumber(100).equals(Money.fromNumber(101)));
});

test("Money rejects negative values", () => {
  assert.throws(() => Money.fromNumber(-1), /negative/i);
});

test("Money rejects non-finite values", () => {
  assert.throws(() => Money.fromNumber(NaN), /Invalid/i);
  assert.throws(() => Money.fromNumber(Infinity), /Invalid/i);
});

test("Money currency mismatch throws on add", () => {
  const kes = Money.fromNumber(100, "KES");
  const usd = Money.fromNumber(100, "USD");
  assert.throws(() => kes.add(usd), /mismatch/i);
});

// ── DateRange ────────────────────────────────────────────────────────────────

test("DateRange.contains returns true for date within range", () => {
  const dr = DateRange.of(new Date("2025-01-01"), new Date("2025-12-31"));
  assert.ok(dr.contains(new Date("2025-06-15")));
});

test("DateRange.contains returns false outside range", () => {
  const dr = DateRange.of(new Date("2025-01-01"), new Date("2025-12-31"));
  assert.ok(!dr.contains(new Date("2026-01-01")));
});

test("DateRange rejects end before start", () => {
  assert.throws(
    () => DateRange.of(new Date("2025-12-31"), new Date("2025-01-01")),
    /end must be/i,
  );
});

// ── ClientId ─────────────────────────────────────────────────────────────────

test("ClientId.fromNumber accepts positive integer", () => {
  assert.equal(ClientId.fromNumber(42).value, 42);
});

test("ClientId rejects zero and negative", () => {
  assert.throws(() => ClientId.fromNumber(0));
  assert.throws(() => ClientId.fromNumber(-1));
});

test("ClientId.equals works", () => {
  assert.ok(ClientId.fromNumber(1).equals(ClientId.fromNumber(1)));
  assert.ok(!ClientId.fromNumber(1).equals(ClientId.fromNumber(2)));
});

// ── NationalId ───────────────────────────────────────────────────────────────

test("NationalId stores trimmed raw value", () => {
  const n = NationalId.fromString("  12345678  ");
  assert.equal(n.raw, "12345678");
});

test("NationalId.normalized is lowercase", () => {
  assert.equal(NationalId.fromString("ABC123").normalized, "abc123");
});

test("NationalId.equals ignores case", () => {
  assert.ok(NationalId.fromString("ABCD").equals(NationalId.fromString("abcd")));
});

test("NationalId rejects too-short values", () => {
  assert.throws(() => NationalId.fromString("AB"), /at least 4/i);
});

// ── PhoneNumber ──────────────────────────────────────────────────────────────

test("PhoneNumber stores raw value", () => {
  assert.equal(PhoneNumber.fromString("+254700000001").raw, "+254700000001");
});

test("PhoneNumber.digits strips non-numeric chars", () => {
  assert.equal(PhoneNumber.fromString("+254-700-000001").digits, "254700000001");
});

test("PhoneNumber rejects too-short values", () => {
  assert.throws(() => PhoneNumber.fromString("123"), /at least 6/i);
});

// ── KycStatus ────────────────────────────────────────────────────────────────

test("KycStatus.fromString round-trips known values", () => {
  for (const v of ["pending", "in_review", "verified", "rejected", "suspended"]) {
    assert.equal(KycStatus.fromString(v).value, v);
  }
});

test("KycStatus.fromString rejects unknown value", () => {
  assert.throws(() => KycStatus.fromString("expired"), /Invalid KYC/i);
});

test("KycStatus predicate helpers work", () => {
  assert.ok(KycStatus.pending().isPending());
  assert.ok(KycStatus.verified().isVerified());
  assert.ok(KycStatus.suspended().isSuspended());
});

test("KycStatus.canTransitionTo enforces allowed paths", () => {
  assert.ok(KycStatus.pending().canTransitionTo(KycStatus.inReview()));
  assert.ok(!KycStatus.pending().canTransitionTo(KycStatus.verified()));
  assert.ok(KycStatus.inReview().canTransitionTo(KycStatus.verified()));
  assert.ok(!KycStatus.verified().canTransitionTo(KycStatus.inReview()));
  assert.ok(KycStatus.rejected().canTransitionTo(KycStatus.pending()));
  assert.ok(KycStatus.suspended().canTransitionTo(KycStatus.pending()));
});

// ── OnboardingStatus ─────────────────────────────────────────────────────────

test("OnboardingStatus.derive returns registered when kyc not started", () => {
  const s = OnboardingStatus.derive({ kycStatus: "pending", hasGuarantor: false, hasCollateral: false, feesPaid: false });
  assert.ok(s.isRegistered());
});

test("OnboardingStatus.derive returns kyc_pending when in_review", () => {
  const s = OnboardingStatus.derive({ kycStatus: "in_review", hasGuarantor: false, hasCollateral: false, feesPaid: false });
  assert.ok(s.isKycPending());
});

test("OnboardingStatus.derive returns kyc_verified when verified but missing guarantor", () => {
  const s = OnboardingStatus.derive({ kycStatus: "verified", hasGuarantor: false, hasCollateral: true, feesPaid: true });
  assert.ok(s.isKycVerified());
});

test("OnboardingStatus.derive returns complete when all conditions met", () => {
  const s = OnboardingStatus.derive({ kycStatus: "verified", hasGuarantor: true, hasCollateral: true, feesPaid: true });
  assert.ok(s.isComplete());
});

test("OnboardingStatus.derive treats suspended as kyc_pending", () => {
  const s = OnboardingStatus.derive({ kycStatus: "suspended", hasGuarantor: true, hasCollateral: true, feesPaid: true });
  assert.ok(s.isKycPending());
});

// ── FeePaymentStatus ─────────────────────────────────────────────────────────

test("FeePaymentStatus.isSettled returns true for paid and waived", () => {
  assert.ok(FeePaymentStatus.paid().isSettled());
  assert.ok(FeePaymentStatus.waived().isSettled());
  assert.ok(!FeePaymentStatus.unpaid().isSettled());
});

// ── LoanId / InterestRate / LoanTerm / LoanStatus ────────────────────────────

test("LoanId rejects non-positive values", () => {
  assert.throws(() => LoanId.fromNumber(0));
  assert.throws(() => LoanId.fromNumber(-5));
});

test("InterestRate rejects out-of-range values", () => {
  assert.throws(() => InterestRate.fromPercentage(-1));
  assert.throws(() => InterestRate.fromPercentage(101));
});

test("InterestRate.asFactor divides by 100", () => {
  assert.equal(InterestRate.fromPercentage(10).asFactor(), 0.1);
});

test("LoanTerm.fromWeeks stores weeks correctly", () => {
  const t = LoanTerm.fromWeeks(4);
  assert.equal(t.weeks, 4);
});

test("LoanTerm.fromMonths converts to weeks", () => {
  const t = LoanTerm.fromMonths(1);
  assert.ok(t.weeks >= 4 && t.weeks <= 5);
});

test("LoanTerm rejects zero or negative weeks", () => {
  assert.throws(() => LoanTerm.fromWeeks(0));
  assert.throws(() => LoanTerm.fromWeeks(-1));
});

test("LoanStatus.fromString round-trips all known values", () => {
  const values = ["pending_approval", "approved", "active", "closed", "rejected", "restructured", "written_off"];
  for (const v of values) {
    assert.equal(LoanStatus.fromString(v).value, v);
  }
});

test("LoanStatus.fromString rejects unknown value", () => {
  assert.throws(() => LoanStatus.fromString("unknown_status"), /Invalid loan status/i);
});

test("LoanStatus.isDisbursed returns true for active, overdue, and restructured", () => {
  assert.ok(LoanStatus.active().isDisbursed());
  assert.ok(LoanStatus.overdue().isDisbursed());
  assert.ok(LoanStatus.restructured().isDisbursed());
  assert.ok(!LoanStatus.approved().isDisbursed());
  assert.ok(!LoanStatus.closed().isDisbursed());
});
test("LoanStatus.isTerminal returns true for closed, written_off, rejected", () => {
  assert.ok(LoanStatus.closed().isTerminal());
  assert.ok(LoanStatus.writtenOff().isTerminal());
  assert.ok(LoanStatus.rejected().isTerminal());
  assert.ok(!LoanStatus.active().isTerminal());
});
