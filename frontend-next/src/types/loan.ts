import type { ClientOnboardingStatus } from './client'

export type LoanRecord = {
  id: number
  client_id: number
  client_name?: string
  principal: number
  expected_total: number
  repaid_total: number
  balance: number
  status: string
  branch_code?: string | null
  officer_name?: string | null
  disbursed_at?: string | null
  interest_rate?: number
  term_weeks?: number | null
  registration_fee?: number | null
  processing_fee?: number | null
  pending_installments?: number
  overdue_installments?: number
  paid_installments?: number
  total_installments?: number
  next_due_date?: string | null
  overdue_amount?: number
  guarantor_count?: number
  collateral_count?: number
  workflow_stage?: string
}

export type LoanPagedResponse = {
  data: LoanRecord[]
  paging: {
    total: number
    limit: number
    offset: number
  }
  sort: {
    sortBy: string
    sortOrder: string
  }
}

export type CreateLoanPayload = {
  clientId: number
  principal: number
  termWeeks: number
  productId?: number
  interestRate?: number
  registrationFee?: number
  processingFee?: number
  branchId?: number
  officerId?: number
  purpose?: string
}

export type LoanWorkflow = {
  loan_id: number
  client_id: number
  branch_id: number | null
  loan_status: string
  lifecycle_stage: string
  lifecycle_stage_label: string
  funding_stage: string
  funding_stage_label: string
  servicing_stage: string
  servicing_stage_label: string
  recovery_stage: string
  recovery_stage_label: string
  archive_state: string
  archive_state_label: string
  disbursed_at: string | null
  maturity_date: string | null
  current_dpd: number
  par_bucket: string
  balance: number
  guarantor_count: number
  collateral_count: number
  installment_summary: {
    total_installments: number
    pending_installments: number
    overdue_installments: number
    paid_installments: number
    pending_amount: number
    overdue_amount: number
    next_due_date: string | null
  }
  client_onboarding: ClientOnboardingStatus & Record<string, unknown>
  approval_blockers: string[]
  can_approve: boolean
  can_disburse: boolean
  can_record_repayment: boolean
  can_request_top_up: boolean
  can_request_refinance: boolean
  can_extend_term: boolean
}

export type LoanDisbursementPayload = {
  notes?: string
  amount?: number
  finalDisbursement?: boolean
}

export type LoanTopUpPayload = {
  additionalPrincipal: number
  newTermWeeks?: number
  note?: string
}

export type LoanRefinancePayload = {
  newInterestRate: number
  newTermWeeks: number
  additionalPrincipal?: number
  note?: string
}

export type LoanTermExtensionPayload = {
  newTermWeeks: number
  note?: string
}

export type LoanDisbursementHistory = {
  loanId: number
  approvedPrincipal: number
  totalDisbursed: number
  remainingPrincipal: number
  tranches: Array<{
    id: number
    tranche_number: number
    amount: number
    disbursed_at: string
    disbursed_by_user_id: number | null
    note: string | null
    is_final: boolean
    created_at: string
  }>
}

export type LoanContractHistory = {
  loanId: number
  versions: Array<{
    id: number
    version_number: number
    event_type: string
    principal: number
    interest_rate: number
    term_weeks: number
    expected_total: number
    repaid_total: number
    balance: number
    snapshot: Record<string, unknown> | null
    note: string | null
    created_by_user_id: number | null
    created_at: string
  }>
}

export type LoanLifecycleEvent = {
  id: string
  at: string
  source_type: string
  event_type: string
  title: string
  summary: string
  stage: string
  metadata: Record<string, unknown>
}

export type LoanLifecycleEventResponse = {
  loanId: number
  currentStatus: string
  total: number
  events: LoanLifecycleEvent[]
}

export type LoanUnderwritingAssessment = {
  loan_id: number
  client_id: number
  branch_id: number | null
  principal: number
  expected_total: number
  balance: number
  term_weeks: number
  guarantor_count: number
  collateral_count: number
  support_income_total: number
  estimated_weekly_installment: number
  estimated_monthly_installment: number
  repayment_to_support_income_ratio: number | null
  collateral_value_total: number
  collateral_coverage_ratio: number | null
  guarantee_amount_total: number
  guarantee_coverage_ratio: number | null
  business_years: number | null
  kyc_status: string
  risk_band: string
  policy_decision: string
  policy_flags: string[]
  override_decision: string | null
  override_reason: string | null
  assessed_at: string
  updated_at: string
}

export type LoanGuarantorRecord = {
  loan_guarantor_id?: number
  loan_id: number
  guarantor_id: number
  guarantee_amount: number
  relationship_to_client?: string | null
  liability_type?: string | null
  note?: string | null
  created_at?: string
  full_name?: string | null
  phone?: string | null
  national_id?: string | null
  physical_address?: string | null
  occupation?: string | null
  employer_name?: string | null
  monthly_income?: number
}

export type CreateLoanGuarantorPayload = {
  guarantorId: number
  guaranteeAmount?: number
  relationshipToClient?: string
  liabilityType?: 'individual' | 'corporate' | 'joint'
  note?: string
}

export type PendingApprovalLoanRecord = {
  loan_id: number
  client_id: number
  client_name: string
  principal: number
  expected_total: number
  balance: number
  term_weeks: number | null
  status: string
  submitted_at: string
  branch_id: number | null
  branch_name?: string | null
  branch_code?: string | null
  officer_id?: number | null
  officer_name?: string | null
  created_by_user_id?: number | null
  created_by_name?: string | null
  fee_payment_status: string
  guarantor_count: number
  collateral_count: number
  approval_ready: number
  approval_blockers: string[]
  workflow_stage: string
}

export type PendingApprovalLoanResponse = {
  data: PendingApprovalLoanRecord[]
  paging: {
    total: number
    limit: number
    offset: number
  }
  sort: {
    sortBy: string
    sortOrder: string
  }
}

export type LoanStatement = {
  generated_at: string
  loan: LoanRecord & Record<string, unknown>
  breakdown?: {
    principal_amount?: number
    interest_amount?: number
    registration_fee_amount?: number
    processing_fee_amount?: number
    fees_total?: number
    penalty_amount_accrued?: number
  } | null
  workflow?: LoanWorkflow
  underwriting?: LoanUnderwritingAssessment | null
  summary: {
    total_installments: number
    paid_installments: number
    overdue_installments: number
    total_due: number
    total_paid: number
    total_outstanding: number
    repayment_count: number
    total_repayments: number
    total_applied?: number
    first_repayment_at: string | null
    last_repayment_at: string | null
  }
  amortization?: Array<{
    installment_number?: number
    due_date?: string | null
    status?: string | null
    amount_due?: number
    amount_paid?: number
    amount_outstanding?: number
    penalty_amount_accrued?: number
  }>
  repayments: Array<{
    id: number
    amount: number
    applied_amount?: number
    penalty_amount?: number
    interest_amount?: number
    principal_amount?: number
    overpayment_amount?: number
    paid_at: string
    note: string | null
    payment_channel?: string | null
    payment_provider?: string | null
    external_receipt?: string | null
    external_reference?: string | null
    payer_phone?: string | null
    recorded_by_name?: string | null
  }>
}

export type LoanRepaymentPayload = {
  amount: number
  note?: string
  paymentChannel?: string
  paymentProvider?: string
  externalReceipt?: string
  externalReference?: string
  payerPhone?: string
}
