import { useMemo, useState } from 'react'
import { AsyncState } from '../../../components/common/AsyncState'
import { DynamicTable, type DynamicTableColumn } from '../../../components/common/DynamicTable'
import { EmptyState } from '../../../components/common/EmptyState'
import styles from '../pages/ReportsPage.module.css'

type TabularSection = {
  key: string
  title: string
  columns: string[]
  rows: Array<Record<string, unknown>>
}

type ReportResultsPanelProps = {
  data: unknown
  loading: boolean
  error: boolean
  onRetry: () => void
}

const LOCAL_PAGE_SIZE = 25

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value)
}

function toLabel(key: string): string {
  return String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Number(value || 0))
}

function formatValueByKey(key: string, value: unknown): string {
  if (value == null) {
    return '-'
  }

  if (typeof value === 'number') {
    if (/ratio|rate|pct|percent|par/i.test(key)) {
      const normalizedPercent = Number(value) <= 1 ? Number(value) * 100 : Number(value)
      return `${normalizedPercent.toFixed(2)}%`
    }
    if (/amount|balance|total|olb|arrears|due|collected|principal|repaid|income|expense|cash|write/i.test(key)) {
      return `Ksh ${formatAmount(value)}`
    }
    return formatNumber(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

function toPathLabel(path: string): string {
  if (String(path || '').trim() === 'reportRows') {
    return 'Report Data'
  }
  return String(path || '')
    .split('.')
    .map((segment) => toLabel(segment))
    .filter(Boolean)
    .join(' ')
}

function extractMetricRows(payload: unknown): Array<{ key: string; label: string; value: string }> {
  if (!isRecord(payload)) {
    return []
  }

  const entries: Array<{ key: string; label: string; value: unknown }> = []
  const addPrimitiveEntries = (source: Record<string, unknown>, prefix = '') => {
    Object.entries(source).forEach(([key, value]) => {
      if (!isPrimitive(value)) {
        return
      }
      const metricKey = prefix ? `${prefix}_${key}` : key
      const label = prefix ? `${toLabel(prefix)} ${toLabel(key)}` : toLabel(key)
      entries.push({ key: metricKey, label, value })
    })
  }

  if (isRecord(payload.summary)) {
    addPrimitiveEntries(payload.summary)
  }

  Object.entries(payload).forEach(([key, value]) => {
    if (key === 'summary' || key === 'period') {
      return
    }
    if (isPrimitive(value)) {
      entries.push({ key, label: toLabel(key), value })
      return
    }
    if (isRecord(value)) {
      addPrimitiveEntries(value, key)
    }
  })

  return entries
    .slice(0, 16)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      value: formatValueByKey(entry.key, entry.value),
    }))
}

function extractColumns(rows: Array<Record<string, unknown>>) {
  const firstRow = rows[0]
  if (!firstRow) {
    return []
  }

  return Object.keys(firstRow).filter((key) => isPrimitive(firstRow[key]))
}

function extractTabularSections(payload: unknown): TabularSection[] {
  if (Array.isArray(payload) && payload.length > 0 && isRecord(payload[0])) {
    const columns = extractColumns(payload as Array<Record<string, unknown>>)
    return columns.length > 0
      ? [{
        key: 'reportRows',
        title: 'Report Data',
        columns,
        rows: payload as Array<Record<string, unknown>>,
      }]
      : []
  }

  if (!isRecord(payload)) {
    return []
  }

  const preferredOrder = [
    'reportRows',
    'details',
    'dueItems',
    'disbursements',
    'customers',
    'payments',
    'guarantors',
    'arrearsDetails',
    'loanAgingDetails',
    'branchBreakdown',
    'regionBreakdown',
    'statusBreakdown',
    'branchPerformance',
    'dailyCollections',
    'daily_collections',
    'top_risk_branches',
    'daily',
    'ledgerEntries',
    'officers',
    'buckets',
    'writeOffs',
    'data',
    'entries',
  ]

  const preferredRank = new Map(preferredOrder.map((key, index) => [key, index]))
  const candidates: Array<{ key: string; title: string; rows: Array<Record<string, unknown>> }> = []

  const collectCandidates = (value: unknown, path = '') => {
    if (!isRecord(value)) {
      return
    }

    Object.entries(value).forEach(([entryKey, entryValue]) => {
      const nextPath = path ? `${path}.${entryKey}` : entryKey
      if (Array.isArray(entryValue) && entryValue.length > 0 && isRecord(entryValue[0])) {
        candidates.push({
          key: nextPath,
          title: toPathLabel(nextPath),
          rows: entryValue as Array<Record<string, unknown>>,
        })
        return
      }
      if (isRecord(entryValue)) {
        collectCandidates(entryValue, nextPath)
      }
    })
  }

  collectCandidates(payload)

  candidates.sort((left, right) => {
    const leftLeaf = left.key.split('.').pop() || left.key
    const rightLeaf = right.key.split('.').pop() || right.key
    const leftRank = preferredRank.has(leftLeaf) ? Number(preferredRank.get(leftLeaf)) : 999
    const rightRank = preferredRank.has(rightLeaf) ? Number(preferredRank.get(rightLeaf)) : 999
    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }
    return left.key.localeCompare(right.key)
  })

  return candidates
    .map((entry) => {
      const columns = extractColumns(entry.rows)
      if (columns.length === 0) {
        return null
      }
      return {
        key: entry.key,
        title: entry.title,
        columns,
        rows: entry.rows,
      } as TabularSection
    })
    .filter((entry): entry is TabularSection => entry !== null)
}

