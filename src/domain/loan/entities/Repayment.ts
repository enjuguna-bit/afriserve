import { Money } from "../../shared/value-objects/Money.js";

/**
 * Repayment entity - maps to the repayments table.
 * Child of the Loan aggregate (read by repaymentService).
 */
export interface RepaymentProps {
  id: number | null;
  loanId: number;
  clientId: number;
  amount: Money;
  paidAt: Date;
  recordedByUserId: number;
  note: string | null;
  externalReference: string | null;
  paymentMethod: string | null;
}

export class Repayment {
  private constructor(private readonly _props: RepaymentProps) {}

  static create(params: Omit<RepaymentProps, "id">): Repayment {
    return new Repayment({ ...params, id: null });
  }

  static reconstitute(props: RepaymentProps): Repayment {
    return new Repayment(props);
  }

  get id(): number | null           { return this._props.id; }
  get loanId(): number              { return this._props.loanId; }
  get amount(): Money               { return this._props.amount; }
  get paidAt(): Date                { return this._props.paidAt; }
  get recordedByUserId(): number    { return this._props.recordedByUserId; }
  get paymentMethod(): string | null { return this._props.paymentMethod; }

  toPersistence(): Record<string, unknown> {
    return {
      id:                    this._props.id,
      loan_id:               this._props.loanId,
      client_id:             this._props.clientId,
      amount:                this._props.amount.amount,
      paid_at:               this._props.paidAt.toISOString(),
      recorded_by_user_id:   this._props.recordedByUserId,
      note:                  this._props.note,
      external_reference:    this._props.externalReference,
      payment_method:        this._props.paymentMethod,
    };
  }
}
