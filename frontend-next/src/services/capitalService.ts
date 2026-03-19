import { apiClient } from './apiClient'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CapitalTransactionType = 'deposit' | 'withdrawal'
export type CapitalTransactionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type CapitalTransaction = {
  id: number
  transaction_type: CapitalTransactionType
  status: CapitalTransactionStatus
  amount: number
  currency: string
  submitted_by_user_id: number
  submitted_by_name: string | null
  submitted_by_role: string
  branch_id: number | null
  branch_name: string | null
  approved_by_user_id: number | null
  approved_by_name: string | null
  approved_at: string | null
  rejected_by_user_id: number | null
  rejected_by_name: string | null
  rejected_at: string | null
  rejection_reason: string | null
  cashflow_net_at_submission: number | null
  cashflow_override_note: string | null
  gl_journal_id: number | null
  reference: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type CapitalTransactionPage = {
  data: CapitalTransaction[]
  paging: { total: number; limit: number; offset: number }
}

export type CashflowPosition = {
  branchId: number | null
  net: number
  total_inflow: number
  total_outflow: number
  pending_withdrawals: number
  available_after_pending: number
}

export type CreateCapitalPayload = {
  amount: number
  currency?: string
  branchId?: number | null
  reference?: string | null
  note?: string | null
}

export type WithdrawalSubmitResult = {
  transaction: CapitalTransaction
  cashflow_at_submission: CashflowPosition
  cashflow_warning: string | null
}

export type ListCapitalQuery = {
  type?: CapitalTransactionType | null
  status?: CapitalTransactionStatus | null
  branchId?: number | null
  limit?: number
  offset?: number
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function getCashflowPosition(branchId?: number | null): Promise<CashflowPosition> {
  const params: Record<string, unknown> = {}
  if (branchId) params.branchId = branchId
  const { data } = await apiClient.get<CashflowPosition>('/capital/cashflow-position', { params })
  return data
}

export async function listCapitalTransactions(
  query: ListCapitalQuery = {},
): Promise<CapitalTransactionPage> {
  const params: Record<string, unknown> = {}
  if (query.type)     params.type     = query.type
  if (query.status)   params.status   = query.status
  if (query.branchId) params.branchId = query.branchId
  params.limit  = query.limit  ?? 50
  params.offset = query.offset ?? 0
  const { data } = await apiClient.get<CapitalTransactionPage>('/capital/transactions', { params })
  return data
}

export async function createCapitalDeposit(payload: CreateCapitalPayload): Promise<CapitalTransaction> {
  const { data } = await apiClient.post<CapitalTransaction>('/capital/deposits', payload)
  return data
}

export async function createCapitalWithdrawal(
  payload: CreateCapitalPayload,
): Promise<WithdrawalSubmitResult> {
  const { data } = await apiClient.post<WithdrawalSubmitResult>('/capital/withdrawals', payload)
  return data
}

export async function approveCapitalTransaction(
  id: number,
  cashflowOverrideNote?: string | null,
): Promise<CapitalTransaction> {
  const { data } = await apiClient.post<CapitalTransaction>(
    `/capital/transactions/${id}/approve`,
    { cashflowOverrideNote: cashflowOverrideNote ?? null },
  )
  return data
}

export async function rejectCapitalTransaction(
  id: number,
  reason: string,
): Promise<CapitalTransaction> {
  const { data } = await apiClient.post<CapitalTransaction>(
    `/capital/transactions/${id}/reject`,
    { reason },
  )
  return data
}
