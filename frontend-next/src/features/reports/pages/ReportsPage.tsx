import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { AsyncState } from '../../../components/common/AsyncState'
import { queryPolicies } from '../../../services/queryPolicies'
import { getReportByPath, getReportFilterOptions } from '../../../services/reportService'
import { queryKeys } from '../../../services/queryKeys'
import { useToastStore } from '../../../store/toastStore'
import styles from './ReportsPage.module.css'

const ReportResultsPanel = lazy(() => import('../components/ReportResultsPanel').then((module) => ({ default: module.ReportResultsPanel })))
const ReportExportActions = lazy(() => import('../components/ReportExportActions').then((module) => ({ default: module.ReportExportActions })))

type ReportDatePreset = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'next_7_days' | 'next_30_days' | 'this_month' | 'last_month' | 'custom_range'

type ReportFilterOptionsPayload = {
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
    scopeType?: string | null
  }>
  agents?: Array<{
    id: number | string
    name: string
    role?: string | null
    branchId?: number | null
    branchName?: string | null
    branchCode?: string | null
    managedLoans?: number
    scopeType?: string | null
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
  categories?: Array<{
    id: string
    label: string
  }>
  reports?: Array<{
    id: string
    label: string
    description?: string
    category: string
    endpoint: string
  }>
}

type GeneratedRequest = {
  report: {
    id: string
    label: string
    description?: string
    category: string
    endpoint: string
  }
  params: Record<string, unknown>
}

const reportDatePresetOptions: Array<{ value: ReportDatePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'next_7_days', label: 'Next 7 Days' },
  { value: 'next_30_days', label: 'Next 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom_range', label: 'Custom Range' },
]

function parseReportDatePreset(value: string | null): ReportDatePreset | null {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return null
  }

  return reportDatePresetOptions.some((entry) => entry.value === normalized)
    ? normalized as ReportDatePreset
    : null
}

function parseCsvValues(value: string | null): string[] {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

const reservedReportSearchParamKeys = new Set([
  'autoload',
  'categoryId',
  'customDateFrom',
  'customDateTo',
  'dateFrom',
  'datePreset',
  'dateTo',
  'level',
  'officeId',
  'officerIds',
  'reportId',
])

function extractReportPassThroughParams(searchParams: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {}

  searchParams.forEach((value, key) => {
    if (reservedReportSearchParamKeys.has(key)) {
      return
    }

    const normalizedValue = String(value || '').trim()
    if (!normalizedValue) {
      return
    }

    params[key] = normalizedValue
  })

  return params
}

function toDateInputValue(value: string | null): string {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().slice(0, 10)
}

function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function resolveReportDateParams({
  preset,
  customDateFrom,
  customDateTo,
}: {
  preset: ReportDatePreset
  customDateFrom: string
  customDateTo: string
}): { params: Record<string, string>; error?: string } {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)

  if (preset === 'custom_range') {
    if (!customDateFrom || !customDateTo) {
      return { params: {}, error: 'Select both Date From and Date To for Custom Range.' }
    }

    // Parse as UTC so dates are not shifted by the user's local offset (e.g. EAT UTC+3)
    const fromDate = new Date(`${customDateFrom}T00:00:00.000Z`)
    const toDate = new Date(`${customDateTo}T23:59:59.999Z`)
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return { params: {}, error: 'Choose valid custom range dates.' }
    }
    if (fromDate > toDate) {
      return { params: {}, error: 'Date From cannot be after Date To.' }
    }
    return {
      params: {
        dateFrom: fromDate.toISOString(),
        dateTo: toDate.toISOString(),
      },
    }
  }

  let fromDate = todayStart
  let toDate = todayEnd

  switch (preset) {
    case 'today':
      break
    case 'yesterday':
      fromDate = startOfDay(addDays(now, -1))
      toDate = endOfDay(addDays(now, -1))
      break
    case 'last_7_days':
      fromDate = startOfDay(addDays(now, -6))
      break
    case 'last_30_days':
      fromDate = startOfDay(addDays(now, -29))
      break
    case 'next_7_days':
      fromDate = startOfDay(addDays(now, 1))
      toDate = endOfDay(addDays(now, 7))
      break
    case 'next_30_days':
      fromDate = startOfDay(addDays(now, 1))
      toDate = endOfDay(addDays(now, 30))
      break
    case 'this_month':
      fromDate = startOfMonth(now)
      break
    case 'last_month': {
      const lastMonthAnchor = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      fromDate = startOfMonth(lastMonthAnchor)
      toDate = endOfMonth(lastMonthAnchor)
      break
    }
    default:
      break
  }

  return {
    params: {
      dateFrom: fromDate.toISOString(),
      dateTo: toDate.toISOString(),
    },
  }
}

