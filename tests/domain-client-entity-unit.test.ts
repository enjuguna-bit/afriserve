/**
 * Unit tests for Client entity domain logic
 * Tests KYC transitions, onboarding flow, and event emission
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Client } from '../src/domain/client/entities/Client.js';
import { KycStatus } from '../src/domain/client/value-objects/KycStatus.js';
import { NationalId } from '../src/domain/client/value-objects/NationalId.js';
import { PhoneNumber } from '../src/domain/client/value-objects/PhoneNumber.js';

function createTestClient(overrides = {}) {
  const defaults = {
    id: 1,
    fullName: 'John Doe',
    phone: PhoneNumber.fromString('+254700000001'),
    nationalId: NationalId.fromString('12345678'),
    branchId: 5,
    officerId: 2,
    createdByUserId: 1,
    ...overrides,
  };
  return Client.create(defaults);
}

describe('Client Entity', () => {
  describe('Creation', () => {
    it('should create client with pending KYC status', () => {
      const client = createTestClient();
      assert.ok(client.kycStatus.isPending());
      assert.ok(client.onboardingStatus.isRegistered());
      assert.ok(client.feePaymentStatus.isUnpaid());
      assert.ok(client.isActive);
      assert.strictEqual(client.fullName, 'John Doe');
    });

    it('should emit ClientCreated event', () => {
      const client = createTestClient();
      const events = client.getUncommittedEvents();
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]!.constructor.name, 'ClientCreated');
    });

    it('should handle optional fields as null', () => {
      const client = createTestClient({
        phone: null,
        nationalId: null,
        kraPin: undefined,
      });
      assert.strictEqual(client.phone, null);
      assert.strictEqual(client.nationalId, null);
      assert.strictEqual(client.kraPin, null);
    });

    it('should create with provided creation date', () => {
      const customDate = new Date('2024-01-15');
      const client = createTestClient({ createdAt: customDate });
      assert.strictEqual(client.createdAt.toISOString(), customDate.toISOString());
    });
  });

  describe('KYC Status Transitions', () => {
    it('should transition from pending to verified', () => {
      const client = createTestClient();
      client.updateKycStatus(KycStatus.verified(), 1, 'Documents validated');
      
      assert.ok(client.kycStatus.isVerified());
      assert.ok(!client.kycStatus.isPending());
    });

    it('should emit ClientKycUpdated event', () => {
      const client = createTestClient();
      client.updateKycStatus(KycStatus.verified(), 1);
      
      const events = client.getUncommittedEvents();
      const kycEvent = events.find(e => e.constructor.name === 'ClientKycUpdated');
      assert.ok(kycEvent);
    });

    it('should transition from pending to rejected', () => {
      const client = createTestClient();
      client.updateKycStatus(KycStatus.rejected(), 1, 'Invalid documents');
      
      assert.ok(client.kycStatus.isRejected());
    });

    it('should be idempotent for same status', () => {
      const client = createTestClient();
      const initialEvents = client.getUncommittedEvents().length;
      
      client.updateKycStatus(KycStatus.pending(), 1);
      
      // Should not emit new event for same status
      assert.strictEqual(client.getUncommittedEvents().length, initialEvents);
    });

    it('should record note in KYC update event', () => {
      const client = createTestClient();
      client.updateKycStatus(KycStatus.verified(), 1, 'All good');
      
      const events = client.getUncommittedEvents();
      const kycEvent = events.find(e => e.constructor.name === 'ClientKycUpdated') as any;
      assert.strictEqual(kycEvent?.payload.note, 'All good');
    });
  });

  describe('Fee Payment Recording', () => {
    it('should record fee payment', () => {
      const client = createTestClient();
      client.recordFeePayment({
        amount: 200,
        paymentReference: 'REF123',
        paidAt: '2024-01-20T10:00:00Z',
        recordedByUserId: 1,
      });
      
      assert.ok(client.feePaymentStatus.isSettled());
      assert.ok(client.feesPaidAt !== null);
    });

    it('should emit ClientFeesPaid event', () => {
      const client = createTestClient();
      client.recordFeePayment({
        paidAt: '2024-01-20T10:00:00Z',
        recordedByUserId: 1,
      });
      
      const events = client.getUncommittedEvents();
      const feeEvent = events.find(e => e.constructor.name === 'ClientFeesPaid');
      assert.ok(feeEvent);
    });

    it('should handle null amount', () => {
      const client = createTestClient();
      client.recordFeePayment({
        paidAt: '2024-01-20T10:00:00Z',
        recordedByUserId: 1,
      });
      
      assert.ok(client.feePaymentStatus.isSettled());
    });
  });

  describe('Onboarding Status Sync', () => {
    it('should derive onboarding status with KYC only', () => {
      const client = createTestClient();
      client.updateKycStatus(KycStatus.verified(), 1);
      client.recordFeePayment({ paidAt: '2024-01-20T10:00:00Z', recordedByUserId: 1 });
      
      client.syncOnboardingStatus({
        hasGuarantor: false,
        hasCollateral: false,
      });
      
      // Should be pending without guarantor/collateral
      assert.ok(!client.onboardingStatus.isComplete());
    });

    it('should be complete with all requirements', () => {
      const client = createTestClient();
      client.updateKycStatus(KycStatus.verified(), 1);
      client.recordFeePayment({ paidAt: '2024-01-20T10:00:00Z', recordedByUserId: 1 });
      
      client.syncOnboardingStatus({
        hasGuarantor: true,
        hasCollateral: true,
      });
      
      assert.ok(client.onboardingStatus.isComplete());
    });

    it('should not emit event if status unchanged', () => {
      const client = createTestClient();
      client.syncOnboardingStatus({
        hasGuarantor: false,
        hasCollateral: false,
      });
      
      const initialEvents = client.getUncommittedEvents().length;
      client.syncOnboardingStatus({
        hasGuarantor: false,
        hasCollateral: false,
      });
      
      assert.strictEqual(client.getUncommittedEvents().length, initialEvents);
    });
  });

  describe('Loan Readiness Check', () => {
    it('should not be ready with pending KYC', () => {
      const client = createTestClient();
      assert.ok(!client.isReadyForLoan());
    });

    it('should not be ready with unpaid fees', () => {
      const client = createTestClient();
      client.updateKycStatus(KycStatus.verified(), 1);
      assert.ok(!client.isReadyForLoan());
    });

    it('should not be ready with incomplete onboarding', () => {
      const client = createTestClient();
      client.updateKycStatus(KycStatus.verified(), 1);
      client.recordFeePayment({ paidAt: '2024-01-20T10:00:00Z', recordedByUserId: 1 });
      // Missing guarantor/collateral
      client.syncOnboardingStatus({ hasGuarantor: false, hasCollateral: false });
      
      assert.ok(!client.isReadyForLoan());
    });

    it('should be ready when all requirements met', () => {
      const client = createTestClient();
      client.updateKycStatus(KycStatus.verified(), 1);
      client.recordFeePayment({ paidAt: '2024-01-20T10:00:00Z', recordedByUserId: 1 });
      client.syncOnboardingStatus({ hasGuarantor: true, hasCollateral: true });
      
      assert.ok(client.isReadyForLoan());
    });

    it('should not be ready when deactivated', () => {
      const client = createTestClient();
      client.deactivate();
      
      assert.ok(!client.isReadyForLoan());
    });
  });

  describe('Activation/Deactivation', () => {
    it('should deactivate client', () => {
      const client = createTestClient();
      client.deactivate();
      
      assert.ok(!client.isActive);
      assert.ok(client.deletedAt !== null);
    });

    it('should reactivate deactivated client', () => {
      const client = createTestClient();
      client.deactivate();
      client.reactivate();
      
      assert.ok(client.isActive);
      assert.strictEqual(client.deletedAt, null);
    });

    it('should accept custom deactivation date', () => {
      const customDate = new Date('2024-02-01');
      const client = createTestClient();
      client.deactivate(customDate);
      
      assert.strictEqual(client.deletedAt!.toISOString(), customDate.toISOString());
    });
  });

  describe('Profile Updates', () => {
    it('should update full name', () => {
      const client = createTestClient();
      client.updateProfile({ fullName: 'Jane Doe' });
      
      assert.strictEqual(client.fullName, 'Jane Doe');
      assert.ok(client.updatedAt !== null);
    });

    it('should update multiple fields', () => {
      const client = createTestClient();
      client.updateProfile({
        fullName: 'Jane Doe',
        kraPin: 'A123456789B',
        businessType: 'Retail',
        businessYears: 5,
      });
      
      assert.strictEqual(client.fullName, 'Jane Doe');
      assert.strictEqual(client.kraPin, 'A123456789B');
      assert.strictEqual(client.businessType, 'Retail');
      assert.strictEqual(client.businessYears, 5);
    });

    it('should set fields to null explicitly', () => {
      const client = createTestClient({ kraPin: 'ABC' });
      client.updateProfile({ kraPin: null });
      
      assert.strictEqual(client.kraPin, null);
    });

    it('should not update fields not in params', () => {
      const client = createTestClient({ fullName: 'Original', businessType: 'Retail' });
      const originalName = client.fullName;
      
      client.updateProfile({ businessType: 'Wholesale' });
      
      assert.strictEqual(client.fullName, originalName);
      assert.strictEqual(client.businessType, 'Wholesale');
    });
  });

  describe('Persistence Mapping', () => {
    it('should convert to persistence format', () => {
      const client = createTestClient();
      const persisted = client.toPersistence();
      
      assert.strictEqual(persisted.id, 1);
      assert.strictEqual(persisted.full_name, 'John Doe');
      assert.strictEqual(persisted.kyc_status, 'pending');
      assert.strictEqual(persisted.onboarding_status, 'registered');
      assert.strictEqual(persisted.is_active, 1);
    });

    it('should serialize dates correctly', () => {
      const client = createTestClient();
      const persisted = client.toPersistence();
      
      assert.strictEqual(typeof persisted.created_at, 'string');
      assert.strictEqual(persisted.deleted_at, null);
    });
  });
});
