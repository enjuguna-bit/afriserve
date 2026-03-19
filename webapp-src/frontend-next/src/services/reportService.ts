import { apiClient } from './apiClient'
import type { BoardSummaryReport, DailyCollectionsReport, PortfolioReport } from '../types/report'

export type ReportFormat = 'json' | 'csv' | 'pdf' | 'xlsx'
export type ReportQueryParams = Record<string, unknown>
export type ReportPayload = Record<string, unknown>
export type DownloadedReport = {
  blob: Blob
  filename: string | null
  contentType: string | null
}

function normalizeReportPath(path: string): string {
  const rawPath = String(path || '').trim()
  if (!rawPath) {
    return '/reports/portfolio'
  }
  if (rawPath.startsWith('/api/')) {
    return rawPath.slice(4)
  }
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`
}

async function getReport<T>(path: string, params: ReportQueryParams = {}): Promise<T> {
  const { data } = await apiClient.get<T>(normalizeReportPath(path), { params })
  return data
}

function extractFilename(contentDisposition: unknown): string | null {
  const rawValue = String(contentDisposition || '').trim()
  if (!rawValue) {
    return null
  }

  const utf8Match = rawValue.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const simpleMatch = rawValue.match(/filename="?([^";]+)"?/i)
  return simpleMatch?.[1] ? simpleMatch[1] : null
}

async function downloadBinaryReport(
  path: string,
  params: ReportQueryParams,
  format: Exclude<ReportFormat, 'json'>,
): Promise<DownloadedReport> {
  const response = await apiClient.get(normalizeReportPath(path), {
    params: {
      ...params,
      format,
    },
    responseType: 'blob',
  })

  return {
    blob: response.data as Blob,
    filename: extractFilename(response.headers?.['content-disposition']),
    contentType: String(response.headers?.['content-type'] || '') || null,
  }
}

export async function getPortfolioReport(params: Record<string, unknown> = {}): Promise<PortfolioReport> {
  const { data } = await apiClient.get<PortfolioReport>('/reports/portfolio', { params })
  return data
}

export async function getDailyCollectionsReport(params: Record<string, unknown> = {}): Promise<DailyCollectionsReport> {
  const { data } = await apiClient.get<DailyCollectionsReport>('/reports/daily-collections', { params })
  return data
}

export async function getBoardSummaryReport(params: Record<string, unknown> = {}): Promise<BoardSummaryReport> {
  const { data } = await apiClient.get<BoardSummaryReport>('/reports/board-summary', { params })
  return data
}

export async function getArrearsReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/arrears', params)
}

export async function getDisbursementsReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/disbursements', params)
}

export async function getDuesReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/dues', params)
}

export async function getClientSummaryReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/clients', params)
}

export async function getPortfolioAgingReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/aging', params)
}

export async function getIncomeStatementReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/income-statement', params)
}

export async function getWriteOffsReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/write-offs', params)
}

export async function getCollectionsSummaryReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/collections', params)
}

export async function getGlChartOfAccountsReport(params: ReportQueryParams = {}): Promise<ReportPayload[]> {
  return getReport<ReportPayload[]>('/reports/gl/accounts', params)
}

export async function getGlTrialBalanceReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/gl/trial-balance', params)
}

export async function getGlIncomeStatementReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/gl/income-statement', params)
}

export async function getGlCashFlowReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/gl/cash-flow', params)
}

export async function getOfficerPerformanceReport(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/officer-performance', params)
}

export async function getReportFilterOptions(params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>('/reports/filter-options', params)
}

export async function getReportByPath(path: string, params: ReportQueryParams = {}): Promise<ReportPayload> {
  return getReport<ReportPayload>(path, params)
}

export async function downloadReport(
  path: string,
  params: ReportQueryParams,
  format: Exclude<ReportFormat, 'json'>,
): Promise<DownloadedReport> {
  return downloadBinaryReport(path, params, format)
}
