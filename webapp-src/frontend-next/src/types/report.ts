export type PortfolioReport = {
  total_loans: number
  active_loans: number
  restructured_loans: number
  written_off_loans: number
  overdue_installments: number
  overdue_amount?: number
  principal_disbursed: number
  expected_total: number
  repaid_total: number
  outstanding_balance: number
  written_off_balance: number
  parRatio?: number
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
    par90_balance: number
    par30_ratio: number
    par90_ratio: number
  }
  collections: {
    repayment_count: number
    loans_with_repayments: number
    total_collected: number
    total_due: number
    total_paid_against_due: number
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
    }>
    top_risk_branches: Array<{
      branch_id: number
      branch_name: string
      region_name: string
      loans_in_arrears: number
      total_arrears_amount: number
      at_risk_balance: number
      par30_balance: number
    }>
  }
}
