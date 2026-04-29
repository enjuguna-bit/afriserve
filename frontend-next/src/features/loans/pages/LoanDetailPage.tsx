import axios from 'axios'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { hasAnyRole } from '../../../app/roleAccess'
import { useAuth } from '../../../hooks/useAuth'
import {
  useAddLoanGuarantor,
  useAddLoanCollateral,
  useApproveLoan,
  useCreateRepayment,
  useDisburseLoan,
  useExtendLoanTerm,
  useLoanContracts,
  useLoanCollateral,
  useLoanDisbursements,
  useLoanGuarantors,
  useLoanLifecycleEvents,
  useReleaseLoanCollateral,
  useRemoveLoanCollateral,
  useRemoveLoanGuarantor,
  useLoanSchedule,
  useLoanStatement,
  useRefinanceLoan,
  useRejectLoan,
  useRestructureLoan,
  useTopUpLoan,
  useWriteLoanOff,
} from '../hooks/useLoans'
import { AsyncState } from '../../../components/common/AsyncState'
import { queryPolicies } from '../../../services/queryPolicies'
import { listCollateralAssets, listGuarantors } from '../../../services/riskService'
import { useToastStore } from '../../../store/toastStore'
import type { LoanRefinancePayload, LoanTopUpPayload } from '../../../types/loan'
import { formatDisplayDate, formatDisplayDateTime } from '../../../utils/dateFormatting'
import { formatDisplayLabel, formatDisplayText, resolveDisplayText } from '../../../utils/displayFormatting'
import { getLoanActionState } from '../utils/workflow'
import styles from './LoanDetailPage.module.css'

type RepaymentForm = {
  amount: number
  note?: string
}

function formatDateTime(value: string | null | undefined): string {
  return formatDisplayDateTime(value)
}

function formatDate(value: string | null | undefined): string {
  return formatDisplayDate(value)
}

function formatMoney(value: unknown): string {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount.toFixed(2) : '-'
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '-'
  }

  return `${(value * 100).toFixed(1)}%`
}

function formatStageLabel(value: string | null | undefined): string {
  return formatDisplayLabel(value)
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

function installmentStatusClass(status: string): string {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'paid') {
    return styles.statusPaid
  }
  if (normalized === 'overdue') {
    return styles.statusOverdue
  }
  return styles.statusPending
}

function loanStatusClass(status: string): string {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'active') {
    return styles.loanStatusActive
  }
  if (normalized === 'approved') {
    return styles.loanStatusApproved
  }
  if (normalized === 'pending_approval') {
    return styles.loanStatusPending
  }
  if (normalized === 'rejected' || normalized === 'written_off') {
    return styles.loanStatusRisk
  }
  return styles.loanStatusNeutral
}

