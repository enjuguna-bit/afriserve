import type { LoanWorkflow, PendingApprovalLoanRecord } from '../../../types/loan'

function normalizeWorkflowValue(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

export function formatWorkflowText(value: string | null | undefined, fallback = '-'): string {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) {
    return fallback
  }

  return normalizedValue
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function getLoanActionState(status: string | null | undefined, workflow?: LoanWorkflow | null) {
  const normalizedStatus = normalizeWorkflowValue(status || workflow?.loan_status)
  const approvalBlockers = Array.isArray(workflow?.approval_blockers)
    ? workflow.approval_blockers.filter((blocker) => String(blocker || '').trim().length > 0)
    : []
  const showApprovalControls = normalizedStatus === 'pending_approval'
  const showFundingWorkspace = Boolean(workflow?.can_disburse) || normalizedStatus === 'approved'
  const showRecoveryControls = ['approved', 'active', 'restructured'].includes(normalizedStatus)
  const canDisburse = workflow?.can_disburse ?? showFundingWorkspace
  const canServe = workflow?.can_record_repayment ?? ['active', 'restructured'].includes(normalizedStatus)
  const canTopUp = workflow?.can_request_top_up ?? canServe
  const canRefinance = workflow?.can_request_refinance ?? canServe
  const canExtendTerm = workflow?.can_extend_term ?? canServe
  const approvalReady = showApprovalControls
    ? workflow?.can_approve ?? approvalBlockers.length === 0
    : false

  return {
    normalizedStatus,
    statusLabel: formatWorkflowText(status, 'Unknown'),
    lifecycleStage: workflow?.lifecycle_stage || normalizedStatus || 'unknown',
    lifecycleStageLabel: workflow?.lifecycle_stage_label || formatWorkflowText(workflow?.lifecycle_stage, 'Unknown'),
    approvalBlockers,
    approvalReady,
    canDisburse,
    canServe,
    canTopUp,
    canRefinance,
    canExtendTerm,
    showApprovalControls,
    showFundingWorkspace,
    showRecoveryControls,
    defaultWorkspaceView: showFundingWorkspace || showApprovalControls ? 'operations' as const : 'overview' as const,
    focusMessage: showFundingWorkspace
      ? 'Funding this loan is the next operational step.'
      : showApprovalControls
        ? approvalReady
          ? 'This application is ready for approval and funding handoff.'
          : 'Resolve the outstanding blockers before approval can proceed.'
        : canServe
          ? 'This loan is active and ready for servicing operations.'
          : 'Review lifecycle details before taking the next action.',
  }
}

export function getPendingApprovalReviewState(loan: PendingApprovalLoanRecord) {
  const approvalBlockers = Array.isArray(loan.approval_blockers)
    ? loan.approval_blockers.filter((blocker) => String(blocker || '').trim().length > 0)
    : []
  const approvalReady = Number(loan.approval_ready || 0) === 1 && approvalBlockers.length === 0

  return {
    approvalReady,
    approvalBlockers,
    workflowStageLabel: formatWorkflowText(loan.workflow_stage, 'Loan Application'),
    loanStatusLabel: formatWorkflowText(loan.status, 'Pending Approval'),
    readinessLabel: approvalReady ? 'Ready to approve' : 'Needs officer follow-up',
  }
}