function ReportTable({ section }: { section: TabularSection }) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [offset, setOffset] = useState(0)

  const filteredAndSorted = useMemo(() => {
    let result = section.rows

    if (search.trim()) {
      const lowerSearch = search.toLowerCase()
      result = result.filter((row) => (
        section.columns.some((column) => String(row[column] || '').toLowerCase().includes(lowerSearch))
      ))
    }

    if (sortKey) {
      result = [...result].sort((left, right) => {
        const leftValue = left[sortKey]
        const rightValue = right[sortKey]

        if (leftValue === rightValue) {
          return 0
        }
        if (leftValue == null) {
          return sortAsc ? 1 : -1
        }
        if (rightValue == null) {
          return sortAsc ? -1 : 1
        }
        if (typeof leftValue === 'number' && typeof rightValue === 'number') {
          return sortAsc ? leftValue - rightValue : rightValue - leftValue
        }

        const leftText = String(leftValue).toLowerCase()
        const rightText = String(rightValue).toLowerCase()
        return sortAsc ? leftText.localeCompare(rightText) : rightText.localeCompare(leftText)
      })
    }

    return result
  }, [search, section.columns, section.rows, sortAsc, sortKey])

  const paginatedRows = filteredAndSorted.slice(offset, offset + LOCAL_PAGE_SIZE)
  const columns = useMemo<Array<DynamicTableColumn<Record<string, unknown>>>>(
    () => section.columns.map((column) => ({
      id: column,
      header: (
        <button type="button" className={styles.sortButton} onClick={() => {
          setOffset(0)
          if (sortKey === column) {
            setSortAsc((current) => !current)
            return
          }
          setSortKey(column)
          setSortAsc(true)
        }}>
          {toLabel(column)}
          <span>{sortKey === column ? (sortAsc ? 'ASC' : 'DESC') : 'SORT'}</span>
        </button>
      ),
      accessor: column,
      cell: (row) => formatValueByKey(column, row[column]),
    })),
    [section.columns, sortAsc, sortKey],
  )

  return (
    <div className={styles.tableContainer}>
      <div className={styles.tableToolbar}>
        <h3>{section.title}</h3>
        <div className={styles.tableSearch}>
          <span>Q</span>
          <input
            type="text"
            placeholder="Search rows..."
            value={search}
            onChange={(event) => {
              setOffset(0)
              setSearch(event.target.value)
            }}
          />
        </div>
      </div>

      <DynamicTable<Record<string, unknown>>
        rows={paginatedRows}
        columns={columns}
        containerClassName={styles.tableWrap}
        tableClassName={styles.table}
        emptyTitle="No matching rows"
        emptyText="Try a different search term or clear the current sort."
        ariaLabel={section.title}
        caption={`${section.title} report table`}
        pagination={{
          totalRows: filteredAndSorted.length,
          limit: LOCAL_PAGE_SIZE,
          offset,
          label: section.title,
          onOffsetChange: setOffset,
        }}
      />
    </div>
  )
}

export function ReportResultsPanel({ data, loading, error, onRetry }: ReportResultsPanelProps) {
  const generatedMetrics = useMemo(() => extractMetricRows(data), [data])
  const generatedTables = useMemo(() => extractTabularSections(data), [data])

  if (!loading && !error && generatedMetrics.length === 0 && generatedTables.length === 0) {
    return (
      <EmptyState
        title="No report data returned"
        description="This report completed without any summary cards or rows for the selected scope and date window."
        visual="table"
      />
    )
  }

  return (
    <>
      <AsyncState
        loading={loading}
        error={error}
        loadingText="Processing report data..."
        errorText="Unable to process report."
        onRetry={onRetry}
      />

      {!loading && !error ? (
        <>
          {generatedMetrics.length > 0 ? (
            <div className={styles.metricGrid}>
              {generatedMetrics.map((metric) => (
                <div key={metric.key} className={styles.metricCard}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {generatedTables.map((section) => (
            <ReportTable key={section.key} section={section} />
          ))}
        </>
      ) : null}
    </>
  )
}
