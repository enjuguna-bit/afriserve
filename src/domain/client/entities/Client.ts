import { DomainEvent } from "../../shared/events/DomainEvent.js";
import { KycStatus } from "../value-objects/KycStatus.js";
import { OnboardingStatus } from "../value-objects/OnboardingStatus.js";
import { FeePaymentStatus } from "../value-objects/FeePaymentStatus.js";
import { ClientId } from "../value-objects/ClientId.js";
import { NationalId } from "../value-objects/NationalId.js";
import { PhoneNumber } from "../value-objects/PhoneNumber.js";
import { ClientCreated } from "../events/ClientCreated.js";
import { ClientKycUpdated } from "../events/ClientKycUpdated.js";
import { ClientFeesPaid } from "../events/ClientFeesPaid.js";

export interface ClientProps {
  id: ClientId;
  fullName: string;
  phone: PhoneNumber | null;
  nationalId: NationalId | null;
  branchId: number;
  officerId: number | null;
  createdByUserId: number | null;
  kycStatus: KycStatus;
  onboardingStatus: OnboardingStatus;
  feePaymentStatus: FeePaymentStatus;
  feesPaidAt: Date | null;
  kraPin: string | null;
  photoUrl: string | null;
  idDocumentUrl: string | null;
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
  nextOfKinRelation: string | null;
  businessType: string | null;
  businessYears: number | null;
  businessLocation: string | null;
  residentialAddress: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export class Client {
  private _props: ClientProps;
  private _events: DomainEvent[] = [];

  private constructor(props: ClientProps) {
    this._props = props;
  }

  // ------------------------------------------------------------------
  // Factory: new client (triggers ClientCreated event)
  // ------------------------------------------------------------------
  static create(params: {
    id: number;
    fullName: string;
    phone: PhoneNumber | null;
    nationalId: NationalId | null;
    branchId: number;
    officerId: number | null;
    createdByUserId: number;
    kraPin?: string | null;
    photoUrl?: string | null;
    idDocumentUrl?: string | null;
    nextOfKinName?: string | null;
    nextOfKinPhone?: string | null;
    nextOfKinRelation?: string | null;
    businessType?: string | null;
    businessYears?: number | null;
    businessLocation?: string | null;
    residentialAddress?: string | null;
    createdAt?: Date;
  }): Client {
    const now = params.createdAt ?? new Date();
    const client = new Client({
      id: ClientId.fromNumber(params.id),
      fullName: params.fullName,
      phone: params.phone,
      nationalId: params.nationalId,
      branchId: params.branchId,
      officerId: params.officerId,
      createdByUserId: params.createdByUserId,
      kycStatus: KycStatus.pending(),
      onboardingStatus: OnboardingStatus.registered(),
      feePaymentStatus: FeePaymentStatus.unpaid(),
      feesPaidAt: null,
      kraPin: params.kraPin ?? null,
      photoUrl: params.photoUrl ?? null,
      idDocumentUrl: params.idDocumentUrl ?? null,
      nextOfKinName: params.nextOfKinName ?? null,
      nextOfKinPhone: params.nextOfKinPhone ?? null,
      nextOfKinRelation: params.nextOfKinRelation ?? null,
      businessType: params.businessType ?? null,
      businessYears: params.businessYears ?? null,
      businessLocation: params.businessLocation ?? null,
      residentialAddress: params.residentialAddress ?? null,
      isActive: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: null,
    });

    client._addEvent(new ClientCreated({
      clientId: params.id,
      fullName: params.fullName,
      branchId: params.branchId,
      officerId: params.officerId,
      createdByUserId: params.createdByUserId,
      occurredAt: now,
    }));

    return client;
  }

  // ------------------------------------------------------------------
  // Factory: reconstitute from persistence (no events)
  // ------------------------------------------------------------------
  static reconstitute(props: ClientProps): Client {
    return new Client(props);
  }

  // ------------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------------
  get id(): ClientId            { return this._props.id; }
  get fullName(): string        { return this._props.fullName; }
  get phone(): PhoneNumber | null { return this._props.phone; }
  get nationalId(): NationalId | null { return this._props.nationalId; }
  get branchId(): number        { return this._props.branchId; }
  get officerId(): number | null { return this._props.officerId; }
  get kycStatus(): KycStatus    { return this._props.kycStatus; }
  get onboardingStatus(): OnboardingStatus { return this._props.onboardingStatus; }
  get feePaymentStatus(): FeePaymentStatus { return this._props.feePaymentStatus; }
  get feesPaidAt(): Date | null  { return this._props.feesPaidAt; }
  get isActive(): boolean       { return this._props.isActive; }
  get deletedAt(): Date | null  { return this._props.deletedAt; }
  get createdAt(): Date         { return this._props.createdAt; }
  get updatedAt(): Date | null  { return this._props.updatedAt; }

  // ------------------------------------------------------------------
  // Business methods
  // ------------------------------------------------------------------

  /**
   * Update KYC status. Validates allowed transitions and emits ClientKycUpdated.
   */
  updateKycStatus(newStatus: KycStatus, updatedByUserId: number, note?: string | null): void {
    if (this._props.kycStatus.equals(newStatus)) return; // idempotent

    const now = new Date();
    const previousValue = this._props.kycStatus.value;
    this._props.kycStatus = newStatus;
    this._props.updatedAt = now;

    // Recompute onboarding status (no guarantor/collateral counts here - caller should sync)
    this._addEvent(new ClientKycUpdated({
      clientId: this._props.id.value,
      previousStatus: previousValue,
      nextStatus: newStatus.value,
      updatedByUserId,
      note: note ?? null,
      occurredAt: now,
    }));
  }

  /**
   * Record fee payment. Emits ClientFeesPaid.
   */
  recordFeePayment(params: {
    amount?: number | null;
    paymentReference?: string | null;
    paidAt: string;
    recordedByUserId: number;
  }): void {
    const now = new Date();
    this._props.feePaymentStatus = FeePaymentStatus.paid();
    this._props.feesPaidAt = new Date(params.paidAt);
    this._props.updatedAt = now;

    this._addEvent(new ClientFeesPaid({
      clientId: this._props.id.value,
      amount: params.amount ?? null,
      paymentReference: params.paymentReference ?? null,
      paidAt: params.paidAt,
      recordedByUserId: params.recordedByUserId,
      occurredAt: now,
    }));
  }

  /**
   * Update the derived onboarding status (called after guarantor/collateral/KYC changes).
   */
  syncOnboardingStatus(params: {
    hasGuarantor: boolean;
    hasCollateral: boolean;
  }): void {
    const next = OnboardingStatus.derive({
      kycStatus: this._props.kycStatus.value,
      hasGuarantor: params.hasGuarantor,
      hasCollateral: params.hasCollateral,
      feesPaid: this._props.feePaymentStatus.isSettled(),
    });
    if (!this._props.onboardingStatus.equals(next)) {
      this._props.onboardingStatus = next;
      this._props.updatedAt = new Date();
    }
  }

  /**
   * Whether this client is fully onboarded and eligible for a loan application.
   */
  isReadyForLoan(): boolean {
    return this._props.isActive &&
           this._props.deletedAt === null &&
           this._props.kycStatus.isVerified() &&
           this._props.feePaymentStatus.isSettled() &&
           this._props.onboardingStatus.isComplete();
  }

  deactivate(deletedAt?: Date): void {
    const now = deletedAt ?? new Date();
    this._props.isActive = false;
    this._props.deletedAt = now;
    this._props.updatedAt = now;
  }

  reactivate(): void {
    this._props.isActive = true;
    this._props.deletedAt = null;
    this._props.updatedAt = new Date();
  }

  /**
   * Update mutable profile fields.  Any key that is present (even as null) overwrites the
   * current value; absent keys are left unchanged.  Always stamps `updatedAt`.
   */
  updateProfile(params: {
    fullName?: string;
    phone?: PhoneNumber | null;
    nationalId?: NationalId | null;
    kraPin?: string | null;
    photoUrl?: string | null;
    idDocumentUrl?: string | null;
    nextOfKinName?: string | null;
    nextOfKinPhone?: string | null;
    nextOfKinRelation?: string | null;
    businessType?: string | null;
    businessYears?: number | null;
    businessLocation?: string | null;
    residentialAddress?: string | null;
    officerId?: number | null;
  }): void {
    const p = this._props;
    if (params.fullName !== undefined)           p.fullName = params.fullName;
    if (params.phone !== undefined)              p.phone = params.phone;
    if (params.nationalId !== undefined)         p.nationalId = params.nationalId;
    if (params.kraPin !== undefined)             p.kraPin = params.kraPin;
    if (params.photoUrl !== undefined)           p.photoUrl = params.photoUrl;
    if (params.idDocumentUrl !== undefined)      p.idDocumentUrl = params.idDocumentUrl;
    if (params.nextOfKinName !== undefined)      p.nextOfKinName = params.nextOfKinName;
    if (params.nextOfKinPhone !== undefined)     p.nextOfKinPhone = params.nextOfKinPhone;
    if (params.nextOfKinRelation !== undefined)  p.nextOfKinRelation = params.nextOfKinRelation;
    if (params.businessType !== undefined)       p.businessType = params.businessType;
    if (params.businessYears !== undefined)      p.businessYears = params.businessYears;
    if (params.businessLocation !== undefined)   p.businessLocation = params.businessLocation;
    if (params.residentialAddress !== undefined) p.residentialAddress = params.residentialAddress;
    if (params.officerId !== undefined)          p.officerId = params.officerId;
    p.updatedAt = new Date();
  }

  // ------------------------------------------------------------------
  // Event management
  // ------------------------------------------------------------------
  getUncommittedEvents(): DomainEvent[] { return [...this._events]; }
  clearEvents(): void { this._events = []; }
  private _addEvent(e: DomainEvent): void { this._events.push(e); }

  // ------------------------------------------------------------------
  // Persistence mapping
  // ------------------------------------------------------------------
  toPersistence(): Record<string, unknown> {
    return {
      id:                   this._props.id.value,
      full_name:            this._props.fullName,
      phone:                this._props.phone?.value ?? null,
      national_id:          this._props.nationalId?.value ?? null,
      branch_id:            this._props.branchId,
      officer_id:           this._props.officerId,
      created_by_user_id:   this._props.createdByUserId,
      kyc_status:           this._props.kycStatus.value,
      onboarding_status:    this._props.onboardingStatus.value,
      fee_payment_status:   this._props.feePaymentStatus.value,
      fees_paid_at:         this._props.feesPaidAt?.toISOString() ?? null,
      kra_pin:              this._props.kraPin,
      photo_url:            this._props.photoUrl,
      id_document_url:      this._props.idDocumentUrl,
      next_of_kin_name:     this._props.nextOfKinName,
      next_of_kin_phone:    this._props.nextOfKinPhone,
      next_of_kin_relation: this._props.nextOfKinRelation,
      business_type:        this._props.businessType,
      business_years:       this._props.businessYears,
      business_location:    this._props.businessLocation,
      residential_address:  this._props.residentialAddress,
      is_active:            this._props.isActive ? 1 : 0,
      deleted_at:           this._props.deletedAt?.toISOString() ?? null,
      created_at:           this._props.createdAt.toISOString(),
      updated_at:           this._props.updatedAt?.toISOString() ?? null,
    };
  }
}
