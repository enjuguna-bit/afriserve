import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import { queryPolicies } from '../../../services/queryPolicies'
import { listAuditLogs } from '../../../services/systemService'
import styles from '../../shared/styles/EntityPage.module.css'

const PAGE_SIZE = 50

function safePrettyJson(value: unknown) {
  if (value == null || value === '') {
    return '-'
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  if (typeof value !== 'string') {
    return String(value)
  }

  try {
    const parsed = JSON.parse(value)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return value
  }
}

export function AuditLogsPage() {
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')
  const [userId, setUserId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [offset, setOffset] = useState(0)

  const filters = useMemo(() => ({
    action: action.trim() || undefined,
    targetType: targetType.trim() || undefined,
    userId: Number(userId) > 0 ? Number(userId) : undefined,
    targetId: Number(targetId) > 0 ? Number(targetId) : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: PAGE_SIZE,
    offset,
    sortBy: 'id',
    sortOrder: 'desc',
  }), [action, targetType, userId, targetId, dateFrom, dateTo, offset])

  const auditLogsQuery = useQuery({
    queryKey: ['system', 'audit-logs', filters],
    queryFn: () => listAuditLogs(filters),
    ...queryPolicies.list,
  })

  const total = Number(auditLogsQuery.data?.paging.total || 0)
  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Audit Log Viewer</h1>
          <p className={styles.muted}>Browse security and data-change trail entries with full filtering controls.</p>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <label className={styles.inputGroup}>
            <span>Action</span>
            <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="e.g. loan.approved" />
          </label>
          <label className={styles.inputGroup}>
            <span>Target type</span>
            <input value={targetType} onChange={(event) => setTargetType(event.target.value)} placeholder="loan, user, client..." />
          </label>
          <label className={styles.inputGroup}>
            <span>User ID</span>
            <input type="number" min={1} value={userId} onChange={(event) => setUserId(event.target.value)} />
          </label>
          <label className={styles.inputGroup}>
            <span>Target ID</span>
            <input type="number" min={1} value={targetId} onChange={(event) => setTargetId(event.target.value)} />
          </label>
          <label className={styles.inputGroup}>
            <span>Date from</span>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className={styles.inputGroup}>
            <span>Date to</span>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <div className={styles.actions}>
            <button type="button" onClick={() => setOffset(0)}>Apply filters</button>
          </div>
        </div>
      </section>

      <AsyncState
        loading={auditLogsQuery.isLoading}
        error={auditLogsQuery.isError}
        empty={Boolean(auditLogsQuery.data && auditLogsQuery.data.data.length === 0)}
        loadingText="Loading audit logs..."
        errorText="Unable to load audit logs."
        emptyText="No audit logs match your filters."
        onRetry={() => {
          void auditLogsQuery.refetch()
        }}
      />

      {auditLogsQuery.data && auditLogsQuery.data.data.length > 0 ? (
        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <div className={styles.muted}>
              Showing {offset + 1} - {Math.min(offset + PAGE_SIZE, total)} of {total}
            </div>
            <div className={styles.actions}>
              <button type="button" disabled={!hasPrev} onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}>
                Previous
              </button>
              <button type="button" disabled={!hasNext} onClick={() => setOffset((prev) => prev + PAGE_SIZE)}>
                Next
              </button>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>When</th>
                  <th>Action</th>
                  <th>User</th>
                  <th>Target</th>
                  <th>IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogsQuery.data.data.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td className={styles.mono}>{row.action}</td>
                    <td>{row.user_id || '-'}</td>
                    <td>
                      {row.target_type || '-'}
                      {row.target_id ? ` #${row.target_id}` : ''}
                    </td>
                    <td>{row.ip_address || '-'}</td>
                    <td>
                      <pre className={styles.pre}>{safePrettyJson(row.details)}</pre>
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
