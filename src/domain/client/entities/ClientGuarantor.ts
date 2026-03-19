/** Guarantor entity - belongs to a Client aggregate. */
export interface ClientGuarantorProps {
  id: number | null;        // null for unsaved
  clientId: number;
  branchId: number | null;
  createdByUserId: number;
  fullName: string;
  phone: string | null;
  nationalId: string | null;
  physicalAddress: string | null;
  occupation: string | null;
  employerName: string | null;
  monthlyIncome: number;
  guaranteeAmount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientGuarantor {
  private _props: ClientGuarantorProps;

  private constructor(props: ClientGuarantorProps) {
    this._props = props;
  }

  static create(params: Omit<ClientGuarantorProps, "id" | "isActive" | "createdAt" | "updatedAt">): ClientGuarantor {
    const now = new Date();
    return new ClientGuarantor({ ...params, id: null, isActive: true, createdAt: now, updatedAt: now });
  }

  static reconstitute(props: ClientGuarantorProps): ClientGuarantor {
    return new ClientGuarantor(props);
  }

  get id(): number | null           { return this._props.id; }
  get clientId(): number            { return this._props.clientId; }
  get branchId(): number | null     { return this._props.branchId; }
  get fullName(): string            { return this._props.fullName; }
  get phone(): string | null        { return this._props.phone; }
  get nationalId(): string | null   { return this._props.nationalId; }
  get guaranteeAmount(): number     { return this._props.guaranteeAmount; }
  get isActive(): boolean           { return this._props.isActive; }

  update(changes: Partial<Pick<ClientGuarantorProps,
    "fullName" | "phone" | "nationalId" | "physicalAddress" |
    "occupation" | "employerName" | "monthlyIncome" | "guaranteeAmount"
  >>): void {
    Object.assign(this._props, changes);
    this._props.updatedAt = new Date();
  }

  toPersistence(): Record<string, unknown> {
    const p = this._props;
    return {
      id:                   p.id,
      client_id:            p.clientId,
      branch_id:            p.branchId,
      created_by_user_id:   p.createdByUserId,
      full_name:            p.fullName,
      phone:                p.phone,
      national_id:          p.nationalId,
      physical_address:     p.physicalAddress,
      occupation:           p.occupation,
      employer_name:        p.employerName,
      monthly_income:       p.monthlyIncome,
      guarantee_amount:     p.guaranteeAmount,
      is_active:            p.isActive ? 1 : 0,
      created_at:           p.createdAt.toISOString(),
      updated_at:           p.updatedAt.toISOString(),
    };
  }
}