export function LoanDetailPage() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const loanId = Number(id)
  const statementQuery = useLoanStatement(loanId)
  const scheduleQuery = useLoanSchedule(loanId)
  const collateralQuery = useLoanCollateral(loanId)
  const guarantorsQuery = useLoanGuarantors(loanId)
  const disbursementHistoryQuery = useLoanDisbursements(loanId)
  const contractHistoryQuery = useLoanContracts(loanId)
  const lifecycleEventsQuery = useLoanLifecycleEvents(loanId)
  const repaymentMutation = useCreateRepayment(loanId)
  const approveMutation = useApproveLoan(loanId)
  const disburseMutation = useDisburseLoan(loanId)
  const rejectMutation = useRejectLoan(loanId)
  const writeOffMutation = useWriteLoanOff(loanId)
  const restructureMutation = useRestructureLoan(loanId)
  const topUpMutation = useTopUpLoan(loanId)
  const refinanceMutation = useRefinanceLoan(loanId)
  const extendTermMutation = useExtendLoanTerm(loanId)
  const addCollateralMutation = useAddLoanCollateral(loanId)
  const addGuarantorMutation = useAddLoanGuarantor(loanId)
  const removeGuarantorMutation = useRemoveLoanGuarantor(loanId)
  const removeCollateralMutation = useRemoveLoanCollateral(loanId)
  const releaseCollateralMutation = useReleaseLoanCollateral(loanId)
  const { user } = useAuth()
  const pushToast = useToastStore((state) => state.pushToast)
  const { register, handleSubmit, reset } = useForm<RepaymentForm>()
  const [approveNote, setApproveNote] = useState('')
  const [disbursementNote, setDisbursementNote] = useState('')
  const [disbursementAmount, setDisbursementAmount] = useState('')
  const [finalDisbursement, setFinalDisbursement] = useState(false)
  
  // Disbursement confirmation state
  const [showDisbursementConfirm, setShowDisbursementConfirm] = useState(false)

  const [rejectReason, setRejectReason] = useState('')
  const [writeOffNote, setWriteOffNote] = useState('')
  const [newTermWeeks, setNewTermWeeks] = useState('')
  const [restructureNote, setRestructureNote] = useState('')
  const [waiveInterest, setWaiveInterest] = useState(false)
  const [topUpPrincipal, setTopUpPrincipal] = useState('')
  const [topUpTermWeeks, setTopUpTermWeeks] = useState('')
  const [topUpNote, setTopUpNote] = useState('')
  const [refinanceRate, setRefinanceRate] = useState('')
  const [refinanceTermWeeks, setRefinanceTermWeeks] = useState('')
  const [refinanceAdditionalPrincipal, setRefinanceAdditionalPrincipal] = useState('')
  const [refinanceNote, setRefinanceNote] = useState('')
  const [extensionTermWeeks, setExtensionTermWeeks] = useState('')
  const [extensionNote, setExtensionNote] = useState('')
  const [guarantorSearch, setGuarantorSearch] = useState('')
  const [guarantorId, setGuarantorId] = useState('')
  const [guaranteeAmount, setGuaranteeAmount] = useState('')
  const [relationshipToClient, setRelationshipToClient] = useState('')
  const [guarantorLiabilityType, setGuarantorLiabilityType] = useState<'individual' | 'corporate' | 'joint'>('individual')
  const [guarantorNote, setGuarantorNote] = useState('')
  const [collateralSearch, setCollateralSearch] = useState('')
  const [collateralAssetId, setCollateralAssetId] = useState('')
  const [forcedSaleValue, setForcedSaleValue] = useState('')
  const [collateralNote, setCollateralNote] = useState('')
  const requestedWorkspace = searchParams.get('workspace')
  const normalizedRequestedWorkspace = requestedWorkspace === 'overview'
    || requestedWorkspace === 'operations'
    || requestedWorkspace === 'security'
    || requestedWorkspace === 'history'
    ? requestedWorkspace
    : null
  const [workspaceView, setWorkspaceView] = useState<'overview' | 'operations' | 'security' | 'history' | null>(normalizedRequestedWorkspace)
  const trimmedGuarantorSearch = guarantorSearch.trim()
  const trimmedCollateralSearch = collateralSearch.trim()
  const guarantorLookupQuery = useQuery({
    queryKey: ['loan-detail', 'guarantor-lookup', loanId, trimmedGuarantorSearch],
    queryFn: () => listGuarantors({
      search: trimmedGuarantorSearch || undefined,
      limit: 8,
      offset: 0,
    }),
    enabled: trimmedGuarantorSearch.length >= 2,
    ...queryPolicies.list,
  })
  const collateralLookupQuery = useQuery({
    queryKey: ['loan-detail', 'collateral-lookup', loanId, trimmedCollateralSearch],
    queryFn: () => listCollateralAssets({
      search: trimmedCollateralSearch || undefined,
      status: 'active',
      limit: 8,
      offset: 0,
    }),
    enabled: trimmedCollateralSearch.length >= 2,
    ...queryPolicies.list,
  })
  const guarantorRows = useMemo(() => {
    if (!Array.isArray(guarantorsQuery.data)) {
      return [] as Array<Record<string, unknown>>
    }

    return guarantorsQuery.data.map((row) => ({
      loan_guarantor_id: row.loan_guarantor_id,
      guarantor_id: row.guarantor_id,
      full_name: row.full_name,
      guarantee_amount: row.guarantee_amount,
      liability_type: row.liability_type,
      relationship_to_client: row.relationship_to_client,
      monthly_income: row.monthly_income,
      phone: row.phone,
      national_id: row.national_id,
      note: row.note,
      created_at: row.created_at,
    }))
  }, [guarantorsQuery.data])
  const collateralRows = useMemo(() => {
    const source = collateralQuery.data
    if (Array.isArray(source)) {
      return source
    }
    if (source && typeof source === 'object') {
      const possibleArrays = Object.values(source).filter((value) => Array.isArray(value))
      if (possibleArrays.length > 0) {
        return possibleArrays[0] as Array<Record<string, unknown>>
      }
    }
    return [] as Array<Record<string, unknown>>
  }, [collateralQuery.data])
  const linkedGuarantorIds = useMemo(
    () => new Set((Array.isArray(guarantorsQuery.data) ? guarantorsQuery.data : []).map((row) => Number(row.guarantor_id)).filter((value) => value > 0)),
    [guarantorsQuery.data],
  )
  const linkedCollateralIds = useMemo(
    () => new Set(collateralRows.map((row) => Number(row.collateral_asset_id || row.id || 0)).filter((value) => value > 0)),
    [collateralRows],
  )

  if (!Number.isInteger(loanId) || loanId <= 0) {
    return <p>Invalid loan ID.</p>
  }

  if (statementQuery.isLoading || statementQuery.isError || !statementQuery.data) {
    const statementErrorText = statementQuery.isError
      ? getApiErrorMessage(statementQuery.error, 'Unable to load loan statement.')
      : 'Unable to load loan statement.'
    return (
      <AsyncState
        loading={statementQuery.isLoading}
        error={statementQuery.isError || !statementQuery.data}
        loadingText="Loading loan statement..."
        errorText={statementErrorText}
        onRetry={() => {
          void statementQuery.refetch()
        }}
      />
    )
  }

  const statement = statementQuery.data
  const workflow = statement.workflow
  const underwriting = statement.underwriting
  const scheduleSummary = scheduleQuery.data && typeof scheduleQuery.data === 'object' && 'summary' in scheduleQuery.data
    ? (scheduleQuery.data as { summary?: Record<string, unknown> }).summary
    : null
  const scheduleInstallments = Array.isArray((scheduleQuery.data as { installments?: unknown } | undefined)?.installments)
    ? ((scheduleQuery.data as { installments: Array<Record<string, unknown>> }).installments)
    : []
  const repaymentHistoryRows = (statement.repayments as Array<Record<string, unknown>>).map((repayment) => ({
    id: Number(repayment.id || 0),
    amount: Number(repayment.amount || 0),
    applied_amount: Number(repayment.applied_amount ?? repayment.amount ?? 0),
    penalty_amount: Number(repayment.penalty_amount ?? 0),
    interest_amount: Number(repayment.interest_amount ?? 0),
    principal_amount: Number(repayment.principal_amount ?? 0),
    overpayment_amount: Number(repayment.overpayment_amount ?? 0),
    paid_at: repayment.paid_at ? String(repayment.paid_at) : null,
    channel: resolveDisplayText([repayment.channel, repayment.payment_channel, repayment.source]),
    recorded_by: resolveDisplayText([repayment.recorded_by_name, repayment.recorded_by]),
  }))
  const disbursementHistory = disbursementHistoryQuery.data
  const contractHistory = contractHistoryQuery.data
  const lifecycleEvents = lifecycleEventsQuery.data?.events || []

  const isActionPending = approveMutation.isPending
    || disburseMutation.isPending
    || rejectMutation.isPending
    || writeOffMutation.isPending
    || restructureMutation.isPending
    || topUpMutation.isPending
    || refinanceMutation.isPending
    || extendTermMutation.isPending
    || addGuarantorMutation.isPending
    || addCollateralMutation.isPending
    || removeGuarantorMutation.isPending
    || removeCollateralMutation.isPending
    || releaseCollateralMutation.isPending
  const loanActionState = getLoanActionState(statement.loan.status, workflow)
  const {
    approvalBlockers,
    approvalReady,
    canDisburse,
    canExtendTerm,
    canRefinance,
    canServe,
    canTopUp,
    defaultWorkspaceView,
    focusMessage,
    normalizedStatus,
    showApprovalControls,
    showFundingWorkspace,
    showRecoveryControls,
    statusLabel,
  } = loanActionState
  const remainingFunding = Number(disbursementHistory?.remainingPrincipal ?? statement.loan.balance ?? statement.loan.principal ?? 0)
  const disburseRoleAllowed = hasAnyRole(user, ['admin', 'cashier', 'finance', 'operations_manager'])
  const disbursePermissionAllowed = !Array.isArray(user?.permissions)
    || user.permissions.includes('loan.disburse')
  const disburseAccessAllowed = disburseRoleAllowed && disbursePermissionAllowed
  const canDisburseAction = canDisburse && disburseAccessAllowed
  const approveRoleAllowed = hasAnyRole(user, ['admin', 'operations_manager', 'finance', 'area_manager'])
  const approvePermissionAllowed = !Array.isArray(user?.permissions)
    || user.permissions.includes('loan.approve')
  const approveAccessAllowed = approveRoleAllowed && approvePermissionAllowed
  const canApproveAction = approvalReady && approveAccessAllowed
  const rejectRoleAllowed = hasAnyRole(user, ['admin', 'operations_manager'])
  const rejectPermissionAllowed = !Array.isArray(user?.permissions)
    || user.permissions.includes('loan.reject')
  const rejectAccessAllowed = rejectRoleAllowed && rejectPermissionAllowed
  const topUpRoleAllowed = hasAnyRole(user, ['admin', 'finance', 'operations_manager'])
  const topUpPermissionAllowed = !Array.isArray(user?.permissions)
    || user.permissions.includes('loan.top_up')
  const topUpAccessAllowed = topUpRoleAllowed && topUpPermissionAllowed
  const canTopUpAction = canTopUp && topUpAccessAllowed
  const nextDueLabel = formatDate(workflow?.installment_summary?.next_due_date ?? statement.summary.first_repayment_at ?? null)
  const maturityLabel = formatDate(workflow?.maturity_date ?? null)
  const termLabel = statement.loan.term_weeks ? `${statement.loan.term_weeks} weeks` : '-'
  const activeWorkspace = workspaceView || normalizedRequestedWorkspace || defaultWorkspaceView

  function switchWorkspace(nextWorkspace: 'overview' | 'operations' | 'security' | 'history') {
    setWorkspaceView(nextWorkspace)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('workspace', nextWorkspace)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className={styles.page}>
      <section className={styles.heroPanel}>
        <div className={styles.breadcrumbs}>
          <Link to="/loans">Loans</Link>
          <span>/</span>
          <span>Loan #{statement.loan.id}</span>
        </div>
        <div className={styles.heroHeader}>
          <div>
            <h1 className={styles.heroTitle}>Loan #{statement.loan.id}</h1>
            <div className={styles.heroMeta}>
              <span>{resolveDisplayText([statement.loan.client_name], 'Borrower not captured')}</span>
              <span>Officer: {formatDisplayText(statement.loan.officer_name)}</span>
              <span>Branch: {formatDisplayText(statement.loan.branch_code)}</span>
            </div>
          </div>
          <div className={`${styles.loanStatusBadge} ${loanStatusClass(normalizedStatus)}`}>
            {statusLabel}
          </div>
        </div>
        <div className={styles.statStrip}>
          <div className={styles.statTile}>
            <span>Principal</span>
            <strong>{formatMoney(statement.loan.principal)}</strong>
          </div>
          <div className={styles.statTile}>
            <span>Outstanding</span>
            <strong>{formatMoney(statement.loan.balance)}</strong>
          </div>
          <div className={styles.statTile}>
            <span>Repayments</span>
            <strong>{statement.summary.repayment_count}</strong>
          </div>
          <div className={styles.statTile}>
            <span>Term</span>
            <strong>{termLabel}</strong>
          </div>
          <div className={styles.statTile}>
            <span>Next due</span>
            <strong>{nextDueLabel}</strong>
          </div>
          <div className={styles.statTile}>
            <span>Maturity</span>
            <strong>{maturityLabel}</strong>
          </div>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.primaryLink} to={`/loans/${loanId}/repay`}>Repayment page</Link>
          <Link className={styles.secondaryLink} to="/loans">Back to loans</Link>
        </div>
      </section>

      <section className={styles.workspaceShell}>
        <div className={styles.workspaceTabs}>
          <button
            type="button"
            className={`${styles.workspaceTab} ${activeWorkspace === 'overview' ? styles.workspaceTabActive : ''}`}
            onClick={() => switchWorkspace('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`${styles.workspaceTab} ${activeWorkspace === 'operations' ? styles.workspaceTabActive : ''}`}
            onClick={() => switchWorkspace('operations')}
          >
            Operations
          </button>
          <button
            type="button"
            className={`${styles.workspaceTab} ${activeWorkspace === 'security' ? styles.workspaceTabActive : ''}`}
            onClick={() => switchWorkspace('security')}
          >
            Security
          </button>
          <button
            type="button"
            className={`${styles.workspaceTab} ${activeWorkspace === 'history' ? styles.workspaceTabActive : ''}`}
            onClick={() => switchWorkspace('history')}
          >
            History
          </button>
        </div>
        <p className={styles.workspaceHint}>
          {activeWorkspace === 'operations'
            ? 'Use this workspace for approval, funding, repayment, and contract changes.'
            : activeWorkspace === 'security'
              ? 'Use this workspace to manage guarantors and collateral linked to the loan.'
              : activeWorkspace === 'history'
                ? 'Use this workspace to review lifecycle, repayment, contract, and funding history.'
                : 'Use this workspace to review current status, readiness, and risk before taking action.'}
        </p>
      </section>

      {focusMessage ? (
        <div className={`${styles.focusBanner} ${normalizedStatus === 'rejected' || normalizedStatus === 'written_off' ? styles.focusBannerDanger : approvalBlockers.length > 0 ? styles.focusBannerWarn : styles.focusBannerInfo}`}>
          <div className={styles.focusBannerIcon} aria-hidden="true">
            {normalizedStatus === 'rejected' || normalizedStatus === 'written_off' ? '✕' : approvalBlockers.length > 0 ? '⚠' : 'ℹ'}
          </div>
          <div className={styles.focusBannerContent}>
            <strong>Next Action Guidance</strong>
            <p>{focusMessage}</p>
          </div>
        </div>
      ) : null}

      {showFundingWorkspace ? (
        <section className={styles.spotlightSection}>
          <div className={styles.spotlightContent}>
            <div className={styles.spotlightLead}>
              <span className={styles.sectionEyebrow}>Funding workspace</span>
              <h2>Disburse this approved loan</h2>
              <p>
                This loan has been approved and is waiting for funding. The disbursement action is isolated here so the funding step is not buried under other lifecycle controls.
              </p>
              <div className={styles.spotlightStats}>
                <div className={styles.spotlightStat}><span>Approved principal</span><strong>{formatMoney(disbursementHistory?.approvedPrincipal ?? statement.loan.principal)}</strong></div>
                <div className={styles.spotlightStat}><span>Remaining to disburse</span><strong>{formatMoney(remainingFunding)}</strong></div>
                <div className={styles.spotlightStat}><span>Funding stage</span><strong>{workflow?.funding_stage_label || 'Awaiting funding'}</strong></div>
              </div>
              {disbursementHistory?.tranches.length ? (
                <p className={styles.spotlightHint}>
                  {disbursementHistory.tranches.length} tranche{disbursementHistory.tranches.length === 1 ? '' : 's'} already recorded. Use a partial amount for the next tranche or leave amount empty for the remaining balance.
                </p>
              ) : (
                <p className={styles.spotlightHint}>No disbursement tranches recorded yet. Leave amount empty to disburse the full approved balance.</p>
              )}
            </div>
            <div className={styles.spotlightForm}>
              <label className={styles.field}>
                <span>Amount to disburse</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Leave empty for full remaining balance"
                  value={disbursementAmount}
                  onChange={(event) => setDisbursementAmount(event.target.value)}
                  disabled={isActionPending || !disburseAccessAllowed}
                />
              </label>
              <label className={styles.field}>
                <span>Funding note</span>
                <input
                  type="text"
                  placeholder="Optional note for this tranche"
                  value={disbursementNote}
                  onChange={(event) => setDisbursementNote(event.target.value)}
                  disabled={isActionPending || !disburseAccessAllowed}
                />
              </label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={finalDisbursement}
                  onChange={(event) => setFinalDisbursement(event.target.checked)}
                  disabled={isActionPending || !disburseAccessAllowed}
                />
                Mark as final disbursement
              </label>
              {!disburseAccessAllowed ? (
                <p className={styles.spotlightHint}>
                  You do not have permission to disburse loans. Ask an operations manager, finance, or cashier to proceed.
                </p>
              ) : null}
              {showDisbursementConfirm ? (
                <div style={{
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginTop: '1rem',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}>
                  <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Confirm Disbursement</strong>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.875rem' }}>
                    You are about to record a disbursement of <strong>{disbursementAmount ? `KES ${formatMoney(Number(disbursementAmount))}` : `KES ${formatMoney(remainingFunding)} (Full balance)`}</strong>.
                    {finalDisbursement ? ' This will trigger the loan schedule and mark funding as complete.' : ''}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={isActionPending || !disburseAccessAllowed}
                      onClick={() => {
                        if (!disburseAccessAllowed) {
                          return
                        }
                        const payload: Record<string, unknown> = {}
                        if (disbursementAmount.trim()) {
                          payload.amount = Number(disbursementAmount)
                        }
                        if (disbursementNote.trim()) {
                          payload.notes = disbursementNote.trim()
                        }
                        if (finalDisbursement) {
                          payload.finalDisbursement = true
                        }
                        disburseMutation.mutate(payload, {
                          onSuccess: () => {
                            pushToast({ type: 'success', message: 'Disbursement submitted.' })
                            setDisbursementAmount('')
                            setDisbursementNote('')
                            setFinalDisbursement(false)
                            setShowDisbursementConfirm(false)
                          },
                          onError: (error) => {
                            pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to disburse loan.') })
                            setShowDisbursementConfirm(false)
                          },
                        })
                      }}
                    >
                      {disburseMutation.isPending ? 'Confirming...' : 'Yes, Disburse'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={isActionPending}
                      onClick={() => setShowDisbursementConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={isActionPending || !canDisburseAction}
                  onClick={() => setShowDisbursementConfirm(true)}
                >
                  Review Disbursement
                </button>
              )}
            </div>
          </div>
        </section>
      ) : activeWorkspace === 'operations' && ['active', 'in_arrears'].includes(normalizedStatus) ? (
        <section className={styles.spotlightSection} style={{ background: 'linear-gradient(135deg, rgba(0,220,150,0.08), rgba(0,184,125,0.05))', borderColor: 'rgba(0,220,150,0.25)' }}>
          <div className={styles.spotlightContent} style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>🎉</div>
            <div style={{ flex: 1, minWidth: 250 }}>
              <strong style={{ display: 'block', fontSize: '1.125rem', color: 'var(--success-text)', marginBottom: '0.25rem' }}>Loan Active & Disbursed</strong>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>This loan has been fully funded and the repayment schedule is active. The borrower's first installment is marked in the schedule.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Link className={styles.primaryLink} to={`/loans/${loanId}/repay`} style={{ background: 'linear-gradient(135deg, var(--accent-strong), var(--accent))', color: '#001a0d' }}>Record Repayment</Link>
            </div>
          </div>
        </section>
      ) : null}

      {(activeWorkspace === 'overview' || activeWorkspace === 'operations') && workflow ? (
        <div className={styles.metaGrid}>
          <div className={styles.card}>
            <h3>Lifecycle</h3>
            <p>{workflow.lifecycle_stage_label}</p>
            <p>Funding: {workflow.funding_stage_label}</p>
            <p>Servicing: {workflow.servicing_stage_label}</p>
            <p>Recovery: {workflow.recovery_stage_label}</p>
            <p>Archive: {workflow.archive_state_label}</p>
          </div>
          <div className={styles.card}>
            <h3>Portfolio Risk</h3>
            <p>Current DPD: {workflow.current_dpd}</p>
            <p>PAR bucket: {formatStageLabel(workflow.par_bucket)}</p>
            <p>Next due: {formatDate(workflow.installment_summary.next_due_date)}</p>
            <p>Maturity: {formatDate(workflow.maturity_date)}</p>
          </div>
          <div className={styles.card}>
            <h3>Readiness</h3>
            <p>Guarantors linked: {workflow.guarantor_count}</p>
            <p>Collateral linked: {workflow.collateral_count}</p>
            <p>Can approve: {workflow.can_approve ? 'Yes' : 'No'}</p>
            <p>Can disburse: {workflow.can_disburse ? 'Yes' : 'No'}</p>
          </div>
        </div>
      ) : null}

      {(activeWorkspace === 'overview' || activeWorkspace === 'operations') && workflow && approvalBlockers.length > 0 ? (
        <div className={`${styles.card} ${styles.blockerCard}`}>
          <h3>Approval blockers</h3>
          <p>Resolve these items before the application can move to approval and funding.</p>
          <ul className={styles.blockerList}>
            {approvalBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : null}

      {activeWorkspace === 'overview' && underwriting ? (
        <div className={styles.metaGrid}>
          <div className={styles.card}>
            <h3>Underwriting decision</h3>
            <p>Policy: {formatStageLabel(underwriting.policy_decision)}</p>
            <p>Risk band: {formatStageLabel(underwriting.risk_band)}</p>
            <p>KYC: {formatStageLabel(underwriting.kyc_status)}</p>
            <p>Assessed: {formatDateTime(resolveDisplayText([underwriting.updated_at, underwriting.assessed_at], ''))}</p>
          </div>
          <div className={styles.card}>
            <h3>Affordability</h3>
            <p>Support income: {formatMoney(underwriting.support_income_total)}</p>
            <p>Weekly installment: {formatMoney(underwriting.estimated_weekly_installment)}</p>
            <p>Monthly installment: {formatMoney(underwriting.estimated_monthly_installment)}</p>
            <p>Burden ratio: {formatPercent(underwriting.repayment_to_support_income_ratio)}</p>
          </div>
          <div className={styles.card}>
            <h3>Coverage</h3>
            <p>Collateral value: {formatMoney(underwriting.collateral_value_total)}</p>
            <p>Collateral coverage: {formatPercent(underwriting.collateral_coverage_ratio)}</p>
            <p>Guarantee amount: {formatMoney(underwriting.guarantee_amount_total)}</p>
            <p>Guarantee coverage: {formatPercent(underwriting.guarantee_coverage_ratio)}</p>
          </div>
        </div>
      ) : null}

      {activeWorkspace === 'overview' && underwriting && (underwriting.policy_flags.length > 0 || underwriting.override_decision || underwriting.override_reason) ? (
        <div className={styles.card}>
          <h3>Underwriting signals</h3>
          {underwriting.policy_flags.length > 0 ? (
            <div className={styles.flagList}>
              {underwriting.policy_flags.map((flag) => (
                <span key={flag} className={styles.flagBadge}>{formatStageLabel(flag)}</span>
              ))}
            </div>
          ) : <p>No active policy flags.</p>}
          {underwriting.override_decision ? <p>Override: {formatStageLabel(underwriting.override_decision)}</p> : null}
          {underwriting.override_reason ? <p>Override reason: {underwriting.override_reason}</p> : null}
          <p>Business years: {underwriting.business_years ?? '-'}</p>
        </div>
      ) : null}

      {activeWorkspace === 'overview' && scheduleSummary ? (
        <div className={styles.infoRow}>
          <p>Total installments: {String(scheduleSummary.total_installments ?? '-')}</p>
          <p>Paid installments: {String(scheduleSummary.paid_installments ?? '-')}</p>
          <p>Overdue installments: {String(scheduleSummary.overdue_installments ?? '-')}</p>
        </div>
      ) : null}

      {(activeWorkspace === 'overview' || activeWorkspace === 'history') ? (
        <div className={styles.collapsibleStack}>
        <details className={styles.collapsible} open={activeWorkspace === 'overview'}>
          <summary>Installment schedule</summary>
          {scheduleInstallments.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Due date</th>
                  <th>Amount due</th>
                  <th>Paid</th>
                  <th>Outstanding</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scheduleInstallments.map((row) => {
                  const status = formatDisplayText(row.status, 'pending')
                  const installmentNumber = formatDisplayText(row.installment_number)
                  return (
                    <tr key={`${installmentNumber}-${formatDisplayText(row.due_date)}`}>
                      <td>{installmentNumber}</td>
                      <td>{formatDate(typeof row.due_date === 'string' ? row.due_date : row.due_date ? String(row.due_date) : null)}</td>
                      <td>{formatDisplayText(row.amount_due)}</td>
                      <td>{formatDisplayText(row.amount_paid)}</td>
                      <td>{formatDisplayText(row.amount_outstanding)}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${installmentStatusClass(status)}`}>
                          {status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p>No installment schedule found.</p>
          )}
        </details>

        <details className={styles.collapsible} open={activeWorkspace === 'history'}>
          <summary>Repayment history</summary>
          {repaymentHistoryRows.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Applied</th>
                  <th>Allocation</th>
                  <th>Date</th>
                  <th>Channel</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {repaymentHistoryRows.map((repayment) => {
                  const allocationParts: string[] = []
                  if (repayment.principal_amount > 0) {
                    allocationParts.push(`Principal ${formatMoney(repayment.principal_amount)}`)
                  }
                  if (repayment.interest_amount > 0) {
                    allocationParts.push(`Interest ${formatMoney(repayment.interest_amount)}`)
                  }
                  if (repayment.penalty_amount > 0) {
                    allocationParts.push(`Penalty ${formatMoney(repayment.penalty_amount)}`)
                  }
                  if (repayment.overpayment_amount > 0) {
                    allocationParts.push(`Overpay ${formatMoney(repayment.overpayment_amount)}`)
                  }
                  const allocationLabel = allocationParts.length > 0 ? allocationParts.join(' ? ') : '-'

                  return (
                    <tr key={repayment.id}>
                      <td>{formatMoney(repayment.amount)}</td>
                      <td>{formatMoney(repayment.applied_amount)}</td>
                      <td>{allocationLabel}</td>
                      <td>{formatDateTime(repayment.paid_at)}</td>
                      <td>{repayment.channel}</td>
                      <td>{repayment.recorded_by}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p>No repayments recorded yet.</p>
          )}
        </details>

        <details className={styles.collapsible} open={activeWorkspace === 'history'}>
          <summary>Disbursement history</summary>
          {disbursementHistoryQuery.isLoading ? <p>Loading disbursements...</p> : null}
          {disbursementHistory ? (
            <>
              <div className={styles.infoRow}>
                <p>Approved principal: {formatMoney(disbursementHistory.approvedPrincipal)}</p>
                <p>Total disbursed: {formatMoney(disbursementHistory.totalDisbursed)}</p>
                <p>Remaining principal: {formatMoney(disbursementHistory.remainingPrincipal)}</p>
              </div>
              {disbursementHistory.tranches.length > 0 ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tranche</th>
                      <th>Amount</th>
                      <th>Disbursed at</th>
                      <th>Final</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disbursementHistory.tranches.map((tranche) => (
                      <tr key={tranche.id}>
                        <td>{tranche.tranche_number}</td>
                        <td>{formatMoney(tranche.amount)}</td>
                        <td>{formatDateTime(tranche.disbursed_at)}</td>
                        <td>{tranche.is_final ? 'Yes' : 'No'}</td>
                        <td>{formatDisplayText(tranche.note)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p>No disbursement tranches recorded yet.</p>}
            </>
          ) : null}
        </details>

        <details className={styles.collapsible} open={false}>
          <summary>Contract history</summary>
          {contractHistoryQuery.isLoading ? <p>Loading contract versions...</p> : null}
          {contractHistory?.versions.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Event</th>
                  <th>Expected total</th>
                  <th>Balance</th>
                  <th>Created at</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {contractHistory.versions.map((version) => (
                  <tr key={version.id}>
                    <td>{version.version_number}</td>
                    <td>{formatStageLabel(version.event_type)}</td>
                    <td>{formatMoney(version.expected_total)}</td>
                    <td>{formatMoney(version.balance)}</td>
                    <td>{formatDateTime(version.created_at)}</td>
                    <td>{formatDisplayText(version.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>No contract versions recorded yet.</p>}
        </details>

        <details className={styles.collapsible} open={activeWorkspace === 'history'}>
          <summary>Lifecycle timeline</summary>
          {lifecycleEventsQuery.isLoading ? <p>Loading lifecycle timeline...</p> : null}
          {lifecycleEvents.length > 0 ? (
            <div className={styles.timeline}>
              {lifecycleEvents.map((event) => (
                <article key={event.id} className={styles.timelineItem}>
                  <div className={styles.timelineHeader}>
                    <strong>{event.title}</strong>
                    <span>{formatDateTime(event.at)}</span>
                  </div>
                  <p>{event.summary}</p>
                  <p>Stage: {formatStageLabel(event.stage)}</p>
                </article>
              ))}
            </div>
          ) : <p>No lifecycle events available yet.</p>}
        </details>

        <details className={styles.collapsible} open={false}>
          <summary>Collateral</summary>
          {collateralRows.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {collateralRows.map((item, index) => (
                  <tr key={String(item.id || item.collateral_asset_id || index)}>
                    <td>{resolveDisplayText([item.asset_type, item.type, item.collateral_type], 'Unknown')}</td>
                    <td>{resolveDisplayText([item.forced_sale_value, item.market_value, item.value])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No collateral attached.</p>
          )}
        </details>
      </div>
      ) : null}

      {activeWorkspace === 'operations' ? (
      <section className={styles.actionSection}>
        <div className={styles.actionSectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>Operations</span>
            <h2>Loan actions</h2>
            <p>Only the controls relevant to the current stage are kept prominent. Funding is handled above when the loan is approved.</p>
          </div>
        </div>

        <div className={styles.actionColumns}>
          {showApprovalControls ? (
            <section className={styles.actionGroup}>
              <div className={styles.actionGroupHeader}>
                <h3>Approval decision</h3>
                <p>
                  {approvalReady
                    ? 'Review this loan and either approve it for funding or reject it with a reason.'
                    : 'Approval is currently blocked. Complete the outstanding application items, then return here to approve or reject.'}
                </p>
              </div>
              <div className={styles.actionGroupGrid}>
                <div className={styles.card}>
          <h3>Approve</h3>
          <input
            type="text"
            placeholder="Approval note (optional)"
            value={approveNote}
            onChange={(event) => setApproveNote(event.target.value)}
            disabled={isActionPending || !approveAccessAllowed}
          />
          <button
            type="button"
            disabled={isActionPending || !canApproveAction}
            onClick={() => {
              if (!approveAccessAllowed) {
                return
              }
              approveMutation.mutate(
                { notes: approveNote.trim() || undefined },
                {
                  onSuccess: () => {
                    pushToast({ type: 'success', message: 'Loan approved.' })
                    setApproveNote('')
                  },
                  onError: (error) => {
                    pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to approve loan.') })
                  },
                },
              )
            }}
          >
            {approveMutation.isPending ? 'Approving...' : 'Approve loan'}
          </button>
          {!approveAccessAllowed ? (
            <p className={styles.actionNote}>You do not have permission to approve loans.</p>
          ) : !approvalReady ? (
            <p className={styles.actionNote}>Approval stays disabled until all blockers are cleared.</p>
          ) : null}
        </div>

                <div className={styles.card}>
          <h3>Reject</h3>
          <input
            type="text"
            placeholder="Reason (min 5 chars)"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            disabled={isActionPending || !rejectAccessAllowed}
          />
          <button
            type="button"
            disabled={isActionPending || !rejectAccessAllowed || rejectReason.trim().length < 5}
            onClick={() => {
              if (!rejectAccessAllowed) {
                return
              }
              rejectMutation.mutate(
                { reason: rejectReason.trim() },
                {
                  onSuccess: () => {
                    pushToast({ type: 'success', message: 'Loan rejected.' })
                    setRejectReason('')
                  },
                  onError: (error) => {
                    pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to reject loan.') })
                  },
                },
              )
            }}
          >
            {rejectMutation.isPending ? 'Rejecting...' : 'Reject loan'}
          </button>
          {!rejectAccessAllowed ? (
            <p className={styles.actionNote}>You do not have permission to reject loans.</p>
          ) : null}
        </div>
              </div>
            </section>
          ) : null}

          <section className={styles.actionGroup}>
            <div className={styles.actionGroupHeader}>
              <h3>Recovery and control</h3>
              <p>Use these controls for exceptional events after approval or during servicing.</p>
            </div>
            <div className={styles.actionGroupGrid}>
              {showRecoveryControls ? (
                <div className={styles.card}>
          <h3>Write-off</h3>
          <input
            type="text"
            placeholder="Write-off note (optional)"
            value={writeOffNote}
            onChange={(event) => setWriteOffNote(event.target.value)}
          />
          <button
            type="button"
            disabled={isActionPending}
            onClick={() => {
              writeOffMutation.mutate(
                { note: writeOffNote.trim() || undefined },
                {
                  onSuccess: () => {
                    pushToast({ type: 'success', message: 'Loan written off.' })
                    setWriteOffNote('')
                  },
                  onError: () => {
                    pushToast({ type: 'error', message: 'Failed to write off loan.' })
                  },
                },
              )
            }}
          >
            {writeOffMutation.isPending ? 'Writing off...' : 'Write off loan'}
          </button>
        </div>
              ) : null}

              <div className={`${styles.card} ${styles.infoCard}`}>
                <h3>Current focus</h3>
                <p>{focusMessage}</p>
                <div className={styles.infoList}>
                  <span>Funding stage: {formatStageLabel(workflow?.funding_stage_label)}</span>
                  <span>Servicing stage: {formatStageLabel(workflow?.servicing_stage_label)}</span>
                  <span>Recovery stage: {formatStageLabel(workflow?.recovery_stage_label)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.actionGroup}>
            <div className={styles.actionGroupHeader}>
              <h3>Portfolio changes</h3>
              <p>Requests that alter the contract are grouped here instead of competing with funding and repayment controls.</p>
            </div>
            <div className={styles.actionGroupGrid}>
              <div className={styles.card}>
          <h3>Restructure</h3>
          <input
            type="number"
            min={1}
            max={260}
            placeholder="New term weeks"
            value={newTermWeeks}
            onChange={(event) => setNewTermWeeks(event.target.value)}
          />
          <input
            type="text"
            placeholder="Restructure note"
            value={restructureNote}
            onChange={(event) => setRestructureNote(event.target.value)}
          />
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={waiveInterest}
              onChange={(event) => setWaiveInterest(event.target.checked)}
            />
            Waive interest
          </label>
          <button
            type="button"
            disabled={isActionPending || !Number.isInteger(Number(newTermWeeks)) || Number(newTermWeeks) <= 0}
            onClick={() => {
              restructureMutation.mutate(
                {
                  newTermWeeks: Number(newTermWeeks),
                  note: restructureNote.trim() || undefined,
                  waiveInterest,
                },
                {
                  onSuccess: () => {
                    pushToast({ type: 'success', message: 'Loan restructured.' })
                    setNewTermWeeks('')
                    setRestructureNote('')
                    setWaiveInterest(false)
                  },
                  onError: () => {
                    pushToast({ type: 'error', message: 'Failed to restructure loan.' })
                  },
                },
              )
            }}
          >
            {restructureMutation.isPending ? 'Restructuring...' : 'Restructure loan'}
          </button>
        </div>

              <div className={styles.card}>
          <h3>Top-up request</h3>
          <input
            type="number"
            min={1}
            step="0.01"
            placeholder="Additional principal"
            value={topUpPrincipal}
            onChange={(event) => setTopUpPrincipal(event.target.value)}
            disabled={isActionPending || !topUpAccessAllowed}
          />
          <input
            type="number"
            min={1}
            max={260}
            placeholder="New term weeks (optional)"
            value={topUpTermWeeks}
            onChange={(event) => setTopUpTermWeeks(event.target.value)}
            disabled={isActionPending || !topUpAccessAllowed}
          />
          <input
            type="text"
            placeholder="Top-up note"
            value={topUpNote}
            onChange={(event) => setTopUpNote(event.target.value)}
            disabled={isActionPending || !topUpAccessAllowed}
          />
          <button
            type="button"
            disabled={isActionPending || !canTopUpAction || Number(topUpPrincipal) <= 0}
            onClick={() => {
              if (!topUpAccessAllowed) {
                return
              }
              const payload: LoanTopUpPayload = {
                additionalPrincipal: Number(topUpPrincipal),
              }
              if (Number(topUpTermWeeks) > 0) {
                payload.newTermWeeks = Number(topUpTermWeeks)
              }
              if (topUpNote.trim()) {
                payload.note = topUpNote.trim()
              }
              topUpMutation.mutate(payload, {
                onSuccess: () => {
                  pushToast({ type: 'success', message: 'Top-up request submitted for approval.' })
                  setTopUpPrincipal('')
                  setTopUpTermWeeks('')
                  setTopUpNote('')
                },
                onError: () => {
                  pushToast({ type: 'error', message: 'Failed to submit top-up request.' })
                },
              })
            }}
          >
            {topUpMutation.isPending ? 'Submitting...' : 'Request top-up'}
          </button>
          {!topUpAccessAllowed ? (
            <p className={styles.actionNote}>You do not have permission to request loan top-ups.</p>
          ) : null}
        </div>

              <div className={styles.card}>
          <h3>Refinance request</h3>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="New interest rate"
            value={refinanceRate}
            onChange={(event) => setRefinanceRate(event.target.value)}
          />
          <input
            type="number"
            min={1}
            max={260}
            placeholder="New term weeks"
            value={refinanceTermWeeks}
            onChange={(event) => setRefinanceTermWeeks(event.target.value)}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Additional principal (optional)"
            value={refinanceAdditionalPrincipal}
            onChange={(event) => setRefinanceAdditionalPrincipal(event.target.value)}
          />
          <input
            type="text"
            placeholder="Refinance note"
            value={refinanceNote}
            onChange={(event) => setRefinanceNote(event.target.value)}
          />
          <button
            type="button"
            disabled={isActionPending || !canRefinance || Number(refinanceRate) < 0 || Number(refinanceTermWeeks) <= 0}
            onClick={() => {
              const payload: LoanRefinancePayload = {
                newInterestRate: Number(refinanceRate),
                newTermWeeks: Number(refinanceTermWeeks),
              }
              if (refinanceAdditionalPrincipal.trim()) {
                payload.additionalPrincipal = Number(refinanceAdditionalPrincipal)
              }
              if (refinanceNote.trim()) {
                payload.note = refinanceNote.trim()
              }
              refinanceMutation.mutate(payload, {
                onSuccess: () => {
                  pushToast({ type: 'success', message: 'Refinance request submitted for approval.' })
                  setRefinanceRate('')
                  setRefinanceTermWeeks('')
                  setRefinanceAdditionalPrincipal('')
                  setRefinanceNote('')
                },
                onError: () => {
                  pushToast({ type: 'error', message: 'Failed to submit refinance request.' })
                },
              })
            }}
          >
            {refinanceMutation.isPending ? 'Submitting...' : 'Request refinance'}
          </button>
        </div>

              <div className={styles.card}>
          <h3>Extend term</h3>
          <input
            type="number"
            min={1}
            max={260}
            placeholder="New term weeks"
            value={extensionTermWeeks}
            onChange={(event) => setExtensionTermWeeks(event.target.value)}
          />
          <input
            type="text"
            placeholder="Extension note"
            value={extensionNote}
            onChange={(event) => setExtensionNote(event.target.value)}
          />
          <button
            type="button"
            disabled={isActionPending || !canExtendTerm || Number(extensionTermWeeks) <= 0}
            onClick={() => {
              extendTermMutation.mutate(
                {
                  newTermWeeks: Number(extensionTermWeeks),
                  note: extensionNote.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    pushToast({ type: 'success', message: 'Term extension request submitted for approval.' })
                    setExtensionTermWeeks('')
                    setExtensionNote('')
                  },
                  onError: () => {
                    pushToast({ type: 'error', message: 'Failed to submit term extension request.' })
                  },
                },
              )
            }}
          >
            {extendTermMutation.isPending ? 'Submitting...' : 'Request term extension'}
          </button>
        </div>
            </div>
          </section>
        </div>
      </section>
      ) : null}

      {activeWorkspace === 'operations' ? (
      <section className={styles.actionGroup}>
        <div className={styles.actionGroupHeader}>
          <h2>Record repayment</h2>
          <p>Servicing is separated from approval and funding so cash posting only appears as its own workflow.</p>
        </div>
        <form
          className={styles.repaymentForm}
        onSubmit={handleSubmit((values) => {
          repaymentMutation.mutate(
            {
              amount: Number(values.amount),
              note: values.note?.trim() || undefined,
            },
            {
              onSuccess: () => {
                reset()
                pushToast({ type: 'success', message: 'Repayment posted successfully.' })
              },
              onError: () => {
                pushToast({ type: 'error', message: 'Failed to post repayment.' })
              },
            },
          )
        })}
      >
        <label className={styles.field}>
          <span>Amount</span>
          <input type="number" min={1} step="0.01" {...register('amount', { valueAsNumber: true })} required />
        </label>
        <label className={styles.field}>
          <span>Note</span>
          <input type="text" {...register('note')} />
        </label>
        {repaymentMutation.isError ? <p>Unable to post repayment.</p> : null}
        <button className={styles.primaryButton} type="submit" disabled={repaymentMutation.isPending || !canServe}>
          {repaymentMutation.isPending ? 'Posting...' : 'Post repayment'}
        </button>
        </form>
      </section>
      ) : null}

      {activeWorkspace === 'security' ? <h2>Guarantors</h2> : null}
      {activeWorkspace === 'security' ? (
      <div className={styles.card}>
        <p>Link guarantor ID to this loan with the agreed coverage terms.</p>
        <div className={styles.row}>
          <input
            type="text"
            placeholder="Search guarantors by name, phone, or national ID"
            value={guarantorSearch}
            onChange={(event) => setGuarantorSearch(event.target.value)}
          />
          <input
            type="number"
            min={1}
            placeholder="Guarantor ID"
            value={guarantorId}
            onChange={(event) => setGuarantorId(event.target.value)}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Guarantee amount (optional)"
            value={guaranteeAmount}
            onChange={(event) => setGuaranteeAmount(event.target.value)}
          />
          <input
            type="text"
            placeholder="Relationship to client (optional)"
            value={relationshipToClient}
            onChange={(event) => setRelationshipToClient(event.target.value)}
          />
          <select
            value={guarantorLiabilityType}
            onChange={(event) => setGuarantorLiabilityType(event.target.value as 'individual' | 'corporate' | 'joint')}
          >
            <option value="individual">Individual</option>
            <option value="corporate">Corporate</option>
            <option value="joint">Joint</option>
          </select>
          <input
            type="text"
            placeholder="Note (optional)"
            value={guarantorNote}
            onChange={(event) => setGuarantorNote(event.target.value)}
          />
          <button
            type="button"
            disabled={addGuarantorMutation.isPending || !Number.isInteger(Number(guarantorId)) || Number(guarantorId) <= 0}
            onClick={() => {
              const payload: {
                guarantorId: number
                guaranteeAmount?: number
                relationshipToClient?: string
                liabilityType?: 'individual' | 'corporate' | 'joint'
                note?: string
              } = {
                guarantorId: Number(guarantorId),
                liabilityType: guarantorLiabilityType,
              }
              if (guaranteeAmount.trim()) {
                payload.guaranteeAmount = Number(guaranteeAmount)
              }
              if (relationshipToClient.trim()) {
                payload.relationshipToClient = relationshipToClient.trim()
              }
              if (guarantorNote.trim()) {
                payload.note = guarantorNote.trim()
              }
              addGuarantorMutation.mutate(payload, {
                onSuccess: () => {
                  pushToast({ type: 'success', message: 'Guarantor linked to loan.' })
                  setGuarantorId('')
                  setGuaranteeAmount('')
                  setRelationshipToClient('')
                  setGuarantorLiabilityType('individual')
                  setGuarantorNote('')
                },
                onError: (error) => {
                  pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to link guarantor.') })
                },
              })
            }}
          >
            {addGuarantorMutation.isPending ? 'Linking...' : 'Link guarantor'}
          </button>
        </div>
        {trimmedGuarantorSearch.length >= 2 ? (
          guarantorLookupQuery.isLoading ? <p>Searching guarantors...</p> : guarantorLookupQuery.data?.data.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Contacts</th>
                  <th>Income</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(guarantorLookupQuery.data?.data ?? []).map((row) => {
                  const isLinked = linkedGuarantorIds.has(Number(row.id))
                  return (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{formatDisplayText(row.full_name, `Guarantor #${row.id}`)}</td>
                      <td>
                        <div>{formatDisplayText(row.phone)}</div>
                        <div>{formatDisplayText(row.national_id)}</div>
                      </td>
                      <td>{formatMoney(row.monthly_income)}</td>
                      <td>
                        <button
                          type="button"
                          disabled={isLinked}
                          onClick={() => {
                            setGuarantorId(String(row.id))
                            setGuarantorSearch(formatDisplayText(row.full_name, String(row.id)))
                          }}
                        >
                          {isLinked ? 'Linked' : 'Use'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <p>No guarantor matches found.</p>
        ) : null}
      </div>
      ) : null}

      {activeWorkspace === 'security' ? (guarantorRows.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Coverage</th>
              <th>Contacts</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {guarantorRows.map((row) => (
              <tr key={String(row.loan_guarantor_id || row.guarantor_id)}>
                <td>
                  <div>{formatDisplayText(row.full_name)}</div>
                  <div>{formatDisplayText(row.relationship_to_client)}</div>
                </td>
                <td>
                  <div>{formatMoney(row.guarantee_amount)}</div>
                  <div>{formatDisplayText(row.liability_type)}</div>
                </td>
                <td>
                  <div>{formatDisplayText(row.phone)}</div>
                  <div>{formatDisplayText(row.national_id)}</div>
                </td>
                <td>{formatDisplayText(row.note)}</td>
                <td>
                  <button
                    type="button"
                    disabled={removeGuarantorMutation.isPending}
                    onClick={() => {
                      removeGuarantorMutation.mutate(Number(row.loan_guarantor_id), {
                        onSuccess: () => {
                          pushToast({ type: 'success', message: 'Guarantor unlinked from loan.' })
                        },
                        onError: () => {
                          pushToast({ type: 'error', message: 'Failed to unlink guarantor.' })
                        },
                      })
                    }}
                  >
                    {removeGuarantorMutation.isPending ? 'Removing...' : 'Unlink'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No guarantors linked.</p>) : null}

      {activeWorkspace === 'security' ? <h2>Collateral</h2> : null}
      {activeWorkspace === 'security' ? (
      <div className={styles.card}>
        <p>Link collateral asset ID to this loan.</p>
        <div className={styles.row}>
          <input
            type="text"
            placeholder="Search collateral by description, registration, logbook, or title"
            value={collateralSearch}
            onChange={(event) => setCollateralSearch(event.target.value)}
          />
          <input
            type="number"
            min={1}
            placeholder="Collateral asset ID"
            value={collateralAssetId}
            onChange={(event) => setCollateralAssetId(event.target.value)}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Forced sale value (optional)"
            value={forcedSaleValue}
            onChange={(event) => setForcedSaleValue(event.target.value)}
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={collateralNote}
            onChange={(event) => setCollateralNote(event.target.value)}
          />
          <button
            type="button"
            disabled={addCollateralMutation.isPending || !Number.isInteger(Number(collateralAssetId)) || Number(collateralAssetId) <= 0}
            onClick={() => {
              const payload: Record<string, unknown> = {
                collateralAssetId: Number(collateralAssetId),
              }
              if (forcedSaleValue.trim()) {
                payload.forcedSaleValue = Number(forcedSaleValue)
              }
              if (collateralNote.trim()) {
                payload.note = collateralNote.trim()
              }
              addCollateralMutation.mutate(payload, {
                onSuccess: () => {
                  pushToast({ type: 'success', message: 'Collateral linked to loan.' })
                  setCollateralAssetId('')
                  setForcedSaleValue('')
                  setCollateralNote('')
                },
                onError: (error) => {
                  pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to link collateral.') })
                },
              })
            }}
          >
            {addCollateralMutation.isPending ? 'Linking...' : 'Link collateral'}
          </button>
        </div>
        {trimmedCollateralSearch.length >= 2 ? (
          collateralLookupQuery.isLoading ? <p>Searching collateral...</p> : collateralLookupQuery.data?.data.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Asset</th>
                  <th>Owner</th>
                  <th>Estimated value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(collateralLookupQuery.data?.data ?? []).map((row) => {
                  const isLinked = linkedCollateralIds.has(Number(row.id))
                  return (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>
                        <div>{formatDisplayText(row.asset_type)}</div>
                        <div>{formatDisplayText(row.description)}</div>
                      </td>
                      <td>
                        <div>{formatDisplayText(row.owner_name)}</div>
                        <div>{formatDisplayText(row.ownership_type)}</div>
                      </td>
                      <td>{formatMoney(row.estimated_value)}</td>
                      <td>
                        <button
                          type="button"
                          disabled={isLinked}
                          onClick={() => {
                            setCollateralAssetId(String(row.id))
                            setCollateralSearch(formatDisplayText(row.description, String(row.id)))
                          }}
                        >
                          {isLinked ? 'Linked' : 'Use'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <p>No collateral matches found.</p>
        ) : null}
      </div>
      ) : null}

      {activeWorkspace === 'security' ? (collateralRows.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Coverage</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {collateralRows.map((item, index) => (
              <tr key={String(item.loan_collateral_id || item.collateral_asset_id || index)}>
                <td>
                  <div>{resolveDisplayText([item.asset_type, item.type, item.collateral_type], 'Unknown')}</div>
                  <div>{formatDisplayText(item.description)}</div>
                </td>
                <td>
                  <div>{resolveDisplayText([item.forced_sale_value, item.market_value, item.value])}</div>
                  <div>Lien rank: {formatDisplayText(item.lien_rank)}</div>
                </td>
                <td>
                  <div>{formatDisplayText(item.owner_name)}</div>
                  <div>{formatDisplayText(item.ownership_type)}</div>
                </td>
                <td>{formatDisplayText(item.status)}</td>
                <td>
                  <div className={styles.inlineActions}>
                    <button
                      type="button"
                      disabled={removeCollateralMutation.isPending || releaseCollateralMutation.isPending}
                      onClick={() => {
                        removeCollateralMutation.mutate(Number(item.loan_collateral_id), {
                          onSuccess: () => {
                            pushToast({ type: 'success', message: 'Collateral unlinked from loan.' })
                          },
                          onError: () => {
                            pushToast({ type: 'error', message: 'Failed to unlink collateral.' })
                          },
                        })
                      }}
                    >
                      {removeCollateralMutation.isPending ? 'Unlinking...' : 'Unlink'}
                    </button>
                    <button
                      type="button"
                      disabled={removeCollateralMutation.isPending || releaseCollateralMutation.isPending}
                      onClick={() => {
                        releaseCollateralMutation.mutate(Number(item.loan_collateral_id), {
                          onSuccess: () => {
                            pushToast({ type: 'success', message: 'Collateral released from loan.' })
                          },
                          onError: () => {
                            pushToast({ type: 'error', message: 'Failed to release collateral.' })
                          },
                        })
                      }}
                    >
                      {releaseCollateralMutation.isPending ? 'Releasing...' : 'Release'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No collateral linked.</p>) : null}
    </div>
  )
}
