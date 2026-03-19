/**
 * Client Aggregate Root
 * Central business entity for client management with rich behavior
 */

import { ClientId } from '../value-objects/ClientId';
import { KycStatus } from '../value-objects/KycStatus';
import { OnboardingStatus } from '../value-objects/OnboardingStatus';
import { FeePaymentStatus } from '../value-objects/FeePaymentStatus';
import { PhoneNumber } from '../value-objects/PhoneNumber';
import { NationalId } from '../value-objects/NationalId';
import { Money } from '../../shared/value-objects/Money';
import { DomainEvent } from '../../shared/events/DomainEvent';
import {
  ClientCreated,
  ClientKycCompleted,
  ClientFeesPaid,
  ClientDeactivated,
} from '../events/ClientEvents';

export interface ClientProps {
  id: ClientId;
  fullName: string;
  phone: PhoneNumber;
  nationalId?: NationalId;
  branchId: number;
  officerId?: number;
  kycStatus: KycStatus;
  onboardingStatus: OnboardingStatus;
  feePaymentStatus: FeePaymentStatus;
  feesPaidAt?: Date;
  nextOfKinName?: string;
  nextOfKinPhone?: PhoneNumber;
  nextOfKinRelation?: string;
  businessType?: string;
  businessYears?: number;
  businessLocation?: string;
  residentialAddress?: string;
  photoUrl?: string;
  idDocumentUrl?: string;
  kraPin?: string;
  isActive: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export class Client {
  private _props: ClientProps;
  private _events: DomainEvent[] = [];

  private constructor(props: ClientProps) {
    this._props = props;
  }

  // ==================== Factory Methods ====================

  /**
   * Create a new client (factory method for client registration)
   */
  static create(params: {
    fullName: string;
    phone: PhoneNumber;
    nationalId?: NationalId;
    branchId: number;
    officerId?: number;
    createdByUserId: number;
  }): Client {
    const client = new Client({
      id: ClientId.generate(), // Will be set by repository
      fullName: params.fullName,
      phone: params.phone,
      nationalId: params.nationalId,
      branchId: params.branchId,
      officerId: params.officerId,
      kycStatus: KycStatus.pending(),
      onboardingStatus: OnboardingStatus.registered(),
      feePaymentStatus: FeePaymentStatus.unpaid(),
      isActive: true,
      createdAt: new Date(),
    });

    client.addEvent(
      new ClientCreated({
        clientId: 0, // Will be set after persistence
        fullName: params.fullName,
        branchId: params.branchId,
        createdByUserId: params.createdByUserId,
        occurredAt: new Date(),
      })
    );

    return client;
  }

  /**
   * Reconstitute client from persistence (for retrieval from database)
   */
  static reconstitute(props: ClientProps): Client {
    return new Client(props);
  }

  // ==================== Business Methods ====================

  /**
   * Complete KYC verification
   */
  completeKyc(
    verifiedByUserId: number,
    photoUrl: string,
    idDocumentUrl: string
  ): void {
    if (this._props.kycStatus.isVerified()) {
      throw new Error('KYC is already verified');
    }

    if (!this._props.isActive) {
      throw new Error('Cannot complete KYC for inactive client');
    }

    const newStatus = KycStatus.verified();
    if (!this._props.kycStatus.canTransitionTo(newStatus)) {
      throw new Error(
        `Invalid KYC status transition from ${this._props.kycStatus.value} to ${newStatus.value}`
      );
    }

    this._props.kycStatus = newStatus;
    this._props.photoUrl = photoUrl;
    this._props.idDocumentUrl = idDocumentUrl;
    this._props.onboardingStatus = OnboardingStatus.kycCompleted();
    this._props.updatedAt = new Date();

    this.addEvent(
      new ClientKycCompleted({
        clientId: this._props.id.value,
        verifiedByUserId,
        occurredAt: new Date(),
      })
    );
  }

  /**
   * Record fee payment
   */
  recordFeePayment(
    amount: Money,
    paymentMethod: string,
    recordedByUserId: number
  ): void {
    if (this._props.feePaymentStatus.isPaid()) {
      throw new Error('Fees are already paid');
    }

    if (!this._props.kycStatus.isVerified()) {
      throw new Error('Cannot record fee payment before KYC verification');
    }

    if (!this._props.isActive) {
      throw new Error('Cannot record fee payment for inactive client');
    }

    this._props.feePaymentStatus = FeePaymentStatus.paid();
    this._props.feesPaidAt = new Date();
    this._props.onboardingStatus = OnboardingStatus.active();
    this._props.updatedAt = new Date();

    this.addEvent(
      new ClientFeesPaid({
        clientId: this._props.id.value,
        amount: amount.amount,
        paymentMethod,
        recordedByUserId,
        occurredAt: new Date(),
      })
    );
  }

  /**
   * Update client information
   */
  updateInformation(updates: {
    fullName?: string;
    nextOfKinName?: string;
    nextOfKinPhone?: PhoneNumber;
    nextOfKinRelation?: string;
    businessType?: string;
    businessYears?: number;
    businessLocation?: string;
    residentialAddress?: string;
  }): void {
    if (!this._props.isActive) {
      throw new Error('Cannot update inactive client');
    }

    if (updates.fullName) this._props.fullName = updates.fullName;
    if (updates.nextOfKinName) this._props.nextOfKinName = updates.nextOfKinName;
    if (updates.nextOfKinPhone) this._props.nextOfKinPhone = updates.nextOfKinPhone;
    if (updates.nextOfKinRelation) this._props.nextOfKinRelation = updates.nextOfKinRelation;
    if (updates.businessType) this._props.businessType = updates.businessType;
    if (updates.businessYears !== undefined) this._props.businessYears = updates.businessYears;
    if (updates.businessLocation) this._props.businessLocation = updates.businessLocation;
    if (updates.residentialAddress) this._props.residentialAddress = updates.residentialAddress;

    this._props.updatedAt = new Date();
  }

  /**
   * Check if client is eligible for loan
   */
  isEligibleForLoan(): boolean {
    return (
      this._props.isActive &&
      this._props.kycStatus.isVerified() &&
      this._props.feePaymentStatus.isPaid() &&
      !this._props.deletedAt
    );
  }

  /**
   * Deactivate client
   */
  deactivate(deactivatedByUserId: number, reason?: string): void {
    if (!this._props.isActive) {
      throw new Error('Client is already inactive');
    }

    this._props.isActive = false;
    this._props.onboardingStatus = OnboardingStatus.inactive();
    this._props.updatedAt = new Date();

    this.addEvent(
      new ClientDeactivated({
        clientId: this._props.id.value,
        reason,
        deactivatedByUserId,
        occurredAt: new Date(),
      })
    );
  }

  /**
   * Reactivate client
   */
  reactivate(): void {
    if (this._props.isActive) {
      throw new Error('Client is already active');
    }

    if (!this._props.kycStatus.isVerified()) {
      throw new Error('Cannot reactivate client without verified KYC');
    }

    this._props.isActive = true;
    this._props.onboardingStatus = OnboardingStatus.active();
    this._props.updatedAt = new Date();
  }

  // ==================== Getters ====================

  get id(): ClientId {
    return this._props.id;
  }

  get fullName(): string {
    return this._props.fullName;
  }

  get phone(): PhoneNumber {
    return this._props.phone;
  }

  get nationalId(): NationalId | undefined {
    return this._props.nationalId;
  }

  get branchId(): number {
    return this._props.branchId;
  }

  get officerId(): number | undefined {
    return this._props.officerId;
  }

  get kycStatus(): KycStatus {
    return this._props.kycStatus;
  }

  get onboardingStatus(): OnboardingStatus {
    return this._props.onboardingStatus;
  }

  get feePaymentStatus(): FeePaymentStatus {
    return this._props.feePaymentStatus;
  }

  get isActive(): boolean {
    return this._props.isActive;
  }

  get createdAt(): Date {
    return this._props.createdAt;
  }

  get referenceCode(): string {
    return this._props.id.toReferenceCode();
  }

  // ==================== Event Management ====================

  getUncommittedEvents(): DomainEvent[] {
    return [...this._events];
  }

  clearEvents(): void {
    this._events = [];
  }

  private addEvent(event: DomainEvent): void {
    this._events.push(event);
  }

  // ==================== Persistence Mapping ====================

  toPersistence(): Record<string, any> {
    return {
      id: this._props.id.value,
      full_name: this._props.fullName,
      phone: this._props.phone.value,
      national_id: this._props.nationalId?.value,
      branch_id: this._props.branchId,
      officer_id: this._props.officerId,
      kyc_status: this._props.kycStatus.value,
      onboarding_status: this._props.onboardingStatus.value,
      fee_payment_status: this._props.feePaymentStatus.value,
      fees_paid_at: this._props.feesPaidAt,
      next_of_kin_name: this._props.nextOfKinName,
      next_of_kin_phone: this._props.nextOfKinPhone?.value,
      next_of_kin_relation: this._props.nextOfKinRelation,
      business_type: this._props.businessType,
      business_years: this._props.businessYears,
      business_location: this._props.businessLocation,
      residential_address: this._props.residentialAddress,
      photo_url: this._props.photoUrl,
      id_document_url: this._props.idDocumentUrl,
      kra_pin: this._props.kraPin,
      is_active: this._props.isActive ? 1 : 0,
      deleted_at: this._props.deletedAt,
      created_at: this._props.createdAt,
      updated_at: this._props.updatedAt,
    };
  }

  /**
   * Create Client from database row
   */
  static fromPersistence(row: Record<string, any>): Client {
    return Client.reconstitute({
      id: ClientId.fromNumber(row.id),
      fullName: row.full_name,
      phone: PhoneNumber.fromString(row.phone),
      nationalId: row.national_id ? NationalId.fromString(row.national_id) : undefined,
      branchId: row.branch_id,
      officerId: row.officer_id,
      kycStatus: KycStatus.fromString(row.kyc_status),
      onboardingStatus: OnboardingStatus.fromString(row.onboarding_status),
      feePaymentStatus: FeePaymentStatus.fromString(row.fee_payment_status),
      feesPaidAt: row.fees_paid_at,
      nextOfKinName: row.next_of_kin_name,
      nextOfKinPhone: row.next_of_kin_phone
        ? PhoneNumber.fromString(row.next_of_kin_phone)
        : undefined,
      nextOfKinRelation: row.next_of_kin_relation,
      businessType: row.business_type,
      businessYears: row.business_years,
      businessLocation: row.business_location,
      residentialAddress: row.residential_address,
      photoUrl: row.photo_url,
      idDocumentUrl: row.id_document_url,
      kraPin: row.kra_pin,
      isActive: row.is_active === 1,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
