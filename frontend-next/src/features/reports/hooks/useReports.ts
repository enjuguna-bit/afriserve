import { useQuery } from '@tanstack/react-query'
import {
  getArrearsAgingReport,
  getArrearsReport,
  getBalanceSheetReport,
  getBoardSummaryReport,
  getBranchPnLReport,
  getCapitalAdequacyReport,
  getClientRetentionReport,
  getClientSummaryReport,
  getCollectionsSummaryReport,
  getDailyCollectionsReport,
  getDisbursementsReport,
  getDuesReport,
  getGlCashFlowStatementReport,
  getGlChartOfAccountsReport,
  getGlIncomeStatementReport,
  getGlTrialBalanceReport,
  getIncomeStatementReport,
  getMonthlyPerformanceReport,
  getCashFlowStatusReport,
  getOfficerPerformanceReport,
  getOfficerPerformanceV2Report,
  getPortfolioAgingReport,
  getPortfolioReport,
  getReportFilterOptions,
  getWriteOffsPortfolioReport,
  getWriteOffsReport,
} from '../../../services/reportService'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'

// ── Core operational reports ─────────────────────────────────────────────────

export function usePortfolioReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.portfolio(params),
    queryFn: () => getPortfolioReport(params),
    ...queryPolicies.report,
  })
}

export function useDailyCollectionsReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.dailyCollections(params),
    queryFn: () => getDailyCollectionsReport(params),
    ...queryPolicies.report,
  })
}

export function useBoardSummaryReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.boardSummary(params),
    queryFn: () => getBoardSummaryReport(params),
    ...queryPolicies.report,
  })
}

export function useArrearsReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.arrears(params),
    queryFn: () => getArrearsReport(params),
    ...queryPolicies.report,
  })
}

export function useDisbursementsReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.disbursements(params),
    queryFn: () => getDisbursementsReport(params),
    ...queryPolicies.report,
  })
}

export function useDuesReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.dues(params),
    queryFn: () => getDuesReport(params),
    ...queryPolicies.report,
  })
}

export function useCollectionsSummaryReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.collections(params),
    queryFn: () => getCollectionsSummaryReport(params),
    ...queryPolicies.report,
  })
}

export function useClientSummaryReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.clients(params),
    queryFn: () => getClientSummaryReport(params),
    ...queryPolicies.report,
  })
}

export function usePortfolioAgingReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.aging(params),
    queryFn: () => getPortfolioAgingReport(params),
    ...queryPolicies.report,
  })
}

export function useOfficerPerformanceReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.officerPerformance(params),
    queryFn: () => getOfficerPerformanceReport(params),
    ...queryPolicies.report,
  })
}

// ── Finance reports ──────────────────────────────────────────────────────────

export function useIncomeStatementReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.incomeStatement(params),
    queryFn: () => getIncomeStatementReport(params),
    ...queryPolicies.report,
  })
}

export function useWriteOffsReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.writeOffs(params),
    queryFn: () => getWriteOffsReport(params),
    ...queryPolicies.report,
  })
}

export function useBalanceSheetReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.balanceSheet(params),
    queryFn: () => getBalanceSheetReport(params),
    ...queryPolicies.report,
  })
}

export function useGlCashFlowStatementReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.glCashFlow(params),
    queryFn: () => getGlCashFlowStatementReport(params),
    ...queryPolicies.report,
  })
}

// ── GL reports ───────────────────────────────────────────────────────────────

export function useGlChartOfAccountsReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.glAccounts(params),
    queryFn: () => getGlChartOfAccountsReport(params),
    ...queryPolicies.report,
  })
}

export function useGlTrialBalanceReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.glTrialBalance(params),
    queryFn: () => getGlTrialBalanceReport(params),
    ...queryPolicies.report,
  })
}

export function useGlIncomeStatementReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.glIncomeStatement(params),
    queryFn: () => getGlIncomeStatementReport(params),
    ...queryPolicies.report,
  })
}

export function useGlCashFlowReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.glCashFlow(params),
    queryFn: () => getGlCashFlowStatementReport(params),
    ...queryPolicies.report,
  })
}

// ── Stakeholder / performance reports ────────────────────────────────────────

export function useMonthlyPerformanceReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.performanceMonthly(params),
    queryFn: () => getMonthlyPerformanceReport(params),
    ...queryPolicies.report,
  })
}

export function useCashFlowStatusReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.performanceCashflow(params),
    queryFn: () => getCashFlowStatusReport(params),
    ...queryPolicies.report,
  })
}

// ── Gap 8 advanced reports ───────────────────────────────────────────────────

export function useArrearsAgingReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.arrearsAging(params),
    queryFn: () => getArrearsAgingReport(params),
    ...queryPolicies.report,
  })
}

export function useOfficerPerformanceV2Report(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.officerPerformanceV2(params),
    queryFn: () => getOfficerPerformanceV2Report(params),
    ...queryPolicies.report,
  })
}

export function useBranchPnLReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.branchPnl(params),
    queryFn: () => getBranchPnLReport(params),
    ...queryPolicies.report,
  })
}

export function useWriteOffsPortfolioReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.writeOffsPortfolio(params),
    queryFn: () => getWriteOffsPortfolioReport(params),
    ...queryPolicies.report,
  })
}

export function useCapitalAdequacyReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.capitalAdequacy(params),
    queryFn: () => getCapitalAdequacyReport(params),
    ...queryPolicies.report,
  })
}

export function useClientRetentionReport(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.reports.clientRetention(params),
    queryFn: () => getClientRetentionReport(params),
    ...queryPolicies.report,
  })
}

// ── Filter options ────────────────────────────────────────────────────────────

export function useReportFilterOptions(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.reports.filterOptions(params),
    queryFn: () => getReportFilterOptions(params),
    ...queryPolicies.report,
  })
}
