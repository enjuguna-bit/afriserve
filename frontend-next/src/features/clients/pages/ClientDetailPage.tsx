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

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

type GuarantorFormState = {
  fullName: string; phone: string; nationalId: string
  physicalAddress: string; occupation: string; employerName: string
  monthlyIncome: string; guaranteeAmount: string
}

type CollateralFormState = {
  assetType: ClientCollateralAssetType; description: string; estimatedValue: string
  ownershipType: ClientCollateralOwnershipType; ownerName: string; ownerNationalId: string
  registrationNumber: string; logbookNumber: string; titleNumber: string
  locationDetails: string; valuationDate: string
}

type FeeFormState = { amount: string; paymentReference: string; paidAt: string; note: string }
type KycFormState = { status: ClientKycStatus; note: string }

type ActivePanel = 'basic-info' | 'statement' | 'attachments' | 'notes' | 'more-info' | 'business-details' | 'guarantor-details' | 'collateral-details' | 'actions'
type ActionStep = 'kyc' | 'guarantor' | 'collateral' | 'fee'

// ─── Empty state defaults ─────────────────────────────────────────────────────

const EMPTY_GUARANTOR: GuarantorFormState = { fullName: '', phone: '', nationalId: '', physicalAddress: '', occupation: '', employerName: '', monthlyIncome: '', guaranteeAmount: '' }
const EMPTY_COLLATERAL: CollateralFormState = { assetType: 'chattel', description: '', estimatedValue: '', ownershipType: 'client', ownerName: '', ownerNationalId: '', registrationNumber: '', logbookNumber: '', titleNumber: '', locationDetails: '', valuationDate: '' }
const EMPTY_FEE: FeeFormState = { amount: '', paymentReference: '', paidAt: '', note: '' }
const EMPTY_KYC: KycFormState = { status: 'verified', note: '' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof axios.AxiosError) {
    const payload = error.response?.data as {
      message?: unknown
      requestId?: unknown
      issues?: Array<{ path?: unknown[]; message?: unknown }>
      debugDetails?: { cause?: unknown }
    } | undefined
    const message = String(payload?.message || '').trim()
    const issues = Array.isArray(payload?.issues)
      ? payload.issues.map((i) => {
          const path = Array.isArray(i?.path) ? i.path.join('.') : ''
          const msg  = String(i?.message || '').trim()
          return path ? `${path}: ${msg}` : msg
        }).filter(Boolean).join('; ')
      : ''
    const cause = String(payload?.debugDetails?.cause || '').trim()
    const reqId = String(payload?.requestId || '').trim()
    const parts = [message || fallback]
    if (issues) parts.push(issues)
    if (cause)  parts.push(`Cause: ${cause}`)
    if (reqId)  parts.push(`Req: ${reqId}`)
    const combined = parts.filter(Boolean).join(' | ').trim()
    if (combined) return combined
  }
  return fallback
}

function toText(value: unknown, fallback = '—') {
  const n = String(value ?? '').trim()
  return n.length > 0 ? n : fallback
}

