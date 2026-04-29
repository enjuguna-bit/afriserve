import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { hasAnyRole } from '../../../app/roleAccess'
import { AsyncState } from '../../../components/common/AsyncState'
import { DynamicTable, type DynamicTableColumn } from '../../../components/common/DynamicTable'
import { useAuth } from '../../../hooks/useAuth'
import { prefetchLoanWorkspace } from '../../../services/prefetch'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'
import { listLoans } from '../../../services/loanService'
import type { LoanRecord } from '../../../types/loan'
import { formatDisplayDate } from '../../../utils/dateFormatting'
import { formatDisplayText, resolveDisplayText } from '../../../utils/displayFormatting'
import { useLoans } from '../hooks/useLoans'
import { formatWorkflowText, getLoanActionState } from '../utils/workflow'
import styles from './LoansPage.module.css'

const DEFAULT_PAGE_SIZE = 100
const PAGE_SIZE_OPTIONS = [50, 100, 250]

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatLoanRef(id: number) {
  return `LN-${String(id).padStart(6, '0')}`
}

function formatInterest(loan: LoanRecord) {
  return Math.max(0, Number(loan.expected_total || 0) - Number(loan.principal || 0))
}

function statusClassName(status: string) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'active' || normalized === 'restructured') {
    return styles.statusActive
  }
  if (normalized === 'pending_approval' || normalized === 'pending') {
    return styles.statusPending
  }
  if (normalized === 'approved') {
    return styles.statusApproved
  }
  if (normalized === 'rejected' || normalized === 'written_off') {
    return styles.statusOther
  }
  if (normalized === 'closed') {
    return styles.statusClosed
  }
  return styles.statusOther
}

