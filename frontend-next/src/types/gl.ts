export type GlAccount = {
  id: number
  code: string
  name: string
  account_type: string
  is_contra: number
  is_active: number
  created_at: string
}

export type GlTrialBalanceRow = {
  id: number
  code: string
  name: string
  account_type: string
  debits: number
  credits: number
  net: number
}

export type GlTrialBalancePayload = {
  period: {
    dateFrom: string | null
    dateTo: string | null
    branchId: number | null
  }
  totals: {
    debits: number
    credits: number
  }
  balanced: boolean
  rows: GlTrialBalanceRow[]
}

export type GlAccountStatementEntry = {
  id: number
  journal_id: number
  posted_at: string
  business_date?: string | null
  reference_type: string | null
  reference_id: string | number | null
  loan_id: number | null
  client_id: number | null
  branch_id: number | null
  branch_name: string | null
  side: string
  debit_amount: number
  credit_amount: number
  amount: number
  transaction_amount: number
  transaction_currency: string | null
  base_currency: string
  journal_transaction_currency: string | null
  exchange_rate: number
  entry_effect: number
  running_balance: number
  memo: string | null
  description: string | null
  note: string | null
}

export type GlAccountStatementDailyGroup = {
  business_date: string | null
  reference_type: string | null
  branch_label: string | null
  branch_count: number
  journal_count: number
  entry_count: number
  total_debits: number
  total_credits: number
  net_effect: number
  closing_balance: number
}

export type GlAccountStatementPayload = {
  period: {
    dateFrom: string | null
    dateTo: string | null
    branchId: number | null
  }
  account: {
    id: number
    code: string
    name: string
    account_type: string
    is_contra: number
    is_active: number
  }
  summary: {
    total_debits: number
    total_credits: number
    closing_balance: number
    entry_count: number
    group_count?: number
  }
  daily_groups: GlAccountStatementDailyGroup[]
  entries: GlAccountStatementEntry[]
}

export type GlFxRate = {
  id: number
  base_currency: string
  quote_currency: string
  rate: number
  source: string
  quoted_at: string
  created_by_user_id: number | null
  created_at: string
}

export type GlBatchRun = {
  id: number
  batch_type: 'eod' | 'eom' | 'eoy' | string
  effective_date: string
  status: string
  started_at: string
  completed_at: string | null
  triggered_by_user_id: number | null
  summary: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export type GlPeriodLock = {
  id: number
  batch_run_id: number | null
  lock_type: 'eod' | 'eom' | 'eoy' | string
  lock_date: string
  status: string
  note: string | null
  locked_by_user_id: number | null
  locked_at: string
  created_at: string
  batch_status: string | null
  batch_completed_at: string | null
}

export type GlCoaVersion = {
  id: number
  version_code: string
  name: string
  status: string
  effective_from: string | null
  effective_to: string | null
  parent_version_id: number | null
  notes: string | null
  created_by_user_id: number | null
  activated_by_user_id: number | null
  activated_at: string | null
  account_count: number
  created_at: string
  updated_at: string
}

export type GlCoaVersionAccount = {
  id: number
  coa_version_id: number
  base_account_id: number | null
  code: string
  name: string
  account_type: string
  is_contra: number
  is_posting_allowed: number
  is_active: number
  created_at: string
  updated_at: string
}

export type GlSuspenseCase = {
  id: number
  external_reference: string | null
  source_channel: string | null
  status: 'open' | 'partially_allocated' | 'resolved' | string
  description: string | null
  branch_id: number | null
  client_id: number | null
  loan_id: number | null
  transaction_currency: string
  transaction_amount: number
  transaction_amount_remaining: number
  book_currency: string
  book_amount: number
  book_amount_remaining: number
  opening_fx_rate: number
  allocated_transaction_amount: number
  allocated_book_amount: number
  allocated_fx_difference: number
  received_at: string
  created_by_user_id: number | null
  resolved_by_user_id: number | null
  resolved_at: string | null
  note: string | null
  created_at: string
  updated_at: string
}
