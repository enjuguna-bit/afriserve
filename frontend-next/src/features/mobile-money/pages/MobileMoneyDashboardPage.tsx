import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import { listLoans } from '../../../services/loanService'
import {
  getMobileMoneyB2CSummary,
  listMobileMoneyB2CDisbursements,
  listMobileMoneyC2BEvents,
  reconcileMobileMoneyC2BEvent,
  retryMobileMoneyB2CReversal,
} from '../../../services/mobileMoneyService'
import { queryPolicies } from '../../../services/queryPolicies'
import { useToastStore } from '../../../store/toastStore'
import type { LoanRecord } from '../../../types/loan'
import type { MobileMoneyC2BEvent } from '../../../types/mobileMoney'
import { formatDisplayDateTime } from '../../../utils/dateFormatting'
import { formatDisplayText, resolveDisplayText } from '../../../utils/displayFormatting'
import styles from '../../shared/styles/EntityPage.module.css'

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatLoanSuggestion(loan: LoanRecord) {
  return `#${loan.id} ${resolveDisplayText([loan.client_name, loan.client_id ? `Client #${loan.client_id}` : null], 'Unknown client')} | ${formatDisplayText(loan.status)} | Bal ${formatMoney(Number(loan.balance || 0))}`
}

function extractNumericCandidate(reference: string | null) {
  const match = String(reference || '').match(/\d+/)
  const numericCandidate = match ? Number(match[0]) : 0
  return Number.isInteger(numericCandidate) && numericCandidate > 0 ? numericCandidate : undefined
}

type C2BReconciliationActionProps = {
  row: MobileMoneyC2BEvent
  loanIdValue: string
  noteValue: string
  disabled: boolean
  onLoanIdChange: (value: string) => void
  onNoteChange: (value: string) => void
  onReconcile: (loanId: number) => void
}

