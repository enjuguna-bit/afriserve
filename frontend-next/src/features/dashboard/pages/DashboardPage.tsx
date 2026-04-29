import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import { useAuth } from '../../../hooks/useAuth'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'
import { useDashboardStore } from '../../../store/dashboardStore'
import { useClients } from '../../clients/hooks/useClients'
import { resolveDashboardBranchIdFilter } from '../dashboardScope'
import {
  getArrearsReport,
  getClientSummaryReport,
  getCollectionsSummaryReport,
  getDailyCollectionsReport,
  getDisbursementsReport,
  getDuesReport,
  getPortfolioReport,
  getReportFilterOptions,
} from '../../../services/reportService'
import { listPendingApprovalLoans } from '../../../services/loanService'
import styles from './DashboardPage.module.css'
import { DashboardMetricCard, type DashboardFilterParams } from '../components/DashboardMetricCard'

const DashboardScaffoldPanels = lazy(() => import('../components/DashboardScaffoldPanels').then((module) => ({ default: module.DashboardScaffoldPanels })))
const BUSINESS_TIME_ZONE = 'Africa/Nairobi'
const BUSINESS_TIME_ZONE_OFFSET_MS = 3 * 60 * 60 * 1000

type SummaryPayload = Record<string, unknown>
type DashboardFilterOptionsPayload = {
  offices?: Array<{
    id: number | string
    name: string
    code?: string | null
    scopeType?: string | null
  }>
  agents?: Array<{
    id: number | string
    name: string
    role?: string | null
    branchId?: number | null
  }>
  scope?: {
    branchId?: number | null
  }
  ui?: {
    officeLabel?: string | null
    agentLabel?: string | null
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatPercent(value: number) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`
}

function formatBusinessDateInputValue(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    return ''
  }

  return `${year}-${month}-${day}`
}

function buildDashboardReportFilterParams({
  reportId,
  categoryId,
  datePreset,
  customDateFrom,
  customDateTo,
  dateFrom,
  dateTo,
  officeId,
  officerId,
  extraParams,
}: {
  reportId: string
  categoryId: string
  datePreset?: string
  customDateFrom?: string
  customDateTo?: string
  dateFrom?: string
  dateTo?: string
  officeId?: number | null
  officerId?: number | null
  extraParams?: DashboardFilterParams
}): DashboardFilterParams {
  return {
    reportId,
    categoryId,
    autoload: '1',
    ...(datePreset ? { datePreset } : {}),
    ...(customDateFrom ? { customDateFrom } : {}),
    ...(customDateTo ? { customDateTo } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(typeof officeId === 'number' && officeId > 0 ? { officeId } : {}),
    ...(typeof officerId === 'number' && officerId > 0 ? { officerIds: officerId } : {}),
    ...(extraParams || {}),
  }
}

function buildDashboardListFilterParams({
  branchId,
  officerId,
  extraParams,
}: {
  branchId?: number | null
  officerId?: number | null
  extraParams?: DashboardFilterParams
}): DashboardFilterParams {
  return {
    ...(typeof branchId === 'number' && branchId > 0 ? { branchId } : {}),
    ...(typeof officerId === 'number' && officerId > 0 ? { officerId } : {}),
    ...(extraParams || {}),
  }
}
function startOfDayIso(now: Date) {
  const businessDate = new Date(now.getTime() + BUSINESS_TIME_ZONE_OFFSET_MS)
  businessDate.setUTCHours(0, 0, 0, 0)
  return new Date(businessDate.getTime() - BUSINESS_TIME_ZONE_OFFSET_MS).toISOString()
}

function startOfMonthIso(now: Date) {
  const businessDate = new Date(now.getTime() + BUSINESS_TIME_ZONE_OFFSET_MS)
  businessDate.setUTCDate(1)
  businessDate.setUTCHours(0, 0, 0, 0)
  return new Date(businessDate.getTime() - BUSINESS_TIME_ZONE_OFFSET_MS).toISOString()
}

function toPositiveNumber(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return []
  }

  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ))
}

export function DashboardPage() {
  const { user } = useAuth()
  const [selectedOfficeId, setSelectedOfficeId] = useState('')
  const [selectedOfficerId, setSelectedOfficerId] = useState('')
  const [draftOfficeId, setDraftOfficeId] = useState('')
  const [draftOfficerId, setDraftOfficerId] = useState('')
  const isFilterOpen = useDashboardStore((state) => state.isFilterOpen)
  const openFilter = useDashboardStore((state) => state.openFilter)
  const closeFilter = useDashboardStore((state) => state.closeFilter)
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null)
  const filterModalRef = useRef<HTMLDivElement | null>(null)
  const lastFocusedElementRef = useRef<HTMLElement | null>(null)
  const [now, setNow] = useState(() => new Date())
  const todayStart = useMemo(() => startOfDayIso(now), [now])
  const monthStart = useMemo(() => startOfMonthIso(now), [now])
  const nowIso = useMemo(() => now.toISOString(), [now])
  const normalizedRole = String(user?.role || '').trim().toLowerCase()
  const isBranchManager = normalizedRole === 'operations_manager' || normalizedRole === 'admin'

  useEffect(() => {
    function refreshDates() {
      if (document.visibilityState === 'visible') {
        setNow(new Date())
      }
    }
    document.addEventListener('visibilitychange', refreshDates)
    return () => document.removeEventListener('visibilitychange', refreshDates)
  }, [])

  const dashboardFilterOptionsQuery = useQuery({
    queryKey: queryKeys.reports.filterOptions({ agentRole: 'loan_officer' }),
    queryFn: () => getReportFilterOptions({ agentRole: 'loan_officer' }),
    enabled: isBranchManager,
    ...queryPolicies.report,
  })

  const dashboardFilterOptions = dashboardFilterOptionsQuery.data as DashboardFilterOptionsPayload | undefined
  const normalizedFilterOptions = useMemo(() => ({
    offices: Array.isArray(dashboardFilterOptions?.offices) ? dashboardFilterOptions.offices : [],
    agents: Array.isArray(dashboardFilterOptions?.agents) ? dashboardFilterOptions.agents : [],
    officeLabel: dashboardFilterOptions?.ui?.officeLabel || 'Office',
    agentLabel: dashboardFilterOptions?.ui?.agentLabel || 'Agent',
    scopedBranchId: toPositiveNumber(dashboardFilterOptions?.scope?.branchId),
  }), [dashboardFilterOptions])
  const { offices, agents, officeLabel, agentLabel, scopedBranchId } = normalizedFilterOptions
  const fallbackOfficeId = useMemo(() => {
    if (!isBranchManager || offices.length === 0) {
      return ''
    }

    const preferredOffice = offices.find((entry) => (
      String(entry.scopeType || '').trim().toLowerCase() === 'branch'
      && toPositiveNumber(entry.id) === scopedBranchId
    ))

    return String(preferredOffice?.id ?? offices[0].id ?? '')
  }, [isBranchManager, offices, scopedBranchId])
  const effectiveSelectedOfficeId = selectedOfficeId && offices.some((entry) => String(entry.id) === String(selectedOfficeId))
    ? selectedOfficeId
    : fallbackOfficeId

  const selectedOffice = useMemo(
    () => offices.find((entry) => String(entry.id) === String(effectiveSelectedOfficeId)) || null,
    [effectiveSelectedOfficeId, offices],
  )

  const availableAgents = useMemo(() => {
    const officeScopeType = String(selectedOffice?.scopeType || '').trim().toLowerCase()
    if (officeScopeType !== 'branch') {
      return agents
    }

    const branchId = toPositiveNumber(selectedOffice?.id)
    if (!branchId) {
      return agents
    }

    return agents.filter((entry) => toPositiveNumber(entry.branchId) === branchId)
  }, [agents, selectedOffice])

  const effectiveDraftOfficeId = draftOfficeId && offices.some((entry) => String(entry.id) === String(draftOfficeId))
    ? draftOfficeId
    : effectiveSelectedOfficeId
  const draftSelectedOffice = useMemo(
    () => offices.find((entry) => String(entry.id) === String(effectiveDraftOfficeId)) || null,
    [effectiveDraftOfficeId, offices],
  )

  const draftAvailableAgents = useMemo(() => {
    const officeScopeType = String(draftSelectedOffice?.scopeType || '').trim().toLowerCase()
    if (officeScopeType !== 'branch') {
      return agents
    }

    const branchId = toPositiveNumber(draftSelectedOffice?.id)
    if (!branchId) {
      return agents
    }

    return agents.filter((entry) => toPositiveNumber(entry.branchId) === branchId)
  }, [agents, draftSelectedOffice])

  const effectiveSelectedOfficerId = selectedOfficerId && availableAgents.some((entry) => String(entry.id) === String(selectedOfficerId))
    ? selectedOfficerId
    : ''
  const effectiveDraftOfficerId = draftOfficerId && draftAvailableAgents.some((entry) => String(entry.id) === String(draftOfficerId))
    ? draftOfficerId
    : ''
  const selectedOfficeScopeType = String(selectedOffice?.scopeType || '').trim().toLowerCase()
  const isOverallOfficeScope = selectedOfficeScopeType === 'overall'
  const branchIdFilter = isBranchManager
    ? resolveDashboardBranchIdFilter({
      normalizedRole,
      selectedOffice,
      userBranchId: user?.branch_id,
    })
    : undefined
  const officerIdFilter = toPositiveNumber(effectiveSelectedOfficerId) ?? undefined
  const reportParams = useMemo(() => ({
    ...(branchIdFilter ? { branchId: branchIdFilter } : {}),
    ...(officerIdFilter ? { officerId: officerIdFilter } : {}),
  }), [branchIdFilter, officerIdFilter])

  const activeAgent = useMemo(
    () => availableAgents.find((entry) => String(entry.id) === String(effectiveSelectedOfficerId)) || null,
    [availableAgents, effectiveSelectedOfficerId],
  )
  const canFilterDashboard = isBranchManager && agents.length > 0
  const dashboardModeLabel = activeAgent
    ? `${activeAgent.name} dashboard`
    : (isOverallOfficeScope ? 'Portfolio dashboard' : 'Branch dashboard')
  const loadingText = activeAgent
    ? 'Loading officer dashboard...'
    : (isBranchManager
      ? (isOverallOfficeScope ? 'Loading portfolio dashboard...' : 'Loading branch dashboard...')
      : 'Loading dashboard...')
  const errorText = activeAgent
    ? 'Unable to load officer dashboard.'
    : (isBranchManager
      ? (isOverallOfficeScope ? 'Unable to load portfolio dashboard.' : 'Unable to load branch dashboard.')
      : 'Unable to load dashboard.')

  const clientsQuery = useClients({
    limit: 1,
    offset: 0,
    sortBy: 'id',
    sortOrder: 'desc',
    ...(branchIdFilter ? { branchId: branchIdFilter } : {}),
    ...(officerIdFilter ? { officerId: officerIdFilter } : {}),
  })
  const portfolioQuery = useQuery({
    queryKey: ['dashboard', 'portfolio', reportParams],
    queryFn: () => getPortfolioReport(reportParams),
    ...queryPolicies.report,
  })
  const monthlyClientSummaryQuery = useQuery({
    queryKey: ['dashboard', 'clients-summary', monthStart, nowIso, reportParams],
    queryFn: () => getClientSummaryReport({ dateFrom: monthStart, dateTo: nowIso, ...reportParams }),
    ...queryPolicies.report,
  })
  const monthlyDisbursementsQuery = useQuery({
    queryKey: ['dashboard', 'disbursements', 'month', monthStart, nowIso, reportParams],
    queryFn: () => getDisbursementsReport({ dateFrom: monthStart, dateTo: nowIso, ...reportParams }),
    ...queryPolicies.report,
  })
  const dailyDisbursementsQuery = useQuery({
    queryKey: ['dashboard', 'disbursements', 'today', todayStart, nowIso, reportParams],
    queryFn: () => getDisbursementsReport({ dateFrom: todayStart, dateTo: nowIso, ...reportParams }),
    ...queryPolicies.report,
  })
  const collectionsSummaryQuery = useQuery({
    queryKey: ['dashboard', 'collections-summary', todayStart, nowIso, reportParams],
    queryFn: () => getCollectionsSummaryReport({ dateFrom: todayStart, dateTo: nowIso, ...reportParams }),
    ...queryPolicies.report,
  })
  const collectionsTodayQuery = useQuery({
    queryKey: ['dashboard', 'daily-collections', todayStart, nowIso, reportParams],
    queryFn: () => getDailyCollectionsReport({ dateFrom: todayStart, dateTo: nowIso, ...reportParams }),
    ...queryPolicies.report,
  })
  const duesQuery = useQuery({
    queryKey: ['dashboard', 'dues', todayStart, nowIso, reportParams],
    queryFn: () => getDuesReport({ dateFrom: todayStart, dateTo: nowIso, ...reportParams }),
    ...queryPolicies.report,
  })
  const arrearsQuery = useQuery({
    queryKey: ['dashboard', 'arrears', reportParams],
    queryFn: () => getArrearsReport(reportParams),
    ...queryPolicies.report,
  })
  const pendingApprovalsQuery = useQuery({
    queryKey: ['dashboard', 'pending-approvals', branchIdFilter],
    queryFn: () => listPendingApprovalLoans({
      limit: 1,
      ...(branchIdFilter ? { branchId: branchIdFilter } : {}),
    }),
    enabled: isBranchManager || normalizedRole === 'admin',
    ...queryPolicies.report,
  })

  const isLoading = (
    clientsQuery.isLoading
    || portfolioQuery.isLoading
    || monthlyClientSummaryQuery.isLoading
    || monthlyDisbursementsQuery.isLoading
    || dailyDisbursementsQuery.isLoading
    || collectionsSummaryQuery.isLoading
    || collectionsTodayQuery.isLoading
    || duesQuery.isLoading
    || arrearsQuery.isLoading
  )
  const isError = (
    clientsQuery.isError
    || portfolioQuery.isError
    || monthlyClientSummaryQuery.isError
    || monthlyDisbursementsQuery.isError
    || dailyDisbursementsQuery.isError
    || collectionsSummaryQuery.isError
    || collectionsTodayQuery.isError
    || duesQuery.isError
    || arrearsQuery.isError
  )

  const portfolio = portfolioQuery.data
  const monthlyClientSummary = (monthlyClientSummaryQuery.data as { summary?: SummaryPayload } | undefined)?.summary || {}
  const monthlyDisbursementsSummary = (monthlyDisbursementsQuery.data as { summary?: SummaryPayload } | undefined)?.summary || {}
  const dailyDisbursementsSummary = (dailyDisbursementsQuery.data as { summary?: SummaryPayload } | undefined)?.summary || {}
  const collectionsSummary = (collectionsSummaryQuery.data as { summary?: SummaryPayload } | undefined)?.summary || {}
  const dailyCollections = (collectionsTodayQuery.data as { dailyCollections?: Array<Record<string, unknown>> } | undefined)?.dailyCollections || []
  const duesPayload = duesQuery.data as {
    duesInPeriod?: SummaryPayload
    alreadyOverdueBeforePeriod?: SummaryPayload
  } | undefined
  const arrearsSummary = (arrearsQuery.data as { summary?: SummaryPayload } | undefined)?.summary || {}

  const borrowerCount = Number(clientsQuery.data?.paging.total || 0)
  const activeLoans = Number(portfolio?.active_loans || 0)
  const outstandingBalance = Number(portfolio?.outstanding_balance || 0)
  const monthlyNewCustomers = Number(monthlyClientSummary.new_clients_registered || 0)
  const monthlyDeclinedLoans = Number(monthlyClientSummary.declined_loans || monthlyClientSummary.declined_loans_in_period || 0)
  const monthlyDisbursedLoans = Number(monthlyDisbursementsSummary.total_loans || 0)
  const monthlyNewDisbursements = Number(monthlyDisbursementsSummary.new_client_loans || 0)
  const monthlyRepeatDisbursements = Number(monthlyDisbursementsSummary.repeat_client_loans || 0)
  const dailyDisbursedLoans = Number(dailyDisbursementsSummary.total_loans || 0)
  const dailyNewDisbursements = Number(dailyDisbursementsSummary.new_client_loans || 0)
  const dailyRepeatDisbursements = Number(dailyDisbursementsSummary.repeat_client_loans || 0)
  const overdueAmount = Number(portfolio?.overdue_amount || 0)
  const writtenOffBalance = Number(portfolio?.written_off_balance || 0)
  const scheduledDueToday = Number(
    duesPayload?.duesInPeriod?.total_scheduled_amount
    ?? duesPayload?.duesInPeriod?.expected_amount
    ?? 0,
  )
  // Today's dues still unpaid = total scheduled for today - amount collected for today's dues.
  // This ensures: Scheduled Due = Collected + Still Unpaid (clean accounting)
  const collectionsToday = dailyCollections.reduce((sum, row) => sum + Number(row.current_due_collected || 0), 0)
  const scheduledDueStillUnpaid = Math.max(0, scheduledDueToday - collectionsToday)
  const arrearsCollectedToday = dailyCollections.reduce((sum, row) => sum + Number(row.arrears_collected || 0), 0)
  const collectionCoverage = scheduledDueToday > 0 ? Math.min(1, collectionsToday / scheduledDueToday) : 0
  const repaidLoanCount = Number(collectionsSummary.loans_with_repayments || collectionsSummary.unique_loans || 0)
  const totalArrears = Number(arrearsSummary.pre_npl_arrears_amount || arrearsSummary.total_arrears_amount || overdueAmount)
  const par30Balance = Number(arrearsSummary.par30_balance || arrearsSummary.par1_balance || 0)
  const par60Balance = Number(arrearsSummary.par60_balance || 0)
  const par90Balance = Number(arrearsSummary.par90_balance || 0)
  const nplBalance = Number(arrearsSummary.npl_balance || 0)
  const nplLoanCount = Number(arrearsSummary.npl_count || 0)
  const portfolioAtRiskBalance = Number(arrearsSummary.at_risk_balance || (par30Balance + par60Balance + par90Balance + nplBalance))
  const par30RatioFallback = outstandingBalance > 0 ? par30Balance / outstandingBalance : 0
  const par60RatioFallback = outstandingBalance > 0 ? par60Balance / outstandingBalance : 0
  const par90RatioFallback = outstandingBalance > 0 ? par90Balance / outstandingBalance : 0
  const nplRatioFallback = outstandingBalance > 0 ? nplBalance / outstandingBalance : 0
  const portfolioAtRiskRatioFallback = outstandingBalance > 0 ? portfolioAtRiskBalance / outstandingBalance : 0
  const par30Ratio = Number(arrearsSummary.par30_ratio ?? par30RatioFallback)
  const par60Ratio = Number(arrearsSummary.par60_ratio ?? par60RatioFallback)
  const par90Ratio = Number(arrearsSummary.par90_ratio ?? par90RatioFallback)
  const nplRatio = Number(arrearsSummary.npl_ratio ?? nplRatioFallback)
  const portfolioAtRiskRatio = Number(arrearsSummary.at_risk_ratio ?? portfolioAtRiskRatioFallback)
  const writeOffOrNplTotal = nplBalance + writtenOffBalance
  const pendingApprovalsCount = Number(pendingApprovalsQuery.data?.paging?.total || 0)
  const todayBusinessDate = useMemo(() => formatBusinessDateInputValue(now), [now])
  const monthStartBusinessDate = useMemo(() => formatBusinessDateInputValue(new Date(monthStart)), [monthStart])
  const dashboardListFilterParams = useMemo(() => (
    buildDashboardListFilterParams({
      branchId: branchIdFilter,
      officerId: officerIdFilter,
    })
  ), [branchIdFilter, officerIdFilter])
  const activePortfolioFilterParams = useMemo(() => (
    buildDashboardListFilterParams({
      branchId: branchIdFilter,
      officerId: officerIdFilter,
      extraParams: { statusGroup: 'active_portfolio' },
    })
  ), [branchIdFilter, officerIdFilter])
  const rejectedLoansFilterParams = useMemo(() => (
    buildDashboardListFilterParams({
      branchId: branchIdFilter,
      officerId: officerIdFilter,
      extraParams: { status: 'rejected' },
    })
  ), [branchIdFilter, officerIdFilter])
  const arrearsLoansFilterParams = useMemo(() => (
    buildDashboardListFilterParams({
      branchId: branchIdFilter,
      officerId: officerIdFilter,
      extraParams: { workflowStage: 'arrears' },
    })
  ), [branchIdFilter, officerIdFilter])
  const collectionsDueTodayReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'collections-dues',
      categoryId: 'collections',
      datePreset: 'custom_range',
      customDateFrom: todayBusinessDate,
      customDateTo: todayBusinessDate,
      dateFrom: todayStart,
      dateTo: nowIso,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
    })
  ), [branchIdFilter, nowIso, officerIdFilter, todayBusinessDate, todayStart])
  const collectionsTodayReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'collections-summary',
      categoryId: 'collections',
      datePreset: 'custom_range',
      customDateFrom: todayBusinessDate,
      customDateTo: todayBusinessDate,
      dateFrom: todayStart,
      dateTo: nowIso,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
    })
  ), [branchIdFilter, nowIso, officerIdFilter, todayBusinessDate, todayStart])
  const monthlyCustomersReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'operations-customers',
      categoryId: 'operations',
      datePreset: 'custom_range',
      customDateFrom: monthStartBusinessDate,
      customDateTo: todayBusinessDate,
      dateFrom: monthStart,
      dateTo: nowIso,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
    })
  ), [branchIdFilter, monthStart, monthStartBusinessDate, nowIso, officerIdFilter, todayBusinessDate])
  const portfolioReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'operations-olb',
      categoryId: 'operations',
      officeId: branchIdFilter,
      officerId: officerIdFilter,
    })
  ), [branchIdFilter, officerIdFilter])
  const monthlyDisbursementsReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'operations-disbursement',
      categoryId: 'operations',
      datePreset: 'custom_range',
      customDateFrom: monthStartBusinessDate,
      customDateTo: todayBusinessDate,
      dateFrom: monthStart,
      dateTo: nowIso,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
    })
  ), [branchIdFilter, monthStart, monthStartBusinessDate, nowIso, officerIdFilter, todayBusinessDate])
  const todayDisbursementsReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'operations-disbursement',
      categoryId: 'operations',
      datePreset: 'custom_range',
      customDateFrom: todayBusinessDate,
      customDateTo: todayBusinessDate,
      dateFrom: todayStart,
      dateTo: nowIso,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
    })
  ), [branchIdFilter, nowIso, officerIdFilter, todayBusinessDate, todayStart])
  const arrearsCollectedTodayReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'collections-summary',
      categoryId: 'collections',
      datePreset: 'custom_range',
      customDateFrom: todayBusinessDate,
      customDateTo: todayBusinessDate,
      dateFrom: todayStart,
      dateTo: nowIso,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
      extraParams: {
        collectionFocus: 'arrears_only',
      },
    })
  ), [branchIdFilter, nowIso, officerIdFilter, todayBusinessDate, todayStart])
  const arrearsReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'operations-red-flag',
      categoryId: 'operations',
      datePreset: 'custom_range',
      customDateFrom: todayBusinessDate,
      customDateTo: todayBusinessDate,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
    })
  ), [branchIdFilter, officerIdFilter, todayBusinessDate])
  const par30ArrearsReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'operations-red-flag',
      categoryId: 'operations',
      datePreset: 'custom_range',
      customDateFrom: todayBusinessDate,
      customDateTo: todayBusinessDate,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
      extraParams: { agingBucket: '1_30' },
    })
  ), [branchIdFilter, officerIdFilter, todayBusinessDate])
  const par60ArrearsReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'operations-red-flag',
      categoryId: 'operations',
      datePreset: 'custom_range',
      customDateFrom: todayBusinessDate,
      customDateTo: todayBusinessDate,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
      extraParams: { agingBucket: '31_60' },
    })
  ), [branchIdFilter, officerIdFilter, todayBusinessDate])
  const par90ArrearsReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'operations-red-flag',
      categoryId: 'operations',
      datePreset: 'custom_range',
      customDateFrom: todayBusinessDate,
      customDateTo: todayBusinessDate,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
      extraParams: { agingBucket: '61_90' },
    })
  ), [branchIdFilter, officerIdFilter, todayBusinessDate])
  const highRiskArrearsReportFilterParams = useMemo(() => (
    buildDashboardReportFilterParams({
      reportId: 'operations-red-flag',
      categoryId: 'operations',
      datePreset: 'custom_range',
      customDateFrom: todayBusinessDate,
      customDateTo: todayBusinessDate,
      officeId: branchIdFilter,
      officerId: officerIdFilter,
      extraParams: { agingBucket: '91_plus' },
    })
  ), [branchIdFilter, officerIdFilter, todayBusinessDate])
  const scaffoldShortcutTargets = useMemo(() => ({
    par30: {
      destinationRoute: '/reports',
      filterParams: par30ArrearsReportFilterParams,
      ariaLabel: 'Open Customer arrears Report for PAR 30 accounts in this dashboard scope',
    },
    par60: {
      destinationRoute: '/reports',
      filterParams: par60ArrearsReportFilterParams,
      ariaLabel: 'Open Customer arrears Report for PAR 60 accounts in this dashboard scope',
    },
    par90: {
      destinationRoute: '/reports',
      filterParams: par90ArrearsReportFilterParams,
      ariaLabel: 'Open Customer arrears Report for PAR 90 accounts in this dashboard scope',
    },
    npl: {
      destinationRoute: '/reports',
      filterParams: highRiskArrearsReportFilterParams,
      ariaLabel: 'Open Customer arrears Report for NPL accounts in this dashboard scope',
    },
    totalArrears: {
      destinationRoute: '/reports',
      filterParams: arrearsReportFilterParams,
      ariaLabel: 'Open Customer arrears Report for borrowers in arrears for this dashboard scope',
    },
    overdueInstallments: {
      destinationRoute: '/loans',
      filterParams: arrearsLoansFilterParams,
      ariaLabel: 'Open loan facilities with overdue installments for this dashboard scope',
    },
    nplLoans: {
      destinationRoute: '/reports',
      filterParams: highRiskArrearsReportFilterParams,
      ariaLabel: 'Open Customer arrears Report for non-performing loans in this dashboard scope',
    },
    nplAndWrittenOff: {
      destinationRoute: '/reports',
      filterParams: highRiskArrearsReportFilterParams,
      ariaLabel: 'Open the highest-risk arrears report for this dashboard scope',
    },
    collectionsDueToday: {
      destinationRoute: '/reports',
      filterParams: collectionsDueTodayReportFilterParams,
      ariaLabel: 'Open Loans Due Report for customers due today in this dashboard scope',
    },
    collectionsToday: {
      destinationRoute: '/reports',
      filterParams: collectionsTodayReportFilterParams,
      ariaLabel: 'Open Collections Report for payments received today in this dashboard scope',
    },
    unpaidDues: {
      destinationRoute: '/reports',
      filterParams: collectionsDueTodayReportFilterParams,
      ariaLabel: 'Open Loans Due Report for unpaid dues in this dashboard scope',
    },
    repayments: {
      destinationRoute: '/reports',
      filterParams: collectionsTodayReportFilterParams,
      ariaLabel: "Open Collections Report for today's repayments in this dashboard scope",
    },
  }), [
    arrearsLoansFilterParams,
    arrearsReportFilterParams,
    collectionsDueTodayReportFilterParams,
    collectionsTodayReportFilterParams,
    highRiskArrearsReportFilterParams,
    par30ArrearsReportFilterParams,
    par60ArrearsReportFilterParams,
    par90ArrearsReportFilterParams,
  ])
  const branchLabel = user?.branch_name || 'Assigned branch'
  const heroHeadline = activeAgent
    ? activeAgent.name
    : (isOverallOfficeScope ? (selectedOffice?.name || 'Dashboard') : (isBranchManager ? branchLabel : 'Dashboard'))

  const heroSubtitle = activeAgent
    ? `${branchLabel} - ${activeAgent.name}`
    : dashboardModeLabel
  const overdueInstallments = Number(portfolio?.overdue_installments || 0)
  const parRatioClass = portfolioAtRiskRatio >= 0.1
    ? styles.textRed
    : portfolioAtRiskRatio >= 0.05
      ? styles.textAmber
      : styles.textGreen
  const coverageClass = collectionCoverage >= 1
    ? styles.textGreen
    : collectionCoverage >= 0.6
      ? styles.textAmber
      : styles.textRed
  const unpaidDuesClass = scheduledDueStillUnpaid > 0 ? styles.textAmber : styles.textGreen
  const vitalSignCards = [
    {
      label: 'PAR ratio',
      value: formatPercent(portfolioAtRiskRatio),
      meta: `Ksh ${formatCurrency(portfolioAtRiskBalance)} at risk`,
      destinationRoute: '/reports',
      filterParams: arrearsReportFilterParams,
      ariaLabel: 'Open the highest-priority arrears report for this dashboard scope',
      toneClass: parRatioClass,
    },
    {
      label: 'Coverage',
      value: formatPercent(collectionCoverage),
      meta: scheduledDueToday > 0
        ? `Ksh ${formatCurrency(collectionsToday)} collected of Ksh ${formatCurrency(scheduledDueToday)} due`
        : 'No scheduled dues today',
      destinationRoute: '/reports',
      filterParams: collectionsDueTodayReportFilterParams,
      ariaLabel: 'Open the collections due report used for today coverage',
      toneClass: coverageClass,
    },
    {
      label: 'Unpaid dues',
      value: `Ksh ${formatCurrency(scheduledDueStillUnpaid)}`,
      meta: scheduledDueStillUnpaid > 0
        ? `${repaidLoanCount} repayment${repaidLoanCount === 1 ? '' : 's'} posted today`
        : 'All scheduled dues cleared',
      destinationRoute: '/reports',
      filterParams: collectionsDueTodayReportFilterParams,
      ariaLabel: 'Open the loans due report for today unpaid dues',
      toneClass: unpaidDuesClass,
    },
    {
      label: 'Active loans',
      value: String(activeLoans),
      meta: `OLB Ksh ${formatCurrency(outstandingBalance)}`,
      destinationRoute: '/loans',
      filterParams: activePortfolioFilterParams,
      ariaLabel: 'Open the active loan facilities for this dashboard scope',
      toneClass: '',
    },
  ]
  const todayActivityCards = [
    {
      label: 'Disbursed today',
      value: String(dailyDisbursedLoans),
      meta: dailyDisbursedLoans > 0
        ? `New ${dailyNewDisbursements} / Repeat ${dailyRepeatDisbursements}`
        : 'No loans disbursed yet today',
      destinationRoute: '/reports',
      filterParams: todayDisbursementsReportFilterParams,
      ariaLabel: "Open today's disbursement report for this dashboard scope",
      toneClass: dailyDisbursedLoans > 0 ? styles.textGreen : '',
    },
    {
      label: 'New today',
      value: String(dailyNewDisbursements),
      meta: 'First-time customer disbursements today',
      destinationRoute: '/reports',
      filterParams: todayDisbursementsReportFilterParams,
      ariaLabel: "Open today's new-customer disbursement report for this dashboard scope",
      toneClass: dailyNewDisbursements > 0 ? styles.textGreen : '',
    },
    {
      label: 'Repeat today',
      value: String(dailyRepeatDisbursements),
      meta: 'Repeat customer disbursements today',
      destinationRoute: '/reports',
      filterParams: todayDisbursementsReportFilterParams,
      ariaLabel: "Open today's repeat-customer disbursement report for this dashboard scope",
      toneClass: dailyRepeatDisbursements > 0 ? styles.textGreen : '',
    },
    {
      label: 'Collected today',
      value: `Ksh ${formatCurrency(collectionsToday)}`,
      meta: 'Current dues collected in the selected scope',
      destinationRoute: '/reports',
      filterParams: collectionsTodayReportFilterParams,
      ariaLabel: 'Open the collections report for payments received today in this dashboard scope',
      toneClass: collectionsToday > 0 ? styles.textGreen : '',
    },
    {
      label: 'Arrears recovered',
      value: `Ksh ${formatCurrency(arrearsCollectedToday)}`,
      meta: 'Older overdue recoveries collected today',
      destinationRoute: '/reports',
      filterParams: arrearsCollectedTodayReportFilterParams,
      ariaLabel: 'Open the collections report for overdue recoveries collected today in this dashboard scope',
      toneClass: arrearsCollectedToday > 0 ? styles.textGreen : '',
    },
  ]
  const monthToDateCards = [
    {
      label: 'New customers',
      value: String(monthlyNewCustomers),
      meta: `Registered from ${monthStartBusinessDate} to ${todayBusinessDate}`,
      destinationRoute: '/reports',
      filterParams: monthlyCustomersReportFilterParams,
      ariaLabel: 'Open the customers report for this dashboard month',
      toneClass: monthlyNewCustomers > 0 ? styles.textGreen : '',
    },
    {
      label: 'Disbursed this month',
      value: String(monthlyDisbursedLoans),
      meta: `New ${monthlyNewDisbursements} / Repeat ${monthlyRepeatDisbursements}`,
      destinationRoute: '/reports',
      filterParams: monthlyDisbursementsReportFilterParams,
      ariaLabel: 'Open the disbursement report for this dashboard month',
      toneClass: monthlyDisbursedLoans > 0 ? styles.textGreen : '',
    },
    {
      label: 'Declined loans',
      value: String(monthlyDeclinedLoans),
      meta: 'Applications declined this month',
      destinationRoute: '/loans',
      filterParams: rejectedLoansFilterParams,
      ariaLabel: 'Open rejected loans for this dashboard scope',
      toneClass: monthlyDeclinedLoans > 0 ? styles.textAmber : '',
    },
  ]


  function openFilterModal() {
    setDraftOfficeId(effectiveSelectedOfficeId)
    setDraftOfficerId(effectiveSelectedOfficerId)
    openFilter()
  }

  function applyDashboardFilter() {
    setSelectedOfficeId(effectiveDraftOfficeId)
    setSelectedOfficerId(effectiveDraftOfficerId)
    closeFilter()
  }

  function resetOfficerFilter() {
    setSelectedOfficerId('')
    setDraftOfficerId('')
  }

  function handleFilterModalKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') {
      return
    }

    const focusableElements = getFocusableElements(filterModalRef.current)
    if (focusableElements.length === 0) {
      event.preventDefault()
      filterModalRef.current?.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement

    if (event.shiftKey) {
      if (activeElement === firstElement || activeElement === filterModalRef.current) {
        event.preventDefault()
        lastElement.focus()
      }
      return
    }

    if (activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  useEffect(() => {
    if (!isBranchManager && isFilterOpen) {
      closeFilter()
    }
  }, [closeFilter, isBranchManager, isFilterOpen])

  useEffect(() => {
    if (!isFilterOpen) {
      return
    }

    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const fallbackFocusTarget = filterTriggerRef.current

    const focusTimer = window.setTimeout(() => {
      const focusableElements = getFocusableElements(filterModalRef.current)
      const nextFocusTarget = focusableElements[0] ?? filterModalRef.current
      nextFocusTarget?.focus()
    }, 0)

    return () => {
      window.clearTimeout(focusTimer)
      const returnFocusTarget = lastFocusedElementRef.current ?? fallbackFocusTarget
      window.setTimeout(() => {
        returnFocusTarget?.focus()
      }, 0)
    }
  }, [isFilterOpen])

  useEffect(() => {
    if (!isFilterOpen) {
      return
    }

    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      closeFilter()
    }

    window.addEventListener('keydown', handleEscapeKey)

    return () => {
      window.removeEventListener('keydown', handleEscapeKey)
    }
  }, [closeFilter, isFilterOpen])

  return (
    <div className={styles.page}>

      {/* â”€â”€ Hero: data-driven headline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            {activeAgent ? 'Officer view - ' + branchLabel : 'Dashboard'}
          </p>
          <h1 className={styles.heroHeadline}>{heroHeadline}</h1>
          <p className={styles.subtitle}>{heroSubtitle}</p>
        </div>
        <div className={styles.heroTools}>
          {/* Primary CTA â€” surfaced only when there's an actionable state */}
          {isBranchManager && pendingApprovalsCount > 0 && !isLoading && (
            <Link className={styles.ctaPrimary} to="/approvals">
              Open approvals queue
            </Link>
          )}
          {canFilterDashboard && (
            <div className={styles.scopeSummaryInline}>
              <span className={styles.scopeChip}>
                {officeLabel}: <strong>{selectedOffice?.name || branchLabel}</strong>
              </span>
              <span className={styles.scopeChip}>
                {agentLabel}: <strong>{activeAgent?.name || 'All officers'}</strong>
              </span>
              <span className={styles.scopeChip}>{dashboardModeLabel}</span>
              <button
                ref={filterTriggerRef}
                type="button"
                className={styles.scopeAction}
                onClick={openFilterModal}
              >
                Filter
              </button>
              {activeAgent && (
                <button type="button" className={styles.scopeActionMuted} onClick={resetOfficerFilter}>
                  Back to branch
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <AsyncState
        loading={isLoading}
        error={isError}
        loadingText={loadingText}
        errorText={errorText}
        onRetry={() => {
          void Promise.all([
            clientsQuery.refetch(),
            portfolioQuery.refetch(),
            monthlyClientSummaryQuery.refetch(),
            monthlyDisbursementsQuery.refetch(),
            dailyDisbursementsQuery.refetch(),
            collectionsSummaryQuery.refetch(),
            collectionsTodayQuery.refetch(),
            duesQuery.refetch(),
            arrearsQuery.refetch(),
          ])
        }}
      />

      {!isLoading && !isError ? (
        <>
          <section className={styles.vitalStrip} aria-label="Portfolio vital signs">
            {vitalSignCards.map((card) => (
              <DashboardMetricCard
                key={card.label}
                className={`${styles.priorityCard} ${styles.priorityCardInteractive}`}
                destinationRoute={card.destinationRoute}
                filterParams={card.filterParams}
                ariaLabel={card.ariaLabel}
              >
                <div className={styles.priorityCardLabel}>{card.label}</div>
                <div className={`${styles.priorityCardValue} ${card.toneClass}`.trim()}>{card.value}</div>
                <div className={styles.priorityCardMeta}>{card.meta}</div>
              </DashboardMetricCard>
            ))}
          </section>

          <section className={styles.zoneLead}>
            <div className={styles.zoneHeader}>
              <div>
                <p className={styles.zoneEyebrow}>Alerts</p>
                <h2>Needs attention first</h2>
              </div>
              <p className={styles.zoneIntro}>
                PAR buckets, overdue workload, and today&apos;s dues health stay above everything else so the branch health is visible before any drill-down.
              </p>
            </div>
          </section>
          {/* â”€â”€ Zone 0: Contextual notice â€” at the TOP where it gets seen â”€â”€â”€â”€ */}
          {/* â”€â”€ Zone 1: Today's urgency â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className={`${styles.middleSectionGrid} ${styles.legacyDashboardSections}`}>
            <section className={`${styles.panel} ${styles.scaffoldSection}`}>
              <div className={styles.scaffoldHeader}>
                <h2>Today</h2>
                <div className={styles.panelBadge}>
                  <span>{scheduledDueToday > 0 ? `Ksh ${formatCurrency(scheduledDueToday)}` : 'Ksh 0.00'}</span>
                  <small>due today</small>
                </div>
              </div>

              <div className={styles.kpiGrid}>
                <DashboardMetricCard
                  className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                  destinationRoute="/reports"
                  filterParams={collectionsDueTodayReportFilterParams}
                  ariaLabel="Open Loans Due Report for customers due today in this dashboard scope"
                >
                  <div className={styles.kpiLabel}>Collections due today</div>
                  <div className={styles.kpiValue}>Ksh {formatCurrency(scheduledDueToday)}</div>
                  <div className={styles.kpiMeta}>
                    <span className={styles.kpiLink}>Open Loans Due Report</span>
                  </div>
                </DashboardMetricCard>

                <DashboardMetricCard
                  className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                  destinationRoute="/reports"
                  filterParams={collectionsTodayReportFilterParams}
                  ariaLabel="Open Collections Report for payments received today in this dashboard scope"
                >
                  <div className={styles.kpiLabel}>Collected today</div>
                  <div className={styles.kpiValue}>Ksh {formatCurrency(collectionsToday)}</div>
                  <div className={styles.kpiMeta}>
                    <span className={styles.kpiLink}>Open Collections Report</span>
                  </div>
                </DashboardMetricCard>

                <DashboardMetricCard
                  className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                  destinationRoute="/reports"
                  filterParams={arrearsCollectedTodayReportFilterParams}
                  ariaLabel="Open Collections Report for overdue recoveries collected today in this dashboard scope"
                >
                  <div className={styles.kpiLabel}>Arrears collected</div>
                  <div className={`${styles.kpiValue} ${arrearsCollectedToday > 0 ? styles.textGreen : ''}`}>
                    Ksh {formatCurrency(arrearsCollectedToday)}
                  </div>
                  <div className={styles.kpiMeta}>
                    <span>Resets midnight</span>
                    <span className={styles.kpiLink}>Open Collections Report</span>
                  </div>
                </DashboardMetricCard>

                <DashboardMetricCard
                  className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                  destinationRoute="/reports"
                  filterParams={collectionsDueTodayReportFilterParams}
                  ariaLabel="Open Customer Dues Report for today's unpaid dues"
                >
                  <div className={styles.kpiLabel}>Unpaid dues</div>
                  <div className={`${styles.kpiValue} ${scheduledDueStillUnpaid > 0 ? styles.textAmber : styles.textGreen}`}>
                    Ksh {formatCurrency(scheduledDueStillUnpaid)}
                  </div>
                  <div className={styles.kpiMeta}>
                    <span className={styles.kpiLink}>Open Customer Dues Report</span>
                  </div>
                </DashboardMetricCard>

                <DashboardMetricCard
                  className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                  destinationRoute="/reports"
                  filterParams={collectionsDueTodayReportFilterParams}
                  ariaLabel="Open Loans Due Report used for today's coverage calculation"
                >
                  <div className={styles.kpiLabel}>Coverage</div>
                  <div className={`${styles.kpiValue} ${collectionCoverage >= 1 ? styles.textGreen : (collectionCoverage >= 0.6 ? styles.textAmber : styles.textRed)}`}>
                    {formatPercent(collectionCoverage)}
                  </div>
                  <div className={styles.kpiMeta}>
                    <span className={styles.kpiLink}>Open Loans Due Report</span>
                  </div>
                </DashboardMetricCard>
              </div>
              <div className={styles.muted}>
                Coverage compares today's scheduled dues against repayments applied to today's dues. Older overdue recoveries are tracked separately in Arrears collected and reset at midnight.
              </div>
            </section>

          {/* â”€â”€ Zone 2: Portfolio â€” ambient health metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <section className={`${styles.panel} ${styles.scaffoldSection}`}>
              <div className={styles.scaffoldHeader}>
                <h2>Portfolio &amp; Disbursement</h2>
                <div className={styles.panelBadge}>
                  <span>{monthlyDisbursedLoans}</span>
                  <small>MTD disbursed</small>
                </div>
              </div>

              <div className={styles.metricGroup}>
                <div className={styles.metricGroupHeader}>
                  <div>
                    <h3>Total</h3>
                    <p>Does not reset</p>
                  </div>
                </div>

                <div className={styles.kpiGrid}>
                  <DashboardMetricCard
                    className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                    destinationRoute="/clients"
                    filterParams={dashboardListFilterParams}
                    ariaLabel="Open the customer register for this dashboard scope"
                  >
                    <div className={styles.kpiLabel}>Customers</div>
                    <div className={styles.kpiValue}>{borrowerCount}</div>
                    <div className={styles.kpiMeta}>
                      <span className={styles.kpiLink}>Open customer register</span>
                    </div>
                  </DashboardMetricCard>

                  <DashboardMetricCard
                    className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                    destinationRoute="/loans"
                    filterParams={activePortfolioFilterParams}
                    ariaLabel="Open the active loan facilities for this dashboard scope"
                  >
                    <div className={styles.kpiLabel}>Active loans</div>
                    <div className={styles.kpiValue}>{activeLoans}</div>
                    <div className={styles.kpiMeta}>
                      <span className={styles.kpiLink}>Open loan facilities</span>
                    </div>
                  </DashboardMetricCard>

                  <DashboardMetricCard
                    className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                    destinationRoute="/reports"
                    filterParams={portfolioReportFilterParams}
                    ariaLabel="Open the portfolio OLB report for this dashboard scope"
                  >
                    <div className={styles.kpiLabel}>OLB</div>
                    <div className={styles.kpiValue}>Ksh {formatCurrency(outstandingBalance)}</div>
                    <div className={styles.kpiMeta}>
                      <span className={styles.kpiLink}>Open portfolio report</span>
                    </div>
                  </DashboardMetricCard>
                </div>
              </div>

              <div className={styles.metricGroup}>
                <div className={styles.metricGroupHeader}>
                  <div>
                    <h3>This Month</h3>
                    <p>Renews monthly</p>
                  </div>
                </div>

                <div className={styles.kpiGrid}>
                  <DashboardMetricCard
                    className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                    destinationRoute="/reports"
                    filterParams={monthlyCustomersReportFilterParams}
                    ariaLabel="Open the customers report for this dashboard month"
                  >
                    <div className={styles.kpiLabel}>New customers</div>
                    <div className={`${styles.kpiValue} ${monthlyNewCustomers > 0 ? styles.textGreen : ''}`}>{monthlyNewCustomers}</div>
                    <div className={styles.kpiMeta}>
                      <span>Resets monthly</span>
                      <span className={styles.kpiLink}>Open customers report</span>
                    </div>
                  </DashboardMetricCard>

                  <DashboardMetricCard
                    className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                    destinationRoute="/reports"
                    filterParams={monthlyDisbursementsReportFilterParams}
                    ariaLabel="Open the disbursement report for this dashboard month"
                  >
                    <div className={styles.kpiLabel}>Disbursed loans</div>
                    <div className={`${styles.kpiValue} ${monthlyDisbursedLoans > 0 ? styles.textGreen : ''}`}>{monthlyDisbursedLoans}</div>
                    <div className={styles.kpiMeta}>
                      <span>New {monthlyNewDisbursements} / Repeat {monthlyRepeatDisbursements}</span>
                      <span className={styles.kpiLink}>Open disbursement report</span>
                    </div>
                  </DashboardMetricCard>

                  <DashboardMetricCard
                    className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                    destinationRoute="/loans"
                    filterParams={rejectedLoansFilterParams}
                    ariaLabel="Open rejected loans for this dashboard scope"
                  >
                    <div className={styles.kpiLabel}>Declined loans</div>
                    <div className={`${styles.kpiValue} ${monthlyDeclinedLoans > 0 ? styles.textAmber : ''}`}>{monthlyDeclinedLoans}</div>
                    <div className={styles.kpiMeta}>
                      <span>Resets monthly</span>
                      <span className={styles.kpiLink}>Open rejected loans</span>
                    </div>
                  </DashboardMetricCard>
                </div>
              </div>

              <div className={styles.metricGroup}>
                <div className={styles.metricGroupHeader}>
                  <div>
                    <h3>Today</h3>
                    <p>Renews daily</p>
                  </div>
                </div>

                <div className={styles.kpiGrid}>
                  <DashboardMetricCard
                    className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                    destinationRoute="/reports"
                    filterParams={todayDisbursementsReportFilterParams}
                    ariaLabel="Open today's disbursement report for this dashboard scope"
                  >
                    <div className={styles.kpiLabel}>Disbursed today</div>
                    <div className={`${styles.kpiValue} ${dailyDisbursedLoans > 0 ? styles.textGreen : ''}`}>{dailyDisbursedLoans}</div>
                    <div className={styles.kpiMeta}>
                      <span>Resets daily</span>
                      <span className={styles.kpiLink}>Open disbursement report</span>
                    </div>
                  </DashboardMetricCard>

                  <DashboardMetricCard
                    className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                    destinationRoute="/reports"
                    filterParams={todayDisbursementsReportFilterParams}
                    ariaLabel="Open today's new-customer disbursements for this dashboard scope"
                  >
                    <div className={styles.kpiLabel}>New today</div>
                    <div className={`${styles.kpiValue} ${dailyNewDisbursements > 0 ? styles.textGreen : ''}`}>{dailyNewDisbursements}</div>
                    <div className={styles.kpiMeta}>
                      <span>New customer disbursements</span>
                      <span className={styles.kpiLink}>Open disbursement report</span>
                    </div>
                  </DashboardMetricCard>

                  <DashboardMetricCard
                    className={`${styles.kpiCard} ${styles.kpiCardInteractive}`}
                    destinationRoute="/reports"
                    filterParams={todayDisbursementsReportFilterParams}
                    ariaLabel="Open today's repeat-customer disbursements for this dashboard scope"
                  >
                    <div className={styles.kpiLabel}>Repeat today</div>
                    <div className={`${styles.kpiValue} ${dailyRepeatDisbursements > 0 ? styles.textGreen : ''}`}>{dailyRepeatDisbursements}</div>
                    <div className={styles.kpiMeta}>
                      <span>Repeat customer disbursements</span>
                      <span className={styles.kpiLink}>Open disbursement report</span>
                    </div>
                  </DashboardMetricCard>
                </div>
              </div>
            </section>
          </div>

          {/* â”€â”€ Zone 3: Deep-dive analytics panels (lazy) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <Suspense fallback={<section className={`${styles.panel} ${styles.scaffoldSection}`}><div className={styles.scaffoldHeader}><h2>Portfolio Risk</h2></div></section>}>
            <DashboardScaffoldPanels
              totalArrears={totalArrears}
              par30Balance={par30Balance}
              par30Ratio={par30Ratio}
              par60Balance={par60Balance}
              par60Ratio={par60Ratio}
              par90Balance={par90Balance}
              par90Ratio={par90Ratio}
              portfolioAtRiskRatio={portfolioAtRiskRatio}
              writeOffOrNplTotal={writeOffOrNplTotal}
              nplBalance={nplBalance}
              nplRatio={nplRatio}
              nplLoanCount={nplLoanCount}
              collectionsToday={collectionsToday}
              scheduledDueToday={scheduledDueToday}
              collectionCoverage={collectionCoverage}
              scheduledDueStillUnpaid={scheduledDueStillUnpaid}
              repaidLoanCount={repaidLoanCount}
              writtenOffBalance={writtenOffBalance}
              overdueInstallments={overdueInstallments}
              shortcutTargets={scaffoldShortcutTargets}
            />
          </Suspense>

          <div className={styles.zoneGrid}>
            <section className={`${styles.panel} ${styles.zonePanel}`}>
              <div className={styles.zoneHeaderCompact}>
                <div>
                  <p className={styles.zoneEyebrow}>Today&apos;s activity</p>
                  <h2>What moved today</h2>
                </div>
                <p className={styles.zoneIntroCompact}>
                  Daily lending and recovery signals stay together so the team can see throughput, borrower mix, and recoveries in one pass.
                </p>
              </div>

              <div className={styles.activityGrid}>
                {todayActivityCards.map((card) => (
                  <DashboardMetricCard
                    key={card.label}
                    className={`${styles.activityCard} ${styles.activityCardInteractive}`}
                    destinationRoute={card.destinationRoute}
                    filterParams={card.filterParams}
                    ariaLabel={card.ariaLabel}
                  >
                    <div className={styles.activityCardLabel}>{card.label}</div>
                    <div className={`${styles.activityCardValue} ${card.toneClass}`.trim()}>{card.value}</div>
                    <div className={styles.activityCardMeta}>{card.meta}</div>
                  </DashboardMetricCard>
                ))}
              </div>
            </section>

            <section className={`${styles.panel} ${styles.zonePanel}`}>
              <div className={styles.zoneHeaderCompact}>
                <div>
                  <p className={styles.zoneEyebrow}>Month-to-date</p>
                  <h2>Portfolio scale and lending pace</h2>
                </div>
                <p className={styles.zoneIntroCompact}>
                  Current book size stays visible while monthly acquisition, disbursement pace, and declines remain available without competing with the alerts zone.
                </p>
              </div>

              <div className={styles.monthGrid}>
                <DashboardMetricCard
                  className={`${styles.featureCard} ${styles.featureCardInteractive}`}
                  destinationRoute="/reports"
                  filterParams={portfolioReportFilterParams}
                  ariaLabel="Open the portfolio OLB report for this dashboard scope"
                >
                  <div className={styles.featureCardLabel}>Current book</div>
                  <div className={styles.featureCardValue}>Ksh {formatCurrency(outstandingBalance)}</div>
                  <p className={styles.featureCardCopy}>Outstanding loan balance across the selected dashboard scope.</p>
                  <div className={styles.featureStats}>
                    <div className={styles.featureStat}>
                      <span>Customers</span>
                      <strong>{borrowerCount}</strong>
                    </div>
                    <div className={styles.featureStat}>
                      <span>Active loans</span>
                      <strong>{activeLoans}</strong>
                    </div>
                  </div>
                </DashboardMetricCard>

                <div className={styles.monthCards}>
                  {monthToDateCards.map((card) => (
                    <DashboardMetricCard
                      key={card.label}
                      className={`${styles.compactCard} ${styles.compactCardInteractive}`}
                      destinationRoute={card.destinationRoute}
                      filterParams={card.filterParams}
                      ariaLabel={card.ariaLabel}
                    >
                      <div className={styles.compactCardLabel}>{card.label}</div>
                      <div className={`${styles.compactCardValue} ${card.toneClass}`.trim()}>{card.value}</div>
                      <div className={styles.compactCardMeta}>{card.meta}</div>
                    </DashboardMetricCard>
                  ))}

                  <DashboardMetricCard
                    className={`${styles.compactCard} ${styles.compactCardInteractive}`}
                    destinationRoute="/clients"
                    filterParams={dashboardListFilterParams}
                    ariaLabel="Open the customer register for this dashboard scope"
                  >
                    <div className={styles.compactCardLabel}>Customers</div>
                    <div className={styles.compactCardValue}>{borrowerCount}</div>
                    <div className={styles.compactCardMeta}>Borrowers currently in the selected scope</div>
                  </DashboardMetricCard>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}

      {/* â”€â”€ Filter modal (unchanged) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isFilterOpen ? (
        <div className={styles.overlay} role="presentation" onClick={closeFilter}>
          <div
            ref={filterModalRef}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-filter-title"
            aria-describedby="dashboard-filter-description"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleFilterModalKeyDown}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="dashboard-filter-title">Filter Dashboard</h2>
                <p id="dashboard-filter-description">Choose an office and officer to switch from branch totals to an officer dashboard.</p>
              </div>
              <button type="button" className={styles.modalClose} onClick={closeFilter} aria-label="Close dashboard filter">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', margin: 'auto' }}>
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>{officeLabel}</span>
                <select
                  value={effectiveDraftOfficeId}
                  onChange={(event) => setDraftOfficeId(event.target.value)}
                  disabled={offices.length <= 1}
                >
                  <option value="">Select office...</option>
                  {offices.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.code ? `${entry.code} - ${entry.name}` : entry.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>{agentLabel}</span>
                <select value={effectiveDraftOfficerId} onChange={(event) => setDraftOfficerId(event.target.value)}>
                  <option value="">All officers</option>
                  {draftAvailableAgents.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.modalActions}>
              <button type="button" className={styles.filterReset} onClick={closeFilter}>Close</button>
              <button type="button" className={styles.filterButton} onClick={applyDashboardFilter}>Apply filter</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}



