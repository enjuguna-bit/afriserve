import { useState } from 'react'
import axios from 'axios'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AsyncState } from '../../../components/common/AsyncState'
import { useToastStore } from '../../../store/toastStore'
import { hasAnyRole } from '../../../app/roleAccess'
import { useAuth } from '../../../hooks/useAuth'
import { getLoanStatement } from '../../../services/loanService'
import { downloadBlob } from '../../../utils/fileDownload'
import type { ClientCollateralAssetType, ClientCollateralOwnershipType, ClientKycStatus } from '../../../types/client'
import type { LoanStatement } from '../../../types/loan'
import {
  useClient,
  useClientCollaterals,
  useClientGuarantors,
  useClientOnboardingStatus,
  useCreateClientCollateral,
  useCreateClientGuarantor,
  useRecordClientFeePayment,
  useUpdateClientKyc,
} from '../hooks/useClients'
import styles from './ClientDetailPage.module.css'

const CLIENT_COLLATERAL_ASSET_TYPES: Array<{ value: ClientCollateralAssetType; label: string }> = [
  { value: 'chattel', label: 'Chattel' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'land', label: 'Land' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'machinery', label: 'Machinery' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'livestock', label: 'Livestock' },
  { value: 'savings', label: 'Savings / Deposit' },
]

const CLIENT_COLLATERAL_OWNERSHIP_TYPES: Array<{ value: ClientCollateralOwnershipType; label: string }> = [
  { value: 'client', label: 'Client' },
  { value: 'guarantor', label: 'Guarantor' },
  { value: 'third_party', label: 'Third party' },
]

type GuarantorFormState = {
  fullName: string
  phone: string
  nationalId: string
  physicalAddress: string
  occupation: string
  employerName: string
  monthlyIncome: string
  guaranteeAmount: string
}

type CollateralFormState = {
  assetType: ClientCollateralAssetType
  description: string
  estimatedValue: string
  ownershipType: ClientCollateralOwnershipType
  ownerName: string
  ownerNationalId: string
  registrationNumber: string
  logbookNumber: string
  titleNumber: string
  locationDetails: string
  valuationDate: string
}

type FeeFormState = {
  amount: string
  paymentReference: string
  paidAt: string
  note: string
}

type KycFormState = {
  status: ClientKycStatus
  note: string
}

const EMPTY_GUARANTOR_FORM: GuarantorFormState = {
  fullName: '',
  phone: '',
  nationalId: '',
  physicalAddress: '',
  occupation: '',
  employerName: '',
  monthlyIncome: '',
  guaranteeAmount: '',
}

const EMPTY_COLLATERAL_FORM: CollateralFormState = {
  assetType: 'chattel',
  description: '',
  estimatedValue: '',
  ownershipType: 'client',
  ownerName: '',
  ownerNationalId: '',
  registrationNumber: '',
  logbookNumber: '',
  titleNumber: '',
  locationDetails: '',
  valuationDate: '',
}

const EMPTY_FEE_FORM: FeeFormState = {
  amount: '',
  paymentReference: '',
  paidAt: '',
  note: '',
}

