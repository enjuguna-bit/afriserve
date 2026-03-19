/**
 * Unit tests: Client aggregate root.
 * Pure in-memory — no server, no DB.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { Client } from "../src/domain/client/entities/Client.js";
import { ClientGuarantor } from "../src/domain/client/entities/ClientGuarantor.js";
import { ClientCollateral } from "../src/domain/client/entities/ClientCollateral.js";
import { KycStatus } from "../src/domain/client/value-objects/KycStatus.js";
import { OnboardingStatus } from "../src/domain/client/value-objects/OnboardingStatus.js";
import { FeePaymentStatus } from "../src/domain/client/value-objects/FeePaymentStatus.js";
import { PhoneNumber } from "../src/domain/client/value-objects/PhoneNumber.js";
import { NationalId } from "../src/domain/client/value-objects/NationalId.js";
import { ClientId } from "../src/domain/client/value-objects/ClientId.js";

function makeClient(overrides: Record<string, any> = {}) {
  return Client.create({
    id: overrides.id ?? 1,
    fullName: overrides.fullName ?? "Jane Mwangi",
    phone: overrides.phone ?? PhoneNumber.fromString("+254700000001"),
    nationalId: overrides.nationalId ?? NationalId.fromString("12345678"),
    branchId: overrides.branchId ?? 10,
    officerId: overrides.officerId ?? null,
    createdByUserId: overrides.createdByUserId ?? 99,
  });
}

test("Client.create sets default KYC status to pending", () => {
  assert.ok(makeClient().kycStatus.isPending());
});

test("Client.create sets default onboarding status to registered", () => {
  assert.ok(makeClient().onboardingStatus.isRegistered());
});

test("Client.create sets default fee payment status to unpaid", () => {
  assert.ok(makeClient().feePaymentStatus.isUnpaid());
});

test("Client.create sets isActive to true", () => {
  const c = makeClient();
  assert.ok(c.isActive);
  assert.equal(c.deletedAt, null);
});

test("Client.create emits ClientCreated event", () => {
  const c = makeClient();
  const events = c.getUncommittedEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "client.created");
});

test("Client.create event carries correct clientId and branchId", () => {
  const c = makeClient({ id: 42, branchId: 7 });
  const ev = c.getUncommittedEvents()[0] as any;
  assert.equal(ev.clientId, 42);
  assert.equal(ev.branchId, 7);
});

test("Client.clearEvents empties the event list", () => {
  const c = makeClient();
  c.clearEvents();
  assert.equal(c.getUncommittedEvents().length, 0);
});

test("updateKycStatus changes kycStatus and emits event", () => {
  const c = makeClient();
  c.clearEvents();
  c.updateKycStatus(KycStatus.inReview(), 5);
  assert.ok(c.kycStatus.isInReview());
  const events = c.getUncommittedEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "client.kyc_status.updated");
});

test("updateKycStatus to same value is idempotent (no event)", () => {
  const c = makeClient();
  c.clearEvents();
  c.updateKycStatus(KycStatus.pending(), 5);
  assert.equal(c.getUncommittedEvents().length, 0);
});

test("updateKycStatus event carries previousStatus and nextStatus", () => {
  const c = makeClient();
  c.clearEvents();
  c.updateKycStatus(KycStatus.inReview(), 5, "looks good");
  const ev = c.getUncommittedEvents()[0] as any;
  assert.equal(ev.previousStatus, "pending");
  assert.equal(ev.nextStatus, "in_review");
  assert.equal(ev.note, "looks good");
});

test("updateKycStatus sets updatedAt", () => {
  const c = makeClient();
  const before = new Date();
  c.updateKycStatus(KycStatus.verified(), 1);
  assert.ok(c.updatedAt !== null && c.updatedAt >= before);
});

test("recordFeePayment sets fee status to paid", () => {
  const c = makeClient();
  c.recordFeePayment({ paidAt: new Date().toISOString(), recordedByUserId: 1 });
  assert.ok(c.feePaymentStatus.isPaid());
});

test("recordFeePayment sets feesPaidAt", () => {
  const c = makeClient();
  const iso = "2025-06-01T00:00:00.000Z";
  c.recordFeePayment({ paidAt: iso, recordedByUserId: 1 });
  assert.ok(c.feesPaidAt !== null);
  assert.equal(c.feesPaidAt!.toISOString(), iso);
});

test("recordFeePayment emits ClientFeesPaid event", () => {
  const c = makeClient();
  c.clearEvents();
  c.recordFeePayment({ amount: 500, paymentReference: "REF-001", paidAt: new Date().toISOString(), recordedByUserId: 1 });
  const events = c.getUncommittedEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "client.fees.recorded");
});

test("recordFeePayment event carries amount and paymentReference", () => {
  const c = makeClient();
  c.clearEvents();
  c.recordFeePayment({ amount: 750, paymentReference: "REF-XYZ", paidAt: new Date().toISOString(), recordedByUserId: 2 });
  const ev = c.getUncommittedEvents()[0] as any;
  assert.equal(ev.amount, 750);
  assert.equal(ev.paymentReference, "REF-XYZ");
});

test("syncOnboardingStatus advances to complete when all conditions met", () => {
  const c = makeClient();
  c.updateKycStatus(KycStatus.verified(), 1);
  c.recordFeePayment({ paidAt: new Date().toISOString(), recordedByUserId: 1 });
  c.syncOnboardingStatus({ hasGuarantor: true, hasCollateral: true });
  assert.ok(c.onboardingStatus.isComplete());
});

test("syncOnboardingStatus stays at kyc_verified if missing guarantor", () => {
  const c = makeClient();
  c.updateKycStatus(KycStatus.verified(), 1);
  c.recordFeePayment({ paidAt: new Date().toISOString(), recordedByUserId: 1 });
  c.syncOnboardingStatus({ hasGuarantor: false, hasCollateral: true });
  assert.ok(c.onboardingStatus.isKycVerified());
});

test("syncOnboardingStatus stays at kyc_pending when KYC is rejected", () => {
  const c = makeClient();
  c.updateKycStatus(KycStatus.rejected(), 1);
  c.syncOnboardingStatus({ hasGuarantor: true, hasCollateral: true });
  assert.ok(c.onboardingStatus.isKycPending());
});

test("isReadyForLoan returns false for new client", () => {
  assert.ok(!makeClient().isReadyForLoan());
});

test("isReadyForLoan returns true when fully onboarded", () => {
  const c = makeClient();
  c.updateKycStatus(KycStatus.verified(), 1);
  c.recordFeePayment({ paidAt: new Date().toISOString(), recordedByUserId: 1 });
  c.syncOnboardingStatus({ hasGuarantor: true, hasCollateral: true });
  assert.ok(c.isReadyForLoan());
});

test("isReadyForLoan returns false for deactivated client even if onboarded", () => {
  const c = makeClient();
  c.updateKycStatus(KycStatus.verified(), 1);
  c.recordFeePayment({ paidAt: new Date().toISOString(), recordedByUserId: 1 });
  c.syncOnboardingStatus({ hasGuarantor: true, hasCollateral: true });
  c.deactivate();
  assert.ok(!c.isReadyForLoan());
});

test("deactivate sets isActive to false and sets deletedAt", () => {
  const c = makeClient();
  const before = new Date();
  c.deactivate();
  assert.ok(!c.isActive);
  assert.ok(c.deletedAt !== null && c.deletedAt >= before);
});

test("reactivate restores isActive and clears deletedAt", () => {
  const c = makeClient();
  c.deactivate();
  c.reactivate();
  assert.ok(c.isActive);
  assert.equal(c.deletedAt, null);
});

test("toPersistence maps id correctly", () => {
  assert.equal(makeClient({ id: 77 }).toPersistence()["id"], 77);
});

test("toPersistence maps kyc_status to string", () => {
  assert.equal(makeClient().toPersistence()["kyc_status"], "pending");
});

test("toPersistence maps is_active as integer", () => {
  const c = makeClient();
  assert.equal(c.toPersistence()["is_active"], 1);
  c.deactivate();
  assert.equal(c.toPersistence()["is_active"], 0);
});

test("toPersistence null for absent optional fields", () => {
  const c = Client.create({ id: 1, fullName: "Test", phone: null, nationalId: null, branchId: 1, officerId: null, createdByUserId: 1 });
  const p = c.toPersistence();
  assert.equal(p["phone"], null);
  assert.equal(p["national_id"], null);
});

test("Client.reconstitute emits no events", () => {
  const props = {
    id: ClientId.fromNumber(1), fullName: "Test", phone: null, nationalId: null,
    branchId: 1, officerId: null, createdByUserId: 1,
    kycStatus: KycStatus.verified(), onboardingStatus: OnboardingStatus.complete(),
    feePaymentStatus: FeePaymentStatus.paid(), feesPaidAt: new Date(),
    kraPin: null, photoUrl: null, idDocumentUrl: null,
    nextOfKinName: null, nextOfKinPhone: null, nextOfKinRelation: null,
    businessType: null, businessYears: null, businessLocation: null, residentialAddress: null,
    isActive: true, deletedAt: null, createdAt: new Date(), updatedAt: null,
  };
  const r = Client.reconstitute(props);
  assert.equal(r.getUncommittedEvents().length, 0);
  assert.ok(r.kycStatus.isVerified());
});

test("ClientGuarantor.create sets isActive true", () => {
  const g = ClientGuarantor.create({
    clientId: 1, branchId: 2, createdByUserId: 3, fullName: "John Doe",
    phone: "+254711000001", nationalId: "98765432", physicalAddress: "Nairobi",
    occupation: "Farmer", employerName: null, monthlyIncome: 5000, guaranteeAmount: 10000,
  });
  assert.ok(g.isActive);
});

test("ClientGuarantor.update changes field", () => {
  const g = ClientGuarantor.create({
    clientId: 1, branchId: 1, createdByUserId: 1, fullName: "Old Name",
    phone: null, nationalId: null, physicalAddress: null, occupation: null,
    employerName: null, monthlyIncome: 0, guaranteeAmount: 1000,
  });
  g.update({ fullName: "New Name" });
  assert.equal(g.fullName, "New Name");
});

test("ClientCollateral.create sets status to active", () => {
  const col = ClientCollateral.create({
    clientId: 1, branchId: 1, createdByUserId: 1, assetType: "vehicle",
    description: "Toyota Hilux", estimatedValue: 800000, ownershipType: "client",
    ownerName: null, ownerNationalId: null, registrationNumber: "KAA 001A",
    logbookNumber: null, titleNumber: null, locationDetails: null, valuationDate: null,
  });
  assert.ok(col.isActive);
  assert.equal(col.status, "active");
});

test("ClientCollateral toPersistence maps asset_type correctly", () => {
  const col = ClientCollateral.create({
    clientId: 1, branchId: 1, createdByUserId: 1, assetType: "land",
    description: "1 acre plot", estimatedValue: 500000, ownershipType: "client",
    ownerName: null, ownerNationalId: null, registrationNumber: null,
    logbookNumber: null, titleNumber: "TITLE/001", locationDetails: "Kiambu", valuationDate: null,
  });
  assert.equal(col.toPersistence()["asset_type"], "land");
  assert.equal(col.toPersistence()["title_number"], "TITLE/001");
});