function toLevelLabel(level: string): string {
  const normalized = String(level || '').trim().toLowerCase()
  if (normalized === 'hq') return 'Head Office'
  if (normalized === 'region') return 'Region'
  if (normalized === 'branch') return 'Branch'
  if (normalized === 'entity') return 'Entity'
  if (normalized === 'satellite') return 'Satellite'
  return String(level || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function normalizeReportPathLabel(endpoint: string) {
  const normalized = String(endpoint || '').trim()
  if (!normalized) {
    return '/reports/portfolio'
  }
  if (normalized.startsWith('/api/')) {
    return normalized.slice(4)
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function isDuesReportEndpoint(endpoint: string | null | undefined): boolean {
  return normalizeReportPathLabel(String(endpoint || '')) === '/reports/dues'
}

function buildGeneratedReportRequest({
  selectedReport,
  availableAgents,
  effectiveSelectedAgentIds,
  selectedOffice,
  reportDatePreset,
  customDateFrom,
  customDateTo,
  extraParams,
  exactDateFrom,
  exactDateTo,
}: {
  selectedReport: GeneratedRequest['report'] | null
  availableAgents: Array<{ id: number | string }>
  effectiveSelectedAgentIds: string[]
  selectedOffice: { id: number | string; scopeType?: string | null } | null
  reportDatePreset: ReportDatePreset
  customDateFrom: string
  customDateTo: string
  extraParams?: Record<string, string>
  exactDateFrom?: string | null
  exactDateTo?: string | null
}): { request: GeneratedRequest | null; error?: string } {
  if (!selectedReport) {
    return { request: null, error: 'Select a report before generating.' }
  }

  const normalizedAgentIds = [...new Set(
    effectiveSelectedAgentIds
      .map((value) => Number(value || 0))
      .filter((value) => Number.isInteger(value) && value > 0),
  )]
  const normalizedEndpoint = String(selectedReport.endpoint || '')
  const resolvedDateParams = resolveReportDateParams({
    preset: reportDatePreset,
    customDateFrom,
    customDateTo,
  })

  if (resolvedDateParams.error) {
    return { request: null, error: resolvedDateParams.error }
  }

  const params: Record<string, unknown> = {
    ...(exactDateFrom && exactDateTo
      ? { dateFrom: exactDateFrom, dateTo: exactDateTo }
      : resolvedDateParams.params),
    ...(extraParams || {}),
    ...(
      normalizedAgentIds.length > 0 && normalizedAgentIds.length < availableAgents.length
        ? { officerIds: normalizedAgentIds.join(',') }
        : {}
    ),
    ...(normalizedEndpoint.endsWith('/reports/portfolio') ? { includeBreakdown: true } : {}),
  }

  if (String(selectedOffice?.scopeType || '').trim().toLowerCase() === 'branch') {
    const normalizedOfficeId = Number(selectedOffice?.id || 0)
    if (Number.isInteger(normalizedOfficeId) && normalizedOfficeId > 0) {
      params.branchId = normalizedOfficeId
    }
  }

  return {
    request: {
      report: selectedReport,
      params,
    },
  }
}

function MultiAgentPicker({
  availableAgents,
  selectedAgentIds,
  setSelectedAgentIds,
  disabled,
}: {
  availableAgents: Array<{ id: number | string; name: string }>
  selectedAgentIds: string[]
  setSelectedAgentIds: (ids: string[]) => void
  disabled: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayValue = selectedAgentIds.length === 0
    ? 'All Officers'
    : `${selectedAgentIds.length} Selected`

  return (
    <div className={styles.multiSelectWrap} ref={wrapperRef}>
      <button
        type="button"
        className={styles.multiSelectTrigger}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current)
          }
        }}
      >
        {displayValue}
        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>v</span>
      </button>

      {isOpen ? (
        <div className={styles.multiSelectDropdown}>
          {availableAgents.map((agent) => {
            const id = String(agent.id)
            const isSelected = selectedAgentIds.includes(id)
            return (
              <label key={id} className={styles.multiSelectOption}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {
                    if (isSelected) {
                      setSelectedAgentIds(selectedAgentIds.filter((value) => value !== id))
                      return
                    }
                    setSelectedAgentIds([...selectedAgentIds, id])
                  }}
                />
                {agent.name}
              </label>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function ReportsPage() {
  const [searchParams] = useSearchParams()
  const deepLinkQueryKey = searchParams.toString()
  const autoloadRequested = searchParams.get('autoload') === '1'
  const deepLinkPassThroughParams = useMemo(() => extractReportPassThroughParams(searchParams), [deepLinkQueryKey, searchParams])
  const deepLinkDateFrom = String(searchParams.get('dateFrom') || '').trim()
  const deepLinkDateTo = String(searchParams.get('dateTo') || '').trim()
  const initialDatePreset = parseReportDatePreset(searchParams.get('datePreset'))
  const [level, setLevel] = useState(() => String(searchParams.get('level') || '').trim())
  const [officeId, setOfficeId] = useState(() => String(searchParams.get('officeId') || '').trim())
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(() => parseCsvValues(searchParams.get('officerIds')))
  const [categoryId, setCategoryId] = useState(() => String(searchParams.get('categoryId') || '').trim())
  const [reportId, setReportId] = useState(() => String(searchParams.get('reportId') || '').trim())
  const [reportDatePreset, setReportDatePreset] = useState<ReportDatePreset>(initialDatePreset || 'last_30_days')
  const [customDateFrom, setCustomDateFrom] = useState(() => toDateInputValue(searchParams.get('customDateFrom') || searchParams.get('dateFrom')))
  const [customDateTo, setCustomDateTo] = useState(() => toDateInputValue(searchParams.get('customDateTo') || searchParams.get('dateTo')))
  const [generatedRequest, setGeneratedRequest] = useState<GeneratedRequest | null>(null)
  const autoloadedQueryRef = useRef<string | null>(null)
  const pushToast = useToastStore((state) => state.pushToast)

  const filterOptionsQuery = useQuery({
    queryKey: queryKeys.reports.filterOptions({ agentRole: 'loan_officer' }),
    queryFn: () => getReportFilterOptions({ agentRole: 'loan_officer' }),
    ...queryPolicies.report,
  })

  const filterOptions = filterOptionsQuery.data as ReportFilterOptionsPayload | undefined
  const normalizedFilterOptions = useMemo(() => ({
    scope: filterOptions?.scope || {},
    filterUi: filterOptions?.ui || {},
    levels: Array.isArray(filterOptions?.levels) ? filterOptions.levels : [],
    offices: Array.isArray(filterOptions?.offices) ? filterOptions.offices : [],
    agents: Array.isArray(filterOptions?.agents) ? filterOptions.agents : [],
    categories: Array.isArray(filterOptions?.categories) ? filterOptions.categories : [],
    reports: Array.isArray(filterOptions?.reports) ? filterOptions.reports : [],
  }), [filterOptions])
  const { scope, filterUi, levels, offices, agents, categories, reports } = normalizedFilterOptions
  const deepLinkedReport = useMemo(
    () => reports.find((entry) => entry.id === reportId) || null,
    [reportId, reports],
  )
  const effectiveLevel = useMemo(() => {
    if (levels.length === 0) {
      return ''
    }
    if (level && levels.includes(level)) {
      return level
    }
    const scopeLevel = String(scope.level || '').trim().toLowerCase()
    const preferredLevel = levels.find((entry) => String(entry).trim().toLowerCase() === scopeLevel)
    return preferredLevel || levels[0]
  }, [level, levels, scope.level])
  const effectiveOfficeId = useMemo(() => {
    if (offices.length === 0) {
      return ''
    }
    if (officeId && offices.some((entry) => String(entry.id) === String(officeId))) {
      return officeId
    }
    const scopeBranchId = Number(scope.branchId || 0)
    const preferredOffice = offices.find(
      (office) => String(office.scopeType || '').trim().toLowerCase() === 'branch'
        && Number(office.id) === scopeBranchId,
    )
    return String(preferredOffice?.id ?? offices[0].id)
  }, [officeId, offices, scope.branchId])
  const effectiveCategoryId = useMemo(() => {
    if (categories.length === 0) {
      return ''
    }
    if (categoryId && categories.some((entry) => entry.id === categoryId)) {
      return categoryId
    }
    if (deepLinkedReport && categories.some((entry) => entry.id === deepLinkedReport.category)) {
      return deepLinkedReport.category
    }
    return categories[0].id
  }, [categories, categoryId, deepLinkedReport])
  const selectedOffice = useMemo(
    () => offices.find((entry) => String(entry.id) === String(effectiveOfficeId)) || null,
    [effectiveOfficeId, offices],
  )

  const availableReports = useMemo(() => {
    if (!effectiveCategoryId) {
      return reports
    }
    return reports.filter((entry) => String(entry.category) === String(effectiveCategoryId))
  }, [effectiveCategoryId, reports])

  const effectiveReportId = useMemo(() => {
    if (availableReports.length === 0) {
      return ''
    }
    if (reportId && availableReports.some((entry) => entry.id === reportId)) {
      return reportId
    }
    return availableReports[0].id
  }, [availableReports, reportId])

  const activeGeneratedRequest = useMemo(() => {
    if (!generatedRequest) {
      return null
    }
    return generatedRequest.report.id === effectiveReportId ? generatedRequest : null
  }, [effectiveReportId, generatedRequest])

  const selectedReport = useMemo(
    () => reports.find((entry) => entry.id === effectiveReportId) || null,
    [effectiveReportId, reports],
  )

  const duesReportSelected = useMemo(
    () => isDuesReportEndpoint(selectedReport?.endpoint),
    [selectedReport?.endpoint],
  )

  const availableAgents = useMemo(() => {
    const officeScopeType = String(selectedOffice?.scopeType || '').trim().toLowerCase()
    if (officeScopeType !== 'branch') {
      return agents
    }
    const selectedOfficeNumber = Number(selectedOffice?.id || 0)
    if (!Number.isInteger(selectedOfficeNumber) || selectedOfficeNumber <= 0) {
      return agents
    }
    return agents.filter((entry) => Number(entry.branchId || 0) === selectedOfficeNumber)
  }, [agents, selectedOffice])
  const effectiveSelectedAgentIds = useMemo(() => {
    if (availableAgents.length === 0) {
      return []
    }
    return selectedAgentIds.filter((selectedId) => (
      availableAgents.some((entry) => String(entry.id) === String(selectedId))
    ))
  }, [availableAgents, selectedAgentIds])

  const generatedReportQuery = useQuery({
    queryKey: queryKeys.reports.generated(
      activeGeneratedRequest?.report.id || null,
      activeGeneratedRequest?.params || {},
    ),
    queryFn: () => getReportByPath(activeGeneratedRequest?.report.endpoint || '/reports/portfolio', activeGeneratedRequest?.params || {}),
    enabled: Boolean(activeGeneratedRequest),
    ...queryPolicies.report,
  })

  useEffect(() => {
    if (!autoloadRequested || filterOptionsQuery.isLoading) {
      return
    }
    if (autoloadedQueryRef.current === deepLinkQueryKey) {
      return
    }

    const { request } = buildGeneratedReportRequest({
      selectedReport,
      availableAgents,
      effectiveSelectedAgentIds,
      selectedOffice,
      reportDatePreset,
      customDateFrom,
      customDateTo,
      extraParams: deepLinkPassThroughParams,
      exactDateFrom: deepLinkDateFrom || null,
      exactDateTo: deepLinkDateTo || null,
    })

    if (!request) {
      return
    }

    setGeneratedRequest(request)
    autoloadedQueryRef.current = deepLinkQueryKey
  }, [
    autoloadRequested,
    availableAgents,
    customDateFrom,
    customDateTo,
    deepLinkDateFrom,
    deepLinkDateTo,
    deepLinkPassThroughParams,
    deepLinkQueryKey,
    effectiveSelectedAgentIds,
    filterOptionsQuery.isLoading,
    reportDatePreset,
    selectedOffice,
    selectedReport,
  ])

  function handleGenerate() {
    const { request, error } = buildGeneratedReportRequest({
      selectedReport,
      availableAgents,
      effectiveSelectedAgentIds,
      selectedOffice,
      reportDatePreset,
      customDateFrom,
      customDateTo,
      extraParams: deepLinkPassThroughParams,
    })

    if (error) {
      pushToast({ type: 'error', message: error })
      return
    }
    if (!request) {
      pushToast({ type: 'error', message: 'Select a report before generating.' })
      return
    }

    setGeneratedRequest(request)
  }

  return (
    <div className={styles.page}>
      <section className={styles.generatorCard}>
        <h1 className={styles.title}>Data & Reports</h1>

        <div className={styles.dividerLabel}>
          <span>Audience & Scope</span>
        </div>
        <div className={styles.grid}>
          <label className={styles.compoundField}>
            <span className={styles.compoundLabel}>Level</span>
            <select
              value={effectiveLevel}
              onChange={(event) => setLevel(event.target.value)}
              disabled={Boolean(filterUi.levelLocked)}
            >
              <option value="">Select level...</option>
              {levels.map((entry) => (
                <option key={entry} value={entry}>{toLevelLabel(entry)}</option>
              ))}
            </select>
          </label>

          <label className={styles.compoundField}>
            <span className={styles.compoundLabel}>{filterUi.officeLabel || 'Office'}</span>
            <select
              value={effectiveOfficeId}
              onChange={(event) => setOfficeId(event.target.value)}
              disabled={Boolean(filterUi.officeLocked)}
            >
              <option value="">{filterUi.officePlaceholder || 'Select office...'}</option>
              {offices.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code ? `${entry.code} - ${entry.name}` : entry.name}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gap: '8px' }}>
            <div className={styles.compoundField}>
              <span className={styles.compoundLabel}>{filterUi.agentLabel || 'Officers'}</span>
              <MultiAgentPicker
                availableAgents={availableAgents.map((agent) => ({ id: agent.id, name: agent.name }))}
                selectedAgentIds={effectiveSelectedAgentIds}
                setSelectedAgentIds={setSelectedAgentIds}
                disabled={Boolean(filterUi.agentLocked)}
              />
            </div>
            <p className={styles.fieldHint}>Select specific officers or leave for branch view.</p>
          </div>
        </div>

        <div className={styles.dividerLabel}>
          <span>Report Configuration</span>
        </div>
        <div className={styles.grid}>
          <label className={styles.compoundField}>
            <span className={styles.compoundLabel}>Category</span>
            <select value={effectiveCategoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Select category...</option>
              {categories.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label.toUpperCase()}</option>
              ))}
            </select>
          </label>

          <label className={styles.compoundField}>
            <span className={styles.compoundLabel}>Report</span>
            <select value={effectiveReportId} onChange={(event) => setReportId(event.target.value)}>
              <option value="">Select report...</option>
              {availableReports.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.compoundField}>
            <span className={styles.compoundLabel}>Date Range</span>
            <select
              value={reportDatePreset}
              onChange={(event) => setReportDatePreset(event.target.value as ReportDatePreset)}
            >
              {reportDatePresetOptions.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </label>
        </div>

        {selectedReport?.description ? (
          <>
            <p className={styles.reportDescription}>{selectedReport.description}</p>
            {duesReportSelected ? (
              <p className={styles.reportHint}>Time-series reports enforce exact boundary matching for disbursements and repays.</p>
            ) : null}
          </>
        ) : null}

        {reportDatePreset === 'custom_range' ? (
          <div className={styles.customRangeGrid}>
            <label className={styles.compoundField}>
              <span className={styles.compoundLabel}>Date From</span>
              <input
                type="date"
                value={customDateFrom}
                onChange={(event) => setCustomDateFrom(event.target.value)}
              />
            </label>

            <label className={styles.compoundField}>
              <span className={styles.compoundLabel}>Date To</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(event) => setCustomDateTo(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div className={styles.generateWrap}>
          <button
            type="button"
            className={styles.generateButton}
            onClick={handleGenerate}
            disabled={generatedReportQuery.isFetching}
          >
            {generatedReportQuery.isFetching ? 'Generating…' : 'Generate View'}
          </button>
        </div>
      </section>

      <AsyncState
        loading={filterOptionsQuery.isLoading}
        error={filterOptionsQuery.isError}
        loadingText="Loading report configurations..."
        errorText="Unable to load report configuration."
        onRetry={() => {
          void filterOptionsQuery.refetch()
        }}
      />

      {activeGeneratedRequest ? (
        <section className={styles.resultCard}>
          <div className={styles.resultHeader}>
            <div>
              <p className={styles.resultEyebrow}>Report Results</p>
              <h2>{activeGeneratedRequest.report.label}</h2>
              {activeGeneratedRequest.report.description ? (
                <p className={styles.resultDescription}>{activeGeneratedRequest.report.description}</p>
              ) : null}
            </div>
            <Suspense
              fallback={(
                <div className={styles.exportGroup}>
                  <button type="button" disabled>CSV</button>
                  <button type="button" disabled>XLSX</button>
                  <button type="button" disabled>PDF</button>
                </div>
              )}
            >
              <ReportExportActions
                endpoint={activeGeneratedRequest.report.endpoint}
                params={activeGeneratedRequest.params}
                label={activeGeneratedRequest.report.label}
              />
            </Suspense>
          </div>

          <Suspense fallback={<p className={styles.fieldHint}>Loading report visuals...</p>}>
            <ReportResultsPanel
              data={generatedReportQuery.data}
              loading={generatedReportQuery.isLoading}
              error={generatedReportQuery.isError}
              onRetry={() => {
                void generatedReportQuery.refetch()
              }}
            />
          </Suspense>
        </section>
      ) : null}
    </div>
  )
}

