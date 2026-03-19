/**
 * Client command interfaces — the write-side of the client CQRS layer.
 *
 * Each command is a plain data object describing the intent.
 * Handlers in handlers/ validate, apply domain logic, and persist.
 */

// ---------------------------------------------------------------------------
// CreateClient
// ---------------------------------------------------------------------------
export interface CreateClientCommand {
  /** Calling user context */
  requestedByUserId: number;
  requestedByRole: string;
  requestedByBranchId?: number | null;
  ipAddress: string | null;

  // Core fields
  fullName: string;
  phone?: string | null;
  nationalId?: string | null;
  branchId?: number | null;
  officerId?: number | null;

  // Optional profile fields
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
}

// ---------------------------------------------------------------------------
// UpdateClientKyc
// ---------------------------------------------------------------------------
export interface UpdateClientKycCommand {
  clientId: number;
  status: string;            // "pending" | "verified" | "rejected"
  note?: string | null;
  requestedByUserId: number;
  requestedByRole: string;
  ipAddress: string | null;
}

// ---------------------------------------------------------------------------
// UpdateClientProfile
// ---------------------------------------------------------------------------
export interface UpdateClientProfileCommand {
  clientId: number;
  requestedByUserId: number;
  requestedByRole: string;
  ipAddress: string | null;

  // All optional — only supplied fields are mutated
  fullName?: string | null;
  phone?: string | null;
  nationalId?: string | null;
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
  branchId?: number | null;
}

// ---------------------------------------------------------------------------
// RecordClientFeePayment
// ---------------------------------------------------------------------------
export interface RecordClientFeePaymentCommand {
  clientId: number;
  amount?: number | null;
  paymentReference?: string | null;
  paidAt?: string | null;        // ISO date string; defaults to now
  requestedByUserId: number;
  requestedByRole: string;
  ipAddress: string | null;
}

// ---------------------------------------------------------------------------
// DeactivateClient / ReactivateClient
// ---------------------------------------------------------------------------
export interface DeactivateClientCommand {
  clientId: number;
  requestedByUserId: number;
  requestedByRole: string;
  ipAddress: string | null;
}

export interface ReactivateClientCommand {
  clientId: number;
  requestedByUserId: number;
  requestedByRole: string;
  ipAddress: string | null;
}
