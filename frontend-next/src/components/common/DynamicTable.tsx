import {
  Component,
  type HTMLAttributes,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PropsWithChildren,
  type ReactNode,
  useId,
  useMemo,
} from 'react'
import { EmptyState } from './EmptyState'
import styles from './DynamicTable.module.css'

type TableRow = Record<string, unknown>

type CellAlign = 'left' | 'center' | 'right'

export type DynamicTableColumn<TRow extends TableRow> = {
  id: string
  header: ReactNode
  accessor?: keyof TRow | ((row: TRow) => unknown)
  cell?: (row: TRow, rowIndex: number) => ReactNode
  width?: string
  align?: CellAlign
  headerClassName?: string
  cellClassName?: string
}

export type DynamicTablePagination = {
  totalRows: number
  limit: number
  offset: number
  onOffsetChange: (nextOffset: number) => void
  onLimitChange?: (nextLimit: number) => void
  limitOptions?: number[]
  isFetching?: boolean
  label?: string
}

type DynamicTableProps<TRow extends TableRow> = {
  rows: TRow[]
  columns?: Array<DynamicTableColumn<TRow>>
  emptyText: string
  emptyTitle?: string
  emptyActionText?: string
  onEmptyAction?: () => void
  preferredColumns?: string[]
  className?: string
  tableClassName?: string
  containerClassName?: string
  rowKey?: (row: TRow, rowIndex: number) => string
  getRowProps?: (row: TRow, rowIndex: number) => HTMLAttributes<HTMLTableRowElement>
  onRowClick?: (row: TRow, rowIndex: number) => void
  onRowHover?: (row: TRow, rowIndex: number) => void
  getRowLabel?: (row: TRow, rowIndex: number) => string
  pagination?: DynamicTablePagination
  ariaLabel?: string
  caption?: string
  onRetry?: () => void
}

type InlineBoundaryProps = PropsWithChildren<{
  onRetry?: () => void
}>

type InlineBoundaryState = {
  hasError: boolean
}

function joinClasses(...values: Array<string | undefined | false | null>) {
  return values.filter(Boolean).join(' ')
}

function toLabel(key: string): string {
  return String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function getDetectedColumns<TRow extends TableRow>(rows: TRow[], preferredColumns: string[] = []): Array<DynamicTableColumn<TRow>> {
  const keys = new Set<string>()
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => keys.add(key))
  })

  const preferred = preferredColumns.filter((key) => keys.has(key))
  const remaining = Array.from(keys)
    .filter((key) => !preferred.includes(key))
    .sort((left, right) => left.localeCompare(right))

  return [...preferred, ...remaining].map((column) => ({
    id: column,
    header: toLabel(column),
    accessor: column,
  }))
}

function formatCellValue(value: unknown): string {
  if (value == null) {
    return '-'
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return '[unavailable]'
  }
}

function resolveCellValue<TRow extends TableRow>(row: TRow, column: DynamicTableColumn<TRow>) {
  if (typeof column.accessor === 'function') {
    return column.accessor(row)
  }

  if (typeof column.accessor === 'string') {
    return row[column.accessor]
  }

  return row[column.id]
}

class InlineTableErrorBoundary extends Component<InlineBoundaryProps, InlineBoundaryState> {
  state: InlineBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): InlineBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('DynamicTable render error:', error)
  }

  private handleReset = () => {
    this.setState({ hasError: false })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className={styles.errorState} role="alert" aria-live="assertive">
          <div className={styles.errorHeader}>
            <p className={styles.errorEyebrow}>Inline recovery</p>
            <h2 className={styles.errorTitle}>This table hit a rendering fault.</h2>
            <p className={styles.errorText}>
              Reset the table view first. If it fails again, refresh the workspace data and try the action again.
            </p>
          </div>
          <div className={styles.errorActions}>
            <button type="button" className={styles.primaryAction} onClick={this.handleReset}>
              Try again
            </button>
            {this.props.onRetry ? (
              <button type="button" className={styles.secondaryAction} onClick={this.props.onRetry}>
                Refresh data
              </button>
            ) : null}
          </div>
        </section>
      )
    }

    return this.props.children
  }
}