const EMPTY_KYC_FORM: KycFormState = {
  status: 'verified',
  note: '',
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

function toText(value: unknown, fallback = '-') {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : fallback
}

function toLabel(value: unknown, fallback = '-') {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return fallback
  }

  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatAmount(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
}

function formatCurrency(value: unknown) {
  return `Ksh ${formatAmount(value)}`
}

function formatDate(value: string | null | undefined, fallback = '-') {
  if (!value) {
    return fallback
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleDateString()
}

function formatDateTime(value: string | null | undefined, fallback = '-') {
  if (!value) {
    return fallback
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleString()
}

function compareClientLoansByRecency(
  left: { id: number; disbursed_at: string | null },
  right: { id: number; disbursed_at: string | null },
) {
  const leftTime = left.disbursed_at ? new Date(left.disbursed_at).getTime() : 0
  const rightTime = right.disbursed_at ? new Date(right.disbursed_at).getTime() : 0

  if (leftTime !== rightTime) {
    return rightTime - leftTime
  }

  return Number(right.id || 0) - Number(left.id || 0)
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildStatementFilename(fullName: string) {
  const safeName = String(fullName || 'Borrower').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Borrower'
  const timestamp = new Date().toString().replace(/:/g, '')
  return `${safeName} statement_${timestamp}.html`
}

function downloadHtmlDocument(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  downloadBlob(blob, filename)
}

function buildBorrowerStatementHtml(options: {
  client: {
    full_name: string
    phone: string | null
    national_id: string | null
    kra_pin: string | null
    branch_name?: string | null
    assigned_officer_name?: string | null
    residential_address?: string | null
    business_type?: string | null
    business_location?: string | null
  }
  onboarding?: {
    readyForLoanApplication?: boolean
    nextStep?: string | null
    feePaymentStatus?: string | null
    kycStatus?: string | null
  } | null
  guarantors: Array<{
    full_name?: string | null
    phone?: string | null
    national_id?: string | null
    occupation?: string | null
    monthly_income?: number
    guarantee_amount?: number
  }>
  collaterals: Array<{
    asset_type?: string | null
    description?: string | null
    estimated_value?: number
    ownership_type?: string | null
    status?: string | null
  }>
  loanStatements: LoanStatement[]
  portfolioSummary: {
    totalLoans: number
    activeLoans: number
    totalPrincipal: number
    totalOutstandingBalance: number
  }
}) {
  const { client, onboarding, guarantors, collaterals, loanStatements, portfolioSummary } = options
  const guarantorRows = guarantors.length > 0
    ? guarantors.map((guarantor) => `
        <tr>
          <td>${escapeHtml(toText(guarantor.full_name))}</td>
          <td>${escapeHtml(toText(guarantor.phone))}</td>
          <td>${escapeHtml(toText(guarantor.national_id))}</td>
          <td>${escapeHtml(toText(guarantor.occupation))}</td>
          <td>${escapeHtml(formatCurrency(guarantor.monthly_income || 0))}</td>
          <td>${escapeHtml(formatCurrency(guarantor.guarantee_amount || 0))}</td>
        </tr>`).join('')
    : '<tr><td colspan="6">No guarantors linked to this borrower.</td></tr>'
  const collateralRows = collaterals.length > 0
    ? collaterals.map((collateral) => `
        <tr>
          <td>${escapeHtml(toLabel(collateral.asset_type, '-'))}</td>
          <td>${escapeHtml(toText(collateral.description))}</td>
          <td>${escapeHtml(formatCurrency(collateral.estimated_value || 0))}</td>
          <td>${escapeHtml(toLabel(collateral.ownership_type, '-'))}</td>
          <td>${escapeHtml(toLabel(collateral.status, '-'))}</td>
        </tr>`).join('')
    : '<tr><td colspan="5">No collateral linked to this borrower.</td></tr>'
  const loanSections = loanStatements.length > 0
    ? loanStatements.map((statement) => {
      const scheduleRows = Array.isArray(statement.amortization) && statement.amortization.length > 0
        ? statement.amortization.map((row) => `
            <tr>
              <td>${escapeHtml(String(row.installment_number || '-'))}</td>
              <td>${escapeHtml(formatDate(row.due_date || null))}</td>
              <td>${escapeHtml(toLabel(row.status, '-'))}</td>
              <td>${escapeHtml(formatCurrency(row.amount_due || 0))}</td>
              <td>${escapeHtml(formatCurrency(row.amount_paid || 0))}</td>
              <td>${escapeHtml(formatCurrency(row.amount_outstanding || 0))}</td>
              <td>${escapeHtml(formatCurrency(row.penalty_amount_accrued || 0))}</td>
            </tr>`).join('')
        : '<tr><td colspan="7">No schedule rows available for this loan.</td></tr>'
      const repaymentRows = statement.repayments.length > 0
        ? statement.repayments.map((repayment) => {
            const appliedAmount = Number(repayment.applied_amount ?? repayment.amount ?? 0)
            const allocationParts = [
              Number(repayment.principal_amount || 0) > 0 ? `Principal ${formatCurrency(repayment.principal_amount || 0)}` : null,
              Number(repayment.interest_amount || 0) > 0 ? `Interest ${formatCurrency(repayment.interest_amount || 0)}` : null,
              Number(repayment.penalty_amount || 0) > 0 ? `Penalty ${formatCurrency(repayment.penalty_amount || 0)}` : null,
              Number(repayment.overpayment_amount || 0) > 0 ? `Overpay ${formatCurrency(repayment.overpayment_amount || 0)}` : null,
            ].filter(Boolean)
            const allocationLabel = allocationParts.length > 0 ? allocationParts.join(' ? ') : '-'
            return `
            <tr>
              <td>${escapeHtml(formatDateTime(repayment.paid_at))}</td>
              <td>${escapeHtml(formatCurrency(repayment.amount || 0))}</td>
              <td>${escapeHtml(formatCurrency(appliedAmount))}</td>
              <td>${escapeHtml(allocationLabel)}</td>
              <td>${escapeHtml(toText(repayment.payment_channel || repayment.payment_provider || '-'))}</td>
              <td>${escapeHtml(toText(repayment.external_receipt || repayment.external_reference || '-'))}</td>
              <td>${escapeHtml(toText(repayment.recorded_by_name || '-'))}</td>
            </tr>`
          }).join('')
        : '<tr><td colspan="7">No repayments recorded for this loan.</td></tr>'
      return `
        <section class="loan-card">
          <div class="loan-header">
            <div>
              <h2>Loan #${escapeHtml(String(statement.loan.id))}</h2>
              <p>Disbursed ${escapeHtml(formatDate(statement.loan.disbursed_at || null))} • Status ${escapeHtml(toLabel(statement.loan.status, '-'))}</p>
            </div>
            <div class="badge">${escapeHtml(toLabel(statement.workflow?.lifecycle_stage_label || statement.workflow?.lifecycle_stage || statement.loan.status, '-'))}</div>
          </div>
          <div class="metric-grid">
            <div class="metric"><span>Principal</span><strong>${escapeHtml(formatCurrency(statement.loan.principal || 0))}</strong></div>
            <div class="metric"><span>Expected total</span><strong>${escapeHtml(formatCurrency(statement.loan.expected_total || 0))}</strong></div>
            <div class="metric"><span>Outstanding</span><strong>${escapeHtml(formatCurrency(statement.summary.total_outstanding || statement.loan.balance || 0))}</strong></div>
            <div class="metric"><span>Total repaid</span><strong>${escapeHtml(formatCurrency(statement.summary.total_applied ?? statement.summary.total_repayments ?? statement.loan.repaid_total ?? 0))}</strong></div>
            <div class="metric"><span>Interest</span><strong>${escapeHtml(formatCurrency(statement.breakdown?.interest_amount || 0))}</strong></div>
            <div class="metric"><span>Fees</span><strong>${escapeHtml(formatCurrency(statement.breakdown?.fees_total || 0))}</strong></div>
          </div>
          <h3>Installment schedule</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Due date</th>
                <th>Status</th>
                <th>Amount due</th>
                <th>Amount paid</th>
                <th>Outstanding</th>
                <th>Penalty</th>
              </tr>
            </thead>
            <tbody>${scheduleRows}</tbody>
          </table>
          <h3>Repayment history</h3>
          <table>
            <thead>
              <tr>
                <th>Paid at</th>
                <th>Amount</th>
                <th>Applied</th>
                <th>Allocation</th>
                <th>Channel</th>
                <th>Receipt / Ref</th>
                <th>Recorded by</th>
              </tr>
            </thead>
            <tbody>${repaymentRows}</tbody>
          </table>
        </section>`
    }).join('')
    : '<p>No loans found for this borrower.</p>'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(client.full_name)} Statement</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 32px; color: #203149; background: #f7f4ee; }
    .sheet { max-width: 1080px; margin: 0 auto; background: #fff; padding: 32px; border: 1px solid #d9dfeb; }
    h1, h2, h3, p { margin-top: 0; }
    .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #203149; padding-bottom: 16px; margin-bottom: 24px; }
    .meta { color: #5f6f84; }
    .metric-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 20px 0; }
    .metric { border: 1px solid #d9dfeb; padding: 12px; border-radius: 12px; background: #f9fbfd; }
    .metric span { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #5f6f84; }
    .metric strong { display: block; margin-top: 6px; font-size: 18px; }
    .section { margin-top: 24px; }
    .loan-card { margin-top: 24px; padding-top: 20px; border-top: 1px solid #d9dfeb; }
    .loan-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .badge { border-radius: 999px; padding: 8px 12px; background: #e9eef5; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #d9dfeb; padding: 8px 10px; text-align: left; font-size: 13px; vertical-align: top; }
    th { background: #eef3f8; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <h1>${escapeHtml(client.full_name)} Statement</h1>
        <p class="meta">Generated ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>
      </div>
      <div>
        <p><strong>Branch:</strong> ${escapeHtml(toText(client.branch_name))}</p>
        <p><strong>Officer:</strong> ${escapeHtml(toText(client.assigned_officer_name))}</p>
      </div>
    </div>

    <div class="section">
      <h2>Borrower profile</h2>
      <div class="metric-grid">
        <div class="metric"><span>Phone</span><strong>${escapeHtml(toText(client.phone))}</strong></div>
        <div class="metric"><span>National ID</span><strong>${escapeHtml(toText(client.national_id))}</strong></div>
        <div class="metric"><span>KRA PIN</span><strong>${escapeHtml(toText(client.kra_pin))}</strong></div>
        <div class="metric"><span>KYC</span><strong>${escapeHtml(toLabel(onboarding?.kycStatus, '-'))}</strong></div>
        <div class="metric"><span>Fee payment</span><strong>${escapeHtml(toLabel(onboarding?.feePaymentStatus, '-'))}</strong></div>
        <div class="metric"><span>Ready for loan</span><strong>${escapeHtml(onboarding?.readyForLoanApplication ? 'Yes' : 'No')}</strong></div>
      </div>
      <p><strong>Address:</strong> ${escapeHtml(toText(client.residential_address))}</p>
      <p><strong>Business:</strong> ${escapeHtml(toText(client.business_type))} ${escapeHtml(toText(client.business_location, ''))}</p>
      <p><strong>Next step:</strong> ${escapeHtml(toLabel(onboarding?.nextStep, 'Ready for next action'))}</p>
    </div>

    <div class="section">
      <h2>Portfolio summary</h2>
      <div class="metric-grid">
        <div class="metric"><span>Total loans</span><strong>${escapeHtml(String(portfolioSummary.totalLoans))}</strong></div>
        <div class="metric"><span>Active loans</span><strong>${escapeHtml(String(portfolioSummary.activeLoans))}</strong></div>
        <div class="metric"><span>Principal disbursed</span><strong>${escapeHtml(formatCurrency(portfolioSummary.totalPrincipal))}</strong></div>
        <div class="metric"><span>Outstanding balance</span><strong>${escapeHtml(formatCurrency(portfolioSummary.totalOutstandingBalance))}</strong></div>
      </div>
    </div>

    <div class="section">
      <h2>Guarantors</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>National ID</th>
            <th>Occupation</th>
            <th>Monthly income</th>
            <th>Guarantee amount</th>
          </tr>
        </thead>
        <tbody>${guarantorRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Collateral</h2>
      <table>
        <thead>
          <tr>
            <th>Asset type</th>
            <th>Description</th>
            <th>Estimated value</th>
            <th>Ownership</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${collateralRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Loan statements</h2>
      ${loanSections}
    </div>
  </div>
</body>
</html>`
}

function menuGlyph(label: string) {
  const normalized = label.trim().toLowerCase()

  if (normalized.includes('basic')) {
    return 'BI'
  }
  if (normalized.includes('statement')) {
    return 'ST'
  }
  if (normalized.includes('attachment')) {
    return 'AT'
  }
  if (normalized.includes('notes')) {
    return 'NT'
  }
  if (normalized.includes('more')) {
    return 'MI'
  }
  if (normalized.includes('business')) {
    return 'BD'
  }
  if (normalized.includes('guarantor')) {
    return 'GD'
  }
  if (normalized.includes('collateral')) {
    return 'CD'
  }

  return 'AC'
}

function toIsoDateTimeOrUndefined(value: string) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return undefined
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }

  return parsed.toISOString()
}

export function ClientDetailPage() {
  const { id } = useParams()
  const clientId = Number(id)
  const { user } = useAuth()
  const location = useLocation()
  const justCreated = Boolean((location.state as Record<string, unknown> | null)?.justCreated)
  const pushToast = useToastStore((state) => state.pushToast)
  const [activePanel, setActivePanel] = useState<'basic-info' | 'statement' | 'attachments' | 'notes' | 'more-info' | 'business-details' | 'guarantor-details' | 'collateral-details' | 'actions'>(justCreated ? 'actions' : 'basic-info')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [guarantorForm, setGuarantorForm] = useState<GuarantorFormState>(EMPTY_GUARANTOR_FORM)
  const [collateralForm, setCollateralForm] = useState<CollateralFormState>(EMPTY_COLLATERAL_FORM)
  const [feeForm, setFeeForm] = useState<FeeFormState>(EMPTY_FEE_FORM)
  const [kycForm, setKycForm] = useState<KycFormState>(EMPTY_KYC_FORM)
  const [isGeneratingStatement, setIsGeneratingStatement] = useState(false)

  const clientQuery = useClient(clientId)
  const onboardingQuery = useClientOnboardingStatus(clientId)
  const guarantorsQuery = useClientGuarantors(clientId)
  const collateralsQuery = useClientCollaterals(clientId)
  const createGuarantorMutation = useCreateClientGuarantor(clientId)
  const createCollateralMutation = useCreateClientCollateral(clientId)
  const recordFeeMutation = useRecordClientFeePayment(clientId)
  const updateKycMutation = useUpdateClientKyc(clientId)

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return <AsyncState error errorText="Invalid client ID." />
  }

  if (clientQuery.isLoading) {
    return <AsyncState loading loadingText="Loading client details..." />
  }

  if (clientQuery.isError || !clientQuery.data) {
    return (
      <AsyncState
        error
        errorText="Unable to load client details."
        onRetry={() => {
          void clientQuery.refetch()
        }}
      />
    )
  }

  const client = clientQuery.data
  const onboarding = onboardingQuery.data
  const createLoanHref = `/loans/new?clientId=${client.id}`
  const canManageClient = hasAnyRole(user, ['admin', 'loan_officer'])
  const canCreateLoan = hasAnyRole(user, ['admin', 'loan_officer'])
  const clientReadyForLoanApplication = Boolean(onboarding?.readyForLoanApplication)
  const canStartLoanApplication = Boolean(canCreateLoan && clientReadyForLoanApplication)
  const sortedLoans = Array.isArray(client.loans) ? [...client.loans].sort(compareClientLoansByRecency) : []
  const totalLoans = sortedLoans.length
  const activeLoans = Array.isArray(client.loans)
    ? client.loans.filter((loan) => !['closed', 'rejected', 'written_off'].includes(String(loan.status || '').toLowerCase())).length
    : 0
  const totalPrincipal = Array.isArray(client.loans)
    ? client.loans.reduce((sum, loan) => sum + Number(loan.principal || 0), 0)
    : 0
  const totalOutstandingBalance = Array.isArray(client.loans)
    ? client.loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0)
    : 0
  const recentLoans = sortedLoans.slice(0, 5)
  const latestLoan = sortedLoans[0] || null
  const latestLoanStatus = String(latestLoan?.status || '').toLowerCase()
  const latestLoanCompleted = latestLoanStatus === 'closed'
  const isEligibleForRepeatLoan = Boolean(canStartLoanApplication && latestLoanCompleted && activeLoans === 0)
  const createLoanCtaLabel = totalLoans === 0
    ? 'Create the first loan'
    : (isEligibleForRepeatLoan ? 'Start next cycle' : 'Create loan for client')
  const workspaceMenu = [
    {
      title: 'Workflow',
      items: [
        { key: 'actions' as const, label: 'Actions' },
      ],
    },
    {
      title: 'Borrower 360',
      items: [
        { key: 'basic-info' as const, label: 'Basic Info' },
        { key: 'statement' as const, label: 'Statement' },
        { key: 'attachments' as const, label: 'Attachments' },
        { key: 'notes' as const, label: 'Notes' },
        { key: 'more-info' as const, label: 'More Info' },
      ],
    },
    {
      title: 'Borrower Structure',
      items: [
        { key: 'business-details' as const, label: 'Business Details' },
        { key: 'guarantor-details' as const, label: 'Guarantor Details' },
        { key: 'collateral-details' as const, label: 'Collateral Details' },
      ],
    },
  ]

  function switchPanel(panel: typeof activePanel) {
    setActivePanel(panel)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function submitGuarantor() {
    const fullName = guarantorForm.fullName.trim()
    if (fullName.length < 2) {
      pushToast({ type: 'error', message: 'Guarantor full name is required.' })
      return
    }

    const monthlyIncome = Number(guarantorForm.monthlyIncome)
    const guaranteeAmount = Number(guarantorForm.guaranteeAmount)
    if (!Number.isFinite(guaranteeAmount) || guaranteeAmount <= 0) {
      pushToast({ type: 'error', message: 'Guarantee amount must be greater than 0.' })
      return
    }

    createGuarantorMutation.mutate(
      {
        fullName,
        phone: guarantorForm.phone.trim() || undefined,
        nationalId: guarantorForm.nationalId.trim() || undefined,
        physicalAddress: guarantorForm.physicalAddress.trim() || undefined,
        occupation: guarantorForm.occupation.trim() || undefined,
        employerName: guarantorForm.employerName.trim() || undefined,
        monthlyIncome: Number.isFinite(monthlyIncome) && monthlyIncome >= 0 ? monthlyIncome : undefined,
        guaranteeAmount,
      },
      {
        onSuccess: () => {
          pushToast({ type: 'success', message: 'Guarantor added to client.' })
          setGuarantorForm(EMPTY_GUARANTOR_FORM)
        },
        onError: (error) => {
          pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to add guarantor.') })
        },
      },
    )
  }

  function submitCollateral() {
    const description = collateralForm.description.trim()
    if (description.length < 3) {
      pushToast({ type: 'error', message: 'Collateral description is required.' })
      return
    }

    const estimatedValue = Number(collateralForm.estimatedValue)
    if (!Number.isFinite(estimatedValue) || estimatedValue <= 0) {
      pushToast({ type: 'error', message: 'Estimated value must be greater than 0.' })
      return
    }

    createCollateralMutation.mutate(
      {
        assetType: collateralForm.assetType,
        description,
        estimatedValue,
        ownershipType: collateralForm.ownershipType,
        ownerName: collateralForm.ownerName.trim() || undefined,
        ownerNationalId: collateralForm.ownerNationalId.trim() || undefined,
        registrationNumber: collateralForm.registrationNumber.trim() || undefined,
        logbookNumber: collateralForm.logbookNumber.trim() || undefined,
        titleNumber: collateralForm.titleNumber.trim() || undefined,
        locationDetails: collateralForm.locationDetails.trim() || undefined,
        valuationDate: toIsoDateTimeOrUndefined(collateralForm.valuationDate),
      },
      {
        onSuccess: () => {
          pushToast({ type: 'success', message: 'Collateral added to client.' })
          setCollateralForm(EMPTY_COLLATERAL_FORM)
        },
        onError: (error) => {
          pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to add collateral.') })
        },
      },
    )
  }

  function submitFeePayment() {
    const amount = Number(feeForm.amount)
    recordFeeMutation.mutate(
      {
        amount: Number.isFinite(amount) && amount >= 0 ? amount : undefined,
        paymentReference: feeForm.paymentReference.trim() || undefined,
        paidAt: toIsoDateTimeOrUndefined(feeForm.paidAt),
        note: feeForm.note.trim() || undefined,
      },
      {
        onSuccess: () => {
          pushToast({ type: 'success', message: 'Client fee payment recorded.' })
          setFeeForm(EMPTY_FEE_FORM)
        },
        onError: (error) => {
          pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to record fee payment.') })
        },
      },
    )
  }

  function submitKycUpdate() {
    updateKycMutation.mutate(
      {
        status: kycForm.status,
        note: kycForm.note.trim() || undefined,
      },
      {
        onSuccess: () => {
          pushToast({ type: 'success', message: 'Client KYC updated.' })
          setKycForm((current) => ({ ...current, note: '' }))
        },
        onError: (error) => {
          pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to update client KYC.') })
        },
      },
    )
  }

  async function handleDownloadStatement() {
    if (isGeneratingStatement) {
      return
    }

    setIsGeneratingStatement(true)

    try {
      const loanStatements = (await Promise.all(
        (Array.isArray(client.loans) ? client.loans : []).map(async (loan) => {
          try {
            return await getLoanStatement(loan.id)
          } catch {
            return null
          }
        }),
      )).filter((statement): statement is LoanStatement => statement !== null)

      const html = buildBorrowerStatementHtml({
        client,
        onboarding,
        guarantors: Array.isArray(guarantorsQuery.data) ? guarantorsQuery.data : [],
        collaterals: Array.isArray(collateralsQuery.data) ? collateralsQuery.data : [],
        loanStatements,
        portfolioSummary: {
          totalLoans,
          activeLoans,
          totalPrincipal,
          totalOutstandingBalance,
        },
      })

      downloadHtmlDocument(html, buildStatementFilename(client.full_name))
      pushToast({
        type: 'success',
        message: loanStatements.length > 0
          ? `Borrower statement downloaded with ${loanStatements.length} loan section${loanStatements.length === 1 ? '' : 's'}.`
          : 'Borrower profile statement downloaded.',
      })
    } catch (error) {
      pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to generate borrower statement.') })
    } finally {
      setIsGeneratingStatement(false)
    }
  }

  return (
    <div className={styles.page}>
      {justCreated && !bannerDismissed ? (
        <div className={styles.justCreatedBanner} role="status">
          <div className={styles.justCreatedBannerContent}>
            <span className={styles.justCreatedBannerIcon} aria-hidden="true">{'\u2713'}</span>
            <div>
              <strong>Customer created successfully.</strong>
              <p>Complete the onboarding steps below to prepare them for their first loan.</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.justCreatedBannerClose}
            aria-label="Dismiss"
            onClick={() => setBannerDismissed(true)}
          >
            {'\u00d7'}
          </button>
        </div>
      ) : null}

      <div className={styles.header}>
        <div>
          <h1>Customer 360</h1>
          <p className={styles.muted}>Open the full borrower profile, onboarding progress, and loan context from one workspace.</p>
        </div>
        <div className={styles.actionBar}>
          <Link to="/clients">Back to borrowers</Link>
          {canManageClient ? <Link to={`/clients/${client.id}/edit`}>Edit client</Link> : null}
          {canStartLoanApplication ? <Link className={styles.primaryLink} to={createLoanHref}>{createLoanCtaLabel}</Link> : null}
          {canCreateLoan && onboarding && !clientReadyForLoanApplication ? (
            <button type="button" className={styles.secondaryButton} onClick={() => switchPanel('actions')}>
              Continue onboarding
            </button>
          ) : null}
        </div>
      </div>

      <section className={styles.summaryShell}>
        <aside className={styles.profileRail}>
          <div className={styles.profileHero}>
            {client.photo_url ? (
              <img className={styles.profilePhoto} src={client.photo_url} alt={client.full_name} />
            ) : (
              <div className={styles.profilePhotoFallback}>{client.full_name.slice(0, 1).toUpperCase()}</div>
            )}
            <div className={styles.profileCopy}>
              <h2>{toText(client.full_name)}</h2>
              <p>{toText(client.phone, 'No phone registered')}</p>
              <span className={Number(client.is_active || 0) === 1 ? styles.statusPillActive : styles.statusPillInactive}>
                {Number(client.is_active || 0) === 1 ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
          </div>

          <div className={styles.profilePanel}>
            <h3>Customer 360</h3>
            <div className={styles.quickMenuSections}>
              {workspaceMenu.map((section) => (
                <div key={section.title} className={styles.quickMenuSection}>
                  <div className={styles.quickMenuSectionTitle}>{section.title}</div>
                  <div className={styles.quickMenu}>
                    {section.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`${styles.quickMenuButton} ${activePanel === item.key ? styles.quickMenuButtonActive : ''}`}
                        onClick={() => switchPanel(item.key)}
                      >
                        <span className={styles.quickMenuIcon} aria-hidden="true">{menuGlyph(item.label)}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.profilePanel}>
            <h3>Assignment</h3>
            <dl className={styles.profileMetaList}>
              <div>
                <dt>Agent</dt>
                <dd>{toText(client.assigned_officer_name, 'Unassigned')}</dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{toText(client.branch_name)}</dd>
              </div>
              <div>
                <dt>National ID</dt>
                <dd>{toText(client.national_id)}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{toText(client.residential_address)}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <div className={styles.dashboardPane}>
          {!isEligibleForRepeatLoan && onboarding?.nextStep ? (
            <div className={styles.nextStepBanner}>
              <div className={styles.nextStepBannerIcon} aria-hidden="true">{'\u279c'}</div>
              <div className={styles.nextStepBannerContent}>
                <span className={styles.nextStepBannerEyebrow}>Next required step</span>
                <strong className={styles.nextStepBannerLabel}>{toLabel(onboarding.nextStep)}</strong>
              </div>
              <button
                type="button"
                className={styles.nextStepBannerCta}
                onClick={() => switchPanel('actions')}
              >
                Take Action
              </button>
            </div>
          ) : null}

          {isEligibleForRepeatLoan && latestLoan ? (
            <section className={styles.cycleBanner}>
              <div className={styles.cycleBannerCopy}>
                <span className={styles.cycleBannerEyebrow}>Loan completed</span>
                <h2>Previous cycle is fully paid.</h2>
                <p>
                  Loan #{latestLoan.id} is closed and this borrower has no open exposure. The next natural step is to start a fresh loan application.
                </p>
              </div>
              <div className={styles.cycleBannerActions}>
                <Link className={styles.primaryButton} to={createLoanHref}>Start next cycle</Link>
                <button type="button" className={styles.secondaryButton} onClick={() => switchPanel('actions')}>Open next actions</button>
              </div>
            </section>
          ) : null}

          <div className={styles.metricGrid}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Ready For Loan</span>
              <strong className={styles.metricValue}>{onboarding?.readyForLoanApplication ? 'YES' : 'NO'}</strong>
              <p className={styles.metricMeta}>{isEligibleForRepeatLoan ? 'Previous loan completed, ready for next cycle' : toLabel(onboarding?.nextStep, 'Ready for next action')}</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Total Loans</span>
              <strong className={styles.metricValue}>{totalLoans}</strong>
              <p className={styles.metricMeta}>{activeLoans} active or pending</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Total Principal</span>
              <strong className={styles.metricValue}>{formatCurrency(totalPrincipal)}</strong>
              <p className={styles.metricMeta}>Disbursed across borrower history</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Outstanding Balance</span>
              <strong className={styles.metricValue}>{formatCurrency(totalOutstandingBalance)}</strong>
              <p className={styles.metricMeta}>Open borrower exposure</p>
            </div>
          </div>

          <section className={styles.sectionCard}>
            <div className={styles.sectionTitleRow}>
              <h2>Recent Loans</h2>
              <Link to="#loans-section">All Loans</Link>
            </div>
            {recentLoans.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#Ref</th>
                    <th>Principal</th>
                    <th>Interest</th>
                    <th>Disbursed</th>
                    <th>OLB</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoans.map((loan) => (
                    <tr key={loan.id}>
                      <td><Link to={`/loans/${loan.id}`}>#{loan.id}</Link></td>
                      <td>{formatCurrency(loan.principal)}</td>
                      <td>{Number(loan.interest_rate || 0)}%</td>
                      <td>{loan.disbursed_at ? new Date(loan.disbursed_at).toLocaleDateString() : '-'}</td>
                      <td>{formatCurrency(loan.balance)}</td>
                      <td>{toLabel(loan.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>
                <p>No loans found for this client.</p>
                {canStartLoanApplication ? <Link className={styles.primaryLink} to={createLoanHref}>{createLoanCtaLabel}</Link> : null}
                {canCreateLoan && onboarding && !clientReadyForLoanApplication ? (
                  <button type="button" className={styles.secondaryButton} onClick={() => switchPanel('actions')}>
                    Continue onboarding
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </section>

      {activePanel === 'basic-info' ? (
        <section id="profile-section" className={styles.sectionCard}>
          <h2>Profile</h2>
          <div className={styles.grid}>
            <div className={styles.card}><div className={styles.label}>Name</div><div className={styles.value}>{toText(client.full_name)}</div></div>
            <div className={styles.card}><div className={styles.label}>Phone</div><div className={styles.value}>{toText(client.phone)}</div></div>
            <div className={styles.card}><div className={styles.label}>National ID</div><div className={styles.value}>{toText(client.national_id)}</div></div>
            <div className={styles.card}><div className={styles.label}>KRA PIN</div><div className={styles.value}>{toText(client.kra_pin)}</div></div>
            <div className={styles.card}><div className={styles.label}>Status</div><div className={styles.value}>{Number(client.is_active || 0) === 1 ? 'Active' : 'Inactive'}</div></div>
            <div className={styles.card}><div className={styles.label}>Branch</div><div className={styles.value}>{toText(client.branch_name)}</div></div>
          </div>
        </section>
      ) : null}

      {activePanel === 'statement' ? (
        <section className={styles.sectionCard}>
          <div className={styles.statementHeader}>
            <div>
              <h2>Borrower Statement</h2>
              <p className={styles.muted}>Generate the downloadable borrower statement used for customer sharing and internal review.</p>
            </div>
            <div className={styles.statementActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  void handleDownloadStatement()
                }}
                disabled={isGeneratingStatement}
              >
                {isGeneratingStatement ? 'Preparing statement...' : 'Download statement'}
              </button>
            </div>
          </div>
          <p className={styles.statementNote}>
            The downloaded file includes the borrower profile, loan schedule, repayments, guarantors, and collateral, with filenames in the format {buildStatementFilename(client.full_name)}.
          </p>
          <div className={styles.statementStack}>
            <div className={styles.statementGroup}>
              <div className={styles.statementGrid}>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>Total loans</div><div className={styles.statementCardValue}>{totalLoans}</div></div>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>Active loans</div><div className={styles.statementCardValue}>{activeLoans}</div></div>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>Principal disbursed</div><div className={styles.statementCardValue}>{formatCurrency(totalPrincipal)}</div></div>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>Outstanding balance</div><div className={styles.statementCardValue}>{formatCurrency(totalOutstandingBalance)}</div></div>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>KYC status</div><div className={styles.statementCardValue}>{toLabel(onboarding?.kycStatus, 'Pending')}</div></div>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>Fee status</div><div className={styles.statementCardValue}>{toLabel(onboarding?.feePaymentStatus, 'Unpaid')}</div></div>
              </div>
            </div>

            <div className={styles.statementGroup}>
              <div className={styles.statementLoanHeader}>
                <div>
                  <h3>Portfolio snapshot</h3>
                  <p className={styles.statementSubtle}>Latest borrower loans and balances before you generate the full statement.</p>
                </div>
                <span className={styles.statementBadge}>{recentLoans.length} latest loan{recentLoans.length === 1 ? '' : 's'}</span>
              </div>
              {recentLoans.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#Ref</th>
                        <th>Status</th>
                        <th>Principal</th>
                        <th>Expected Total</th>
                        <th>Balance</th>
                        <th>Disbursed</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLoans.map((loan) => (
                        <tr key={loan.id}>
                          <td>{loan.id}</td>
                          <td>{toLabel(loan.status)}</td>
                          <td>{formatCurrency(loan.principal)}</td>
                          <td>{formatCurrency(loan.expected_total)}</td>
                          <td>{formatCurrency(loan.balance)}</td>
                          <td>{formatDate(loan.disbursed_at)}</td>
                          <td><Link to={`/loans/${loan.id}`}>Open loan</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className={styles.statementEmpty}>No statement data is available until the borrower has at least one loan.</p>}
            </div>

            <div className={styles.statementGroup}>
              <div className={styles.statementLoanHeader}>
                <div>
                  <h3>Borrower support structure</h3>
                  <p className={styles.statementSubtle}>Guarantors and collateral linked to this customer will be included in the generated statement.</p>
                </div>
              </div>
              <div className={styles.statementGrid}>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>Guarantors linked</div><div className={styles.statementCardValue}>{Array.isArray(guarantorsQuery.data) ? guarantorsQuery.data.length : 0}</div></div>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>Collateral assets</div><div className={styles.statementCardValue}>{Array.isArray(collateralsQuery.data) ? collateralsQuery.data.length : 0}</div></div>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>Ready for loan</div><div className={styles.statementCardValue}>{onboarding?.readyForLoanApplication ? 'Yes' : 'No'}</div></div>
                <div className={styles.statementCard}><div className={styles.statementCardLabel}>Next step</div><div className={styles.statementCardValue}>{toLabel(onboarding?.nextStep, 'Ready for next action')}</div></div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activePanel === 'attachments' ? (
        <section className={styles.sectionCard}>
          <h2>Attachments</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.label}>Passport Photo</div>
              <div className={styles.value}>{client.photo_url ? <a href={client.photo_url} target="_blank" rel="noreferrer">Open photo</a> : 'No photo uploaded'}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>ID Document</div>
              <div className={styles.value}>{client.id_document_url ? <a href={client.id_document_url} target="_blank" rel="noreferrer">Open document</a> : 'No ID document uploaded'}</div>
            </div>
          </div>
        </section>
      ) : null}

      {activePanel === 'notes' ? (
        <section className={styles.sectionCard}>
          <h2>Notes</h2>
          <div className={styles.stack}>
            <div className={styles.detailPanel}>
              <div className={styles.noteTitle}>Current onboarding direction</div>
              <p className={styles.muted}>{isEligibleForRepeatLoan ? 'Latest loan is closed. Begin the next cycle when the borrower is ready.' : toLabel(onboarding?.nextStep, 'Ready for next action')}</p>
            </div>
            <div className={styles.detailPanel}>
              <div className={styles.noteTitle}>Customer 360 workspace note</div>
              <p className={styles.muted}>Use this view to verify profile completeness, linked guarantors, collateral readiness, and current loan exposure before taking action.</p>
            </div>
          </div>
        </section>
      ) : null}

      {activePanel === 'more-info' || activePanel === 'business-details' ? (
        <section className={styles.sectionCard}>
          <h2>{activePanel === 'more-info' ? 'More Info' : 'Business Details'}</h2>
          <div className={styles.grid}>
            <div className={styles.card}><div className={styles.label}>Next of kin</div><div className={styles.value}>{toText(client.next_of_kin_name)}</div></div>
            <div className={styles.card}><div className={styles.label}>Next of kin phone</div><div className={styles.value}>{toText(client.next_of_kin_phone)}</div></div>
            <div className={styles.card}><div className={styles.label}>Relationship</div><div className={styles.value}>{toText(client.next_of_kin_relation)}</div></div>
            <div className={styles.card}><div className={styles.label}>Business type</div><div className={styles.value}>{toText(client.business_type)}</div></div>
            <div className={styles.card}><div className={styles.label}>Business years</div><div className={styles.value}>{toText(client.business_years)}</div></div>
            <div className={styles.card}><div className={styles.label}>Business location</div><div className={styles.value}>{toText(client.business_location)}</div></div>
            <div className={styles.card}><div className={styles.label}>Residential address</div><div className={styles.value}>{toText(client.residential_address)}</div></div>
          </div>
        </section>
      ) : null}

      {activePanel === 'guarantor-details' ? (
        <section id="guarantors-section" className={styles.sectionCard}>
          <h2>Guarantors</h2>
          {guarantorsQuery.isLoading ? <p>Loading guarantors...</p> : guarantorsQuery.isError ? <p>Unable to load guarantors.</p> : guarantorsQuery.data && guarantorsQuery.data.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>National ID</th>
                  <th>Occupation</th>
                  <th>Income</th>
                  <th>Guarantee</th>
                </tr>
              </thead>
              <tbody>
                {guarantorsQuery.data.map((guarantor) => (
                  <tr key={guarantor.id}>
                    <td>{toText(guarantor.full_name)}</td>
                    <td>{toText(guarantor.phone)}</td>
                    <td>{toText(guarantor.national_id)}</td>
                    <td>{toText(guarantor.occupation)}</td>
                    <td>{formatAmount(guarantor.monthly_income)}</td>
                    <td>{formatAmount(guarantor.guarantee_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>No guarantors linked to this client yet.</p>}
        </section>
      ) : null}

      {activePanel === 'collateral-details' ? (
        <section id="collateral-section" className={styles.sectionCard}>
          <h2>Collateral</h2>
          {collateralsQuery.isLoading ? <p>Loading collateral...</p> : collateralsQuery.isError ? <p>Unable to load collateral.</p> : collateralsQuery.data && collateralsQuery.data.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Asset type</th>
                  <th>Description</th>
                  <th>Estimated value</th>
                  <th>Owner</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {collateralsQuery.data.map((collateral) => (
                  <tr key={collateral.id}>
                    <td>{toLabel(collateral.asset_type)}</td>
                    <td>{toText(collateral.description)}</td>
                    <td>{formatAmount(collateral.estimated_value)}</td>
                    <td>{toText(collateral.owner_name)}</td>
                    <td>{toLabel(collateral.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>No collateral linked to this client yet.</p>}
        </section>
      ) : null}

      {activePanel === 'basic-info' ? (
      <section id="onboarding-section" className={styles.sectionCard}>
        <h2>Onboarding</h2>
        {onboardingQuery.isLoading ? (
          <p>Loading onboarding status...</p>
        ) : onboardingQuery.isError || !onboarding ? (
          <p>Unable to load onboarding status.</p>
        ) : (
          <div className={styles.grid}>
            <div className={styles.card}><div className={styles.label}>Stage</div><div className={styles.value}>{toLabel(onboarding.onboardingStatus)}</div></div>
            <div className={styles.card}><div className={styles.label}>KYC</div><div className={styles.value}>{toLabel(onboarding.kycStatus)}</div></div>
            <div className={styles.card}><div className={styles.label}>Fee payment</div><div className={styles.value}>{toLabel(onboarding.feePaymentStatus)}</div></div>
            <div className={styles.card}><div className={styles.label}>Guarantors</div><div className={styles.value}>{onboarding.counts.guarantors}</div></div>
            <div className={styles.card}><div className={styles.label}>Collaterals</div><div className={styles.value}>{onboarding.counts.collaterals}</div></div>
            <div className={styles.card}><div className={styles.label}>Ready for loan</div><div className={styles.value}>{onboarding.readyForLoanApplication ? 'Yes' : 'No'}</div></div>
            <div className={styles.card}><div className={styles.label}>Next step</div><div className={styles.value}>{toLabel(onboarding.nextStep, 'Ready for next action')}</div></div>
          </div>
        )}
      </section>
      ) : null}

      {activePanel === 'actions' ? (
      <section className={styles.sectionCard}>
        {onboarding ? (
          <div className={styles.onboardingCompact}>
            <span className={styles.onboardingCompactChip}>{toLabel(onboarding.onboardingStatus, 'Onboarding')}</span>
            <span className={styles.onboardingCompactChip}>KYC: {toLabel(onboarding.kycStatus)}</span>
            <span className={styles.onboardingCompactChip}>Fee: {toLabel(onboarding.feePaymentStatus)}</span>
            <span className={styles.onboardingCompactChip}>Guarantors: {onboarding.counts.guarantors}</span>
            <span className={styles.onboardingCompactChip}>Collaterals: {onboarding.counts.collaterals}</span>
            <span className={onboarding.readyForLoanApplication ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>
              {onboarding.readyForLoanApplication ? '\u2713 Ready for loan' : '\u23f3 Not yet ready'}
            </span>
          </div>
        ) : null}
        {canManageClient ? (
        <>
        <div className={styles.sectionTitleRow}>
          <h2>{isEligibleForRepeatLoan ? 'Next Actions' : 'Continue Onboarding'}</h2>
          {canStartLoanApplication ? <Link className={styles.primaryLink} to={createLoanHref}>{isEligibleForRepeatLoan ? 'Start next cycle' : 'Start loan application'}</Link> : null}
        </div>
        {isEligibleForRepeatLoan ? (
          <p className={styles.muted}>The borrower completed the latest loan. Review the profile and launch a new application for the next cycle.</p>
        ) : null}
        {canCreateLoan && onboarding && !clientReadyForLoanApplication ? (
          <p className={styles.muted}>
            Loan origination stays locked until onboarding is complete. Finish the remaining borrower setup below.
          </p>
        ) : null}
        {onboarding && ['start_kyc', 'complete_kyc_review', 'resubmit_kyc', 'resolve_kyc_hold'].includes(String(onboarding.nextStep || '')) ? (
          <p className={styles.muted}>Resolve KYC before the client can progress to a complete onboarding state.</p>
        ) : null}

        {/* Onboarding progress stepper */}
        {onboarding ? (() => {
          const kycDone = String(onboarding.kycStatus || '').toLowerCase() === 'verified'
          const guarantorDone = Number(onboarding.counts.guarantors) > 0
          const collateralDone = Number(onboarding.counts.collaterals) > 0
          const feeDone = String(onboarding.feePaymentStatus || '').toLowerCase() === 'paid'
          const allDone = Boolean(onboarding.readyForLoanApplication)
          const steps = [
            { label: 'KYC', done: kycDone },
            { label: 'Guarantor', done: guarantorDone },
            { label: 'Collateral', done: collateralDone },
            { label: 'Fee', done: feeDone },
            { label: 'Ready', done: allDone },
          ]
          const nextIncomplete = steps.findIndex(s => !s.done)
          return (
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', padding: '1rem 0', flexWrap: 'wrap' }}>
              {steps.map((step, i) => {
                const isCurrent = i === nextIncomplete
                return (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: '50%', fontSize: 13, fontWeight: 700,
                      background: step.done ? 'var(--color-success, #16a34a)' : isCurrent ? 'var(--color-primary, #2563eb)' : 'var(--color-subtle, #e2e8f0)',
                      color: step.done || isCurrent ? '#fff' : 'var(--color-muted, #64748b)',
                    }}>
                      {step.done ? '✓' : i + 1}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 400, color: step.done ? 'var(--color-success, #16a34a)' : isCurrent ? 'var(--color-primary, #2563eb)' : 'var(--color-muted, #64748b)' }}>
                      {step.label}
                    </span>
                    {i < steps.length - 1 ? <span style={{ margin: '0 0.25rem', color: 'var(--color-subtle, #d1d5db)' }}>→</span> : null}
                  </div>
                )
              })}
            </div>
          )
        })() : null}

        {/* Prominent CTA when onboarding is complete */}
        {onboarding && clientReadyForLoanApplication && !isEligibleForRepeatLoan && canCreateLoan ? (
          <div style={{
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            border: '1px solid #6ee7b7',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '1rem',
          }}>
            <div>
              <strong style={{ color: '#065f46', fontSize: '1rem' }}>✓ Onboarding complete</strong>
              <p style={{ color: '#047857', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                All requirements met. This borrower is ready for their first loan application.
              </p>
            </div>
            <Link className={styles.primaryButton || styles.primaryLink} to={createLoanHref} style={{ whiteSpace: 'nowrap' }}>
              Create Loan
            </Link>
          </div>
        ) : null}
        <div className={styles.stack}>
          <details className={styles.detailPanel} open={Boolean(onboarding && ['start_kyc', 'complete_kyc_review', 'resubmit_kyc', 'resolve_kyc_hold'].includes(String(onboarding.nextStep || '')))}>
            <summary className={styles.detailSummary}>Update KYC</summary>
            <div className={styles.inlineForm}>
              <label>
                <span>Status</span>
                <select value={kycForm.status} onChange={(event) => setKycForm((prev) => ({ ...prev, status: event.target.value as ClientKycStatus }))}>
                  <option value="pending">Pending</option>
                  <option value="in_review">In review</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
              <label className={styles.fullWidthField}>
                <span>Note</span>
                <input value={kycForm.note} onChange={(event) => setKycForm((prev) => ({ ...prev, note: event.target.value }))} />
              </label>
            </div>
            <div className={styles.actionBar}>
              <button type="button" onClick={submitKycUpdate} disabled={updateKycMutation.isPending}>
                {updateKycMutation.isPending ? 'Saving KYC...' : 'Update KYC'}
              </button>
            </div>
          </details>

          <details className={styles.detailPanel} open={onboarding?.nextStep === 'add_guarantor'}>
            <summary className={styles.detailSummary}>Add guarantor</summary>
            <div className={styles.inlineForm}>
              <label>
                <span>Full name</span>
                <input value={guarantorForm.fullName} onChange={(event) => setGuarantorForm((prev) => ({ ...prev, fullName: event.target.value }))} />
              </label>
              <label>
                <span>Phone</span>
                <input value={guarantorForm.phone} onChange={(event) => setGuarantorForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </label>
              <label>
                <span>National ID</span>
                <input value={guarantorForm.nationalId} onChange={(event) => setGuarantorForm((prev) => ({ ...prev, nationalId: event.target.value }))} />
              </label>
              <label>
                <span>Physical address</span>
                <input value={guarantorForm.physicalAddress} onChange={(event) => setGuarantorForm((prev) => ({ ...prev, physicalAddress: event.target.value }))} />
              </label>
              <label>
                <span>Occupation</span>
                <input value={guarantorForm.occupation} onChange={(event) => setGuarantorForm((prev) => ({ ...prev, occupation: event.target.value }))} />
              </label>
              <label>
                <span>Employer name</span>
                <input value={guarantorForm.employerName} onChange={(event) => setGuarantorForm((prev) => ({ ...prev, employerName: event.target.value }))} />
              </label>
              <label>
                <span>Monthly income</span>
                <input type="number" min={0} step="0.01" value={guarantorForm.monthlyIncome} onChange={(event) => setGuarantorForm((prev) => ({ ...prev, monthlyIncome: event.target.value }))} />
              </label>
              <label>
                <span>Guarantee amount</span>
                <input type="number" min={0.01} step="0.01" value={guarantorForm.guaranteeAmount} onChange={(event) => setGuarantorForm((prev) => ({ ...prev, guaranteeAmount: event.target.value }))} />
              </label>
            </div>
            <div className={styles.actionBar}>
              <button type="button" onClick={submitGuarantor} disabled={createGuarantorMutation.isPending}>
                {createGuarantorMutation.isPending ? 'Saving guarantor...' : 'Add guarantor'}
              </button>
            </div>
          </details>

          <details className={styles.detailPanel} open={onboarding?.nextStep === 'add_collateral'}>
            <summary className={styles.detailSummary}>Add collateral</summary>
            <div className={styles.inlineForm}>
              <label>
                <span>Asset type</span>
                <select value={collateralForm.assetType} onChange={(event) => setCollateralForm((prev) => ({ ...prev, assetType: event.target.value as CollateralFormState['assetType'] }))}>
                  {CLIENT_COLLATERAL_ASSET_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Description</span>
                <input value={collateralForm.description} onChange={(event) => setCollateralForm((prev) => ({ ...prev, description: event.target.value }))} />
              </label>
              <label>
                <span>Estimated value</span>
                <input type="number" min={1} step="0.01" value={collateralForm.estimatedValue} onChange={(event) => setCollateralForm((prev) => ({ ...prev, estimatedValue: event.target.value }))} />
              </label>
              <label>
                <span>Ownership type</span>
                <select value={collateralForm.ownershipType} onChange={(event) => setCollateralForm((prev) => ({ ...prev, ownershipType: event.target.value as CollateralFormState['ownershipType'] }))}>
                  {CLIENT_COLLATERAL_OWNERSHIP_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Owner name</span>
                <input value={collateralForm.ownerName} onChange={(event) => setCollateralForm((prev) => ({ ...prev, ownerName: event.target.value }))} />
              </label>
              <label>
                <span>Registration number</span>
                <input value={collateralForm.registrationNumber} onChange={(event) => setCollateralForm((prev) => ({ ...prev, registrationNumber: event.target.value }))} />
              </label>
              <label>
                <span>Title number</span>
                <input value={collateralForm.titleNumber} onChange={(event) => setCollateralForm((prev) => ({ ...prev, titleNumber: event.target.value }))} />
              </label>
              <label>
                <span>Logbook number</span>
                <input value={collateralForm.logbookNumber} onChange={(event) => setCollateralForm((prev) => ({ ...prev, logbookNumber: event.target.value }))} />
              </label>
              <label>
                <span>Location details</span>
                <input value={collateralForm.locationDetails} onChange={(event) => setCollateralForm((prev) => ({ ...prev, locationDetails: event.target.value }))} />
              </label>
              <label>
                <span>Valuation date</span>
                <input type="date" value={collateralForm.valuationDate} onChange={(event) => setCollateralForm((prev) => ({ ...prev, valuationDate: event.target.value }))} />
              </label>
            </div>
            <div className={styles.actionBar}>
              <button type="button" onClick={submitCollateral} disabled={createCollateralMutation.isPending}>
                {createCollateralMutation.isPending ? 'Saving collateral...' : 'Add collateral'}
              </button>
            </div>
          </details>

          <details className={styles.detailPanel} open={onboarding?.feePaymentStatus !== 'paid'}>
            <summary className={styles.detailSummary}>Record fee payment</summary>
            <div className={styles.inlineForm}>
              <label>
                <span>Amount</span>
                <input type="number" min={0} step="0.01" value={feeForm.amount} onChange={(event) => setFeeForm((prev) => ({ ...prev, amount: event.target.value }))} />
              </label>
              <label>
                <span>Payment reference</span>
                <input value={feeForm.paymentReference} onChange={(event) => setFeeForm((prev) => ({ ...prev, paymentReference: event.target.value }))} />
              </label>
              <label>
                <span>Paid at</span>
                <input type="date" value={feeForm.paidAt} onChange={(event) => setFeeForm((prev) => ({ ...prev, paidAt: event.target.value }))} />
              </label>
              <label className={styles.fullWidthField}>
                <span>Note</span>
                <input value={feeForm.note} onChange={(event) => setFeeForm((prev) => ({ ...prev, note: event.target.value }))} />
              </label>
            </div>
            <div className={styles.actionBar}>
              <button type="button" onClick={submitFeePayment} disabled={recordFeeMutation.isPending}>
                {recordFeeMutation.isPending ? 'Recording fee...' : 'Record fee payment'}
              </button>
            </div>
          </details>
        </div>
        </>
        ) : null}
      </section>
      ) : null}

      {activePanel === 'basic-info' || activePanel === 'statement' ? (
      <section id="loans-section" className={styles.sectionCard}>
        <h2>Loans</h2>
        {Array.isArray(client.loans) && client.loans.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Principal</th>
                <th>Expected Total</th>
                <th>Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {client.loans.map((loan) => (
                <tr key={loan.id}>
                  <td>{loan.id}</td>
                  <td>{toText(loan.status)}</td>
                  <td>{formatAmount(loan.principal)}</td>
                  <td>{formatAmount(loan.expected_total)}</td>
                  <td>{formatAmount(loan.balance)}</td>
                  <td><Link to={`/loans/${loan.id}`}>Open loan</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.emptyState}>
            <p>No loans found for this client.</p>
            {canCreateLoan ? <Link className={styles.primaryLink} to={createLoanHref}>Create the first loan</Link> : null}
          </div>
        )}
      </section>
      ) : null}
    </div>
  )
}

