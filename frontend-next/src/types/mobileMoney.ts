export type MobileMoneyC2BEvent = {
  id: number
  provider: string
  external_receipt: string
  account_reference: string | null
  payer_phone: string | null
  amount: number
  paid_at: string | null
  status: string
  raw_status?: string
  loan_id: number | null
  repayment_id: number | null
  reconciliation_note: string | null
  reconciled_at: string | null
  created_at: string
}

export type MobileMoneyB2CDisbursement = {
  id: number
  request_id: string | null
  loan_id: number
  provider: string
  amount: number
  phone_number: string
  account_reference: string | null
  narration: string | null
  initiated_by_user_id: number | null
  provider_request_id: string | null
  status: 'pending' | 'accepted' | 'completed' | 'failed' | 'core_failed'
  failure_reason: string | null
  reversal_attempts: number
  reversal_last_requested_at: string | null
  created_at: string
  updated_at: string
}

export type MobileMoneyB2CSummary = {
  total: number
  completed_count: number
  failed_count: number
  core_failed_count: number
  reversal_required_count: number
  total_reversal_attempts: number
}
