import { Money } from "../../shared/value-objects/Money.js";

/**
 * Disbursement entity - represents a single tranche or full disbursement record.
 * Child entity of the Loan aggregate, maps to loan_disbursement_tranches table.
 */
export interface DisbursementProps {
  id: number | null;
  loanId: number;
  trancheNumber: number;
  amount: Money;
  disbursedAt: Date;
  disbursedByUserId: number;
  note: string | null;
  isFinal: boolean;
}

export class Disbursement {
  private constructor(private readonly _props: DisbursementProps) {}

  static create(params: Omit<DisbursementProps, "id">): Disbursement {
    return new Disbursement({ ...params, id: null });
  }

  static reconstitute(props: DisbursementProps): Disbursement {
    return new Disbursement(props);
  }

  get id(): number | null        { return this._props.id; }
  get loanId(): number           { return this._props.loanId; }
  get trancheNumber(): number    { return this._props.trancheNumber; }
  get amount(): Money            { return this._props.amount; }
  get disbursedAt(): Date        { return this._props.disbursedAt; }
  get isFinal(): boolean         { return this._props.isFinal; }

  toPersistence(): Record<string, unknown> {
    return {
      id:                    this._props.id,
      loan_id:               this._props.loanId,
      tranche_number:        this._props.trancheNumber,
      amount:                this._props.amount.amount,
      disbursed_at:          this._props.disbursedAt.toISOString(),
      disbursed_by_user_id:  this._props.disbursedByUserId,
      note:                  this._props.note,
      is_final:              this._props.isFinal ? 1 : 0,
    };
  }
}
