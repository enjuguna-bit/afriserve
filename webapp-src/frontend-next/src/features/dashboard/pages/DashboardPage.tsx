import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import { useAuth } from '../../../hooks/useAuth'
import { queryPolicies } from '../../../services/queryPolicies'
import { useDashboardStore } from '../../../store/dashboardStore'
import { useClients } from '../../clients/hooks/useClients'
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
import styles from './DashboardPage.module.css'

const DashboardDeepDivePanels = lazy(() => import('../components/DashboardDeepDivePanels').then((module) => ({ default: module.DashboardDeepDivePanels })))

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

function startOfDayIso(now: Date) {
  const value = new Date(now)
  value.setHours(0, 0, 0, 0)
  return value.toISOString()
}

function startOfMonthIso(now: Date) {
  const value = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  return value.toISOString()
}



function firstName(name: string | undefined) {
  return String(name || '').trim().split(/\s+/)[0] || 'Manager'
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
    queryKey: ['dashboard', 'filter-options', 'loan_officer'],
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

  const branchIdFilter = isBranchManager
    ? (toPositiveNumber(selectedOffice?.id) ?? toPositiveNumber(user?.branch_id))
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
  const dashboardModeLabel = activeAgent ? `${activeAgent.name} dashboard` : 'Branch dashboard'
  const loadingText = activeAgent
    ? 'Loading officer dashboard...'
    : (isBranchManager ? 'Loading branch manager dashboard...' : 'Loading dashboard...')
  const errorText = activeAgent
    ? 'Unable to load officer dashboard.'
    : (isBranchManager ? 'Unable to load branch manager dashboard.' : 'Unable to load dashboard.')

  const clientsQuery = useClients({
    limit: 1,
    offset: 0,
    sortBy: 'id',
    sortOrder: 'desc',
    ...(branchIdFilter ? { branchId: branchIdFilter } : {}),
    ...(officerIdFilter ? { officerId: officerIdFilter } : {}),
  })
  const activeClientsQuery = useClients({
    limit: 1,
    offset: 0,
    sortBy: 'id',
    sortOrder: 'desc',
    isActive: true,
    ...(branchIdFilter ? { branchId: branchIdFilter } : {}),
    ...(officerIdFilter ? { officerId: officerIdFilter } : {}),
  })
  const portfolioQuery = useQuery({
    queryKey: ['dashboard', 'portfolio', reportParams],
    queryFn: () => getPortfolioReport(reportParams),
    ...queryPolicies.report,
  })
  const clientSummaryQuery = useQuery({
    queryKey: ['dashboard', 'clients-summary', monthStart, nowIso, reportParams],
    queryFn: () => getClientSummaryReport({ dateFrom: monthStart, dateTo: nowIso, ...reportParams }),
    ...queryPolicies.report,
  })
  const disbursementsQuery = useQuery({
    queryKey: ['dashboard', 'disbursements', monthStart, nowIso, reportParams],
    queryFn: () => getDisbursementsReport({ dateFrom: monthStart, dateTo: nowIso, ...reportParams }),
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
    queryFn: () => fetch('/api/loans?status=pending_approval&limit=1' + (branchIdFilter ? `&branchId=${branchIdFilter}` : '')).then(res => res.json()),
    enabled: isBranchManager || normalizedRole === 'admin',
    ...queryPolicies.report,
  })

  const isLoading = (
    clientsQuery.isLoading
    || activeClientsQuery.isLoading
    || portfolioQuery.isLoading
    || clientSummaryQuery.isLoading
    || disbursementsQuery.isLoading
    || collectionsSummaryQuery.isLoading
    || collectionsTodayQuery.isLoading
    || duesQuery.isLoading
    || arrearsQuery.isLoading
  )
  const isError = (
    clientsQuery.isError
    || activeClientsQuery.isError
    || portfolioQuery.isError
    || clientSummaryQuery.isError
    || disbursementsQuery.isError
    || collectionsSummaryQuery.isError
    || collectionsTodayQuery.isError
    || duesQuery.isError
    || arrearsQuery.isError
  )

  const portfolio = portfolioQuery.data
  const clientSummary = (clientSummaryQuery.data as { summary?: SummaryPayload } | undefined)?.summary || {}
  const disbursementSummary = (disbursementsQuery.data as { summary?: SummaryPayload } | undefined)?.summary || {}
  const collectionsSummary = (collectionsSummaryQuery.data as { summary?: SummaryPayload } | undefined)?.summary || {}
  const dailyCollections = (collectionsTodayQuery.data as { dailyCollections?: Array<Record<string, unknown>> } | undefined)?.dailyCollections || []
  const duesPayload = duesQuery.data as {
    duesInPeriod?: SummaryPayload
    alreadyOverdueBeforePeriod?: SummaryPayload
  } | undefined
  const arrearsSummary = (arrearsQuery.data as { summary?: SummaryPayload } | undefined)?.summary || {}

  const borrowerCount = Number(clientsQuery.data?.paging.total || 0)
  const activeCustomerCount = Number(activeClientsQuery.data?.paging.total || 0)
  const activeLoans = Number(portfolio?.active_loans || 0)
  const outstandingBalance = Number(portfolio?.outstanding_balance || 0)
  const overdueAmount = Number(portfolio?.overdue_amount || 0)
  const writtenOffBalance = Number(portfolio?.written_off_balance || 0)
  const parRatio = Number(portfolio?.parRatio || 0)
  const dueNow = Number(duesPayload?.duesInPeriod?.expected_amount || 0)
  const unpaidDue = Number(duesPayload?.duesInPeriod?.pending_amount || 0)
  const arrearsBacklog = Number(duesPayload?.alreadyOverdueBeforePeriod?.overdue_amount || 0)
  const collectionsToday = dailyCollections.reduce((sum, row) => sum + Number(row.total_collected || 0), 0)
  const collectionCoverage = dueNow > 0 ? Math.min(1, collectionsToday / dueNow) : 0
  const newClients = Number(clientSummary.new_clients_registered || 0)
  const firstTimeBorrowers = Number(clientSummary.first_time_borrowers_in_period || 0)
  const repeatBorrowers = Number(clientSummary.total_repeat_borrowers || 0)
  const loansDisbursed = Number(disbursementSummary.total_loans || 0)
  const totalDisbursedAmount = Number(disbursementSummary.total_disbursed_amount || 0)
  const repaidLoanCount = Number(collectionsSummary.loans_with_repayments || 0)
  const totalArrears = Number(arrearsSummary.total_arrears_amount || overdueAmount)
  const preWriteoffMonitoredBalance = Number(arrearsSummary.par60_balance || 0)
  const nplBalance = Number(arrearsSummary.par90_balance || 0)
  const nplLoanCount = Number(arrearsSummary.par90_count || 0)
  const writeOffOrNplTotal = nplBalance + writtenOffBalance
  const pendingApprovalsCount = Number(pendingApprovalsQuery.data?.paging?.total || 0)

  const title = isBranchManager
    ? (activeAgent ? `${activeAgent.name} Dashboard` : 'Branch Manager Dashboard')
    : 'Dashboard'
  const branchLabel = user?.branch_name || 'Assigned branch'
  const welcomeName = firstName(user?.full_name)

  // Notice Logic
  const needsAttention = parRatio > 0.1 || (arrearsBacklog > 0)
  const noticeVariant = needsAttention ? styles.noticeWarning : ''
  const noticeTitle = needsAttention ? 'Attention required' : 'Workspace ready'
  const noticeText = needsAttention
    ? `${welcomeName}, ${activeAgent ? activeAgent.name + "'s" : branchLabel} portfolio requires attention due to elevated arrears.`
    : `Welcome ${welcomeName}. ${activeAgent ? activeAgent.name + ' performance is' : branchLabel + ' performance is'} synced for today.`

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
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Role workspace</p>
          <h1>{title}</h1>
          <p className={styles.subtitle}>
            {activeAgent
              ? `${branchLabel} | officer view for ${activeAgent.name}, including borrower growth, portfolio quality, and collections.`
              : `${branchLabel} | borrower growth, loan book quality, and branch collections in one view.`}
          </p>
        </div>
        <div className={styles.heroTools}>
          <div className={styles.quickLinks}>
            {isBranchManager && (
              <Link className={styles.quickLink} to="/approvals">
                Approvals {pendingApprovalsCount > 0 ? `(${pendingApprovalsCount})` : ''}
              </Link>
            )}
            <Link className={styles.quickLink} to="/clients">Borrowers</Link>
            <Link className={styles.quickLink} to="/loans">Loans</Link>
            <Link className={styles.quickLink} to="/reports">Reports</Link>
          </div>
        </div>
      </section>

      {canFilterDashboard ? (
        <section className={styles.scopeSummary}>
          <span className={styles.scopeChip}>{officeLabel}: <strong>{selectedOffice?.name || branchLabel}</strong></span>
          <span className={styles.scopeChip}>{agentLabel}: <strong>{activeAgent?.name || 'All officers'}</strong></span>
          <span className={styles.scopeChip}>{dashboardModeLabel}</span>
          <button ref={filterTriggerRef} type="button" className={styles.scopeAction} onClick={openFilterModal}>Filter</button>
          {activeAgent ? (
            <button type="button" className={styles.scopeActionMuted} onClick={resetOfficerFilter}>Back to branch</button>
          ) : null}
        </section>
      ) : null}

      <AsyncState
        loading={isLoading}
        error={isError}
        loadingText={loadingText}
        errorText={errorText}
        onRetry={() => {
          void Promise.all([
            clientsQuery.refetch(),
            activeClientsQuery.refetch(),
            portfolioQuery.refetch(),
            clientSummaryQuery.refetch(),
            disbursementsQuery.refetch(),
            collectionsSummaryQuery.refetch(),
            collectionsTodayQuery.refetch(),
            duesQuery.refetch(),
            arrearsQuery.refetch(),
          ])
        }}
      />

      {!isLoading && !isError ? (
        <>
          <section className={styles.kpiStrip}>
            <article className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Total Customers</div>
              <div className={styles.kpiValue}>{borrowerCount}</div>
              <div className={styles.kpiMeta}>
                <span className={newClients > 0 ? styles.trendUp : styles.trendNeutral}>↑ {newClients}</span>
                <span> this month</span>
              </div>
            </article>
            <article className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Active Loans</div>
              <div className={styles.kpiValue}>{activeLoans}</div>
              <div className={styles.kpiMeta}>
                <span className={loansDisbursed > 0 ? styles.trendUp : styles.trendNeutral}>↑ {loansDisbursed}</span>
                <span> this month</span>
              </div>
            </article>
            <article className={styles.kpiCard}>
              <div className={styles.kpiLabel}>OLB</div>
              <div className={styles.kpiValue}>Ksh {formatCurrency(outstandingBalance)}</div>
              <div className={styles.kpiMeta}>{activeCustomerCount} active customers</div>
            </article>
            <article className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Due Today</div>
              <div className={styles.kpiValue}>Ksh {formatCurrency(dueNow)}</div>
              <div className={styles.kpiMeta}>
                <span className={unpaidDue === 0 && dueNow > 0 ? styles.textGreen : (unpaidDue > 0 ? styles.textAmber : '')}>
                  {unpaidDue > 0 ? `Ksh ${formatCurrency(unpaidDue)} unpaid` : (dueNow > 0 ? 'Fully collected' : 'No dues')}
                </span>
              </div>
            </article>
            <article className={styles.kpiCard}>
              <div className={styles.kpiLabel}>PAR Ratio</div>
              <div className={`${styles.kpiValue} ${parRatio < 0.05 ? styles.textGreen : (parRatio < 0.1 ? styles.textAmber : styles.textRed)}`}>
                {formatPercent(parRatio)}
              </div>
              <div className={styles.kpiMeta}>Portfolio at risk</div>
            </article>
          </section>
          
          <Suspense fallback={<section className={styles.panel}><p className={styles.muted}>Loading analytics panels...</p></section>}>
            <DashboardDeepDivePanels
              borrowerCount={borrowerCount}
              activeCustomerCount={activeCustomerCount}
              outstandingBalance={outstandingBalance}
              totalArrears={totalArrears}
              preWriteoffMonitoredBalance={preWriteoffMonitoredBalance}
              writeOffOrNplTotal={writeOffOrNplTotal}
              nplBalance={nplBalance}
              nplLoanCount={nplLoanCount}
              collectionCoverage={collectionCoverage}
              dueNow={dueNow}
              unpaidDue={unpaidDue}
              collectionsToday={collectionsToday}
              arrearsBacklog={arrearsBacklog}
              newClients={newClients}
              firstTimeBorrowers={firstTimeBorrowers}
              repeatBorrowers={repeatBorrowers}
              repaidLoanCount={repaidLoanCount}
              overdueAmount={overdueAmount}
              writtenOffBalance={writtenOffBalance}
              overdueInstallments={Number(portfolio?.overdue_installments || 0)}
              restructuredLoans={Number(portfolio?.restructured_loans || 0)}
              loansDisbursed={loansDisbursed}
              totalDisbursedAmount={totalDisbursedAmount}
            />
          </Suspense>
        </>
      ) : null}

      <section className={`${styles.notice} ${noticeVariant}`}>
        <span className={styles.noticeTitle}>{noticeTitle}</span>
        <span>{noticeText}</span>
      </section>

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
