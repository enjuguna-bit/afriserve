import type { LoanWorkflow, PendingApprovalLoanRecord } from '../../../types/loan'

type PendingApprovalReviewer = {
  id?: number | null
  role?: string | null
  roles?: Array<string | null | undefined> | null
  permissions?: Array<string | null | undefined> | null
} | null | undefined

const APPROVE_LOAN_ROLES = ['admin', 'operations_manager', 'finance', 'area_manager']
const REJECT_LOAN_ROLES = ['admin', 'operations_manager']

function normalizeWorkflowValue(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function appendUniqueBlocker(blockers: string[], blocker: string) {
  const normalizedBlocker = String(blocker || '').trim()
  if (!normalizedBlocker || blockers.includes(normalizedBlocker)) {
    return
  }

  blockers.push(normalizedBlocker)
}

function normalizeReviewerRoles(reviewer: PendingApprovalReviewer): string[] {
  if (!reviewer || typeof reviewer !== 'object') {
    return []
  }

  const seenRoles = new Set<string>()
  const normalizedRoles: string[] = []
  const sourceRoles = [
    ...(Array.isArray(reviewer.roles) ? reviewer.roles : []),
    reviewer.role,
  ]

  sourceRoles.forEach((role) => {
    const normalizedRole = normalizeWorkflowValue(role)
    if (!normalizedRole || seenRoles.has(normalizedRole)) {
      return
    }

    seenRoles.add(normalizedRole)
    normalizedRoles.push(normalizedRole)
  })

  return normalizedRoles
}

function normalizeReviewerPermissions(reviewer: PendingApprovalReviewer): string[] | null {
  if (!reviewer || typeof reviewer !== 'object' || !Array.isArray(reviewer.permissions)) {
    return null
  }

  return reviewer.permissions
    .map((permission) => String(permission || '').trim())
    .filter(Boolean)
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

export function getPendingApprovalReviewState(
  loan: PendingApprovalLoanRecord,
  reviewer?: PendingApprovalReviewer,
) {
  const workflowBlockers = Array.isArray(loan.approval_blockers)
    ? loan.approval_blockers.filter((blocker) => String(blocker || '').trim().length > 0)
    : []
  const approvalReady = Number(loan.approval_ready || 0) === 1 && workflowBlockers.length === 0
  const reviewerRoles = normalizeReviewerRoles(reviewer)
  const reviewerPermissions = normalizeReviewerPermissions(reviewer)
  const reviewerId = Number(reviewer && typeof reviewer === 'object' ? reviewer.id || 0 : 0)
  const isAdminReviewer = reviewerRoles.includes('admin')
  const approveAccessBlockers = [...workflowBlockers]
  const rejectAccessBlockers: string[] = []

  if (reviewerRoles.length > 0 && !reviewerRoles.some((role) => APPROVE_LOAN_ROLES.includes(role))) {
    appendUniqueBlocker(approveAccessBlockers, 'You do not have an approval role for pending loan applications.')
  }
  if (reviewerPermissions && !reviewerPermissions.includes('loan.approve')) {
    appendUniqueBlocker(approveAccessBlockers, 'You do not have permission to approve loans.')
  }
  if (reviewerRoles.length > 0 && !reviewerRoles.some((role) => REJECT_LOAN_ROLES.includes(role))) {
    appendUniqueBlocker(rejectAccessBlockers, 'You do not have a rejection role for pending loan applications.')
  }
  if (reviewerPermissions && !reviewerPermissions.includes('loan.reject')) {
    appendUniqueBlocker(rejectAccessBlockers, 'You do not have permission to reject loans.')
  }

  if (!isAdminReviewer && reviewerId > 0) {
    if (Number(loan.created_by_user_id || 0) === reviewerId) {
      appendUniqueBlocker(approveAccessBlockers, 'Maker-checker policy blocks you from approving a loan you created.')
      appendUniqueBlocker(rejectAccessBlockers, 'Maker-checker policy blocks you from rejecting a loan you created.')
    }
    if (Number(loan.officer_id || 0) > 0 && Number(loan.officer_id || 0) === reviewerId) {
      appendUniqueBlocker(approveAccessBlockers, 'Maker-checker policy blocks you from approving a loan assigned to you as officer.')
      appendUniqueBlocker(rejectAccessBlockers, 'Maker-checker policy blocks you from rejecting a loan assigned to you as officer.')
    }
  }

  const canApprove = approvalReady && approveAccessBlockers.length === 0
  const canReject = rejectAccessBlockers.length === 0

  return {
    approvalReady,
    canApprove,
    canReject,
    approvalBlockers: approveAccessBlockers,
    rejectBlockers: rejectAccessBlockers,
    workflowStageLabel: formatWorkflowText(loan.workflow_stage, 'Loan Application'),
    loanStatusLabel: formatWorkflowText(loan.status, 'Pending Approval'),
    readinessLabel: canApprove
      ? 'Ready to approve'
      : approvalReady
        ? 'Approval restricted'
        : 'Needs officer follow-up',
  }
}