export function DynamicTable<TRow extends TableRow>({
  rows,
  columns,
  emptyText,
  emptyTitle = 'Nothing matched this view',
  emptyActionText,
  onEmptyAction,
  preferredColumns = [],
  className,
  tableClassName,
  containerClassName,
  rowKey,
  getRowProps,
  onRowClick,
  onRowHover,
  getRowLabel,
  pagination,
  ariaLabel = 'Data table',
  caption,
  onRetry,
}: DynamicTableProps<TRow>) {
  const descriptionId = useId()
  const detectedColumns = useMemo(
    () => columns ?? getDetectedColumns(rows, preferredColumns),
    [columns, preferredColumns, rows],
  )
  const totalRows = Math.max(0, pagination?.totalRows ?? rows.length)
  const limit = Math.max(1, pagination?.limit ?? rows.length ?? 1)
  const offset = Math.max(0, pagination?.offset ?? 0)
  const currentPage = totalRows === 0 ? 1 : Math.floor(offset / limit) + 1
  const totalPages = Math.max(1, Math.ceil(totalRows / limit))
  const showingFrom = totalRows === 0 ? 0 : offset + 1
  const showingTo = totalRows === 0 ? 0 : Math.min(offset + rows.length, totalRows)
  const isInteractive = Boolean(onRowClick || onRowHover)
  const summaryText = totalRows === 0
    ? 'No rows available.'
    : `Showing rows ${showingFrom} to ${showingTo} of ${totalRows}.`

  if (rows.length === 0) {
    return (
      <InlineTableErrorBoundary onRetry={onRetry}>
        <EmptyState
          title={emptyTitle}
          description={emptyText}
          actionLabel={emptyActionText}
          onAction={onEmptyAction}
          visual="table"
        />
      </InlineTableErrorBoundary>
    )
  }

  return (
    <InlineTableErrorBoundary onRetry={onRetry}>
      <div className={joinClasses(styles.shell, className)}>
        <p id={descriptionId} className={styles.srOnly}>
          {summaryText}
        </p>

        {pagination ? (
          <div className={styles.statusBar} aria-live="polite">
            <p className={styles.summary}>{summaryText}</p>
            <div className={styles.statusMeta}>
              {pagination.isFetching ? <span className={styles.fetchingBadge}>Refreshing</span> : null}
              {pagination.onLimitChange ? (
                <label>
                  <span className={styles.srOnly}>Rows per page</span>
                  <select
                    className={styles.limitSelect}
                    value={String(limit)}
                    onChange={(event) => pagination.onLimitChange?.(Number(event.target.value))}
                    aria-label="Rows per page"
                  >
                    {(pagination.limitOptions || [25, 50, 100, 250]).map((option) => (
                      <option key={option} value={option}>
                        {option} / page
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={joinClasses(styles.tableWrap, containerClassName)}>
          <table
            className={joinClasses(styles.table, tableClassName)}
            role="grid"
            aria-label={ariaLabel}
            aria-describedby={descriptionId}
            aria-colcount={detectedColumns.length}
            aria-rowcount={totalRows}
            aria-readonly="true"
            aria-busy={pagination?.isFetching ? 'true' : 'false'}
          >
            {caption ? <caption className={styles.srOnly}>{caption}</caption> : null}
            <colgroup>
              {detectedColumns.map((column) => (
                <col key={column.id} style={column.width ? { width: column.width } : undefined} />
              ))}
            </colgroup>
            <thead role="rowgroup">
              <tr role="row" aria-rowindex={1}>
                {detectedColumns.map((column, columnIndex) => (
                  <th
                    key={column.id}
                    role="columnheader"
                    scope="col"
                    aria-colindex={columnIndex + 1}
                    data-align={column.align || 'left'}
                    className={column.headerClassName}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {rows.map((row, rowIndex) => {
                const externalRowProps = getRowProps?.(row, rowIndex)
                const resolvedRowIndex = offset + rowIndex + 2
                const handleHover = () => {
                  onRowHover?.(row, rowIndex)
                }
                const handleClick = (event: ReactMouseEvent<HTMLTableRowElement>) => {
                  externalRowProps?.onClick?.(event)
                  if (!event.defaultPrevented) {
                    onRowClick?.(row, rowIndex)
                  }
                }
                const handleFocus = (event: ReactFocusEvent<HTMLTableRowElement>) => {
                  externalRowProps?.onFocus?.(event)
                  if (!event.defaultPrevented) {
                    onRowHover?.(row, rowIndex)
                  }
                }
                const handleKeyDown = (event: ReactKeyboardEvent<HTMLTableRowElement>) => {
                  externalRowProps?.onKeyDown?.(event)
                  if (event.defaultPrevented || !onRowClick) {
                    return
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onRowClick(row, rowIndex)
                  }
                }

                return (
                  <tr
                    key={rowKey ? rowKey(row, rowIndex) : String(row.id ?? `${offset}-${rowIndex}`)}
                    {...externalRowProps}
                    role="row"
                    aria-rowindex={resolvedRowIndex}
                    aria-label={getRowLabel?.(row, rowIndex)}
                    className={joinClasses(
                      externalRowProps?.className,
                      isInteractive && styles.interactiveRow,
                    )}
                    tabIndex={isInteractive ? 0 : externalRowProps?.tabIndex}
                    onClick={handleClick}
                    onFocus={handleFocus}
                    onMouseEnter={(event) => {
                      externalRowProps?.onMouseEnter?.(event)
                      if (!event.defaultPrevented) {
                        handleHover()
                      }
                    }}
                    onKeyDown={handleKeyDown}
                  >
                    {detectedColumns.map((column, columnIndex) => (
                      <td
                        key={column.id}
                        role="gridcell"
                        aria-colindex={columnIndex + 1}
                        data-align={column.align || 'left'}
                        className={column.cellClassName}
                      >
                        {column.cell
                          ? column.cell(row, rowIndex)
                          : formatCellValue(resolveCellValue(row, column))}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {pagination && totalPages > 1 ? (
          <div className={styles.pagination} aria-label={`Pagination for ${pagination.label || 'table rows'}`}>
            <p className={styles.pageInfo}>
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </p>
            <div className={styles.pageControls}>
              <button
                type="button"
                className={styles.pageButton}
                disabled={offset === 0}
                onClick={() => pagination.onOffsetChange(Math.max(0, offset - limit))}
              >
                Prev
              </button>
              <button
                type="button"
                className={styles.pageButton}
                disabled={offset + limit >= totalRows}
                onClick={() => pagination.onOffsetChange(offset + limit)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </InlineTableErrorBoundary>
  )
}
