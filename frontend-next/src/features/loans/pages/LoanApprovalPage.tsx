import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { AsyncState } from '../../../components/common/AsyncState'
import { hasAnyRole } from '../../../app/roleAccess'
import { useAuth } from '../../../hooks/useAuth'
import {
  useApprovalRequests,
  useApproveLoanAction,
  usePendingApprovalLoans,
  useRejectLoanAction,
  useReviewApprovalRequest,
} from '../hooks/useLoans'
import { useToastStore } from '../../../store/toastStore'
import { formatDisplayDateTime, parseDisplayDate } from '../../../utils/dateFormatting'
import { formatDisplayText, resolveDisplayText } from '../../../utils/displayFormatting'
import type { PendingApprovalLoanRecord } from '../../../types/loan'
import { formatWorkflowText, getPendingApprovalReviewState } from '../utils/workflow'
import styles from './LoanApprovalPage.module.css'

type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
type ApprovalRequestType = 'loan_restructure' | 'loan_write_off' | 'loan_top_up' | 'loan_refinance' | 'loan_term_extension'

type ApprovalRequestRow = {
  id: number
  loan_id: number
  loan_status: string | null
  loan_principal: number | null
  client_id: number | null
  client_name: string | null
  branch_id: number | null
  branch_name: string | null
  branch_code: string | null
  request_type: string
  requested_by_user_id: number | null
  requested_by_name: string | null
  checker_user_id: number | null
  checker_name: string | null
  status: ApprovalRequestStatus
  execution_state: string | null
  requested_at: string | null
  reviewed_at: string | null
  approved_at: string | null
  rejected_at: string | null
  executed_at: string | null
  request_note: string | null
  review_note: string | null
  request_payload: unknown
}

const REQUEST_TYPE_OPTIONS: Array<{ value: ApprovalRequestType; label: string }> = [
  { value: 'loan_restructure', label: 'Restructure' },
  { value: 'loan_write_off', label: 'Write-off' },
  { value: 'loan_top_up', label: 'Top-up' },
  { value: 'loan_refinance', label: 'Refinance' },
  { value: 'loan_term_extension', label: 'Term extension' },
]

function normalizeApprovalRows(payload: unknown): ApprovalRequestRow[] {
  const sourceRows = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && Array.isArray((payload as { rows?: unknown }).rows))
      ? (payload as { rows: unknown[] }).rows
      : (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data))
        ? (payload as { data: unknown[] }).data
        : []

  return sourceRows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map((row) => ({
      id: Number(row.id || 0),
      loan_id: Number(row.loan_id || 0),
      loan_status: row.loan_status ? String(row.loan_status) : null,
      loan_principal: Number.isFinite(Number(row.loan_principal)) ? Number(row.loan_principal) : null,
      client_id: Number.isInteger(Number(row.client_id)) ? Number(row.client_id) : null,
      client_name: row.client_name ? String(row.client_name) : null,
      branch_id: Number.isInteger(Number(row.branch_id)) ? Number(row.branch_id) : null,
      branch_name: row.branch_name ? String(row.branch_name) : null,
      branch_code: row.branch_code ? String(row.branch_code) : null,
      request_type: String(row.request_type || 'unknown'),
      requested_by_user_id: Number.isInteger(Number(row.requested_by_user_id)) ? Number(row.requested_by_user_id) : null,
      requested_by_name: row.requested_by_name ? String(row.requested_by_name) : null,
      checker_user_id: Number.isInteger(Number(row.checker_user_id)) ? Number(row.checker_user_id) : null,
      checker_name: row.checker_name ? String(row.checker_name) : null,
      status: String(row.status || 'pending') as ApprovalRequestStatus,
      execution_state: row.execution_state ? String(row.execution_state) : null,
      requested_at: row.requested_at ? String(row.requested_at) : null,
      reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
      approved_at: row.approved_at ? String(row.approved_at) : null,
      rejected_at: row.rejected_at ? String(row.rejected_at) : null,
      executed_at: row.executed_at ? String(row.executed_at) : null,
      request_note: row.request_note ? String(row.request_note) : null,
      review_note: row.review_note ? String(row.review_note) : null,
      request_payload: row.request_payload,
    }))
    .filter((row) => row.id > 0)
}

function normalizePendingLoans(payload: unknown): PendingApprovalLoanRecord[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown }).data)) {
    return []
  }

  return (payload as { data: PendingApprovalLoanRecord[] }).data
}