function C2BReconciliationAction({
  row,
  loanIdValue,
  noteValue,
  disabled,
  onLoanIdChange,
  onNoteChange,
  onReconcile,
}: C2BReconciliationActionProps) {
  const searchTerm = formatDisplayText(row.account_reference, '').trim()
  const numericCandidate = extractNumericCandidate(searchTerm)
  const suggestionsQuery = useQuery({
    queryKey: ['mobile-money', 'c2b-loan-suggestions', row.id, searchTerm, numericCandidate || null],
    queryFn: () => listLoans({
      search: searchTerm || undefined,
      loanId: numericCandidate,
      limit: 5,
      offset: 0,
      sortBy: 'id',
      sortOrder: 'desc',
    }),
    enabled: Boolean(searchTerm || numericCandidate),
    ...queryPolicies.list,
  })

  const suggestions = suggestionsQuery.data?.data || []

  return (
    <div className={styles.actions}>
      <label className={styles.inputGroup}>
        <span>Loan ID</span>
        <input
          type="number"
          min={1}
          value={loanIdValue}
          onChange={(event) => {
            onLoanIdChange(event.target.value)
          }}
          placeholder={row.loan_id ? String(row.loan_id) : 'Loan ID'}
        />
      </label>
      <label className={styles.inputGroupWide}>
        <span>Review note</span>
        <input
          type="text"
          value={noteValue}
          onChange={(event) => {
            onNoteChange(event.target.value)
          }}
          placeholder={`Account ref: ${formatDisplayText(row.account_reference)}`}
        />
      </label>
      {suggestionsQuery.isSuccess && suggestions.length > 0 ? (
        <div className={styles.inputGroupWide}>
          <span>Suggested loans</span>
          <div className={styles.actions}>
            {suggestions.map((loan) => (
              <button
                key={loan.id}
                type="button"
                onClick={() => {
                  onLoanIdChange(String(loan.id))
                }}
              >
                {formatLoanSuggestion(loan)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        disabled={disabled || !Number.isInteger(Number(loanIdValue || 0)) || Number(loanIdValue || 0) <= 0}
        onClick={() => {
          onReconcile(Number(loanIdValue || 0))
        }}
      >
        {disabled ? 'Reconciling...' : 'Reconcile'}
      </button>
    </div>
  )
}

export function MobileMoneyDashboardPage() {
  const queryClient = useQueryClient()
  const pushToast = useToastStore((state) => state.pushToast)
  const [status, setStatus] = useState('')
  const [reconcileLoanIds, setReconcileLoanIds] = useState<Record<number, string>>({})
  const [reconcileNotes, setReconcileNotes] = useState<Record<number, string>>({})

  const c2bQuery = useQuery({
    queryKey: ['mobile-money', 'c2b-events', status],
    queryFn: () => listMobileMoneyC2BEvents({
      status: status || undefined,
      limit: 100,
    }),
    ...queryPolicies.list,
  })
  const b2cQuery = useQuery({
    queryKey: ['mobile-money', 'b2c-disbursements', status],
    queryFn: () => listMobileMoneyB2CDisbursements({
      status: status || undefined,
      limit: 100,
    }),
    ...queryPolicies.list,
  })
  const summaryQuery = useQuery({
    queryKey: ['mobile-money', 'b2c-summary', status],
    queryFn: () => getMobileMoneyB2CSummary({
      status: status || undefined,
    }),
    ...queryPolicies.report,
  })

  const retryMutation = useMutation({
    mutationFn: retryMobileMoneyB2CReversal,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-money', 'b2c-disbursements'] })
      void queryClient.invalidateQueries({ queryKey: ['mobile-money', 'b2c-summary'] })
    },
  })
  const reconcileMutation = useMutation({
    mutationFn: ({ eventId, loanId, note }: { eventId: number; loanId: number; note?: string }) => (
      reconcileMobileMoneyC2BEvent(eventId, { loanId, note })
    ),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-money', 'c2b-events'] })
      setReconcileLoanIds((current) => ({ ...current, [variables.eventId]: '' }))
      setReconcileNotes((current) => ({ ...current, [variables.eventId]: '' }))
    },
  })

  const loading = c2bQuery.isLoading || b2cQuery.isLoading || summaryQuery.isLoading
  const error = c2bQuery.isError || b2cQuery.isError || summaryQuery.isError

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Mobile Money Dashboard</h1>
          <p className={styles.muted}>Monitor incoming C2B events and outgoing B2C disbursement lifecycle.</p>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <label className={styles.inputGroup}>
            <span>Filter status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="core_failed">Core failed</option>
              <option value="received">Received</option>
              <option value="reconciled">Reconciled</option>
              <option value="unmatched">Unmatched</option>
            </select>
          </label>
        </div>
      </section>

      {summaryQuery.data ? (
        <section className={styles.cards}>
          <article className={styles.card}>
            <div className={styles.label}>B2C disbursements</div>
            <div className={styles.value}>{Number(summaryQuery.data.total || 0)}</div>
          </article>
          <article className={styles.card}>
            <div className={styles.label}>Completed</div>
            <div className={styles.value}>{Number(summaryQuery.data.completed_count || 0)}</div>
          </article>
          <article className={styles.card}>
            <div className={styles.label}>Failures requiring action</div>
            <div className={styles.value}>{Number(summaryQuery.data.reversal_required_count || 0)}</div>
          </article>
          <article className={styles.card}>
            <div className={styles.label}>Total reversal attempts</div>
            <div className={styles.value}>{Number(summaryQuery.data.total_reversal_attempts || 0)}</div>
          </article>
        </section>
      ) : null}

      <AsyncState
        loading={loading}
        error={error}
        empty={false}
        loadingText="Loading mobile money dashboard..."
        errorText="Unable to load mobile money data."
        onRetry={() => {
          void Promise.all([c2bQuery.refetch(), b2cQuery.refetch(), summaryQuery.refetch()])
        }}
      />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>B2C disbursements</h2>
        {b2cQuery.data && b2cQuery.data.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Loan</th>
                  <th>Phone</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Provider ref</th>
                  <th>Failure</th>
                  <th>Reversal</th>
                </tr>
              </thead>
              <tbody>
                {b2cQuery.data.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.loan_id}</td>
                    <td>{formatDisplayText(row.phone_number)}</td>
                    <td>{formatMoney(row.amount)}</td>
                    <td>
                      <span
                        className={
                          row.status === 'completed'
                            ? styles.badgeActive
                            : row.status === 'failed' || row.status === 'core_failed'
                              ? styles.badgeDanger
                              : styles.badgeWarn
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className={styles.mono}>{resolveDisplayText([row.provider_request_id, row.request_id])}</td>
                    <td>{formatDisplayText(row.failure_reason)}</td>
                    <td>
                      <div className={styles.actions}>
                        <span className={styles.muted}>Attempts: {Number(row.reversal_attempts || 0)}</span>
                        {(row.status === 'failed' || row.status === 'core_failed') ? (
                          <button
                            type="button"
                            disabled={retryMutation.isPending}
                            onClick={() => {
                              retryMutation.mutate(row.id, {
                                onSuccess: () => {
                                  pushToast({ type: 'success', message: `Reversal retry requested for B2C #${row.id}.` })
                                },
                                onError: () => {
                                  pushToast({ type: 'error', message: `Failed to request reversal retry for B2C #${row.id}.` })
                                },
                              })
                            }}
                          >
                            Retry reversal
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.muted}>No B2C disbursements found for the current filters.</p>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>C2B events</h2>
        {c2bQuery.data && c2bQuery.data.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Receipt</th>
                  <th>Payer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Loan</th>
                  <th>Reconciliation</th>
                  <th>Paid at</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {c2bQuery.data.map((row) => {
                  const receiptLabel = formatDisplayText(row.external_receipt, `Receipt #${row.id}`)

                  return (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td className={styles.mono}>{receiptLabel}</td>
                    <td>{formatDisplayText(row.payer_phone)}</td>
                    <td>{formatMoney(row.amount)}</td>
                    <td>
                      <span
                        className={
                          row.status === 'reconciled'
                            ? styles.badgeActive
                            : row.status === 'unmatched'
                              ? styles.badgeDanger
                              : styles.badgeWarn
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td>{formatDisplayText(row.loan_id)}</td>
                    <td>{formatDisplayText(row.reconciliation_note)}</td>
                    <td>{formatDisplayDateTime(row.paid_at)}</td>
                    <td>
                      {row.status === 'unmatched' || row.status === 'rejected' || row.status === 'received' ? (
                        <C2BReconciliationAction
                          row={row}
                          loanIdValue={reconcileLoanIds[row.id] || ''}
                          noteValue={reconcileNotes[row.id] || ''}
                          disabled={reconcileMutation.isPending}
                          onLoanIdChange={(value) => {
                            setReconcileLoanIds((current) => ({ ...current, [row.id]: value }))
                          }}
                          onNoteChange={(value) => {
                            setReconcileNotes((current) => ({ ...current, [row.id]: value }))
                          }}
                          onReconcile={(loanId) => {
                            reconcileMutation.mutate(
                              {
                                eventId: row.id,
                                loanId,
                                note: (reconcileNotes[row.id] || '').trim() || undefined,
                              },
                              {
                                onSuccess: () => {
                                  pushToast({ type: 'success', message: `${receiptLabel} reconciled to loan #${loanId}.` })
                                },
                                onError: () => {
                                  pushToast({ type: 'error', message: `Failed to reconcile ${receiptLabel}.` })
                                },
                              },
                            )
                          }}
                        />
                      ) : (
                        <span className={styles.muted}>No action required</span>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.muted}>No C2B events found for the current filters.</p>
        )}
      </section>
    </div>
  )
}
