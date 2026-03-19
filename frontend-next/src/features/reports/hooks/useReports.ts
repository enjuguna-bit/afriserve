import { useQuery } from '@tanstack/react-query'
import { getBoardSummaryReport, getDailyCollectionsReport, getPortfolioReport } from '../../../services/reportService'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'

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