function formatRequestType(value: string): string {
  return formatDisplayText(value, 'Unknown')
    .toLowerCase()
    .replace(/^loan_/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatDateTime(value: string | null): string {
  return formatDisplayDateTime(value, '-')
}

function formatTimeInQueue(submittedAt: string | null): string {
  if (!submittedAt) return '-'
  const submitTime = parseDisplayDate(submittedAt)?.getTime()
  if (submitTime == null) return '-'
  if (Number.isNaN(submitTime)) return '-'
  const diffMs = Date.now() - submitTime
  if (diffMs < 0) return 'Just now'
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHrs < 1) return '< 1 hour'
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs === 1 ? '' : 's'}`
  const diffDays = Math.floor(diffHrs / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'}`
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof axios.AxiosError) {
    const payload = error.response?.data as {
      message?: unknown
      requestId?: unknown
      issues?: Array<{ path?: unknown[]; message?: unknown }>
      debugDetails?: { cause?: unknown; errorCode?: unknown; errorName?: unknown }
    } | undefined
    const message = String(payload?.message || '').trim()
    const validationDetails = Array.isArray(payload?.issues)
      ? payload.issues
        .map((issue) => {
          const path = Array.isArray(issue?.path) ? issue.path.join('.') : ''
          const issueMessage = String(issue?.message || '').trim()
          return path ? `${path}: ${issueMessage}` : issueMessage
        })
        .filter(Boolean)
        .join('; ')
      : ''
    const cause = String(payload?.debugDetails?.cause || '').trim()
    const requestId = String(payload?.requestId || '').trim()
    const parts = [message || fallback]

    if (validationDetails) {
      parts.push(validationDetails)
    }
    if (cause) {
      parts.push(`Cause: ${cause}`)
    }
    if (requestId) {
      parts.push(`Request ID: ${requestId}`)
    }

    const combined = parts.filter(Boolean).join(' | ').trim()
    if (combined) {
      return combined
    }
  }

  return fallback
}

function snapshotSummary(value: unknown): string {
  if (!value) {
    return '-'
  }
  if (typeof value === 'string') {
    const normalized = formatDisplayText(value, '')
    if (!normalized) {
      return '-'
    }
    return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized
  }
  if (typeof value !== 'object') {
    return formatDisplayText(value)
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 3)
  if (entries.length === 0) {
    return '-'
  }

  return entries
    .map(([key, entryValue]) => `${key}: ${typeof entryValue === 'object' && entryValue !== null ? `[${Array.isArray(entryValue) ? 'array' : 'object'}]` : formatDisplayText(entryValue)}`)
    .join(' | ')
}

