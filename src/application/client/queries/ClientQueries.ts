/**
 * Client query interfaces and DTOs — the read-side of the client CQRS layer.
 */

// ---------------------------------------------------------------------------
// GetClient
// ---------------------------------------------------------------------------
export interface GetClientQuery {
  clientId: number;
  requestedByUserId: number;
  requestedByRole: string;
}

export interface ClientDto {
  id: number;
  full_name: string;
  phone: string | null;
  national_id: string | null;
  branch_id: number | null;
  officer_id: number | null;
  kyc_status: string;
  onboarding_status: string;
  fee_payment_status: string;
  is_active: number;
  created_at: string;
  updated_at: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// ListClients
// ---------------------------------------------------------------------------
export interface ListClientsQuery {
  requestedByUserId: number;
  requestedByRole: string;
  branchId?: number | null;
  officerId?: number | null;
  search?: string | null;
  status?: string | null;
  page?: number;
  limit?: number;
}

export interface ListClientsDto {
  clients: ClientDto[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// GetClientOnboardingStatus
// ---------------------------------------------------------------------------
export interface GetClientOnboardingStatusQuery {
  clientId: number;
  requestedByUserId: number;
  requestedByRole: string;
}

export interface ClientOnboardingStatusDto {
  clientId: number;
  onboarding_status: string;
  kyc_status: string;
  fee_payment_status: string;
  ready_for_loan_application: boolean;
  blockers: string[];
  guarantor_count: number;
  collateral_count: number;
}

// ---------------------------------------------------------------------------
// GetClientHistory
// ---------------------------------------------------------------------------
export interface GetClientHistoryQuery {
  clientId: number;
  requestedByUserId: number;
  requestedByRole: string;
}
