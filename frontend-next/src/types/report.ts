export type PortfolioReport = {
  // Core totals
  total_loans: number
  active_loans: number
  restructured_loans: number
  written_off_loans: number
  overdue_installments: number
  overdue_loans?: number
  overdue_amount?: number
  principal_disbursed: number
  expected_total: number
  repaid_total: number
  outstanding_balance: number
  written_off_balance: number
  at_risk_balance?: number
  // Legacy camelCase aliases (backend emits both)
  parRatio?: number
  totalLoans?: number
  activeLoans?: number
  totalDisbursed?: number
  totalOutstanding?: number
  totalCollected?: number
  overdueCount?: number
  overdueAmount?: number
  atRiskOutstanding?: number
  // Period
  period?: {
    dateFrom: string | null
    dateTo: string | null
  }
  // Optional breakdown (only when includeBreakdown=true)
  branchBreakdown?: Array<{
    branch_id: number
    branch_name: string | null
    branch_code: string | null
    region_id: number
    region_name: string | null
    total_loans: number
    active_loans: number
    outstanding_balance: number
    overdue_installments: number
  }>
  regionBreakdown?: Array<{
    region_id: number
    region_name: string | null
    branch_count: number
    total_loans: number
    active_loans: number
    outstanding_balance: number
  }>
}

export type DailyCollectionsReport = {
  period: {
    dateFrom: string | null
    dateTo: string | null
  }
  dailyCollections: Array<{
    date: string
    repayment_count: number
    total_collected: number
    current_due_collected: number
    arrears_collected: number
    advance_collected: number
    unapplied_credit: number
    unique_loans: number
  }>
}

export type BoardSummaryReport = {
  generatedAt: string
  scopeFilter: 'all' | 'mine'
  period: {
    dateFrom: string
    dateTo: string
    days: number
  }
  portfolio: {
    total_loans: number
    active_loans: number
    principal_disbursed: number
    repaid_total: number
    outstanding_balance: number
    overdue_loans: number
    overdue_amount: number
    par_ratio: number
  }
  risk: {
    loans_in_arrears: number
    total_arrears_amount: number
    at_risk_balance: number
    par30_balance: number
    par60_balance: number
    par90_balance: number
    npl_balance: number
    par30_ratio: number
    par60_ratio: number
    par90_ratio: number
    npl_ratio: number
  }
  collections: {
    repayment_count: number
    loans_with_repayments: number
    total_collected: number
    total_due: number
    total_paid_against_due: number
    arrears_collected: number
    advance_collected: number
    unapplied_credit: number
    collection_rate: number
  }
  sustainability: {
    collection_coverage_ratio: number
    liquidity_from_collections_ratio: number
    risk_adjusted_collection_ratio: number
  }
  trends: {
    daily_collections: Array<{
      date: string
      repayment_count: number
      total_collected: number
      current_due_collected: number
      arrears_collected: number
      advance_collected: number
      unapplied_credit: number
    }>
    top_risk_branches: Array<{
      branch_id: number
      branch_name: string
      region_name: string
      loans_in_arrears: number
      total_arrears_amount: number
      at_risk_balance: number
      par30_balance: number
      par60_balance: number
      par90_balance: number
      npl_balance: number
    }>
  }
}

export type MonthlyPerformanceProductTier = {
  label: string
  accountCode: string
  amount: number
  loanCount: number
}

export type MonthlyPerformanceReport = {
  month?: string
  interest_income?: number
  fee_income?: number
  penalty_income?: number
  total_income?: number
  interest_by_product?: Record<string, MonthlyPerformanceProductTier>
}

export type StakeholderCashFlowStatusReport = {
  total_inflow?: number
  total_outflow?: number
  net_cash_flow?: number
  capital_deposits?: number
  capital_withdrawals?: number
  pending_withdrawals?: number
  period?: string
}

export type ReportCatalogEntry = {
  id: string
  label: string
  description?: string
  category: string
  endpoint: string
}

export type ReportFilterOptions = {
  scope?: {
    level?: string | null
    role?: string | null
    branchId?: number | null
    regionId?: number | null
  }
  levels?: string[]
  offices?: Array<{
    id: number | string
    name: string
    code?: string | null
    regionId?: number | null
    regionName?: string | null
    scopeType?: 'overall' | 'region' | 'branch' | null
  }>
  agents?: Array<{
    id: number | string
    name: string
    role?: string | null
    branchId?: number | null
    branchName?: string | null
    branchCode?: string | null
    managedLoans?: number
    scopeType?: 'overall' | 'user' | null
  }>
  ui?: {
    levelLocked?: boolean
    officeLocked?: boolean
    agentLocked?: boolean
    officeLabel?: string | null
    officePlaceholder?: string | null
    agentLabel?: string | null
    agentPlaceholder?: string | null
  }
  categories?: Array<{ id: string; label: string }>
  reports?: ReportCatalogEntry[]
}

