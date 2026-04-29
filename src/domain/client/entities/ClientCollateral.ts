/** Collateral asset entity - belongs to a Client aggregate. */
export type CollateralAssetType = "chattel" | "vehicle" | "land" | "equipment" | "machinery" | "inventory" | "livestock" | "savings";
export type CollateralOwnershipType = "client" | "guarantor" | "third_party";
export type CollateralStatus = "active" | "released" | "liquidated";

export interface ClientCollateralProps {
  id: number | null;
  clientId: number;
  branchId: number | null;
  createdByUserId: number;
  assetType: CollateralAssetType;
  description: string;
  estimatedValue: number;
  ownershipType: CollateralOwnershipType;
  ownerName: string | null;
  ownerNationalId: string | null;
  registrationNumber: string | null;
  logbookNumber: string | null;
  titleNumber: string | null;
  locationDetails: string | null;
  valuationDate: string | null;
  status: CollateralStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientCollateral {
  private _props: ClientCollateralProps;

  private constructor(props: ClientCollateralProps) {
    this._props = props;
  }

  static create(params: Omit<ClientCollateralProps, "id" | "status" | "createdAt" | "updatedAt">): ClientCollateral {
    const now = new Date();
    return new ClientCollateral({ ...params, id: null, status: "active", createdAt: now, updatedAt: now });
  }

  static reconstitute(props: ClientCollateralProps): ClientCollateral {
    return new ClientCollateral(props);
  }

  get id(): number | null               { return this._props.id; }
  get clientId(): number                { return this._props.clientId; }
  get branchId(): number | null         { return this._props.branchId; }
  get assetType(): CollateralAssetType  { return this._props.assetType; }
  get estimatedValue(): number          { return this._props.estimatedValue; }
  get status(): CollateralStatus        { return this._props.status; }
  get isActive(): boolean               { return this._props.status === "active"; }

  update(changes: Partial<Pick<ClientCollateralProps,
    "assetType" | "description" | "estimatedValue" | "ownershipType" | "ownerName" |
    "ownerNationalId" | "registrationNumber" | "logbookNumber" | "titleNumber" |
    "locationDetails" | "valuationDate"
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
      asset_type:           p.assetType,
      description:          p.description,
      estimated_value:      p.estimatedValue,
      ownership_type:       p.ownershipType,
      owner_name:           p.ownerName,
      owner_national_id:    p.ownerNationalId,
      registration_number:  p.registrationNumber,
      logbook_number:       p.logbookNumber,
      title_number:         p.titleNumber,
      location_details:     p.locationDetails,
      valuation_date:       p.valuationDate,
      status:               p.status,
      created_at:           p.createdAt.toISOString(),
      updated_at:           p.updatedAt.toISOString(),
    };
  }
}
