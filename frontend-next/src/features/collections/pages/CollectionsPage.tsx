import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AsyncState } from '../../../components/common/AsyncState'
import { useToastStore } from '../../../store/toastStore'
import { useCollectionsSummary, useCreateCollectionAction, useOverdueCollections } from '../hooks/useCollections'
import type { CollectionOverdueRow } from '../../../types/collection'
import { formatDisplayDate } from '../../../utils/dateFormatting'
import styles from './CollectionsPage.module.css'

type ActionKind = 'call' | 'visit' | 'notice'

const actionTypeByKind: Record<ActionKind, 'contact_attempt' | 'note' | 'status_change'> = {
  call: 'contact_attempt',
  visit: 'contact_attempt',
  notice: 'note',
}

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatLoanRef(id: number) {
  return `LN-${String(id).padStart(6, '0')}`
}

function getBadgeClass(dpd: number) {
  if (dpd >= 91) return styles.dpdCritical
  if (dpd >= 61) return styles.dpdHigh
  if (dpd >= 31) return styles.dpdMid
  return styles.dpdLow
}

export function CollectionsPage() {
  const summaryQuery = useCollectionsSummary({})
  const overdueQuery = useOverdueCollections({ limit: 1000, offset: 0, sortBy: 'daysOverdue', sortOrder: 'desc' })
  const createActionMutation = useCreateCollectionAction()
  const pushToast = useToastStore((state) => state.pushToast)
  const [activeLoanId, setActiveLoanId] = useState<number | null>(null)
  const [actionKind, setActionKind] = useState<ActionKind>('call')
  const [actionNote, setActionNote] = useState('')
  const [expandedOfficers, setExpandedOfficers] = useState<Set<string>>(new Set())

  const groupedOverdue = useMemo(() => {
    const groups = new Map<string, CollectionOverdueRow[]>()
    const rows = overdueQuery.data?.data || []
    rows.forEach((row) => {
      const officer = row.officer_name || 'Unassigned'
      if (!groups.has(officer)) {
        groups.set(officer, [])
      }
      groups.get(officer)?.push(row)
    })

    return Array.from(groups.entries())
      .map(([officer, rows]) => {
        const totalAmount = rows.reduce((acc, row) => acc + Number(row.overdue_amount || 0), 0)
        const criticalCount = rows.filter((r) => Number(r.days_overdue || 0) >= 91).length
        return { officer, rows, totalAmount, criticalCount }
      })
      .sort((a, b) => b.totalAmount - a.totalAmount)
  }, [overdueQuery.data?.data])

  const summary = summaryQuery.data

  const toggleOfficer = (officer: string) => {
    setExpandedOfficers((prev) => {
      const next = new Set(prev)
      if (next.has(officer)) next.delete(officer)
      else next.add(officer)
      return next
    })
  }

  // Pre-expand top 2 officers by default when data loads
  useMemo(() => {
    if (groupedOverdue.length > 0 && expandedOfficers.size === 0) {
      setExpandedOfficers(new Set(groupedOverdue.slice(0, 2).map((g) => g.officer)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedOverdue.length])

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBody}>
          <p className={styles.eyebrow}>Arrears management</p>
          <h1>Collections Workspace</h1>
          <p className={styles.subtitle}>
            Prioritize and log follow-up actions for overdue accounts, organized by responsible officer.
          </p>
        </div>
        <div className={styles.heroBadge}>
          {summary?.open_collection_actions || 0} Open Actions
        </div>
      </section>

      {summary ? (
        <>
          <section className={styles.kpiStrip}>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Total Arrears</p>
              <div className={`${styles.kpiValue} ${styles.kpiAlert}`}>
                Ksh {formatCurrency(summary.overdue_amount)}
              </div>
              <p className={styles.kpiMeta}>{summary.overdue_loans} accounts</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Open Follow-ups</p>
              <div className={styles.kpiValue}>{summary.open_collection_actions}</div>
              <p className={styles.kpiMeta}>Logged by agents</p>
            </div>
            <div className={styles.kpiCard}>
              <p className={styles.kpiLabel}>Active Promises</p>
              <div className={styles.kpiValue}>{summary.open_promises}</div>
              <p className={styles.kpiMeta}>Pending settlement</p>
            </div>
          </section>

          <section className={styles.bucketSection}>
            <h2>Risk Buckets</h2>
            <div className={styles.bucketGrid}>
              <div className={`${styles.bucket} ${styles.sev1}`}>
                <span className={styles.bucketLabel}>PAR 30</span>
                <span className={styles.bucketCount}>{groupedOverdue.map(g => g.rows).flat().filter(r => Number(r.days_overdue) >= 1 && Number(r.days_overdue) <= 30).length}</span>
                <span className={styles.bucketAmount}>Early warning</span>
              </div>
              <div className={`${styles.bucket} ${styles.sev2}`}>
                <span className={styles.bucketLabel}>PAR 60</span>
                <span className={styles.bucketCount}>{groupedOverdue.map(g => g.rows).flat().filter(r => Number(r.days_overdue) >= 31 && Number(r.days_overdue) <= 60).length}</span>
                <span className={styles.bucketAmount}>Monitoring</span>
              </div>
              <div className={`${styles.bucket} ${styles.sev3}`}>
                <span className={styles.bucketLabel}>PAR 90</span>
                <span className={styles.bucketCount}>{groupedOverdue.map(g => g.rows).flat().filter(r => Number(r.days_overdue) >= 61 && Number(r.days_overdue) <= 90).length}</span>
                <span className={styles.bucketAmount}>Intensive</span>
              </div>
              <div className={`${styles.bucket} ${styles.sev4}`}>
                <span className={styles.bucketLabel}>NPL</span>
                <span className={styles.bucketCount}>{groupedOverdue.map(g => g.rows).flat().filter(r => Number(r.days_overdue) >= 91).length}</span>
                <span className={styles.bucketAmount}>Critical recovery</span>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section className={styles.officerPanel}>
        <div className={styles.panelHeader}>
          <h2>Agent Workloads</h2>
          <span className={styles.panelMeta}>Ranked by exposure</span>
        </div>

        <AsyncState
          loading={overdueQuery.isLoading}
          error={overdueQuery.isError}
          empty={Boolean(overdueQuery.data && overdueQuery.data.data.length === 0)}
          loadingText="Loading overdue accounts..."
          errorText="Unable to load overdue data."
          emptyText="Excellent! No overdue accounts found."
          onRetry={() => {
            void overdueQuery.refetch()
          }}
        />

        {groupedOverdue.map((group) => {
          const isExpanded = expandedOfficers.has(group.officer)
          return (
            <div key={group.officer} className={styles.officerGroup}>
              <button
                type="button"
                className={styles.officerHeader}
                onClick={() => toggleOfficer(group.officer)}
                aria-expanded={isExpanded}
              >
                <span className={styles.officerName}>{group.officer}</span>
                <div className={styles.officerStats}>
                  <span className={styles.officerStatAlert}>
                    <strong>Ksh {formatCurrency(group.totalAmount)}</strong>
                  </span>
                  <span className={styles.officerStat}>
                    <strong>{group.rows.length}</strong> accounts
                  </span>
                  {group.criticalCount > 0 && (
                    <span className={styles.officerStatAlert}>
                      (<strong>{group.criticalCount}</strong> in NPL)
                    </span>
                  )}
                  <span className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}>▼</span>
                </div>
              </button>

              {isExpanded && (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Loan DPD</th>
                        <th>Client details</th>
                        <th>Overdue amount</th>
                        <th>Next installment</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => {
                        const dpd = Number(row.days_overdue || 0)
                        return (
                          <tr key={`${row.loan_id}-${row.due_date}`}>
                            <td>
                              <div className={styles.field}>
                                <span className={`${styles.dpdBadge} ${getBadgeClass(dpd)}`}>
                                  {dpd} days
                                </span>
                                <Link to={`/loans/${row.loan_id}`} className={styles.loanRef}>
                                  {formatLoanRef(row.loan_id)}
                                </Link>
                              </div>
                            </td>
                            <td className={styles.clientName}>
                              <strong>{row.client_name}</strong>
                              <span>{row.branch_code || 'No branch info'}</span>
                            </td>
                            <td className={styles.amountCell}>Ksh {formatCurrency(row.overdue_amount)}</td>
                            <td>{formatDisplayDate(row.due_date, '-')}</td>
                            <td>
                              <button
                                type="button"
                                className={styles.actionBtn}
                                onClick={() => {
                                  setActiveLoanId(row.loan_id)
                                  setActionKind('call')
                                  setActionNote('')
                                }}
                              >
                                Log Action
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </section>

      {/* Action Modal */}
      {activeLoanId ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <h3>Log Action</h3>
                <p>Register recovery attempt for {formatLoanRef(activeLoanId)}</p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setActiveLoanId(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <label className={styles.field}>
              <span>Interaction type</span>
              <select value={actionKind} onChange={(event) => setActionKind(event.target.value as ActionKind)}>
                <option value="call">Phone call</option>
                <option value="visit">Field visit</option>
                <option value="notice">Demand notice sent</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Action record notes</span>
              <textarea
                rows={4}
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
                placeholder="Include response, promises, or attitude of client..."
              />
            </label>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setActiveLoanId(null)}
                disabled={createActionMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={createActionMutation.isPending}
                onClick={() => {
                  createActionMutation.mutate(
                    {
                      loanId: activeLoanId,
                      actionType: actionTypeByKind[actionKind],
                      actionNote: `${actionKind.toUpperCase()}: ${actionNote.trim() || 'No additional note recorded'}`,
                    },
                    {
                      onSuccess: () => {
                        pushToast({ type: 'success', message: 'Collection action securely logged.' })
                        setActiveLoanId(null)
                        setActionNote('')
                      },
                      onError: () => {
                        pushToast({ type: 'error', message: 'Failed to record the action. Try again.' })
                      },
                    },
                  )
                }}
              >
                {createActionMutation.isPending ? 'Logging...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
