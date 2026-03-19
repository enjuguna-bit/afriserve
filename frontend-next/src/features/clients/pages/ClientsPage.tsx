import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { hasAnyRole } from '../../../app/roleAccess'
import { AsyncState } from '../../../components/common/AsyncState'
import { DynamicTable, type DynamicTableColumn } from '../../../components/common/DynamicTable'
import { useAuth } from '../../../hooks/useAuth'
import { prefetchClientWorkspace } from '../../../services/prefetch'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'
import { listClients } from '../../../services/clientService'
import type { ClientKycStatus, ClientRecord } from '../../../types/client'
import { useClients } from '../hooks/useClients'
import styles from './ClientsPage.module.css'

const DEFAULT_PAGE_SIZE = 100
const PAGE_SIZE_OPTIONS = [50, 100, 250]

function formatBorrowerRef(client: ClientRecord) {
  return `BRW-${String(client.id).padStart(6, '0')}`
}

function formatClientStatus(client: ClientRecord) {
  return Number(client.is_active || 0) === 1 ? 'ACTIVE' : 'INACTIVE'
}

function borrowerMeta(client: ClientRecord) {
  return client.phone || client.national_id || 'No phone or national ID'
}

function buildClientColumns(canManageClients: boolean): Array<DynamicTableColumn<ClientRecord>> {
  return [
    {
      id: 'name',
      header: 'Name',
      width: '22%',
      cell: (client) => (
        <div className={styles.nameCell}>
          <strong>{client.full_name}</strong>
          <span>{borrowerMeta(client)}</span>
        </div>
      ),
    },
    {
      id: 'borrowerRef',
      header: 'Borrower Ref',
      width: '12%',
      cell: (client) => <span className={styles.refCell}>{formatBorrowerRef(client)}</span>,
    },
    {
      id: 'contact',
      header: 'Contact',
      width: '12%',
      cell: (client) => <span className={styles.phoneCell}>{client.phone || '-'}</span>,
    },
    {
      id: 'compliance',
      header: 'Compliance',
      width: '15%',
      cell: (client) => (
        <div className={styles.complianceCell}>
          <span className={styles.metaBadge}>{client.kyc_status || 'N/A KYC'}</span>
          <span className={styles.metaBadge}>{client.fee_payment_status || 'N/A Fee'}</span>
        </div>
      ),
    },
    {
      id: 'officer',
      header: 'Officer',
      width: '12%',
      cell: (client) => client.assigned_officer_name || '-',
    },
    {
      id: 'branch',
      header: 'Branch',
      width: '10%',
      cell: (client) => client.branch_name || '-',
    },
    {
      id: 'status',
      header: 'Status',
      width: '8%',
      cell: (client) => (
        <span className={Number(client.is_active || 0) === 1 ? styles.statusActive : styles.statusInactive}>
          {formatClientStatus(client)}
        </span>
      ),
    },
    {
      id: 'loans',
      header: 'Loans',
      width: '6%',
      align: 'right',
      cell: (client) => <strong>{String(client.loan_count ?? 0)}</strong>,
    },
    {
      id: 'actions',
      header: 'Actions',
      width: '10%',
      cell: (client) => (
        <div className={styles.actions}>
          <Link to={`/clients/${client.id}`} onClick={(event) => event.stopPropagation()}>
            View 360
          </Link>
          {canManageClients ? (
            <Link to={`/clients/${client.id}/edit`} onClick={(event) => event.stopPropagation()}>
              Edit
            </Link>
          ) : null}
        </div>
      ),
    },
  ]
}