function toLabel(value: unknown, fallback = '—') {
  const n = String(value ?? '').trim()
  if (!n) return fallback
  return n.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function formatAmount(value: unknown) {
  const p = Number(value || 0)
  return Number.isFinite(p) ? p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
}

function formatCurrency(value: unknown) { return `Ksh ${formatAmount(value)}` }

function formatDate(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()
}

function formatDateTime(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

function compareByRecency(a: { id: number; disbursed_at: string | null }, b: { id: number; disbursed_at: string | null }) {
  const at = a.disbursed_at ? new Date(a.disbursed_at).getTime() : 0
  const bt = b.disbursed_at ? new Date(b.disbursed_at).getTime() : 0
  return at !== bt ? bt - at : Number(b.id || 0) - Number(a.id || 0)
}

function escapeHtml(v: unknown) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

function toIsoDateOrUndefined(value: string) {
  const n = String(value || '').trim()
  if (!n) return undefined
  const p = new Date(`${n}T00:00:00.000Z`)
  return Number.isNaN(p.getTime()) ? undefined : p.toISOString()
}

function loanStatusClass(status: string) {
  const s = String(status || '').toLowerCase()
  if (['active', 'disbursed'].includes(s))                    return styles.loanStatusActive
  if (['pending_approval', 'approved', 'pending'].includes(s)) return styles.loanStatusPending
  if (s === 'closed')                                          return styles.loanStatusClosed
  if (['rejected', 'written_off'].includes(s))                 return styles.loanStatusRejected
  return styles.loanStatusDefault
}

function kycBadgeClass(status: string) {
  const s = String(status || '').toLowerCase()
  if (s === 'verified') return styles.kycBadgeVerified
  if (s === 'rejected' || s === 'suspended') return styles.kycBadgeRejected
  return styles.kycBadgePending
}

function menuGlyph(label: string) {
  const n = label.trim().toLowerCase()
  if (n.includes('action'))     return '⚡'
  if (n.includes('basic'))      return '👤'
  if (n.includes('statement'))  return '📄'
  if (n.includes('attach'))     return '📎'
  if (n.includes('note'))       return '📝'
  if (n.includes('more'))       return '📋'
  if (n.includes('business'))   return '🏪'
  if (n.includes('guarantor'))  return '🤝'
  if (n.includes('collateral')) return '🏠'
  return '•'
}

// ─── Statement builder ────────────────────────────────────────────────────────

function buildStatementFilename(fullName: string) {
  const safe = String(fullName || 'Borrower').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim() || 'Borrower'
  return `${safe}_statement_${new Date().toISOString().split('T')[0]}.html`
}

function downloadHtmlDocument(html: string, filename: string) {
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename)
}

function buildBorrowerStatementHtml(options: {
  client: {
    full_name: string; phone: string | null; national_id: string | null; kra_pin: string | null
    branch_name?: string | null; assigned_officer_name?: string | null
    residential_address?: string | null; business_type?: string | null; business_location?: string | null
  }
  onboarding?: { readyForLoanApplication?: boolean; nextStep?: string | null; feePaymentStatus?: string | null; kycStatus?: string | null } | null
  guarantors: Array<{ full_name?: string | null; phone?: string | null; national_id?: string | null; occupation?: string | null; monthly_income?: number; guarantee_amount?: number }>
  collaterals: Array<{ asset_type?: string | null; description?: string | null; estimated_value?: number; ownership_type?: string | null; status?: string | null }>
  loanStatements: LoanStatement[]
  portfolioSummary: { totalLoans: number; activeLoans: number; totalPrincipal: number; totalOutstandingBalance: number }
}) {
  const { client, onboarding, guarantors, collaterals, loanStatements, portfolioSummary } = options
  const guarantorRows = guarantors.length > 0
    ? guarantors.map((g) => `<tr><td>${escapeHtml(toText(g.full_name))}</td><td>${escapeHtml(toText(g.phone))}</td><td>${escapeHtml(toText(g.national_id))}</td><td>${escapeHtml(toText(g.occupation))}</td><td>${escapeHtml(formatCurrency(g.monthly_income||0))}</td><td>${escapeHtml(formatCurrency(g.guarantee_amount||0))}</td></tr>`).join('')
    : '<tr><td colspan="6">No guarantors linked.</td></tr>'
  const collateralRows = collaterals.length > 0
    ? collaterals.map((c) => `<tr><td>${escapeHtml(toLabel(c.asset_type))}</td><td>${escapeHtml(toText(c.description))}</td><td>${escapeHtml(formatCurrency(c.estimated_value||0))}</td><td>${escapeHtml(toLabel(c.ownership_type))}</td><td>${escapeHtml(toLabel(c.status))}</td></tr>`).join('')
    : '<tr><td colspan="5">No collateral linked.</td></tr>'
  const loanSections = loanStatements.length > 0
    ? loanStatements.map((st) => {
      const scheduleRows = Array.isArray(st.amortization) && st.amortization.length > 0
        ? st.amortization.map((r) => `<tr><td>${escapeHtml(String(r.installment_number||'-'))}</td><td>${escapeHtml(formatDate(r.due_date||null))}</td><td>${escapeHtml(toLabel(r.status))}</td><td>${escapeHtml(formatCurrency(r.amount_due||0))}</td><td>${escapeHtml(formatCurrency(r.amount_paid||0))}</td><td>${escapeHtml(formatCurrency(r.amount_outstanding||0))}</td><td>${escapeHtml(formatCurrency(r.penalty_amount_accrued||0))}</td></tr>`).join('')
        : '<tr><td colspan="7">No schedule.</td></tr>'
      const repaymentRows = st.repayments.length > 0
        ? st.repayments.map((r) => {
            const applied = Number(r.applied_amount ?? r.amount ?? 0)
            return `<tr><td>${escapeHtml(formatDateTime(r.paid_at))}</td><td>${escapeHtml(formatCurrency(r.amount||0))}</td><td>${escapeHtml(formatCurrency(applied))}</td><td>${escapeHtml(toText(r.payment_channel||r.payment_provider||'-'))}</td><td>${escapeHtml(toText(r.external_receipt||r.external_reference||'-'))}</td><td>${escapeHtml(toText(r.recorded_by_name||'-'))}</td></tr>`
          }).join('')
        : '<tr><td colspan="6">No repayments.</td></tr>'
      return `<section class="loan-card"><div class="loan-header"><div><h2>Loan #${escapeHtml(String(st.loan.id))}</h2><p>Disbursed ${escapeHtml(formatDate(st.loan.disbursed_at||null))} · ${escapeHtml(toLabel(st.loan.status))}</p></div><div class="badge">${escapeHtml(toLabel(st.workflow?.lifecycle_stage_label||st.loan.status))}</div></div><div class="metric-grid"><div class="metric"><span>Principal</span><strong>${escapeHtml(formatCurrency(st.loan.principal||0))}</strong></div><div class="metric"><span>Outstanding</span><strong>${escapeHtml(formatCurrency(st.summary.total_outstanding||st.loan.balance||0))}</strong></div><div class="metric"><span>Total repaid</span><strong>${escapeHtml(formatCurrency(st.summary.total_applied??st.summary.total_repayments??st.loan.repaid_total??0))}</strong></div><div class="metric"><span>Interest</span><strong>${escapeHtml(formatCurrency(st.breakdown?.interest_amount||0))}</strong></div></div><h3>Schedule</h3><table><thead><tr><th>#</th><th>Due</th><th>Status</th><th>Due amount</th><th>Paid</th><th>Outstanding</th><th>Penalty</th></tr></thead><tbody>${scheduleRows}</tbody></table><h3>Repayments</h3><table><thead><tr><th>Paid at</th><th>Amount</th><th>Applied</th><th>Channel</th><th>Receipt</th><th>Recorded by</th></tr></thead><tbody>${repaymentRows}</tbody></table></section>`
    }).join('')
    : '<p>No loans found.</p>'

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(client.full_name)} Statement</title><style>body{font-family:Georgia,"Times New Roman",serif;margin:32px;color:#203149;background:#f7f4ee}.sheet{max-width:1080px;margin:0 auto;background:#fff;padding:32px;border:1px solid #d9dfeb}h1,h2,h3,p{margin-top:0}.header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #203149;padding-bottom:16px;margin-bottom:24px}.meta{color:#5f6f84}.metric-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:20px 0}.metric{border:1px solid #d9dfeb;padding:12px;border-radius:12px;background:#f9fbfd}.metric span{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#5f6f84}.metric strong{display:block;margin-top:6px;font-size:18px}.section{margin-top:24px}.loan-card{margin-top:24px;padding-top:20px;border-top:1px solid #d9dfeb}.loan-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.badge{border-radius:999px;padding:8px 12px;background:#e9eef5;font-size:12px;font-weight:700;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #d9dfeb;padding:8px 10px;text-align:left;font-size:13px;vertical-align:top}th{background:#eef3f8}</style></head><body><div class="sheet"><div class="header"><div><h1>${escapeHtml(client.full_name)}</h1><p class="meta">Generated ${escapeHtml(formatDateTime(new Date().toISOString()))}</p></div><div><p><strong>Branch:</strong> ${escapeHtml(toText(client.branch_name))}</p><p><strong>Officer:</strong> ${escapeHtml(toText(client.assigned_officer_name))}</p></div></div><div class="section"><h2>Borrower profile</h2><div class="metric-grid"><div class="metric"><span>Phone</span><strong>${escapeHtml(toText(client.phone))}</strong></div><div class="metric"><span>National ID</span><strong>${escapeHtml(toText(client.national_id))}</strong></div><div class="metric"><span>KRA PIN</span><strong>${escapeHtml(toText(client.kra_pin))}</strong></div><div class="metric"><span>KYC</span><strong>${escapeHtml(toLabel(onboarding?.kycStatus))}</strong></div><div class="metric"><span>Fee</span><strong>${escapeHtml(toLabel(onboarding?.feePaymentStatus))}</strong></div><div class="metric"><span>Ready for loan</span><strong>${escapeHtml(onboarding?.readyForLoanApplication?'Yes':'No')}</strong></div></div></div><div class="section"><h2>Portfolio summary</h2><div class="metric-grid"><div class="metric"><span>Total loans</span><strong>${escapeHtml(String(portfolioSummary.totalLoans))}</strong></div><div class="metric"><span>Active loans</span><strong>${escapeHtml(String(portfolioSummary.activeLoans))}</strong></div><div class="metric"><span>Principal disbursed</span><strong>${escapeHtml(formatCurrency(portfolioSummary.totalPrincipal))}</strong></div><div class="metric"><span>Outstanding</span><strong>${escapeHtml(formatCurrency(portfolioSummary.totalOutstandingBalance))}</strong></div></div></div><div class="section"><h2>Guarantors</h2><table><thead><tr><th>Name</th><th>Phone</th><th>National ID</th><th>Occupation</th><th>Monthly income</th><th>Guarantee amount</th></tr></thead><tbody>${guarantorRows}</tbody></table></div><div class="section"><h2>Collateral</h2><table><thead><tr><th>Asset type</th><th>Description</th><th>Estimated value</th><th>Ownership</th><th>Status</th></tr></thead><tbody>${collateralRows}</tbody></table></div><div class="section"><h2>Loan statements</h2>${loanSections}</div></div></body></html>`
}

// ─── Component ────────────────────────────────────────────────────────────────

const WORKSPACE_MENU = [
  { title: 'Workflow',          items: [{ key: 'actions' as const, label: 'Actions' }] },
  { title: 'Borrower 360',      items: [{ key: 'basic-info' as const, label: 'Basic Info' }, { key: 'statement' as const, label: 'Statement' }, { key: 'attachments' as const, label: 'Attachments' }, { key: 'notes' as const, label: 'Notes' }] },
  { title: 'Borrower Structure', items: [{ key: 'more-info' as const, label: 'More Info' }, { key: 'business-details' as const, label: 'Business Details' }, { key: 'guarantor-details' as const, label: 'Guarantor Details' }, { key: 'collateral-details' as const, label: 'Collateral Details' }] },
]

export function ClientDetailPage() {
  const { id } = useParams()
  const clientId = Number(id)
  const { user } = useAuth()
  const location = useLocation()
  const justCreated = Boolean((location.state as Record<string, unknown> | null)?.justCreated)
  const pushToast = useToastStore((state) => state.pushToast)

  const [activePanel, setActivePanel]   = useState<ActivePanel>(justCreated ? 'actions' : 'basic-info')
  const [actionStep, setActionStep]     = useState<ActionStep>('kyc')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [guarantorForm, setGuarantorForm] = useState<GuarantorFormState>(EMPTY_GUARANTOR)
  const [collateralForm, setCollateralForm] = useState<CollateralFormState>(EMPTY_COLLATERAL)
  const [feeForm, setFeeForm]           = useState<FeeFormState>(EMPTY_FEE)
  const [kycForm, setKycForm]           = useState<KycFormState>(EMPTY_KYC)
  const [isGeneratingStatement, setIsGeneratingStatement] = useState(false)

  const clientQuery      = useClient(clientId)
  const onboardingQuery  = useClientOnboardingStatus(clientId)
  const guarantorsQuery  = useClientGuarantors(clientId)
  const collateralsQuery = useClientCollaterals(clientId)
  const createGuarantorMutation  = useCreateClientGuarantor(clientId)
  const createCollateralMutation = useCreateClientCollateral(clientId)
  const recordFeeMutation        = useRecordClientFeePayment(clientId)
  const updateKycMutation        = useUpdateClientKyc(clientId)

  if (!Number.isInteger(clientId) || clientId <= 0) return <AsyncState error errorText="Invalid client ID." />
  if (clientQuery.isLoading) return <AsyncState loading loadingText="Loading client profile..." />
  if (clientQuery.isError || !clientQuery.data) {
    return <AsyncState error errorText="Unable to load client details." onRetry={() => { void clientQuery.refetch() }} />
  }

  const client     = clientQuery.data
  const onboarding = onboardingQuery.data

  // Derived state
  const canManageClient  = hasAnyRole(user, ['admin', 'loan_officer'])
  const canCreateLoan    = hasAnyRole(user, ['admin', 'loan_officer'])
  const clientReady      = Boolean(onboarding?.readyForLoanApplication)
  const canStartLoan     = Boolean(canCreateLoan && clientReady)
  const createLoanHref   = `/loans/new?clientId=${client.id}`

  const sortedLoans   = Array.isArray(client.loans) ? [...client.loans].sort(compareByRecency) : []
  const totalLoans    = sortedLoans.length
  const activeLoans   = sortedLoans.filter((l) => !['closed','rejected','written_off'].includes(String(l.status||'').toLowerCase())).length
  const totalPrincipal       = sortedLoans.reduce((s,l) => s + Number(l.principal||0), 0)
  const totalOutstanding     = sortedLoans.reduce((s,l) => s + Number(l.balance||0), 0)
  const recentLoans          = sortedLoans.slice(0, 5)
  const latestLoan           = sortedLoans[0] || null
  const latestLoanClosed     = String(latestLoan?.status||'').toLowerCase() === 'closed'
  const isEligibleForRepeat  = Boolean(canStartLoan && latestLoanClosed && activeLoans === 0)
  const createLoanCtaLabel   = totalLoans === 0 ? 'Create first loan' : (isEligibleForRepeat ? 'Start next cycle' : 'Create loan')

  // Onboarding steps derived state
  const kycDone       = String(onboarding?.kycStatus||'').toLowerCase() === 'verified'
  const guarantorDone = Number(onboarding?.counts?.guarantors||0) > 0
  const collateralDone = Number(onboarding?.counts?.collaterals||0) > 0
  const feeDone       = String(onboarding?.feePaymentStatus||'').toLowerCase() === 'paid'

  function switchPanel(panel: ActivePanel) {
    setActivePanel(panel)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Auto-advance to the next incomplete action step when entering the Actions panel
  function openActions() {
    if (!kycDone)        setActionStep('kyc')
    else if (!guarantorDone) setActionStep('guarantor')
    else if (!collateralDone) setActionStep('collateral')
    else if (!feeDone)   setActionStep('fee')
    else                 setActionStep('kyc')
    switchPanel('actions')
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  function submitKycUpdate() {
    updateKycMutation.mutate({ status: kycForm.status, note: kycForm.note.trim() || undefined }, {
      onSuccess: () => { pushToast({ type: 'success', message: 'KYC updated.' }); setKycForm((p) => ({ ...p, note: '' })) },
      onError: (e) => { pushToast({ type: 'error', message: getApiErrorMessage(e, 'Failed to update KYC.') }) },
    })
  }

  function submitGuarantor() {
    const fullName = guarantorForm.fullName.trim()
    if (fullName.length < 2) { pushToast({ type: 'error', message: 'Guarantor full name is required.' }); return }
    const guaranteeAmount = Number(guarantorForm.guaranteeAmount)
    if (!Number.isFinite(guaranteeAmount) || guaranteeAmount <= 0) { pushToast({ type: 'error', message: 'Guarantee amount must be greater than 0.' }); return }
    const monthlyIncome = Number(guarantorForm.monthlyIncome)
    createGuarantorMutation.mutate({
      fullName, phone: guarantorForm.phone.trim()||undefined, nationalId: guarantorForm.nationalId.trim()||undefined,
      physicalAddress: guarantorForm.physicalAddress.trim()||undefined, occupation: guarantorForm.occupation.trim()||undefined,
      employerName: guarantorForm.employerName.trim()||undefined,
      monthlyIncome: Number.isFinite(monthlyIncome)&&monthlyIncome>=0 ? monthlyIncome : undefined,
      guaranteeAmount,
    }, {
      onSuccess: () => { pushToast({ type: 'success', message: 'Guarantor added.' }); setGuarantorForm(EMPTY_GUARANTOR) },
      onError: (e) => { pushToast({ type: 'error', message: getApiErrorMessage(e, 'Failed to add guarantor.') }) },
    })
  }

  function submitCollateral() {
    const description = collateralForm.description.trim()
    if (description.length < 3) { pushToast({ type: 'error', message: 'Description is required.' }); return }
    const estimatedValue = Number(collateralForm.estimatedValue)
    if (!Number.isFinite(estimatedValue) || estimatedValue <= 0) { pushToast({ type: 'error', message: 'Estimated value must be greater than 0.' }); return }
    createCollateralMutation.mutate({
      assetType: collateralForm.assetType, description, estimatedValue,
      ownershipType: collateralForm.ownershipType, ownerName: collateralForm.ownerName.trim()||undefined,
      ownerNationalId: collateralForm.ownerNationalId.trim()||undefined, registrationNumber: collateralForm.registrationNumber.trim()||undefined,
      logbookNumber: collateralForm.logbookNumber.trim()||undefined, titleNumber: collateralForm.titleNumber.trim()||undefined,
      locationDetails: collateralForm.locationDetails.trim()||undefined, valuationDate: toIsoDateOrUndefined(collateralForm.valuationDate),
    }, {
      onSuccess: () => { pushToast({ type: 'success', message: 'Collateral added.' }); setCollateralForm(EMPTY_COLLATERAL) },
      onError: (e) => { pushToast({ type: 'error', message: getApiErrorMessage(e, 'Failed to add collateral.') }) },
    })
  }

  function submitFeePayment() {
    const amount = Number(feeForm.amount)
    recordFeeMutation.mutate({
      amount: Number.isFinite(amount)&&amount>=0 ? amount : undefined,
      paymentReference: feeForm.paymentReference.trim()||undefined,
      paidAt: toIsoDateOrUndefined(feeForm.paidAt), note: feeForm.note.trim()||undefined,
    }, {
      onSuccess: () => { pushToast({ type: 'success', message: 'Fee payment recorded.' }); setFeeForm(EMPTY_FEE) },
      onError: (e) => { pushToast({ type: 'error', message: getApiErrorMessage(e, 'Failed to record fee.') }) },
    })
  }

  async function handleDownloadStatement() {
    if (isGeneratingStatement) return
    setIsGeneratingStatement(true)
    try {
      const loanStatements = (await Promise.all(
        (Array.isArray(client.loans) ? client.loans : []).map(async (loan) => {
          try { return await getLoanStatement(loan.id) } catch { return null }
        }),
      )).filter((s): s is LoanStatement => s !== null)
      const html = buildBorrowerStatementHtml({ client, onboarding, guarantors: Array.isArray(guarantorsQuery.data) ? guarantorsQuery.data : [], collaterals: Array.isArray(collateralsQuery.data) ? collateralsQuery.data : [], loanStatements, portfolioSummary: { totalLoans, activeLoans, totalPrincipal, totalOutstandingBalance: totalOutstanding } })
      downloadHtmlDocument(html, buildStatementFilename(client.full_name))
      pushToast({ type: 'success', message: loanStatements.length > 0 ? `Statement downloaded — ${loanStatements.length} loan section${loanStatements.length>1?'s':''}.` : 'Profile statement downloaded.' })
    } catch (error) {
      pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to generate statement.') })
    } finally {
      setIsGeneratingStatement(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const kycStatus = String(onboarding?.kycStatus || 'pending').toLowerCase()

  return (
    <div className={styles.page}>

      {/* ── Just-created success banner ──────────────────────────── */}
      {justCreated && !bannerDismissed ? (
        <div className={styles.justCreatedBanner} role="status">
          <div className={styles.justCreatedBannerContent}>
            <span className={styles.justCreatedBannerIcon} aria-hidden="true">✓</span>
            <div>
              <strong>Client created successfully.</strong>
              <p>Complete the onboarding steps below to prepare them for their first loan application.</p>
            </div>
          </div>
          <button type="button" className={styles.justCreatedBannerClose} aria-label="Dismiss" onClick={() => setBannerDismissed(true)}>×</button>
        </div>
      ) : null}

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1>Customer 360</h1>
          <p className={styles.muted}>Full borrower profile, onboarding progress, and loan context in one workspace.</p>
        </div>
        <div className={styles.actionBar}>
          <Link to="/clients">← Borrowers</Link>
          {canManageClient ? <Link to={`/clients/${client.id}/edit`}>Edit</Link> : null}
          {canStartLoan ? <Link className={styles.primaryLink} to={createLoanHref}>{createLoanCtaLabel}</Link> : null}
          {canCreateLoan && onboarding && !clientReady ? (
            <button type="button" className={styles.secondaryButton} onClick={openActions}>Continue onboarding</button>
          ) : null}
        </div>
      </div>

      {/* ── Main layout ──────────────────────────────────────────── */}
      <section className={styles.summaryShell}>

        {/* ── LEFT: Profile rail ─────────────────────────────────── */}
        <aside className={styles.profileRail}>

          {/* Profile hero */}
          <div className={styles.profileHero}>
            {client.photo_url ? (
              <img className={styles.profilePhoto} src={client.photo_url} alt={client.full_name} />
            ) : (
              <div className={styles.profilePhotoFallback}>{client.full_name.slice(0,1).toUpperCase()}</div>
            )}
            <div className={styles.profileCopy}>
              <h2>{toText(client.full_name)}</h2>
              <p>{toText(client.phone, 'No phone')}</p>
              <div className={styles.statusBadgeRow}>
                <span className={Number(client.is_active||0)===1 ? styles.statusPillActive : styles.statusPillInactive}>
                  {Number(client.is_active||0)===1 ? '● ACTIVE' : '○ INACTIVE'}
                </span>
                {onboarding?.kycStatus ? (
                  <span className={`${styles.kycBadge} ${kycBadgeClass(kycStatus)}`}>
                    KYC: {toLabel(onboarding.kycStatus)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className={styles.profilePanel}>
            <h3>Workspace</h3>
            <div className={styles.quickMenuSections}>
              {WORKSPACE_MENU.map((section) => (
                <div key={section.title} className={styles.quickMenuSection}>
                  <div className={styles.quickMenuSectionTitle}>{section.title}</div>
                  <div className={styles.quickMenu}>
                    {section.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`${styles.quickMenuButton} ${activePanel === item.key ? styles.quickMenuButtonActive : ''}`}
                        onClick={() => item.key === 'actions' ? openActions() : switchPanel(item.key)}
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

          {/* Assignment meta */}
          <div className={styles.profilePanel}>
            <h3>Assignment</h3>
            <dl className={styles.profileMetaList}>
              <div><dt>Agent</dt><dd>{toText(client.assigned_officer_name, 'Unassigned')}</dd></div>
              <div><dt>Branch</dt><dd>{toText(client.branch_name)}</dd></div>
              <div><dt>National ID</dt><dd>{toText(client.national_id)}</dd></div>
              <div><dt>Address</dt><dd>{toText(client.residential_address)}</dd></div>
            </dl>
          </div>
        </aside>

        {/* ── RIGHT: Dashboard pane ──────────────────────────────── */}
        <div className={styles.dashboardPane}>

          {/* Next step banner */}
          {!isEligibleForRepeat && onboarding?.nextStep ? (
            <div className={styles.nextStepBanner}>
              <div className={styles.nextStepBannerIcon} aria-hidden="true">→</div>
              <div className={styles.nextStepBannerContent}>
                <span className={styles.nextStepBannerEyebrow}>Next required step</span>
                <strong className={styles.nextStepBannerLabel}>{toLabel(onboarding.nextStep)}</strong>
              </div>
              <button type="button" className={styles.nextStepBannerCta} onClick={openActions}>Take Action</button>
            </div>
          ) : null}

          {/* Repeat loan / cycle complete banner */}
          {isEligibleForRepeat && latestLoan ? (
            <section className={styles.cycleBanner}>
              <div className={styles.cycleBannerCopy}>
                <span className={styles.cycleBannerEyebrow}>Cycle complete ✓</span>
                <h2>Previous loan is fully repaid.</h2>
                <p>Loan #{latestLoan.id} is closed. Start the next cycle when the borrower is ready.</p>
              </div>
              <div className={styles.cycleBannerActions}>
                <Link className={styles.primaryButton} to={createLoanHref}>Start next cycle</Link>
                <button type="button" className={styles.secondaryButton} onClick={openActions}>Review actions</button>
              </div>
            </section>
          ) : null}

          {/* KPI metric cards */}
          <div className={styles.metricGrid}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Loan Ready</span>
              <strong className={`${styles.metricValue} ${clientReady ? styles.metricValueGreen : styles.metricValueAmber}`}>
                {clientReady ? 'YES' : 'NO'}
              </strong>
              <p className={styles.metricMeta}>{isEligibleForRepeat ? 'Previous loan closed — next cycle ready' : toLabel(onboarding?.nextStep, 'Review onboarding')}</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Total Loans</span>
              <strong className={styles.metricValue}>{totalLoans}</strong>
              <p className={styles.metricMeta}>{activeLoans} active or pending</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Principal Disbursed</span>
              <strong className={styles.metricValue}>{totalLoans > 0 ? formatCurrency(totalPrincipal) : '—'}</strong>
              <p className={styles.metricMeta}>Across borrower history</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Outstanding Balance</span>
              <strong className={`${styles.metricValue} ${totalOutstanding > 0 ? styles.metricValueAmber : ''}`}>
                {totalOutstanding > 0 ? formatCurrency(totalOutstanding) : 'Nil'}
              </strong>
              <p className={styles.metricMeta}>Open exposure</p>
            </div>
          </div>

          {/* Recent loans preview */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionTitleRow}>
              <h2>Recent Loans</h2>
              {totalLoans > 5 ? <Link to={`/loans?clientId=${client.id}`}>All {totalLoans} loans →</Link> : null}
            </div>
            {recentLoans.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>#</th><th>Status</th><th>Principal</th><th>Rate</th><th>Disbursed</th><th>Balance</th></tr>
                  </thead>
                  <tbody>
                    {recentLoans.map((loan) => (
                      <tr key={loan.id}>
                        <td><Link to={`/loans/${loan.id}`}>#{loan.id}</Link></td>
                        <td><span className={`${styles.loanStatusBadge} ${loanStatusClass(String(loan.status||''))}`}>{toLabel(loan.status)}</span></td>
                        <td>{formatCurrency(loan.principal)}</td>
                        <td>{Number(loan.interest_rate||0)}%</td>
                        <td>{loan.disbursed_at ? new Date(loan.disbursed_at).toLocaleDateString() : '—'}</td>
                        <td>{formatCurrency(loan.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <p>No loans yet for this client.</p>
                {canStartLoan ? <Link className={styles.primaryLink} to={createLoanHref}>{createLoanCtaLabel}</Link> : null}
                {canCreateLoan && onboarding && !clientReady ? (
                  <button type="button" className={styles.secondaryButton} onClick={openActions}>Complete onboarding first</button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          PANEL: Basic Info
      ═══════════════════════════════════════════════════════════════ */}
      {activePanel === 'basic-info' ? (
        <>
          <section className={styles.sectionCard}>
            <h2>Profile</h2>
            <div className={styles.grid}>
              {[
                ['Full name', client.full_name],
                ['Phone', client.phone],
                ['National ID', client.national_id],
                ['KRA PIN', client.kra_pin],
                ['Status', Number(client.is_active||0)===1 ? 'Active' : 'Inactive'],
                ['Branch', client.branch_name],
                ['Officer', client.assigned_officer_name],
                ['Registered', formatDate(client.created_at)],
              ].map(([label, val]) => (
                <div key={String(label)} className={styles.card}>
                  <div className={styles.label}>{label}</div>
                  <div className={styles.value}>{toText(val)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.sectionCard}>
            <h2>Onboarding Status</h2>
            {onboardingQuery.isLoading ? <p className={styles.muted}>Loading...</p> : onboardingQuery.isError || !onboarding ? <p className={styles.muted}>Unable to load.</p> : (
              <div className={styles.grid}>
                {[
                  ['Stage', onboarding.onboardingStatus],
                  ['KYC', onboarding.kycStatus],
                  ['Fee payment', onboarding.feePaymentStatus],
                  ['Guarantors', onboarding.counts?.guarantors],
                  ['Collaterals', onboarding.counts?.collaterals],
                  ['Ready for loan', onboarding.readyForLoanApplication ? 'Yes ✓' : 'No'],
                  ['Next step', onboarding.nextStep || 'None'],
                ].map(([label, val]) => (
                  <div key={String(label)} className={styles.card}>
                    <div className={styles.label}>{label}</div>
                    <div className={styles.value}>{toLabel(val)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.sectionCard}>
            <div className={styles.sectionTitleRow}>
              <h2>All Loans</h2>
              {canStartLoan ? <Link className={styles.primaryLink} to={createLoanHref}>{createLoanCtaLabel}</Link> : null}
            </div>
            {Array.isArray(client.loans) && client.loans.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>ID</th><th>Status</th><th>Principal</th><th>Expected Total</th><th>Balance</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {sortedLoans.map((loan) => (
                      <tr key={loan.id}>
                        <td>#{loan.id}</td>
                        <td><span className={`${styles.loanStatusBadge} ${loanStatusClass(String(loan.status||''))}`}>{toLabel(loan.status)}</span></td>
                        <td>{formatAmount(loan.principal)}</td>
                        <td>{formatAmount(loan.expected_total)}</td>
                        <td>{formatAmount(loan.balance)}</td>
                        <td><Link to={`/loans/${loan.id}`}>Open →</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <p>No loans found.</p>
                {canCreateLoan ? <Link className={styles.primaryLink} to={createLoanHref}>Create the first loan</Link> : null}
              </div>
            )}
          </section>
        </>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          PANEL: Statement
      ═══════════════════════════════════════════════════════════════ */}
      {activePanel === 'statement' ? (
        <section className={styles.sectionCard}>
          <div className={styles.statementHeader}>
            <div>
              <h2>Borrower Statement</h2>
              <p className={styles.muted}>Downloadable full-profile statement for customer sharing and internal review.</p>
            </div>
            <div className={styles.statementActions}>
              <button type="button" className={styles.primaryButton} onClick={() => { void handleDownloadStatement() }} disabled={isGeneratingStatement}>
                {isGeneratingStatement ? 'Preparing...' : '↓ Download statement'}
              </button>
            </div>
          </div>

          <p className={styles.statementNote}>
            Includes borrower profile, loan schedule, repayments, guarantors, and collateral in a printable HTML format.
          </p>

          <div className={styles.statementStack}>
            <div className={styles.statementGroup}>
              <div className={styles.statementGrid}>
                {[
                  ['Total loans', totalLoans],
                  ['Active loans', activeLoans],
                  ['Principal disbursed', formatCurrency(totalPrincipal)],
                  ['Outstanding balance', formatCurrency(totalOutstanding)],
                  ['KYC status', toLabel(onboarding?.kycStatus, 'Pending')],
                  ['Fee status', toLabel(onboarding?.feePaymentStatus, 'Unpaid')],
                  ['Guarantors', Array.isArray(guarantorsQuery.data) ? guarantorsQuery.data.length : '—'],
                  ['Collaterals', Array.isArray(collateralsQuery.data) ? collateralsQuery.data.length : '—'],
                ].map(([label, val]) => (
                  <div key={String(label)} className={styles.statementCard}>
                    <div className={styles.statementCardLabel}>{label}</div>
                    <div className={styles.statementCardValue}>{String(val)}</div>
                  </div>
                ))}
              </div>
            </div>

            {recentLoans.length > 0 ? (
              <div className={styles.statementGroup}>
                <div className={styles.statementLoanHeader}>
                  <div>
                    <h3>Portfolio snapshot</h3>
                    <p className={styles.statementSubtle}>Latest loan records before generating the full statement.</p>
                  </div>
                  <span className={styles.statementBadge}>{recentLoans.length} loan{recentLoans.length>1?'s':''}</span>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr><th>#</th><th>Status</th><th>Principal</th><th>Expected</th><th>Balance</th><th>Disbursed</th></tr>
                    </thead>
                    <tbody>
                      {recentLoans.map((loan) => (
                        <tr key={loan.id}>
                          <td>{loan.id}</td>
                          <td><span className={`${styles.loanStatusBadge} ${loanStatusClass(String(loan.status||''))}`}>{toLabel(loan.status)}</span></td>
                          <td>{formatCurrency(loan.principal)}</td>
                          <td>{formatCurrency(loan.expected_total)}</td>
                          <td>{formatCurrency(loan.balance)}</td>
                          <td>{formatDate(loan.disbursed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className={styles.statementEmpty}>No loans yet — statement will include only the borrower profile.</p>
            )}
          </div>
        </section>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          PANEL: Attachments
      ═══════════════════════════════════════════════════════════════ */}
      {activePanel === 'attachments' ? (
        <section className={styles.sectionCard}>
          <h2>Attachments</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.label}>Passport Photo</div>
              <div className={styles.value}>{client.photo_url ? <a href={client.photo_url} target="_blank" rel="noreferrer">Open photo ↗</a> : 'Not uploaded'}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>ID Document</div>
              <div className={styles.value}>{client.id_document_url ? <a href={client.id_document_url} target="_blank" rel="noreferrer">Open document ↗</a> : 'Not uploaded'}</div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          PANEL: Notes
      ═══════════════════════════════════════════════════════════════ */}
      {activePanel === 'notes' ? (
        <section className={styles.sectionCard}>
          <h2>Notes</h2>
          <div className={styles.stack}>
            <div className={styles.detailPanel}>
              <div className={styles.noteTitle}>Current onboarding direction</div>
              <p className={styles.muted} style={{ marginTop: 6 }}>
                {isEligibleForRepeat ? 'Latest loan is closed. Begin the next cycle when the borrower is ready.' : toLabel(onboarding?.nextStep, 'Ready for next action')}
              </p>
            </div>
            <div className={styles.detailPanel}>
              <div className={styles.noteTitle}>Customer 360 workspace</div>
              <p className={styles.muted} style={{ marginTop: 6 }}>
                Use this view to verify profile completeness, guarantors, collateral, and current loan exposure before taking action.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          PANEL: More Info
      ═══════════════════════════════════════════════════════════════ */}
      {activePanel === 'more-info' ? (
        <section className={styles.sectionCard}>
          <h2>Contact &amp; Recovery</h2>
          <div className={styles.grid}>
            {[
              ['Next of kin', client.next_of_kin_name],
              ['NOK phone', client.next_of_kin_phone],
              ['Relationship', client.next_of_kin_relation],
              ['Residential address', client.residential_address],
            ].map(([label, val]) => (
              <div key={String(label)} className={styles.card}>
                <div className={styles.label}>{label}</div>
                <div className={styles.value}>{toText(val)}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          PANEL: Business Details
      ═══════════════════════════════════════════════════════════════ */}
      {activePanel === 'business-details' ? (
        <section className={styles.sectionCard}>
          <h2>Business Details</h2>
          <div className={styles.grid}>
            {[
              ['Business type', client.business_type],
              ['Years in business', client.business_years],
              ['Business location', client.business_location],
            ].map(([label, val]) => (
              <div key={String(label)} className={styles.card}>
                <div className={styles.label}>{label}</div>
                <div className={styles.value}>{toText(val)}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          PANEL: Guarantor Details
      ═══════════════════════════════════════════════════════════════ */}
      {activePanel === 'guarantor-details' ? (
        <section className={styles.sectionCard}>
          <div className={styles.sectionTitleRow}>
            <h2>Guarantors</h2>
            <span className={styles.statementBadge}>{Array.isArray(guarantorsQuery.data) ? guarantorsQuery.data.length : 0} linked</span>
          </div>
          {guarantorsQuery.isLoading ? <p className={styles.muted}>Loading...</p>
            : guarantorsQuery.isError ? <p className={styles.muted}>Unable to load guarantors.</p>
            : guarantorsQuery.data && guarantorsQuery.data.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Name</th><th>Phone</th><th>National ID</th><th>Occupation</th><th>Monthly income</th><th>Guarantee amount</th></tr>
                </thead>
                <tbody>
                  {guarantorsQuery.data.map((g) => (
                    <tr key={g.id}>
                      <td>{toText(g.full_name)}</td>
                      <td>{toText(g.phone)}</td>
                      <td>{toText(g.national_id)}</td>
                      <td>{toText(g.occupation)}</td>
                      <td>{formatAmount(g.monthly_income)}</td>
                      <td>{formatAmount(g.guarantee_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.emptyState}><p>No guarantors linked yet.</p><button type="button" className={styles.secondaryButton} onClick={() => { setActionStep('guarantor'); switchPanel('actions') }}>Add guarantor</button></div>}
        </section>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          PANEL: Collateral Details
      ═══════════════════════════════════════════════════════════════ */}
      {activePanel === 'collateral-details' ? (
        <section className={styles.sectionCard}>
          <div className={styles.sectionTitleRow}>
            <h2>Collateral</h2>
            <span className={styles.statementBadge}>{Array.isArray(collateralsQuery.data) ? collateralsQuery.data.length : 0} linked</span>
          </div>
          {collateralsQuery.isLoading ? <p className={styles.muted}>Loading...</p>
            : collateralsQuery.isError ? <p className={styles.muted}>Unable to load collateral.</p>
            : collateralsQuery.data && collateralsQuery.data.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Asset type</th><th>Description</th><th>Estimated value</th><th>Owner</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {collateralsQuery.data.map((c) => (
                    <tr key={c.id}>
                      <td>{toLabel(c.asset_type)}</td>
                      <td>{toText(c.description)}</td>
                      <td>{formatAmount(c.estimated_value)}</td>
                      <td>{toText(c.owner_name)}</td>
                      <td>{toLabel(c.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.emptyState}><p>No collateral linked yet.</p><button type="button" className={styles.secondaryButton} onClick={() => { setActionStep('collateral'); switchPanel('actions') }}>Add collateral</button></div>}
        </section>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          PANEL: Actions / Onboarding
      ═══════════════════════════════════════════════════════════════ */}
      {activePanel === 'actions' && canManageClient ? (
        <section className={styles.sectionCard}>
          {/* Onboarding status chips */}
          {onboarding ? (
            <div className={styles.onboardingCompact}>
              <span className={styles.onboardingCompactChip}>{toLabel(onboarding.onboardingStatus, 'Onboarding')}</span>
              <span className={kycDone ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>KYC: {toLabel(onboarding.kycStatus)}</span>
              <span className={feeDone ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>Fee: {toLabel(onboarding.feePaymentStatus)}</span>
              <span className={guarantorDone ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>Guarantors: {onboarding.counts?.guarantors || 0}</span>
              <span className={collateralDone ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>Collateral: {onboarding.counts?.collaterals || 0}</span>
              <span className={clientReady ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>
                {clientReady ? '✓ Ready for loan' : '⏳ Not yet ready'}
              </span>
            </div>
          ) : null}

          {/* Onboarding complete CTA */}
          {onboarding && clientReady && !isEligibleForRepeat && canCreateLoan ? (
            <div style={{ background: 'rgba(0,220,150,0.07)', border: '1px solid rgba(0,220,150,0.22)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: 'var(--success-text)', fontSize: '0.95rem' }}>✓ Onboarding complete</strong>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '0.84rem' }}>All requirements met — this borrower is ready for their first loan application.</p>
              </div>
              <Link className={styles.primaryButton} to={createLoanHref} style={{ whiteSpace: 'nowrap' }}>Create Loan →</Link>
            </div>
          ) : null}

          <div className={styles.sectionTitleRow}>
            <h2>{isEligibleForRepeat ? 'Next Actions' : 'Complete Onboarding'}</h2>
            {canStartLoan ? <Link className={styles.primaryLink} to={createLoanHref}>{isEligibleForRepeat ? 'Start next cycle' : 'Start loan application'}</Link> : null}
          </div>

          {/* Step progress indicator */}
          {onboarding ? (
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { key: 'kyc' as ActionStep, label: 'KYC', done: kycDone },
                { key: 'guarantor' as ActionStep, label: 'Guarantor', done: guarantorDone },
                { key: 'collateral' as ActionStep, label: 'Collateral', done: collateralDone },
                { key: 'fee' as ActionStep, label: 'Fee', done: feeDone },
              ].map((step, i, arr) => {
                const isCurrent = actionStep === step.key
                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => setActionStep(step.key)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                        borderRadius: 10, border: '1px solid', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        background: step.done ? 'rgba(0,220,150,0.1)' : isCurrent ? 'rgba(75,156,245,0.12)' : 'rgba(255,255,255,0.04)',
                        borderColor: step.done ? 'rgba(0,220,150,0.3)' : isCurrent ? 'rgba(75,156,245,0.35)' : 'rgba(255,255,255,0.1)',
                        color: step.done ? 'var(--success-text)' : isCurrent ? 'var(--accent-blue)' : 'var(--text-muted)',
                      }}
                    >
                      <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, background: step.done ? 'var(--success-text)' : isCurrent ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)', color: step.done||isCurrent ? '#fff' : 'var(--text-muted)' }}>
                        {step.done ? '✓' : i + 1}
                      </span>
                      {step.label}
                    </button>
                    {i < arr.length - 1 ? <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>→</span> : null}
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* ── KYC step ───────────────────────────────────────── */}
          {actionStep === 'kyc' ? (
            <div className={styles.stepFormCard}>
              <h3>KYC Verification</h3>
              <p>Set the KYC status and add a review note for this borrower.</p>
              <div className={styles.inlineForm}>
                <label>
                  <span>Status</span>
                  <select value={kycForm.status} onChange={(e) => setKycForm((p) => ({ ...p, status: e.target.value as ClientKycStatus }))}>
                    <option value="pending">Pending</option>
                    <option value="in_review">In review</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
                <label className={styles.fullWidthField}>
                  <span>Note</span>
                  <input value={kycForm.note} onChange={(e) => setKycForm((p) => ({ ...p, note: e.target.value }))} placeholder="Optional review note" />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={styles.primaryButton} onClick={submitKycUpdate} disabled={updateKycMutation.isPending}>
                  {updateKycMutation.isPending ? 'Saving...' : 'Update KYC'}
                </button>
                {!guarantorDone && <button type="button" className={styles.secondaryButton} onClick={() => setActionStep('guarantor')}>Next: Guarantor →</button>}
              </div>
            </div>
          ) : null}

          {/* ── Guarantor step ─────────────────────────────────── */}
          {actionStep === 'guarantor' ? (
            <div className={styles.stepFormCard}>
              <h3>Add Guarantor</h3>
              <p>Link a guarantor who will back this borrower's loan applications. {guarantorDone ? `(${onboarding?.counts?.guarantors} already linked)` : 'None linked yet.'}</p>
              <div className={styles.inlineForm}>
                <label><span>Full name *</span><input value={guarantorForm.fullName} onChange={(e) => setGuarantorForm((p) => ({ ...p, fullName: e.target.value }))} placeholder="Guarantor full name" /></label>
                <label><span>Phone</span><input value={guarantorForm.phone} onChange={(e) => setGuarantorForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+254 7XX..." /></label>
                <label><span>National ID</span><input value={guarantorForm.nationalId} onChange={(e) => setGuarantorForm((p) => ({ ...p, nationalId: e.target.value }))} /></label>
                <label><span>Physical address</span><input value={guarantorForm.physicalAddress} onChange={(e) => setGuarantorForm((p) => ({ ...p, physicalAddress: e.target.value }))} /></label>
                <label><span>Occupation</span><input value={guarantorForm.occupation} onChange={(e) => setGuarantorForm((p) => ({ ...p, occupation: e.target.value }))} /></label>
                <label><span>Employer name</span><input value={guarantorForm.employerName} onChange={(e) => setGuarantorForm((p) => ({ ...p, employerName: e.target.value }))} /></label>
                <label><span>Monthly income</span><input type="number" min={0} step="0.01" value={guarantorForm.monthlyIncome} onChange={(e) => setGuarantorForm((p) => ({ ...p, monthlyIncome: e.target.value }))} /></label>
                <label><span>Guarantee amount *</span><input type="number" min={0.01} step="0.01" value={guarantorForm.guaranteeAmount} onChange={(e) => setGuarantorForm((p) => ({ ...p, guaranteeAmount: e.target.value }))} /></label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={styles.primaryButton} onClick={submitGuarantor} disabled={createGuarantorMutation.isPending}>
                  {createGuarantorMutation.isPending ? 'Saving...' : 'Add guarantor'}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => setActionStep('collateral')}>Next: Collateral →</button>
              </div>
            </div>
          ) : null}

          {/* ── Collateral step ────────────────────────────────── */}
          {actionStep === 'collateral' ? (
            <div className={styles.stepFormCard}>
              <h3>Add Collateral</h3>
              <p>Register a collateral asset for this borrower. {collateralDone ? `(${onboarding?.counts?.collaterals} already linked)` : 'None linked yet.'}</p>
              <div className={styles.inlineForm}>
                <label><span>Asset type</span><select value={collateralForm.assetType} onChange={(e) => setCollateralForm((p) => ({ ...p, assetType: e.target.value as ClientCollateralAssetType }))}>{CLIENT_COLLATERAL_ASSET_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                <label><span>Description *</span><input value={collateralForm.description} onChange={(e) => setCollateralForm((p) => ({ ...p, description: e.target.value }))} placeholder="Describe the asset" /></label>
                <label><span>Estimated value *</span><input type="number" min={1} step="0.01" value={collateralForm.estimatedValue} onChange={(e) => setCollateralForm((p) => ({ ...p, estimatedValue: e.target.value }))} /></label>
                <label><span>Ownership type</span><select value={collateralForm.ownershipType} onChange={(e) => setCollateralForm((p) => ({ ...p, ownershipType: e.target.value as ClientCollateralOwnershipType }))}>{CLIENT_COLLATERAL_OWNERSHIP_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                <label><span>Owner name</span><input value={collateralForm.ownerName} onChange={(e) => setCollateralForm((p) => ({ ...p, ownerName: e.target.value }))} /></label>
                <label><span>Registration no.</span><input value={collateralForm.registrationNumber} onChange={(e) => setCollateralForm((p) => ({ ...p, registrationNumber: e.target.value }))} /></label>
                <label><span>Title number</span><input value={collateralForm.titleNumber} onChange={(e) => setCollateralForm((p) => ({ ...p, titleNumber: e.target.value }))} /></label>
                <label><span>Logbook number</span><input value={collateralForm.logbookNumber} onChange={(e) => setCollateralForm((p) => ({ ...p, logbookNumber: e.target.value }))} /></label>
                <label><span>Location</span><input value={collateralForm.locationDetails} onChange={(e) => setCollateralForm((p) => ({ ...p, locationDetails: e.target.value }))} /></label>
                <label><span>Valuation date</span><input type="date" value={collateralForm.valuationDate} onChange={(e) => setCollateralForm((p) => ({ ...p, valuationDate: e.target.value }))} /></label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={styles.primaryButton} onClick={submitCollateral} disabled={createCollateralMutation.isPending}>
                  {createCollateralMutation.isPending ? 'Saving...' : 'Add collateral'}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => setActionStep('fee')}>Next: Fee →</button>
              </div>
            </div>
          ) : null}

          {/* ── Fee step ──────────────────────────────────────── */}
          {actionStep === 'fee' ? (
            <div className={styles.stepFormCard}>
              <h3>Record Fee Payment</h3>
              <p>Log the client registration or onboarding fee. Current status: <strong>{toLabel(onboarding?.feePaymentStatus, 'Unpaid')}</strong>.</p>
              <div className={styles.inlineForm}>
                <label><span>Amount</span><input type="number" min={0} step="0.01" value={feeForm.amount} onChange={(e) => setFeeForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" /></label>
                <label><span>Payment reference</span><input value={feeForm.paymentReference} onChange={(e) => setFeeForm((p) => ({ ...p, paymentReference: e.target.value }))} placeholder="M-Pesa ref, receipt no..." /></label>
                <label><span>Paid at</span><input type="date" value={feeForm.paidAt} onChange={(e) => setFeeForm((p) => ({ ...p, paidAt: e.target.value }))} /></label>
                <label className={styles.fullWidthField}><span>Note</span><input value={feeForm.note} onChange={(e) => setFeeForm((p) => ({ ...p, note: e.target.value }))} placeholder="Optional note" /></label>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={styles.primaryButton} onClick={submitFeePayment} disabled={recordFeeMutation.isPending}>
                  {recordFeeMutation.isPending ? 'Recording...' : 'Record fee payment'}
                </button>
                {canStartLoan && (
                  <Link className={styles.primaryLink} to={createLoanHref}>Onboarding done — Create loan →</Link>
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