export function LoanApprovalPage() {
  const { user } = useAuth()
  const pushToast = useToastStore((state) => state.pushToast)
  const [statusFilter, setStatusFilter] = useState<ApprovalRequestStatus>('pending')
  const [requestTypeFilter, setRequestTypeFilter] = useState<'all' | ApprovalRequestType>('all')
  const [decisionNotes, setDecisionNotes] = useState<Record<number, string>>({})
  const [loanNotes, setLoanNotes] = useState<Record<number, string>>({})
  const [activeRequestId, setActiveRequestId] = useState<number | null>(null)
  const [activeLoanId, setActiveLoanId] = useState<number | null>(null)
  const [activeLoanDecision, setActiveLoanDecision] = useState<'approve' | 'reject' | null>(null)
  const [recentlyApprovedLoan, setRecentlyApprovedLoan] = useState<{ loanId: number; clientName: string | null } | null>(null)
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<number>>(new Set())
  const [isBatchApproving, setIsBatchApproving] = useState(false)

  const canReviewPendingLoans = hasAnyRole(user, ['admin', 'operations_manager', 'finance', 'area_manager'])
    && (!Array.isArray(user?.permissions) || user.permissions.includes('loan.approve'))
  const canRejectPendingLoans = hasAnyRole(user, ['admin', 'operations_manager'])
    && (!Array.isArray(user?.permissions) || user.permissions.includes('loan.reject'))
  const isLoanOfficer = hasAnyRole(user, ['loan_officer'])

  const pendingLoansQuery = usePendingApprovalLoans({}, canReviewPendingLoans)
  const approvalsQuery = useApprovalRequests(
    {
      status: statusFilter,
      ...(requestTypeFilter !== 'all' ? { requestType: requestTypeFilter } : {}),
    },
    true,
  )
  const approveLoanMutation = useApproveLoanAction()
  const rejectLoanMutation = useRejectLoanAction()
  const reviewMutation = useReviewApprovalRequest()

  const pendingLoans = useMemo(() => normalizePendingLoans(pendingLoansQuery.data), [pendingLoansQuery.data])
  const rows = useMemo(() => normalizeApprovalRows(approvalsQuery.data), [approvalsQuery.data])
  const pendingLoanReviewStates = useMemo(
    () => new Map(pendingLoans.map((loan) => [loan.loan_id, getPendingApprovalReviewState(loan, user)])),
    [pendingLoans, user],
  )
  const approvableLoanIds = useMemo(
    () => pendingLoans
      .filter((loan) => pendingLoanReviewStates.get(loan.loan_id)?.canApprove)
      .map((loan) => loan.loan_id),
    [pendingLoans, pendingLoanReviewStates],
  )

  function updateDecisionNote(requestId: number, nextValue: string) {
    setDecisionNotes((current) => ({
      ...current,
      [requestId]: nextValue,
    }))
  }

  function updateLoanNote(loanId: number, nextValue: string) {
    setLoanNotes((current) => ({
      ...current,
      [loanId]: nextValue,
    }))
  }

  function submitDecision(requestId: number, decision: 'approve' | 'reject') {
    setActiveRequestId(requestId)
    reviewMutation.mutate(
      { requestId, decision, note: decisionNotes[requestId]?.trim() || undefined },
      {
        onSuccess: () => {
          setDecisionNotes((current) => {
            const nextState = { ...current }
            delete nextState[requestId]
            return nextState
          })
          pushToast({
            type: 'success',
            message: decision === 'approve' ? 'Approval request approved.' : 'Approval request rejected.',
          })
        },
        onError: (error) => {
          pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to review approval request.') })
        },
        onSettled: () => {
          setActiveRequestId(null)
        },
      },
    )
  }

  function approvePendingLoan(loanId: number) {
    const approvedLoan = pendingLoans.find((loan) => loan.loan_id === loanId) || null
    setActiveLoanId(loanId)
    setActiveLoanDecision('approve')
    approveLoanMutation.mutate(
      {
        loanId,
        notes: loanNotes[loanId]?.trim() || undefined,
      },
      {
        onSuccess: () => {
          setLoanNotes((current) => {
            const nextState = { ...current }
            delete nextState[loanId]
            return nextState
          })
          setRecentlyApprovedLoan({
            loanId,
            clientName: approvedLoan?.client_name ? String(approvedLoan.client_name) : null,
          })
          pushToast({ type: 'success', message: 'Loan approved and routed to the next stage.' })
        },
        onError: (error) => {
          pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to approve loan.') })
        },
        onSettled: () => {
          setActiveLoanId(null)
          setActiveLoanDecision(null)
        },
      },
    )
  }

  function rejectPendingLoan(loanId: number) {
    const reason = loanNotes[loanId]?.trim() || ''
    if (reason.length < 5) {
      pushToast({ type: 'error', message: 'Provide at least 5 characters before rejecting a loan.' })
      return
    }

    setActiveLoanId(loanId)
    setActiveLoanDecision('reject')
    rejectLoanMutation.mutate(
      {
        loanId,
        reason,
      },
      {
        onSuccess: () => {
          setLoanNotes((current) => {
            const nextState = { ...current }
            delete nextState[loanId]
            return nextState
          })
          pushToast({ type: 'success', message: 'Loan rejected and removed from the pending queue.' })
        },
        onError: (error) => {
          pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to reject loan.') })
        },
        onSettled: () => {
          setActiveLoanId(null)
          setActiveLoanDecision(null)
        },
      },
    )
  }

  async function batchApprove() {
    if (selectedLoanIds.size === 0) return

    setIsBatchApproving(true)
    const ids = Array.from(selectedLoanIds)
    let successCount = 0
    const failedMessages: string[] = []

    for (const loanId of ids) {
      try {
        await approveLoanMutation.mutateAsync({ loanId })
        successCount++
      } catch (error) {
        failedMessages.push(`Loan #${loanId}: ${getApiErrorMessage(error, 'Failed to approve loan.')}`)
      }
    }

    setIsBatchApproving(false)
    setSelectedLoanIds(new Set())
    setLoanNotes((current) => {
      const nextState = { ...current }
      ids.forEach(id => delete nextState[id])
      return nextState
    })

    if (successCount > 0) {
      pushToast({ type: 'success', message: `${successCount} loan(s) approved successfully.` })
    }
    if (failedMessages.length > 0) {
      pushToast({
        type: 'error',
        message: failedMessages.length === 1
          ? failedMessages[0]
          : `Failed to approve ${failedMessages.length} loan(s). First error: ${failedMessages[0]}`,
      })
    }
  }

  if (isLoanOfficer && !canReviewPendingLoans) {
    return (
      <div>
        <h1>Approvals</h1>
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: '8px', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '1.5rem' }}>🔒</span>
          <div>
            <strong style={{ display: 'block', color: 'var(--danger-text)', marginBottom: '0.25rem' }}>Access Restricted</strong>
            <p style={{ margin: 0, color: 'var(--danger-text)', opacity: 0.85 }}>Your role does not have permission to view or manage loan approvals.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1>Approvals</h1>
      <p className={styles.subtle}>Applications submitted by officers flow into this approval workspace automatically, alongside lifecycle maker-checker requests.</p>

      {recentlyApprovedLoan ? (
        <section className={styles.handoffBanner} style={{
          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
          border: '1px solid #6ee7b7',
          padding: '1.25rem 1.5rem',
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div className={styles.handoffCopy} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>✓</span>
            <div>
              <strong style={{ color: 'var(--success-text)', display: 'block', fontSize: '1rem', marginBottom: '0.25rem' }}>
                Loan #{recentlyApprovedLoan.loanId} approved{recentlyApprovedLoan.clientName ? ` for ${recentlyApprovedLoan.clientName}` : ''}.
              </strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Continue directly to the funding workspace to disburse this loan.</span>
            </div>
          </div>
          <div className={styles.handoffActions} style={{ display: 'flex', gap: '0.5rem' }}>
            <Link className={styles.handoffPrimary} to={`/loans/${recentlyApprovedLoan.loanId}?workspace=operations`} style={{
              background: '#059669', color: '#fff', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600
            }}>
              Go to funding
            </Link>
            <button type="button" className={styles.handoffSecondary} onClick={() => setRecentlyApprovedLoan(null)} style={{
              background: 'transparent', color: '#065f46', border: '1px solid #059669', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer'
            }}>
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      <h2>Pending Loan Applications</h2>
      <p className={styles.subtle}>New loan applications stay here until a branch, finance, or area approval role reviews them.</p>

      {canReviewPendingLoans ? (
        <>
          <AsyncState
            loading={pendingLoansQuery.isLoading}
            error={pendingLoansQuery.isError}
            empty={Boolean(!pendingLoansQuery.isLoading && !pendingLoansQuery.isError && pendingLoans.length === 0)}
            loadingText="Loading pending loan applications..."
            errorText="Unable to load pending loan applications."
            emptyText="No pending loan applications found."
            onRetry={() => {
              void pendingLoansQuery.refetch()
            }}
          />

          {pendingLoans.length > 0 ? (
            <>
              {selectedLoanIds.size > 0 ? (
                <div style={{
                  background: 'var(--surface-soft)',
                  padding: '0.75rem 1rem',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{selectedLoanIds.size} loan(s) selected for approval</span>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="button" onClick={() => setSelectedLoanIds(new Set())} disabled={isBatchApproving} style={{
                      background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer'
                    }}>Cancel</button>
                    <button type="button" onClick={batchApprove} disabled={isBatchApproving} style={{
                      background: 'var(--accent)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer'
                    }}>
                      {isBatchApproving ? 'Approving...' : `Approve ${selectedLoanIds.size} loans`}
                    </button>
                  </div>
                </div>
              ) : null}
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input 
                        type="checkbox" 
                        checked={selectedLoanIds.size > 0 && selectedLoanIds.size === approvableLoanIds.length}
                        onChange={(e) => {
                          const checked = e.target.checked
                          if (checked) {
                            setSelectedLoanIds(new Set(approvableLoanIds))
                          } else {
                            setSelectedLoanIds(new Set())
                          }
                        }}
                        disabled={isBatchApproving || approvableLoanIds.length === 0}
                      />
                    </th>
                    <th>Loan</th>
                    <th>Borrower</th>
                    <th>Workflow</th>
                    <th>Maker</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLoans.map((loan) => {
                    const isApproving = approveLoanMutation.isPending && activeLoanId === loan.loan_id && activeLoanDecision === 'approve'
                    const isRejecting = rejectLoanMutation.isPending && activeLoanId === loan.loan_id && activeLoanDecision === 'reject'
                    const reviewState = pendingLoanReviewStates.get(loan.loan_id) ?? getPendingApprovalReviewState(loan, user)
                    const isSelected = selectedLoanIds.has(loan.loan_id)
                    const branchLabel = resolveDisplayText([loan.branch_name, loan.branch_code], 'Unassigned branch')
                    const clientLabel = resolveDisplayText([loan.client_name, loan.client_id ? `Client #${loan.client_id}` : null], 'Unknown client')
                    const makerLabel = resolveDisplayText([loan.created_by_name, loan.created_by_user_id ? `User #${loan.created_by_user_id}` : null])

                    return (
                      <tr key={loan.loan_id} style={isSelected ? { background: 'rgba(0, 220, 150, 0.06)' } : {}}>
                        <td>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            disabled={isBatchApproving || !reviewState.canApprove || isApproving || isRejecting}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setSelectedLoanIds(current => {
                                const next = new Set(current)
                                if (checked) next.add(loan.loan_id)
                                else next.delete(loan.loan_id)
                                return next
                              })
                            }}
                          />
                        </td>
                        <td>
                          <div className={styles.metaBlock}>
                            <strong><Link to={`/loans/${loan.loan_id}`}>Loan #{loan.loan_id}</Link></strong>
                            <span>Principal: Ksh {formatCurrency(loan.principal)}</span>
                            <span>Expected total: Ksh {formatCurrency(loan.expected_total)}</span>
                            <span>Branch: {branchLabel}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.metaBlock}>
                            <strong>{clientLabel}</strong>
                            <span>Officer: {formatDisplayText(loan.officer_name)}</span>
                            <span style={{ color: 'var(--warning-text)' }}>In queue: {formatTimeInQueue(loan.submitted_at)}</span>
                            <span>Submitted: {formatDateTime(loan.submitted_at)}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.metaBlock}>
                            <strong>{reviewState.readinessLabel}</strong>
                            <span>Stage: {reviewState.workflowStageLabel}</span>
                          <span>Guarantors: {loan.guarantor_count} | Collateral: {loan.collateral_count}</span>
                          <span>Fees: {formatDisplayText(loan.fee_payment_status)}</span>
                          {reviewState.approvalBlockers.length > 0 ? (
                            <ul className={styles.blockerList}>
                              {reviewState.approvalBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                            </ul>
                          ) : (
                            <span>Application is clear for approval handoff.</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.metaBlock}>
                          <strong>{makerLabel}</strong>
                          <span>Status: {reviewState.loanStatusLabel}</span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.reviewStack}>
                          <textarea
                            className={styles.noteInput}
                            rows={3}
                            placeholder={canRejectPendingLoans ? 'Add approval notes or rejection reason' : 'Add approval notes'}
                            value={loanNotes[loan.loan_id] || ''}
                            onChange={(event) => updateLoanNote(loan.loan_id, event.target.value)}
                          />
                          <div className={styles.actions}>
                            <Link className={styles.inlineLink} to={`/loans/${loan.loan_id}?workspace=operations`}>
                              Open application
                            </Link>
                            <button
                              type="button"
                              disabled={isApproving || isRejecting || !reviewState.canApprove}
                              onClick={() => approvePendingLoan(loan.loan_id)}
                            >
                              {isApproving ? 'Approving...' : 'Approve loan'}
                            </button>
                            {canRejectPendingLoans ? (
                              <button
                                type="button"
                                className={styles.reject}
                                disabled={isApproving || isRejecting || !reviewState.canReject}
                                onClick={() => rejectPendingLoan(loan.loan_id)}
                              >
                                {isRejecting ? 'Rejecting...' : 'Reject loan'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </>
          ) : null}
        </>
      ) : (
        <p className={styles.subtle}>Your role can review lifecycle approval requests here, but standard pending loan applications are routed to branch, finance, and area approval roles.</p>
      )}

      <h2>Lifecycle Approval Requests</h2>
      <p className={styles.subtle}>Restructure, write-off, top-up, refinance, and term extension requests remain available below.</p>

      <div className={styles.toolbar}>
        <label className={styles.filterGroup}>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ApprovalRequestStatus)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className={styles.filterGroup}>
          <span>Request type</span>
          <select value={requestTypeFilter} onChange={(event) => setRequestTypeFilter(event.target.value as 'all' | ApprovalRequestType)}>
            <option value="all">All types</option>
            {REQUEST_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <AsyncState
        loading={approvalsQuery.isLoading}
        error={approvalsQuery.isError}
        empty={Boolean(!approvalsQuery.isLoading && !approvalsQuery.isError && rows.length === 0)}
        loadingText="Loading lifecycle approval requests..."
        errorText="Unable to load lifecycle approval requests."
        emptyText="No lifecycle approval requests found."
        onRetry={() => {
          void approvalsQuery.refetch()
        }}
      />

      {rows.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Loan</th>
              <th>Branch</th>
              <th>Action</th>
              <th>Maker</th>
              <th>Status</th>
              <th>Timeline</th>
              <th>Request details</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isPending = reviewMutation.isPending && activeRequestId === row.id
              const isReviewable = row.status === 'pending'
              const clientLabel = resolveDisplayText([row.client_name, row.client_id ? `Client #${row.client_id}` : null], 'Unknown client')
              const branchLabel = formatDisplayText(row.branch_name, 'Unassigned branch')
              const branchCode = formatDisplayText(row.branch_code, 'No branch code')
              const makerLabel = resolveDisplayText([row.requested_by_name, row.requested_by_user_id ? `User #${row.requested_by_user_id}` : null])
              const checkerLabel = resolveDisplayText([row.checker_name, row.checker_user_id ? `User #${row.checker_user_id}` : null])
              const loanStatus = formatDisplayText(row.loan_status, '')

              return (
                <tr key={row.id}>
                  <td>
                    <div className={styles.metaBlock}>
                      <strong>
                        {row.loan_id > 0 ? <Link to={`/loans/${row.loan_id}`}>Loan #{row.loan_id}</Link> : '-'}
                      </strong>
                      <span>{clientLabel}</span>
                      <span>{loanStatus ? `Loan status: ${formatWorkflowText(loanStatus)}` : 'Loan status unavailable'}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.metaBlock}>
                      <strong>{branchLabel}</strong>
                      <span>{branchCode}</span>
                    </div>
                  </td>
                  <td>{formatRequestType(row.request_type)}</td>
                  <td>
                    <div className={styles.metaBlock}>
                      <strong>{makerLabel}</strong>
                      <span>Requested: {formatDateTime(row.requested_at)}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.metaBlock}>
                      <strong>{row.status}</strong>
                      <span>{formatDisplayText(row.execution_state)}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.metaBlock}>
                      <span>Requested: {formatDateTime(row.requested_at)}</span>
                      <span>Reviewed: {formatDateTime(row.reviewed_at)}</span>
                      <span>Executed: {formatDateTime(row.executed_at)}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.metaBlock}>
                      <span>{snapshotSummary(row.request_payload)}</span>
                      <span>Request note: {formatDisplayText(row.request_note)}</span>
                      <span>Review note: {formatDisplayText(row.review_note)}</span>
                    </div>
                  </td>
                  <td>
                    {isReviewable ? (
                      <div className={styles.reviewStack}>
                        <textarea
                          className={styles.noteInput}
                          rows={3}
                          placeholder="Add review note"
                          value={decisionNotes[row.id] || ''}
                          onChange={(event) => updateDecisionNote(row.id, event.target.value)}
                        />
                        <div className={styles.actions}>
                          <button type="button" disabled={isPending} onClick={() => submitDecision(row.id, 'approve')}>
                            {isPending ? 'Saving...' : 'Approve'}
                          </button>
                          <button type="button" className={styles.reject} disabled={isPending} onClick={() => submitDecision(row.id, 'reject')}>
                            {isPending ? 'Saving...' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.metaBlock}>
                        <strong>{checkerLabel}</strong>
                        <span>{formatDisplayText(row.review_note, 'No review note recorded')}</span>
                        <span>
                          {row.approved_at
                            ? `Approved: ${formatDateTime(row.approved_at)}`
                            : row.rejected_at
                              ? `Rejected: ${formatDateTime(row.rejected_at)}`
                              : `Reviewed: ${formatDateTime(row.reviewed_at)}`}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