export function ClientsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [kycStatus, setKycStatus] = useState<ClientKycStatus | ''>('')
  const [onboardingStatus, setOnboardingStatus] = useState<'registered' | 'kyc_pending' | 'kyc_verified' | 'complete' | ''>('')
  const [feePaymentStatus, setFeePaymentStatus] = useState<'unpaid' | 'paid' | 'waived' | ''>('')
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [offset, setOffset] = useState(0)

  const query = useMemo(
    () => ({
      search: appliedSearch || undefined,
      kycStatus: kycStatus || undefined,
      onboardingStatus: onboardingStatus || undefined,
      feePaymentStatus: feePaymentStatus || undefined,
      limit,
      offset,
      sortBy: 'id' as const,
      sortOrder: 'desc' as const,
    }),
    [appliedSearch, feePaymentStatus, kycStatus, limit, offset, onboardingStatus],
  )

  const clientsQuery = useClients(query)
  const clients = clientsQuery.data?.data || []
  const normalizedRole = String(user?.role || '').trim().toLowerCase()
  const canManageClients = hasAnyRole(user, ['admin', 'loan_officer'])
  const title = normalizedRole === 'operations_manager' ? 'Borrowers' : 'Clients'
  const totalRecords = Number(clientsQuery.data?.paging.total || 0)
  const showingFrom = totalRecords === 0 ? 0 : offset + 1
  const showingTo = totalRecords === 0 ? 0 : Math.min(offset + clients.length, totalRecords)
  const hasActiveFilters = Boolean(appliedSearch || feePaymentStatus || kycStatus || onboardingStatus)
  const columns = buildClientColumns(canManageClients)

  useEffect(() => {
    if (!clientsQuery.data) {
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
      queryKey: queryKeys.clients.list(nextQuery),
      queryFn: () => listClients(nextQuery),
      staleTime: queryPolicies.list.staleTime,
    })
  }, [clientsQuery.data, limit, offset, query, queryClient, totalRecords])

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBody}>
          <p className={styles.eyebrow}>Borrower register</p>
          <h1>{title}</h1>
          <p className={styles.subtitle}>
            Branch view of borrowers, account statuses, compliance checks, and assignment coverage.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span>Total Borrowers</span>
          <strong>{totalRecords}</strong>
        </div>
      </section>

      <section className={styles.toolbarCard}>
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>Q</span>
            <input
              className={styles.inputSearch}
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setOffset(0)
                  setAppliedSearch(searchInput.trim())
                }
              }}
              placeholder="Search by borrower name, phone, or ID..."
            />
          </div>
          <select className={styles.inputSelect} value={kycStatus} onChange={(event) => {
            setOffset(0)
            setKycStatus(event.target.value as ClientKycStatus | '')
          }}>
            <option value="">All KYC Status</option>
            <option value="pending">Pending Review</option>
            <option value="in_review">In Review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
          <select className={styles.inputSelect} value={onboardingStatus} onChange={(event) => {
            setOffset(0)
            setOnboardingStatus(event.target.value as 'registered' | 'kyc_pending' | 'kyc_verified' | 'complete' | '')
          }}>
            <option value="">All Onboarding</option>
            <option value="registered">Registered</option>
            <option value="kyc_pending">KYC Pending</option>
            <option value="kyc_verified">KYC Verified</option>
            <option value="complete">Complete</option>
          </select>
          <select className={styles.inputSelect} value={feePaymentStatus} onChange={(event) => {
            setOffset(0)
            setFeePaymentStatus(event.target.value as 'unpaid' | 'paid' | 'waived' | '')
          }}>
            <option value="">All Fees</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>
          <button type="button" className={styles.searchButton} onClick={() => {
            setOffset(0)
            setAppliedSearch(searchInput.trim())
          }}>
            Filter
          </button>
        </div>
        {canManageClients ? (
          <Link className={styles.primaryLink} to="/clients/new">
            + New Borrower
          </Link>
        ) : null}
      </section>

      <AsyncState
        loading={!clientsQuery.data && clientsQuery.isFetching}
        error={clientsQuery.isError && !clientsQuery.data}
        loadingText="Loading borrowers..."
        errorText="Unable to load borrowers."
        onRetry={() => {
          void clientsQuery.refetch()
        }}
      />

      {clientsQuery.data ? (
        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <p className={styles.tableEyebrow}>Client Profiles</p>
              <h2>Assigned borrower list</h2>
            </div>
            <p className={styles.total}>
              {totalRecords === 0 ? 'No borrowers matched the current filter set.' : `Showing ${showingFrom} to ${showingTo} of ${totalRecords}`}
            </p>
          </div>

          <DynamicTable<ClientRecord>
            rows={clients}
            columns={columns}
            tableClassName={styles.table}
            emptyTitle="No borrowers in this slice"
            emptyText="No borrowers matched the active filters. Adjust the search, KYC, onboarding, or fee filters and try again."
            emptyActionText={hasActiveFilters ? 'Clear filters' : undefined}
            onEmptyAction={hasActiveFilters ? () => {
              setOffset(0)
              setSearchInput('')
              setAppliedSearch('')
              setKycStatus('')
              setOnboardingStatus('')
              setFeePaymentStatus('')
            } : undefined}
            onRetry={() => {
              void clientsQuery.refetch()
            }}
            ariaLabel="Assigned borrower list"
            caption="Paginated borrower register"
            rowKey={(client) => String(client.id)}
            getRowProps={() => ({ className: styles.rowLink })}
            getRowLabel={(client) => `Open borrower ${client.full_name}`}
            onRowClick={(client) => navigate(`/clients/${client.id}`)}
            onRowHover={(client) => {
              void prefetchClientWorkspace(queryClient, client.id)
            }}
            pagination={{
              totalRows: totalRecords,
              limit,
              offset,
              label: 'borrowers',
              isFetching: clientsQuery.isFetching,
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