function parsePositiveIntSearchParam(value: string | null): number | undefined {
  const parsed = Number(value || 0)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function buildLoanColumns(): Array<DynamicTableColumn<LoanRecord>> {
  return [
    {
      id: 'facility',
      header: 'Facility',
      width: '10%',
      cell: (loan) => (
        <Link to={`/loans/${loan.id}`} className={styles.refCell} onClick={(event) => event.stopPropagation()}>
          {formatLoanRef(loan.id)}
        </Link>
      ),
    },
    {
      id: 'borrower',
      header: 'Borrower',
      width: '22%',
      cell: (loan) => (
        <div className={styles.borrowerCell}>
          <strong>{resolveDisplayText([loan.client_name, loan.client_id ? `Client ${loan.client_id}` : null], 'Unknown client')}</strong>
          <span>{formatDisplayDate(loan.disbursed_at, 'Not disbursed')}</span>
        </div>
      ),
    },
    {
      id: 'principal',
      header: 'Principal',
      width: '13%',
      align: 'right',
      cell: (loan) => <span className={styles.moneyCell}>Ksh {formatCurrency(loan.principal)}</span>,
    },
    {
      id: 'interest',
      header: 'Interest',
      width: '13%',
      align: 'right',
      cell: (loan) => `Ksh ${formatCurrency(formatInterest(loan))}`,
    },
    {
      id: 'outstanding',
      header: 'Outstanding',
      width: '13%',
      align: 'right',
      cell: (loan) => <span className={styles.moneyCell}>Ksh {formatCurrency(loan.balance)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      width: '12%',
      cell: (loan) => (
        <span className={`${styles.statusBadge} ${statusClassName(loan.status)}`}>
          {formatWorkflowText(resolveDisplayText([loan.workflow_stage, loan.status], 'unknown'))}
        </span>
      ),
    },
    {
      id: 'unit',
      header: 'Unit',
      width: '7%',
      cell: (loan) => formatDisplayText(loan.branch_code),
    },
    {
      id: 'action',
      header: 'Action',
      width: '10%',
      cell: (loan) => {
        const workflowState = getLoanActionState(loan.status)

        if (workflowState.showApprovalControls) {
          return (
            <div className={styles.actions}>
              <Link className={styles.actionPrimary} to={`/loans/${loan.id}?workspace=operations`} onClick={(event) => event.stopPropagation()}>
                Action Required
              </Link>
            </div>
          )
        }

        if (workflowState.showFundingWorkspace) {
          return (
            <div className={styles.actions}>
              <Link className={styles.actionPrimary} to={`/loans/${loan.id}?workspace=operations`} onClick={(event) => event.stopPropagation()}>
                Awaiting Funds
              </Link>
            </div>
          )
        }

        return (
          <div className={styles.actions}>
            <Link className={styles.actionView} to={`/loans/${loan.id}`} onClick={(event) => event.stopPropagation()}>
              Manage
            </Link>
          </div>
        )
      },
    },
  ]
}

export function LoansPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const searchQueryKey = searchParams.toString()
  const { user } = useAuth()
  const [searchInput, setSearchInput] = useState(() => String(searchParams.get('search') || '').trim())
  const [appliedSearch, setAppliedSearch] = useState(() => String(searchParams.get('search') || '').trim())
  const [status, setStatus] = useState(() => String(searchParams.get('status') || '').trim())
  const [branchIdFilter, setBranchIdFilter] = useState<number | undefined>(() => parsePositiveIntSearchParam(searchParams.get('branchId')))
  const [officerIdFilter, setOfficerIdFilter] = useState<number | undefined>(() => parsePositiveIntSearchParam(searchParams.get('officerId')))
  const [statusGroupFilter, setStatusGroupFilter] = useState(() => String(searchParams.get('statusGroup') || '').trim())
  const [workflowStageFilter, setWorkflowStageFilter] = useState(() => String(searchParams.get('workflowStage') || '').trim())
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [offset, setOffset] = useState(0)
  const canCreateLoans = hasAnyRole(user, ['admin', 'loan_officer'])
  const columns = buildLoanColumns()

  const query = useMemo(
    () => ({
      limit,
      offset,
      search: appliedSearch || undefined,
      status: status || undefined,
      branchId: branchIdFilter,
      officerId: officerIdFilter,
      statusGroup: statusGroupFilter || undefined,
      workflowStage: workflowStageFilter || undefined,
      sortBy: 'id',
      sortOrder: 'desc',
    }),
    [appliedSearch, branchIdFilter, limit, offset, officerIdFilter, status, statusGroupFilter, workflowStageFilter],
  )

  const loansQuery = useLoans(query)
  const loans = loansQuery.data?.data || []
  const totalRecords = Number(loansQuery.data?.paging.total || 0)
  const showingFrom = totalRecords === 0 ? 0 : offset + 1
  const showingTo = totalRecords === 0 ? 0 : Math.min(offset + loans.length, totalRecords)
  const hasActiveFilters = Boolean(appliedSearch || status || branchIdFilter || officerIdFilter || statusGroupFilter || workflowStageFilter)

  useEffect(() => {
    const nextSearch = String(searchParams.get('search') || '').trim()
    setSearchInput(nextSearch)
    setAppliedSearch(nextSearch)
    setStatus(String(searchParams.get('status') || '').trim())
    setBranchIdFilter(parsePositiveIntSearchParam(searchParams.get('branchId')))
    setOfficerIdFilter(parsePositiveIntSearchParam(searchParams.get('officerId')))
    setStatusGroupFilter(String(searchParams.get('statusGroup') || '').trim())
    setWorkflowStageFilter(String(searchParams.get('workflowStage') || '').trim())
    setOffset(0)
  }, [searchParams, searchQueryKey])

  useEffect(() => {
    if (!loansQuery.data) {
      return
    }

    const nextOffset = offset + limit
    if (nextOffset >= totalRecords) {
      return
    }

    const nextQuery = {
      ...query,
      offset: nextOffset,
    }

    void queryClient.prefetchQuery({
      queryKey: queryKeys.loans.list(nextQuery),
      queryFn: () => listLoans(nextQuery),
      staleTime: queryPolicies.list.staleTime,
    })
  }, [limit, loansQuery.data, offset, query, queryClient, totalRecords])

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBody}>
          <p className={styles.eyebrow}>Portfolio register</p>
          <h1>Loan Facilities</h1>
          <p className={styles.subtitle}>
            Live firm-wide view of all loan facilities, balances, interest expectations, and application statuses.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span>Total Facilities</span>
          <strong>{totalRecords}</strong>
        </div>
      </section>

      <section className={styles.toolbarCard}>
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>Q</span>
            <input
              className={styles.inputSearch}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setOffset(0)
                  setAppliedSearch(searchInput.trim())
                }
              }}
              placeholder="Search borrower or ID..."
            />
          </div>
          <select
            className={styles.inputSelect}
            value={status}
            onChange={(event) => {
              setOffset(0)
              setStatus(event.target.value)
            }}
          >
            <option value="">All statuses</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved (Pending Disbursement)</option>
            <option value="active">Active</option>
            <option value="closed">Closed / Paid out</option>
          </select>
        </div>
        {canCreateLoans ? (
          <Link className={styles.primaryLink} to="/loans/new">
            + Originate Loan
          </Link>
        ) : null}
      </section>

      <AsyncState
        loading={!loansQuery.data && loansQuery.isFetching}
        error={loansQuery.isError && !loansQuery.data}
        loadingText="Loading facilities..."
        errorText="Unable to load loans."
        onRetry={() => {
          void loansQuery.refetch()
        }}
      />

      {loansQuery.data ? (
        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <p className={styles.tableEyebrow}>Loan portfolio</p>
              <h2>Assigned loan list</h2>
            </div>
            <p className={styles.total}>
              {totalRecords === 0 ? 'No facilities matched the current filter set.' : `Showing ${showingFrom} to ${showingTo} of ${totalRecords}`}
            </p>
          </div>

          <DynamicTable<LoanRecord>
            rows={loans}
            columns={columns}
            tableClassName={styles.table}
            emptyTitle="No facilities in this slice"
            emptyText="No facilities matched the current search or status filter. Expand the filter or clear the search to widen the portfolio view."
            emptyActionText={hasActiveFilters ? 'Clear filters' : undefined}
            onEmptyAction={hasActiveFilters ? () => {
              setOffset(0)
              setSearchInput('')
              setAppliedSearch('')
              setStatus('')
              setBranchIdFilter(undefined)
              setOfficerIdFilter(undefined)
              setStatusGroupFilter('')
              setWorkflowStageFilter('')
            } : undefined}
            onRetry={() => {
              void loansQuery.refetch()
            }}
            ariaLabel="Assigned loan list"
            caption="Paginated loan facility register"
            rowKey={(loan) => String(loan.id)}
            getRowLabel={(loan) => `Open loan facility ${formatLoanRef(loan.id)}`}
            onRowHover={(loan) => {
              void prefetchLoanWorkspace(queryClient, loan.id)
            }}
            pagination={{
              totalRows: totalRecords,
              limit,
              offset,
              label: 'loan facilities',
              isFetching: loansQuery.isFetching,
              limitOptions: PAGE_SIZE_OPTIONS,
              onOffsetChange: setOffset,
              onLimitChange: (nextLimit) => {
                setLimit(nextLimit)
                setOffset(0)
              },
            }}
          />
        </section>
      ) : null}
    </div>
  )
}

