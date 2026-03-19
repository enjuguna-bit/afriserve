import { Money } from "../../shared/value-objects/Money.js";
import { LoanId } from "../value-objects/LoanId.js";
import { LoanStatus } from "../value-objects/LoanStatus.js";
import { InterestRate } from "../value-objects/InterestRate.js";
import { LoanTerm } from "../value-objects/LoanTerm.js";
import { DomainEvent } from "../../shared/events/DomainEvent.js";
import { LoanApplicationSubmitted } from "../events/LoanApplicationSubmitted.js";
import { LoanApproved } from "../events/LoanApproved.js";
import { LoanDisbursed } from "../events/LoanDisbursed.js";
import { LoanRejected } from "../events/LoanRejected.js";
import { LoanMarkedOverdue } from "../events/LoanMarkedOverdue.js";
import { LoanFullyRepaid } from "../events/LoanFullyRepaid.js";
import { RepaymentRecorded } from "../events/RepaymentRecorded.js";

export interface LoanProps {
  id: LoanId;
  clientId: number;
  productId: number | null;
  branchId: number | null;
  createdByUserId: number | null;
  officerId: number | null;
  principal: Money;
  interestRate: InterestRate;
  term: LoanTerm;
  registrationFee: Money;
  processingFee: Money;
  expectedTotal: Money;
  balance: Money;
  repaidTotal: Money;
  status: LoanStatus;
  approvedByUserId: number | null;
  approvedAt: Date | null;
  disbursedByUserId: number | null;
  disbursedAt: Date | null;
  disbursementNote: string | null;
  externalReference: string | null;
  rejectedByUserId: number | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export class Loan {
  private _props: LoanProps;
  private _events: DomainEvent[] = [];

  private constructor(props: LoanProps) { this._props = props; }

  // ------------------------------------------------------------------
  // Factories
  // ------------------------------------------------------------------

  static createApplication(params: {
    id: number;
    clientId: number;
    productId?: number | null;
    branchId?: number | null;
    createdByUserId: number;
    officerId?: number | null;
    principal: Money;
    interestRate: InterestRate;
    term: LoanTerm;
    registrationFee: Money;
    processingFee: Money;
    expectedTotal: Money;
    createdAt?: Date;
  }): Loan {
    const now = params.createdAt ?? new Date();
    const loan = new Loan({
      id: LoanId.fromNumber(params.id),
      clientId: params.clientId,
      productId: params.productId ?? null,
      branchId: params.branchId ?? null,
      createdByUserId: params.createdByUserId,
      officerId: params.officerId ?? null,
      principal: params.principal,
      interestRate: params.interestRate,
      term: params.term,
      registrationFee: params.registrationFee,
      processingFee: params.processingFee,
      expectedTotal: params.expectedTotal,
      balance: params.expectedTotal,
      repaidTotal: Money.zero(),
      status: LoanStatus.pendingApproval(),
      approvedByUserId: null, approvedAt: null,
      disbursedByUserId: null, disbursedAt: null,
      disbursementNote: null, externalReference: null,
      rejectedByUserId: null, rejectedAt: null, rejectionReason: null,
      archivedAt: null, createdAt: now,
    });
    loan._addEvent(new LoanApplicationSubmitted({
      loanId: params.id,
      clientId: params.clientId,
      principal: params.principal.amount,
      termWeeks: params.term.weeks,
      branchId: params.branchId ?? null,
      createdByUserId: params.createdByUserId,
      occurredAt: now,
    }));
    return loan;
  }

  static reconstitute(props: LoanProps): Loan { return new Loan(props); }

  // ------------------------------------------------------------------
  // Getters
  // ------------------------------------------------------------------

  get id(): LoanId                 { return this._props.id; }
  get clientId(): number           { return this._props.clientId; }
  get branchId(): number | null    { return this._props.branchId; }
  get principal(): Money           { return this._props.principal; }
  get interestRate(): InterestRate { return this._props.interestRate; }
  get term(): LoanTerm             { return this._props.term; }
  get registrationFee(): Money     { return this._props.registrationFee; }
  get processingFee(): Money       { return this._props.processingFee; }
  get expectedTotal(): Money       { return this._props.expectedTotal; }
  get balance(): Money             { return this._props.balance; }
  get repaidTotal(): Money         { return this._props.repaidTotal; }
  get status(): LoanStatus         { return this._props.status; }
  get officerId(): number | null   { return this._props.officerId; }
  get disbursedAt(): Date | null   { return this._props.disbursedAt; }
  get approvedAt(): Date | null    { return this._props.approvedAt; }
  get rejectionReason(): string | null { return this._props.rejectionReason; }

  // ------------------------------------------------------------------
  // State guards
  // ------------------------------------------------------------------

  canBeApproved(): boolean      { return this._props.status.isPendingApproval(); }
  canBeRejected(): boolean      { return this._props.status.isPendingApproval(); }
  canBeDisbursed(): boolean     { return this._props.status.isApproved(); }
  /** Loan is disbursed (active / overdue / restructured) and can accept repayments. */
  canAcceptRepayment(): boolean { return this._props.status.isDisbursed(); }
  isFullyRepaid(): boolean      { return this._props.balance.isZero(); }

  /**
   * True when the loan is in a disbursed state that has NOT already been
   * promoted to overdue. Used by overdueSync to skip loans already marked.
   */
  canBeMarkedOverdue(): boolean {
    return this._props.status.isActive() || this._props.status.isRestructured();
  }

  // ------------------------------------------------------------------
  // Business methods
  // ------------------------------------------------------------------

  approve(approvedByUserId: number): void {
    if (!this.canBeApproved()) {
      throw new Error(`Cannot approve loan ${this._props.id.value} in status: ${this._props.status.value}`);
    }
    const now = new Date();
    this._props.status = LoanStatus.approved();
    this._props.approvedByUserId = approvedByUserId;
    this._props.approvedAt = now;
    this._addEvent(new LoanApproved({
      loanId: this._props.id.value,
      clientId: this._props.clientId,
      approvedByUserId,
      approvedAt: now,
      occurredAt: now,
    }));
  }

  reject(rejectedByUserId: number, reason: string): void {
    if (!this.canBeRejected()) {
      throw new Error(`Cannot reject loan ${this._props.id.value} in status: ${this._props.status.value}`);
    }
    const now = new Date();
    this._props.status = LoanStatus.rejected();
    this._props.rejectedByUserId = rejectedByUserId;
    this._props.rejectedAt = now;
    this._props.rejectionReason = reason;
    this._addEvent(new LoanRejected({
      loanId: this._props.id.value,
      clientId: this._props.clientId,
      rejectedByUserId,
      rejectedAt: now,
      reason,
      occurredAt: now,
    }));
  }

  disburse(params: {
    disbursedByUserId: number;
    disbursedAt?: Date;
    disbursementNote?: string | null;
    externalReference?: string | null;
  }): void {
    if (!this.canBeDisbursed()) {
      throw new Error(`Cannot disburse loan ${this._props.id.value} in status: ${this._props.status.value}`);
    }
    const now = params.disbursedAt ?? new Date();
    this._props.status = LoanStatus.active();
    this._props.disbursedByUserId = params.disbursedByUserId;
    this._props.disbursedAt = now;
    this._props.disbursementNote = params.disbursementNote ?? null;
    this._props.externalReference = params.externalReference ?? null;
    this._addEvent(new LoanDisbursed({
      loanId: this._props.id.value,
      clientId: this._props.clientId,
      principal: this._props.principal.amount,
      disbursedByUserId: params.disbursedByUserId,
      disbursedAt: now,
      externalReference: params.externalReference ?? null,
      isTranche: false,
      occurredAt: now,
    }));
  }

  /**
   * Partial tranche disbursement — loan stays "approved" until isFinal=true.
   * Mirrors the actual loanLifecycleService tranche behaviour.
   */
  disburseTranche(params: {
    disbursedByUserId: number;
    trancheNumber: number;
    trancheAmount: number;
    isFinal: boolean;
    disbursedAt?: Date;
    note?: string | null;
  }): void {
    if (!this.canBeDisbursed()) {
      throw new Error(`Cannot disburse tranche for loan ${this._props.id.value} in status: ${this._props.status.value}`);
    }
    const now = params.disbursedAt ?? new Date();
    if (params.isFinal) {
      this._props.status = LoanStatus.active();
      this._props.disbursedByUserId = params.disbursedByUserId;
      this._props.disbursedAt = now;
      this._props.disbursementNote = params.note ?? null;
    }
    this._addEvent(new LoanDisbursed({
      loanId: this._props.id.value,
      clientId: this._props.clientId,
      principal: this._props.principal.amount,
      disbursedByUserId: params.disbursedByUserId,
      disbursedAt: now,
      isTranche: !params.isFinal,
      trancheNumber: params.trancheNumber,
      trancheAmount: params.trancheAmount,
      occurredAt: now,
    }));
  }

  recordRepayment(params: {
    amount: Money;
    recordedByUserId: number;
    externalReference?: string | null;
    occurredAt?: Date;
  }): void {
    if (!this.canAcceptRepayment()) {
      throw new Error(`Cannot record repayment for loan ${this._props.id.value} in status: ${this._props.status.value}`);
    }
    if (params.amount.isZero()) {
      throw new Error("Repayment amount must be positive");
    }
    const now = params.occurredAt ?? new Date();

    this._props.repaidTotal = this._props.repaidTotal.add(params.amount);
    const balanceAfter = this._props.balance.isGreaterThan(params.amount)
      ? this._props.balance.subtract(params.amount)
      : Money.zero();
    this._props.balance = balanceAfter;

    const fullyRepaid = balanceAfter.isZero();
    if (fullyRepaid) {
      this._props.status = LoanStatus.closed();
    }

    this._addEvent(new RepaymentRecorded({
      loanId: this._props.id.value,
      clientId: this._props.clientId,
      amount: params.amount.amount,
      remainingBalance: balanceAfter.amount,
      recordedByUserId: params.recordedByUserId,
      isFullyRepaid: fullyRepaid,
      externalReference: params.externalReference ?? null,
      occurredAt: now,
    }));

    // Emit dedicated closure event when loan is fully repaid
    if (fullyRepaid) {
      this._addEvent(new LoanFullyRepaid({
        loanId: this._props.id.value,
        clientId: this._props.clientId,
        totalRepaid: this._props.repaidTotal.amount,
        closedAt: now,
        occurredAt: now,
      }));
    }
  }

  /**
   * Transition a disbursed loan (active / restructured) to the "overdue" status.
   *
   * This is the aggregate-level entry point for the overdueSync job (Gap 12).
   * Calling this ensures:
   *   - The status change goes through the aggregate (not a raw SQL UPDATE),
   *   - A `LoanMarkedOverdue` domain event is emitted,
   *   - The event is persisted to the outbox via loanRepository.save() +
   *     eventBus.publishAll(), guaranteeing at-least-once delivery.
   *
   * Guards:
   *   - No-op if the loan is already overdue (idempotent).
   *   - Throws if the loan is not in a disbursed state at all.
   *
   * @param overdueInstallments - how many installments triggered the transition
   *                              (informational; stored in the event payload)
   */
  markOverdue(overdueInstallments: number = 1): void {
    // Already overdue — idempotent, no duplicate event
    if (this._props.status.isOverdue()) {
      return;
    }

    if (!this.canBeMarkedOverdue()) {
      throw new Error(
        `Cannot mark loan ${this._props.id.value} as overdue from status: ${this._props.status.value}`,
      );
    }

    const now = new Date();
    this._props.status = LoanStatus.overdue();

    this._addEvent(new LoanMarkedOverdue({
      loanId:              this._props.id.value,
      clientId:            this._props.clientId,
      branchId:            this._props.branchId,
      officerId:           this._props.officerId,
      overdueInstallments: Math.max(1, overdueInstallments),
      markedAt:            now,
      occurredAt:          now,
    }));
  }

  // ------------------------------------------------------------------
  // Event management
  // ------------------------------------------------------------------

  getUncommittedEvents(): DomainEvent[] { return [...this._events]; }
  clearEvents(): void { this._events = []; }
  private _addEvent(e: DomainEvent): void { this._events.push(e); }

  // ------------------------------------------------------------------
  // Persistence
  // ------------------------------------------------------------------

  toPersistence(): Record<string, unknown> {
    const p = this._props;
    return {
      id: p.id.value,
      client_id: p.clientId,
      product_id: p.productId,
      branch_id: p.branchId,
      created_by_user_id: p.createdByUserId,
      officer_id: p.officerId,
      principal: p.principal.amount,
      interest_rate: p.interestRate.percentage,
      term_weeks: p.term.weeks,
      term_months: p.term.months,
      registration_fee: p.registrationFee.amount,
      processing_fee: p.processingFee.amount,
      expected_total: p.expectedTotal.amount,
      balance: p.balance.amount,
      repaid_total: p.repaidTotal.amount,
      status: p.status.value,
      approved_by_user_id: p.approvedByUserId,
      approved_at: p.approvedAt?.toISOString() ?? null,
      disbursed_by_user_id: p.disbursedByUserId,
      disbursed_at: p.disbursedAt?.toISOString() ?? null,
      disbursement_note: p.disbursementNote,
      external_reference: p.externalReference,
      rejected_by_user_id: p.rejectedByUserId,
      rejected_at: p.rejectedAt?.toISOString() ?? null,
      rejection_reason: p.rejectionReason,
      archived_at: p.archivedAt?.toISOString() ?? null,
      created_at: p.createdAt.toISOString(),
    };
  }
}
