import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { AsyncState } from '../../../components/common/AsyncState'
import { useAuth } from '../../../hooks/useAuth'
import { hasAnyRole } from '../../../app/roleAccess'
import { useClients } from '../hooks/useClients'
import { downloadClientsCsv } from '../../../services/clientService'
import { useToastStore } from '../../../store/toastStore'
import { downloadBlob } from '../../../utils/fileDownload'
import { formatDisplayText, resolveDisplayText } from '../../../utils/displayFormatting'
import type { ClientRecord } from '../../../types/client'
import styles from './ClientsPage.module.css'

function formatBorrowerRef(client: ClientRecord) {
  return `BRW-${String(client.id).padStart(6, '0')}`
}

function borrowerMeta(client: ClientRecord) {
  return resolveDisplayText([client.phone, client.national_id], 'No phone or national ID')
}

function toNumber(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  return fallback
}

export function DormantClientsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const pushToast = useToastStore((state) => state.pushToast)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const canManageClients = hasAnyRole(user, ['admin', 'loan_officer'])

  const query = useMemo(
    () => ({
      search: appliedSearch || undefined,
      dormantOnly: true,
      minLoans: 1,
      limit: 50,
      offset: 0,
      sortBy: 'loanCount' as const,
      sortOrder: 'desc' as const,
    }),
    [appliedSearch],
  )

  const clientsQuery = useClients(query)
  const dormantCount = Number(clientsQuery.data?.paging.total || 0)

  async function handleDownloadCsv() {
    setIsDownloading(true)
    try {
      const { blob, filename } = await downloadClientsCsv(query)
      downloadBlob(blob, filename || 'dormant-borrowers.csv')
      pushToast({ type: 'success', message: 'Dormant borrower list downloaded.' })
    } catch (error) {
      pushToast({ type: 'error', message: getApiErrorMessage(error, 'Unable to download dormant borrower list.') })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBadge}>D</div>
        <div className={styles.heroBody}>
          <p className={styles.eyebrow}>Retention</p>
          <h1>Dormant Borrowers</h1>
          <p className={styles.subtitle}>Borrowers with completed loan history and no current open loan exposure. Use this list to restart the next cycle.</p>
        </div>
        <div className={styles.heroMeta}>
          <span>Total</span>
          <strong>{dormantCount}</strong>
        </div>
      </section>

      <section className={styles.toolbarCard}>
        <div className={styles.toolbar}>
          <input
            className={styles.input}
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search dormant borrowers by name, phone, or national ID"
          />
          <button type="button" className={styles.searchButton} onClick={() => setAppliedSearch(searchInput.trim())}>
            Search
          </button>
          <button type="button" className={styles.primaryLink} onClick={() => void handleDownloadCsv()} disabled={isDownloading}>
            {isDownloading ? 'Preparing CSV...' : 'Download CSV'}
          </button>
        </div>
        <Link className={styles.primaryLink} to="/clients">Back to borrowers</Link>
      </section>

      <AsyncState
        loading={clientsQuery.isLoading}
        error={clientsQuery.isError}
        empty={Boolean(clientsQuery.data && clientsQuery.data.data.length === 0)}
        loadingText="Loading dormant borrowers..."
        errorText="Unable to load dormant borrowers."
        emptyText="No dormant borrowers found for the current filters."
        onRetry={() => {
          void clientsQuery.refetch()
        }}
      />

      {clientsQuery.data && clientsQuery.data.data.length > 0 ? (
        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <p className={styles.tableEyebrow}>Dormant register</p>
              <h2>Eligible for next cycle</h2>
            </div>
            <p className={styles.total}>Showing {clientsQuery.data.data.length} of {clientsQuery.data.paging.total}</p>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Borrower Ref</th>
                  <th>Phone</th>
                  <th>Completed Loans</th>
                  <th>Open Loans</th>
                  <th>Agent</th>
                  <th>Branch</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(clientsQuery.data?.data ?? []).map((client) => (
                  <tr key={client.id} className={styles.rowLink} onClick={() => navigate(`/clients/${client.id}`)}>
                    <td className={styles.nameCell}>
                      <strong>{formatDisplayText(client.full_name, `Client #${client.id}`)}</strong>
                      <span>{borrowerMeta(client)}</span>
                    </td>
                    <td className={styles.refCell}>{formatBorrowerRef(client)}</td>
                    <td>{formatDisplayText(client.phone)}</td>
                    <td>{toNumber(client.closed_loan_count || client.loan_count)}</td>
                    <td>{toNumber(client.open_loan_count)}</td>
                    <td>{formatDisplayText(client.assigned_officer_name)}</td>
                    <td>{formatDisplayText(client.branch_name)}</td>
                    <td className={styles.actions}>
                      <Link to={`/clients/${client.id}`} onClick={(event) => event.stopPropagation()}>View 360</Link>
                      {canManageClients ? <Link to={`/loans/new?clientId=${client.id}`} onClick={(event) => event.stopPropagation()}>Start next cycle</Link> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