// ── Gap 8 report types ──────────────────────────────────────────────────────

export type AgingBucket = {
  loan_count: number
  client_count: number
  arrears_amount: number
  outstanding_balance: number
}

export type ArrearsAgingReport = {
  as_of: string
  totals: {
    total_overdue_loans: number
    total_overdue_clients: number
    total_arrears_amount: number
    total_outstanding: number
  }
  buckets: {
    '1_30_days': AgingBucket
    '31_60_days': AgingBucket
    '61_90_days': AgingBucket
    '91_plus_days': AgingBucket
  }
  branch_breakdown: Array<{
    branch_id: number
    branch_name: string | null
    branch_code: string | null
    buckets: ArrearsAgingReport['buckets']
  }>
}

export type OfficerPerformanceV2Officer = {
  officer_id: number
  officer_name: string | null
  officer_email: string | null
  branch_id: number
  disbursed_loans: number
  disbursed_principal: number
  active_loans: number
  outstanding_balance: number
  collected_in_period: number
  written_off_loans: number
  written_off_balance: number
  overdue_loans: number
  overdue_arrears: number
  par_ratio: number
}

export type OfficerPerformanceV2Report = {
  period: { dateFrom: string | null; dateTo: string | null }
  as_of: string
  summary: {
    total_officers: number
    total_disbursed_loans: number
    total_disbursed_principal: number
    total_active_loans: number
    total_outstanding_balance: number
    total_collected_in_period: number
    total_overdue_loans: number
    total_overdue_arrears: number
  }
  officers: OfficerPerformanceV2Officer[]
}

export type BranchPnLBranch = {
  branch_id: number
  branch_name: string | null
  branch_code: string | null
  region_name: string | null
  loan_count: number
  interest_income: number
  fee_income: number
  penalty_income: number
  gross_income: number
  write_off_amount: number
  provision_credit_loss: number
  total_expenses: number
  net_income: number
  collected_in_period: number
}

export type BranchPnLReport = {
  period: { dateFrom: string | null; dateTo: string | null }
  totals: Omit<BranchPnLBranch, 'branch_id' | 'branch_name' | 'branch_code' | 'region_name' | 'loan_count'>
  branches: BranchPnLBranch[]
}

export type WriteOffLoan = {
  loan_id: number
  client_id: number
  client_name: string | null
  branch_id: number
  branch_name: string | null
  officer_id: number | null
  officer_name: string | null
  principal: number
  repaid_total: number
  net_loss: number
  written_off_at: string | null
}

export type WriteOffPortfolioReport = {
  period: { dateFrom: string | null; dateTo: string | null }
  summary: {
    total_write_offs: number
    total_principal_written_off: number
    total_recovered: number
    total_net_loss: number
    recovery_rate: number
  }
  loans: WriteOffLoan[]
}

export type CapitalAdequacyReport = {
  as_of: string
  total_loans: number
  total_principal_disbursed: number
  gross_outstanding: number
  provision_pool: number
  written_off_principal: number
  written_off_net_loss: number
  par30_balance: number
  par60_balance: number
  par90_balance: number
  npl_balance: number
  par30_ratio: number
  par60_ratio: number
  par90_ratio: number
  npl_ratio: number
  write_off_rate: number
}

export type ClientRetentionCycle = {
  cycle: 'cycle_1' | 'cycle_2' | 'cycle_3' | 'cycle_4_plus'
  client_count: number
  avg_loan_size: number
  returned_count: number
  dropout_count: number
  retention_rate: number
}

export type ClientRetentionReport = {
  period: { dateFrom: string | null; dateTo: string | null }
  total_clients: number
  overall_retention_rate: number
  cycles: ClientRetentionCycle[]
}

// ── Finance report types ─────────────────────────────────────────────────────

export type BalanceSheetReport = {
  period: { asOfDate: string }
  assets: { cash: number; loan_receivable: number; total_assets: number }
  liabilities: { suspense_funds: number; total_liabilities: number }
  equity: { retained_earnings: number; total_equity: number }
  balanced: boolean
}

export type CashFlowReport = {
  period: { dateFrom: string | null; dateTo: string | null }
  inflows: { repayments: number; suspense: number; total: number }
  outflows: { disbursements: number; total: number }
  net_reversals: number
  net_cash_flow: number
}
