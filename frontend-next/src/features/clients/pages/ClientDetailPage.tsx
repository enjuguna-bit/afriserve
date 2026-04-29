import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import axios from 'axios'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AsyncState } from '../../../components/common/AsyncState'
import { useToastStore } from '../../../store/toastStore'
import { hasAnyRole } from '../../../app/roleAccess'
import { useAuth } from '../../../hooks/useAuth'
import { reverseGeocodeCoordinates } from '../../../services/clientService'
import { getLoanStatement } from '../../../services/loanService'
import { downloadBlob } from '../../../utils/fileDownload'
import { optimizeImageForUpload } from '../../../utils/imageOptimization'
import { formatDisplayDate, formatDisplayDateTime, parseDisplayDate } from '../../../utils/dateFormatting'
import { formatDisplayLabel, formatDisplayText } from '../../../utils/displayFormatting'
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
  useUpdateClient,
  useUpdateClientKyc,
  useUploadClientDocument,
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
type UploadedDocumentState = { url: string; name: string }
type UploadTarget = 'photo' | 'customer-id' | 'guarantor' | 'collateral'
type UploadDocumentType = 'photo' | 'id_document' | 'guarantor_id_document' | 'collateral_document'
type LocationDraftState = {
  latitude: string
  longitude: string
  accuracyMeters: string
  displayName: string
  status: 'idle' | 'locating' | 'saving' | 'ready' | 'error'
  source: 'gps' | 'manual' | null
}

type ActivePanel = 'basic-info' | 'statement' | 'attachments' | 'notes' | 'more-info' | 'business-details' | 'guarantor-details' | 'collateral-details' | 'actions'
type ActionStep = 'profile' | 'kyc' | 'guarantor' | 'collateral' | 'fee'
type CameraCaptureState = 'idle' | 'requesting' | 'ready' | 'capturing'
type CameraCaptureConfig = {
  uploadTarget: 'photo' | 'customer-id' | 'guarantor'
  documentType: 'photo' | 'id_document' | 'guarantor_id_document'
  title: string
  description: string
  captureButtonLabel: string
  fallbackLabel: string
  facingMode: 'user' | 'environment'
  fileNamePrefix: string
}

// ─── Empty state defaults ─────────────────────────────────────────────────────

const EMPTY_GUARANTOR: GuarantorFormState = { fullName: '', phone: '', nationalId: '', physicalAddress: '', occupation: '', employerName: '', monthlyIncome: '', guaranteeAmount: '' }
const EMPTY_COLLATERAL: CollateralFormState = { assetType: 'chattel', description: '', estimatedValue: '', ownershipType: 'client', ownerName: '', ownerNationalId: '', registrationNumber: '', logbookNumber: '', titleNumber: '', locationDetails: '', valuationDate: '' }
const EMPTY_FEE: FeeFormState = { amount: '', paymentReference: '', paidAt: '', note: '' }
const EMPTY_KYC: KycFormState = { status: 'verified', note: '' }
const EMPTY_LOCATION_DRAFT: LocationDraftState = { latitude: '', longitude: '', accuracyMeters: '', displayName: '', status: 'idle', source: null }
const MAP_NUDGE_DELTA = 0.00035

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
  return formatDisplayText(value, fallback)
}

function toLabel(value: unknown, fallback = '—') {
  return formatDisplayLabel(value, fallback)
}

function formatAmount(value: unknown) {
  const p = Number(value || 0)
  return Number.isFinite(p) ? p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
}

function formatCurrency(value: unknown) { return `Ksh ${formatAmount(value)}` }

function formatDate(value: string | null | undefined, fallback = '—') {
  return formatDisplayDate(value, fallback)
}

function formatDateTime(value: string | null | undefined, fallback = '—') {
  return formatDisplayDateTime(value, fallback)
}

function compareByRecency(a: { id: number; disbursed_at: string | null }, b: { id: number; disbursed_at: string | null }) {
  const at = parseDisplayDate(a.disbursed_at)?.getTime() ?? 0
  const bt = parseDisplayDate(b.disbursed_at)?.getTime() ?? 0
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

function hasCoordinates(latitude: unknown, longitude: unknown) {
  return latitude != null
    && longitude != null
    && String(latitude).trim() !== ''
    && String(longitude).trim() !== ''
    && Number.isFinite(Number(latitude))
    && Number.isFinite(Number(longitude))
}

function formatReverseGeocodeDisplay(result: {
  displayName: string | null
  address?: {
    street?: string | null
    suburb?: string | null
    city?: string | null
    county?: string | null
    country?: string | null
  }
}) {
  if (result.displayName) {
    return result.displayName
  }

  return [
    result.address?.street,
    result.address?.suburb,
    result.address?.city,
    result.address?.county,
    result.address?.country,
  ].filter(Boolean).join(', ')
}

function buildMapEmbedUrl(latitude: number, longitude: number) {
  const latSpan = 0.008
  const lngSpan = 0.008
  const left = longitude - lngSpan
  const right = longitude + lngSpan
  const top = latitude + latSpan
  const bottom = latitude - latSpan

  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${latitude}%2C${longitude}`
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

const CAMERA_CAPTURE_CONFIGS: Record<'photo' | 'customer-id' | 'guarantor', CameraCaptureConfig> = {
  photo: {
    uploadTarget: 'photo',
    documentType: 'photo',
    title: 'Capture customer photo',
    description: 'Frame the borrower clearly, then take the photo to upload it into Customer 360.',
    captureButtonLabel: 'Take photo',
    fallbackLabel: 'Use file instead',
    facingMode: 'user',
    fileNamePrefix: 'customer-photo',
  },
  'customer-id': {
    uploadTarget: 'customer-id',
    documentType: 'id_document',
    title: 'Capture customer ID',
    description: 'Use the rear camera and keep the ID flat so the name and ID number stay crisp after upload.',
    captureButtonLabel: 'Capture ID image',
    fallbackLabel: 'Upload ID file instead',
    facingMode: 'environment',
    fileNamePrefix: 'customer-id',
  },
  guarantor: {
    uploadTarget: 'guarantor',
    documentType: 'guarantor_id_document',
    title: 'Capture guarantor ID',
    description: 'Use the rear camera and keep the guarantor ID steady so all text remains easy to read.',
    captureButtonLabel: 'Capture ID image',
    fallbackLabel: 'Upload ID file instead',
    facingMode: 'environment',
    fileNamePrefix: 'guarantor-id',
  },
}

export function ClientDetailPage() {
  const { id } = useParams()
  const clientId = Number(id)
  const { user } = useAuth()
  const location = useLocation()
  const justCreated = Boolean((location.state as Record<string, unknown> | null)?.justCreated)
  const pushToast = useToastStore((state) => state.pushToast)

  const [activePanel, setActivePanel]   = useState<ActivePanel>(justCreated ? 'actions' : 'basic-info')
  const [actionStep, setActionStep]     = useState<ActionStep>('profile')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [guarantorForm, setGuarantorForm] = useState<GuarantorFormState>(EMPTY_GUARANTOR)
  const [collateralForm, setCollateralForm] = useState<CollateralFormState>(EMPTY_COLLATERAL)
  const [feeForm, setFeeForm]           = useState<FeeFormState>(EMPTY_FEE)
  const [kycForm, setKycForm]           = useState<KycFormState>(EMPTY_KYC)
  const [customerIdDocument, setCustomerIdDocument] = useState<UploadedDocumentState | null>(null)
  const [guarantorDocument, setGuarantorDocument] = useState<UploadedDocumentState | null>(null)
  const [collateralDocument, setCollateralDocument] = useState<UploadedDocumentState | null>(null)
  const [locationDraft, setLocationDraft] = useState<LocationDraftState>(EMPTY_LOCATION_DRAFT)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null)
  const [isGeneratingStatement, setIsGeneratingStatement] = useState(false)
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false)
  const [cameraCaptureState, setCameraCaptureState] = useState<CameraCaptureState>('idle')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraCaptureConfig, setCameraCaptureConfig] = useState<CameraCaptureConfig | null>(null)

  const cameraPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const filePhotoInputRef = useRef<HTMLInputElement | null>(null)
  const customerIdCameraInputRef = useRef<HTMLInputElement | null>(null)
  const customerIdDocInputRef = useRef<HTMLInputElement | null>(null)
  const guarantorCameraInputRef = useRef<HTMLInputElement | null>(null)
  const guarantorDocInputRef = useRef<HTMLInputElement | null>(null)
  const collateralDocInputRef = useRef<HTMLInputElement | null>(null)
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const cameraRequestTokenRef = useRef(0)

  const clientQuery      = useClient(clientId)
  const onboardingQuery  = useClientOnboardingStatus(clientId)
  const guarantorsQuery  = useClientGuarantors(clientId)
  const collateralsQuery = useClientCollaterals(clientId)
  const updateClientMutation     = useUpdateClient(clientId)
  const createGuarantorMutation  = useCreateClientGuarantor(clientId)
  const createCollateralMutation = useCreateClientCollateral(clientId)
  const recordFeeMutation        = useRecordClientFeePayment(clientId)
  const updateKycMutation        = useUpdateClientKyc(clientId)
  const uploadDocumentMutation   = useUploadClientDocument(clientId)

  useEffect(() => {
    const currentClient = clientQuery.data
    if (!currentClient) {
      return
    }

    setLocationDraft((previous) => {
      const nextLatitude = currentClient.latitude == null ? '' : String(currentClient.latitude)
      const nextLongitude = currentClient.longitude == null ? '' : String(currentClient.longitude)
      const nextAccuracy = currentClient.location_accuracy_meters == null ? '' : String(currentClient.location_accuracy_meters)
      const nextDisplayName = previous.displayName || currentClient.residential_address || currentClient.business_location || ''

      if (
        previous.latitude === nextLatitude
        && previous.longitude === nextLongitude
        && previous.accuracyMeters === nextAccuracy
        && previous.displayName === nextDisplayName
      ) {
        return previous
      }

      return {
        latitude: nextLatitude,
        longitude: nextLongitude,
        accuracyMeters: nextAccuracy,
        displayName: nextDisplayName,
        status: hasCoordinates(currentClient.latitude, currentClient.longitude) ? 'ready' : previous.status,
        source: hasCoordinates(currentClient.latitude, currentClient.longitude) ? previous.source || 'gps' : previous.source,
      }
    })
  }, [
    clientQuery.data,
    clientQuery.data?.latitude,
    clientQuery.data?.longitude,
    clientQuery.data?.location_accuracy_meters,
    clientQuery.data?.residential_address,
    clientQuery.data?.business_location,
  ])

  const currentClient = clientQuery.data
  const onboarding = onboardingQuery.data
  const profilePhotoDone = Boolean(currentClient?.photo_url || onboarding?.checklist?.profilePhotoAdded)
  const customerIdDocumentUrl = customerIdDocument?.url || currentClient?.id_document_url || null
  const customerIdDocumentDone = Boolean(customerIdDocumentUrl)
  const locationDone = Boolean(
    onboarding?.checklist?.locationCaptured
    || onboarding?.location?.captured
    || hasCoordinates(currentClient?.latitude, currentClient?.longitude),
  )
  const profileDone = profilePhotoDone && locationDone
  const kycDone = String(onboarding?.kycStatus || '').toLowerCase() === 'verified'
  const guarantorDocsDone = Boolean(onboarding?.checklist?.guarantorDocumentsComplete)
  const collateralDocsDone = Boolean(onboarding?.checklist?.collateralDocumentsComplete)
  const guarantorDone = Number(onboarding?.counts?.guarantors || 0) > 0 && guarantorDocsDone
  const collateralDone = Number(onboarding?.counts?.collaterals || 0) > 0 && collateralDocsDone
  const feeDone = String(onboarding?.feePaymentStatus || '').toLowerCase() === 'paid'

  useEffect(() => {
    if (actionStep === 'profile') {
      return
    }
    if (actionStep === 'kyc' && !profileDone) {
      setActionStep('profile')
      return
    }
    if (actionStep === 'guarantor' && (!profileDone || !kycDone)) {
      setActionStep(profileDone ? 'kyc' : 'profile')
      return
    }
    if (actionStep === 'collateral' && (!profileDone || !kycDone || !guarantorDone)) {
      setActionStep(!profileDone ? 'profile' : !kycDone ? 'kyc' : 'guarantor')
      return
    }
    if (actionStep === 'fee' && (!profileDone || !kycDone || !guarantorDone || !collateralDone)) {
      setActionStep(!profileDone ? 'profile' : !kycDone ? 'kyc' : !guarantorDone ? 'guarantor' : 'collateral')
    }
  }, [actionStep, profileDone, kycDone, guarantorDone, collateralDone])

  useEffect(() => {
    if (!isCameraModalOpen) {
      return
    }

    const previewElement = cameraPreviewRef.current
    const stream = cameraStreamRef.current
    if (!previewElement || !stream) {
      return
    }

    previewElement.srcObject = stream
    previewElement.muted = true
    previewElement.playsInline = true
    void previewElement.play().catch(() => {})

    return () => {
      if (previewElement.srcObject === stream) {
        previewElement.srcObject = null
      }
    }
  }, [isCameraModalOpen, cameraCaptureState])

  useEffect(() => () => {
    cameraRequestTokenRef.current += 1
    const stream = cameraStreamRef.current
    if (!stream) {
      return
    }

    stream.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
  }, [])

  if (!Number.isInteger(clientId) || clientId <= 0) return <AsyncState error errorText="Invalid client ID." />
  if (clientQuery.isLoading) return <AsyncState loading loadingText="Loading client profile..." />
  if (clientQuery.isError || !currentClient) {
    return <AsyncState error errorText="Unable to load client details." onRetry={() => { void clientQuery.refetch() }} />
  }

  const client = currentClient

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

  const mapLatitude = Number(locationDraft.latitude || client.latitude || 0)
  const mapLongitude = Number(locationDraft.longitude || client.longitude || 0)
  const hasDraftCoordinates = hasCoordinates(locationDraft.latitude, locationDraft.longitude)

  function canSelectStep(step: ActionStep) {
    if (step === 'profile') return true
    if (step === 'kyc') return profileDone
    if (step === 'guarantor') return profileDone && kycDone
    if (step === 'collateral') return profileDone && kycDone && guarantorDone
    return profileDone && kycDone && guarantorDone && collateralDone
  }

  function switchPanel(panel: ActivePanel) {
    setActivePanel(panel)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function stopCameraStream() {
    const stream = cameraStreamRef.current
    if (!stream) {
      return
    }

    stream.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
  }

  function closeCameraModal() {
    cameraRequestTokenRef.current += 1
    stopCameraStream()
    setIsCameraModalOpen(false)
    setCameraCaptureState('idle')
    setCameraError(null)
    setCameraCaptureConfig(null)
  }

  function getCameraFallbackInput(target: CameraCaptureConfig['uploadTarget']) {
    if (target === 'photo') {
      return cameraPhotoInputRef.current
    }
    if (target === 'customer-id') {
      return customerIdCameraInputRef.current
    }
    return guarantorCameraInputRef.current
  }

  function getFileInput(target: CameraCaptureConfig['uploadTarget']) {
    if (target === 'photo') {
      return filePhotoInputRef.current
    }
    if (target === 'customer-id') {
      return customerIdDocInputRef.current
    }
    return guarantorDocInputRef.current
  }

  function openFilePickerForTarget(target: CameraCaptureConfig['uploadTarget']) {
    closeCameraModal()
    window.setTimeout(() => getFileInput(target)?.click(), 0)
  }

  async function openCameraCapture(config: CameraCaptureConfig) {
    if (!navigator.mediaDevices?.getUserMedia) {
      pushToast({ type: 'error', message: 'This browser cannot open the camera directly. Falling back to the device camera input.' })
      getCameraFallbackInput(config.uploadTarget)?.click()
      return
    }

    const requestToken = cameraRequestTokenRef.current + 1
    cameraRequestTokenRef.current = requestToken

    setCameraCaptureConfig(config)
    setIsCameraModalOpen(true)
    setCameraCaptureState('requesting')
    setCameraError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: config.facingMode,
          width: { ideal: config.facingMode === 'user' ? 1280 : 1920 },
          height: { ideal: config.facingMode === 'user' ? 720 : 1080 },
        },
      })

      if (cameraRequestTokenRef.current !== requestToken) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      stopCameraStream()
      cameraStreamRef.current = stream
      setCameraCaptureState('ready')
    } catch (error) {
      if (cameraRequestTokenRef.current !== requestToken) {
        return
      }

      setCameraCaptureState('idle')
      setCameraError('Camera access was blocked or is unavailable on this device.')
      pushToast({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to open the camera. You can choose a file instead.'),
      })
    }
  }

  async function capturePhotoFromCamera() {
    if (cameraCaptureState !== 'ready' || !cameraCaptureConfig) {
      return
    }

    const previewElement = cameraPreviewRef.current
    if (!previewElement || previewElement.videoWidth <= 0 || previewElement.videoHeight <= 0) {
      pushToast({ type: 'error', message: 'Camera preview is not ready yet. Try again in a moment.' })
      return
    }

    setCameraCaptureState('capturing')

    try {
      const captureCanvas = document.createElement('canvas')
      captureCanvas.width = previewElement.videoWidth
      captureCanvas.height = previewElement.videoHeight

      const context = captureCanvas.getContext('2d')
      if (!context) {
        throw new Error('Could not create a canvas context for camera capture.')
      }

      context.drawImage(previewElement, 0, 0, captureCanvas.width, captureCanvas.height)

      const captureBlob = await new Promise<Blob | null>((resolve) => {
        captureCanvas.toBlob(resolve, 'image/jpeg', 0.92)
      })

      if (!captureBlob) {
        throw new Error('Could not convert the camera frame into an image.')
      }

      const photoFile = new File(
        [captureBlob],
        `${cameraCaptureConfig.fileNamePrefix}-${client.id}-${Date.now()}.jpg`,
        { type: captureBlob.type || 'image/jpeg' },
      )

      closeCameraModal()
      await uploadDocument(photoFile, cameraCaptureConfig.uploadTarget, cameraCaptureConfig.documentType)
    } catch (error) {
      setCameraCaptureState('ready')
      pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to capture a photo from the camera.') })
    }
  }

  // Auto-advance to the next incomplete action step when entering the Actions panel
  function openActions() {
    if (!profileDone)    setActionStep('profile')
    else if (!kycDone)        setActionStep('kyc')
    else if (!guarantorDone) setActionStep('guarantor')
    else if (!collateralDone) setActionStep('collateral')
    else if (!feeDone)   setActionStep('fee')
    else                 setActionStep('profile')
    switchPanel('actions')
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async function prepareUploadFile(file: File, target: UploadTarget) {
    if (!file.type.startsWith('image/')) {
      return file
    }

    if (target === 'photo') {
      return optimizeImageForUpload(file, {
        targetBytes: 320 * 1024,
        maxDimension: 1440,
        qualitySteps: [0.94, 0.9, 0.86, 0.82, 0.78],
      })
    }

    return optimizeImageForUpload(file, {
      targetBytes: 650 * 1024,
      maxDimension: 2000,
      qualitySteps: [0.98, 0.94, 0.9, 0.86, 0.82],
    })
  }

  async function uploadDocument(
    file: File,
    target: UploadTarget,
    documentType: UploadDocumentType,
  ) {
    setUploadTarget(target)
    try {
      const preparedFile = await prepareUploadFile(file, target)
      const response = await uploadDocumentMutation.mutateAsync({ file: preparedFile, documentType })
      const uploadedUrl = String((response as { url?: unknown })?.url || '').trim()
      if (!uploadedUrl) {
        throw new Error('Upload completed without a document URL')
      }

      if (target === 'customer-id') {
        setCustomerIdDocument({ url: uploadedUrl, name: preparedFile.name })
      }
      if (target === 'guarantor') {
        setGuarantorDocument({ url: uploadedUrl, name: preparedFile.name })
      }
      if (target === 'collateral') {
        setCollateralDocument({ url: uploadedUrl, name: preparedFile.name })
      }

      pushToast({
        type: 'success',
        message: target === 'photo'
          ? 'Customer photo uploaded and optimized.'
          : target === 'customer-id'
            ? 'Customer ID uploaded with readable image compression.'
          : target === 'guarantor'
            ? 'Guarantor ID uploaded with readable image compression.'
            : 'Collateral document uploaded.',
      })
    } catch (error) {
      const fallbackMessage = target === 'photo'
        ? 'Failed to upload customer photo.'
        : target === 'customer-id'
          ? 'Failed to upload customer ID.'
          : target === 'guarantor'
            ? 'Failed to upload guarantor ID.'
            : 'Failed to upload document.'
      pushToast({
        type: 'error',
        message: getApiErrorMessage(error, fallbackMessage),
      })
    } finally {
      setUploadTarget(null)
    }
  }

  async function handleProfilePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await uploadDocument(file, 'photo', 'photo')
  }

  async function handleCustomerIdDocumentSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await uploadDocument(file, 'customer-id', 'id_document')
  }

  async function handleGuarantorDocumentSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await uploadDocument(file, 'guarantor', 'guarantor_id_document')
  }

  async function handleCollateralDocumentSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await uploadDocument(file, 'collateral', 'collateral_document')
  }

  async function saveLocation(latitude: number, longitude: number, accuracyMeters: number | null, source: 'gps' | 'manual') {
    setLocationDraft((previous) => ({
      ...previous,
      latitude: String(latitude),
      longitude: String(longitude),
      accuracyMeters: accuracyMeters == null ? previous.accuracyMeters : String(Math.round(accuracyMeters)),
      status: 'saving',
      source,
    }))
    setLocationError(null)

    const geocode = await reverseGeocodeCoordinates(latitude, longitude)
    const displayName = formatReverseGeocodeDisplay(geocode)
    const capturedAt = new Date().toISOString()

    await updateClientMutation.mutateAsync({
      latitude,
      longitude,
      locationAccuracyMeters: accuracyMeters == null ? undefined : Number(accuracyMeters.toFixed(2)),
      locationCapturedAt: capturedAt,
      residentialAddress: displayName || undefined,
      businessLocation: client.business_location || displayName || undefined,
    })

    setLocationDraft({
      latitude: String(latitude),
      longitude: String(longitude),
      accuracyMeters: accuracyMeters == null ? '' : String(Math.round(accuracyMeters)),
      displayName,
      status: 'ready',
      source,
    })
  }

  async function captureLocationFromGps() {
    if (!navigator.geolocation) {
      setLocationError('This browser does not support GPS capture.')
      pushToast({ type: 'error', message: 'GPS capture is not supported in this browser.' })
      return
    }

    setLocationDraft((previous) => ({ ...previous, status: 'locating', source: 'gps' }))
    setLocationError(null)

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      })

      await saveLocation(
        Number(position.coords.latitude),
        Number(position.coords.longitude),
        Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        'gps',
      )
      pushToast({ type: 'success', message: 'GPS location captured and address populated.' })
    } catch (error) {
      const fallback = getApiErrorMessage(error, 'Unable to capture GPS location.')
      setLocationDraft((previous) => ({ ...previous, status: 'error' }))
      setLocationError(fallback)
      pushToast({ type: 'error', message: fallback })
    }
  }

  async function saveManualLocationPin() {
    const latitude = Number(locationDraft.latitude)
    const longitude = Number(locationDraft.longitude)
    const accuracy = locationDraft.accuracyMeters ? Number(locationDraft.accuracyMeters) : null

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setLocationError('Enter valid latitude and longitude values before saving the manual pin.')
      pushToast({ type: 'error', message: 'Manual pin requires valid latitude and longitude values.' })
      return
    }

    try {
      await saveLocation(latitude, longitude, Number.isFinite(Number(accuracy)) ? Number(accuracy) : null, 'manual')
      pushToast({ type: 'success', message: 'Manual location pin saved.' })
    } catch (error) {
      const fallback = getApiErrorMessage(error, 'Failed to save manual location pin.')
      setLocationDraft((previous) => ({ ...previous, status: 'error' }))
      setLocationError(fallback)
      pushToast({ type: 'error', message: fallback })
    }
  }

  function nudgeManualPin(latitudeDelta: number, longitudeDelta: number) {
    setLocationDraft((previous) => {
      const currentLatitude = Number(previous.latitude || client.latitude || 0)
      const currentLongitude = Number(previous.longitude || client.longitude || 0)

      return {
        ...previous,
        latitude: (currentLatitude + latitudeDelta).toFixed(6),
        longitude: (currentLongitude + longitudeDelta).toFixed(6),
        source: 'manual',
      }
    })
  }

  function submitKycUpdate() {
    updateKycMutation.mutate({ status: kycForm.status, note: kycForm.note.trim() || undefined }, {
      onSuccess: () => {
        pushToast({ type: 'success', message: 'KYC updated.' })
        setKycForm((p) => ({ ...p, note: '' }))
        if (String(kycForm.status).toLowerCase() === 'verified') {
          setActionStep('guarantor')
        }
      },
      onError: (e) => { pushToast({ type: 'error', message: getApiErrorMessage(e, 'Failed to update KYC.') }) },
    })
  }

  function submitGuarantor() {
    const fullName = guarantorForm.fullName.trim()
    if (fullName.length < 2) { pushToast({ type: 'error', message: 'Guarantor full name is required.' }); return }
    const guaranteeAmount = Number(guarantorForm.guaranteeAmount)
    if (!Number.isFinite(guaranteeAmount) || guaranteeAmount <= 0) { pushToast({ type: 'error', message: 'Guarantee amount must be greater than 0.' }); return }
    if (!guarantorDocument?.url) { pushToast({ type: 'error', message: 'Upload the guarantor ID before continuing.' }); return }
    const monthlyIncome = Number(guarantorForm.monthlyIncome)
    createGuarantorMutation.mutate({
      fullName, phone: guarantorForm.phone.trim()||undefined, nationalId: guarantorForm.nationalId.trim()||undefined,
      physicalAddress: guarantorForm.physicalAddress.trim()||undefined, occupation: guarantorForm.occupation.trim()||undefined,
      employerName: guarantorForm.employerName.trim()||undefined,
      monthlyIncome: Number.isFinite(monthlyIncome)&&monthlyIncome>=0 ? monthlyIncome : undefined,
      guaranteeAmount,
      idDocumentUrl: guarantorDocument.url,
    }, {
      onSuccess: () => {
        pushToast({ type: 'success', message: 'Guarantor added.' })
        setGuarantorForm(EMPTY_GUARANTOR)
        setGuarantorDocument(null)
        setActionStep('collateral')
      },
      onError: (e) => { pushToast({ type: 'error', message: getApiErrorMessage(e, 'Failed to add guarantor.') }) },
    })
  }

  function submitCollateral() {
    const description = collateralForm.description.trim()
    if (description.length < 3) { pushToast({ type: 'error', message: 'Description is required.' }); return }
    const estimatedValue = Number(collateralForm.estimatedValue)
    if (!Number.isFinite(estimatedValue) || estimatedValue <= 0) { pushToast({ type: 'error', message: 'Estimated value must be greater than 0.' }); return }
    if (!collateralDocument?.url) { pushToast({ type: 'error', message: 'Upload the collateral document before continuing.' }); return }
    createCollateralMutation.mutate({
      assetType: collateralForm.assetType, description, estimatedValue,
      ownershipType: collateralForm.ownershipType, ownerName: collateralForm.ownerName.trim()||undefined,
      ownerNationalId: collateralForm.ownerNationalId.trim()||undefined, registrationNumber: collateralForm.registrationNumber.trim()||undefined,
      logbookNumber: collateralForm.logbookNumber.trim()||undefined, titleNumber: collateralForm.titleNumber.trim()||undefined,
      locationDetails: collateralForm.locationDetails.trim()||undefined, valuationDate: toIsoDateOrUndefined(collateralForm.valuationDate),
      documentUrl: collateralDocument.url,
    }, {
      onSuccess: () => {
        pushToast({ type: 'success', message: 'Collateral added.' })
        setCollateralForm(EMPTY_COLLATERAL)
        setCollateralDocument(null)
        setActionStep('fee')
      },
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
      <input
        ref={cameraPhotoInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleProfilePhotoSelection}
        style={{ display: 'none' }}
      />
      <input
        ref={filePhotoInputRef}
        type="file"
        accept="image/*"
        onChange={handleProfilePhotoSelection}
        style={{ display: 'none' }}
      />
      <input
        ref={customerIdCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCustomerIdDocumentSelection}
        style={{ display: 'none' }}
      />
      <input
        ref={customerIdDocInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        onChange={handleCustomerIdDocumentSelection}
        style={{ display: 'none' }}
      />
      <input
        ref={guarantorCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleGuarantorDocumentSelection}
        style={{ display: 'none' }}
      />
      <input
        ref={guarantorDocInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        onChange={handleGuarantorDocumentSelection}
        style={{ display: 'none' }}
      />
      <input
        ref={collateralDocInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        onChange={handleCollateralDocumentSelection}
        style={{ display: 'none' }}
      />
      {isCameraModalOpen ? (
        <div className={styles.cameraModalOverlay} role="dialog" aria-modal="true" aria-labelledby="customer-camera-title">
          <div className={styles.cameraModal}>
            <div className={styles.cameraModalHeader}>
              <div>
                <h3 id="customer-camera-title">{cameraCaptureConfig?.title || 'Capture image'}</h3>
                <p>{cameraCaptureConfig?.description || 'Use the camera to capture this document.'}</p>
              </div>
              <button type="button" className={styles.cameraModalClose} onClick={closeCameraModal} aria-label="Close camera capture">
                x
              </button>
            </div>
            <div className={styles.cameraViewport}>
              {cameraCaptureState === 'ready' || cameraCaptureState === 'capturing' ? (
                <video ref={cameraPreviewRef} className={styles.cameraPreview} autoPlay muted playsInline />
              ) : null}
              {cameraCaptureState !== 'ready' && cameraCaptureState !== 'capturing' ? (
                <div className={styles.cameraPlaceholder}>
                  <strong>{cameraError ? 'Camera unavailable' : 'Opening camera...'}</strong>
                  <span>{cameraError || 'Approve access in the browser so we can capture this image directly.'}</span>
                </div>
              ) : null}
              <div className={styles.cameraScrim} aria-hidden="true" />
            </div>
            {cameraError ? <p className={styles.cameraError}>{cameraError}</p> : null}
            <div className={styles.cameraModalActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => { void capturePhotoFromCamera() }}
                disabled={cameraCaptureState !== 'ready'}
              >
                {cameraCaptureState === 'capturing' ? 'Capturing...' : cameraCaptureConfig?.captureButtonLabel || 'Take photo'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  if (cameraCaptureConfig) {
                    openFilePickerForTarget(cameraCaptureConfig.uploadTarget)
                  }
                }}
              >
                {cameraCaptureConfig?.fallbackLabel || 'Use file instead'}
              </button>
              <button type="button" className={styles.secondaryButton} onClick={closeCameraModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                        <td>{formatDate(loan.disbursed_at, '—')}</td>
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
                  ['Profile photo', onboarding.checklist?.profilePhotoAdded ? 'Complete' : 'Incomplete'],
                  ['Pinned location', onboarding.checklist?.locationCaptured ? 'Complete' : 'Incomplete'],
                  ['KYC', onboarding.kycStatus],
                  ['Fee payment', onboarding.feePaymentStatus],
                  ['Guarantors', onboarding.counts?.guarantors],
                  ['Guarantor IDs', onboarding.counts?.guarantorDocuments],
                  ['Collaterals', onboarding.counts?.collaterals],
                  ['Collateral docs', onboarding.counts?.collateralDocuments],
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
              <div className={styles.label}>Customer Profile Picture</div>
              <div className={styles.value}>{client.photo_url ? <a href={client.photo_url} target="_blank" rel="noreferrer">Open photo ↗</a> : 'Incomplete'}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>Customer ID Document</div>
              <div className={styles.value}>
                {customerIdDocumentUrl ? <a href={customerIdDocumentUrl} target="_blank" rel="noreferrer">Open document â†—</a> : 'Incomplete'}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>Pinned Location</div>
              <div className={styles.value}>
                {locationDone
                  ? `${toText(locationDraft.displayName || client.residential_address)} (${toText(client.latitude)}, ${toText(client.longitude)})`
                  : 'Incomplete'}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>Guarantor ID</div>
              <div className={styles.value}>
                {Array.isArray(guarantorsQuery.data) && guarantorsQuery.data.some((g) => g.id_document_url)
                  ? guarantorsQuery.data
                    .filter((g) => g.id_document_url)
                    .map((g) => <a key={g.id} href={g.id_document_url || '#'} target="_blank" rel="noreferrer">{toText(g.full_name)} ↗</a>)
                  : 'Incomplete'}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.label}>Collateral Documentation</div>
              <div className={styles.value}>
                {Array.isArray(collateralsQuery.data) && collateralsQuery.data.some((c) => c.document_url)
                  ? collateralsQuery.data
                    .filter((c) => c.document_url)
                    .map((c) => <a key={c.id} href={c.document_url || '#'} target="_blank" rel="noreferrer">{toText(c.description)} ↗</a>)
                  : 'Incomplete'}
              </div>
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
              <span className={profileDone ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>
                Profile: {profileDone ? 'Complete' : 'Incomplete'}
              </span>
              <span className={kycDone ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>KYC: {toLabel(onboarding.kycStatus)}</span>
              <span className={feeDone ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>Fee: {toLabel(onboarding.feePaymentStatus)}</span>
              <span className={guarantorDone ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>Guarantors: {onboarding.counts?.guarantors || 0} / IDs {onboarding.counts?.guarantorDocuments || 0}</span>
              <span className={collateralDone ? styles.onboardingCompactChipReady : styles.onboardingCompactChipPending}>Collateral: {onboarding.counts?.collaterals || 0} / Docs {onboarding.counts?.collateralDocuments || 0}</span>
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
                { key: 'profile' as ActionStep, label: 'Profile', done: profileDone, description: profileDone ? 'Complete' : 'Incomplete' },
                { key: 'kyc' as ActionStep, label: 'KYC', done: kycDone, description: kycDone ? 'Complete' : 'Incomplete' },
                { key: 'guarantor' as ActionStep, label: 'Guarantor', done: guarantorDone, description: guarantorDone ? 'Complete' : 'Incomplete' },
                { key: 'collateral' as ActionStep, label: 'Collateral', done: collateralDone, description: collateralDone ? 'Complete' : 'Incomplete' },
                { key: 'fee' as ActionStep, label: 'Fee', done: feeDone, description: feeDone ? 'Complete' : 'Incomplete' },
              ].map((step, i, arr) => {
                const isCurrent = actionStep === step.key
                const isSelectable = canSelectStep(step.key)
                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => setActionStep(step.key)}
                      disabled={!isSelectable}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                        borderRadius: 10, border: '1px solid', cursor: isSelectable ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700,
                        background: step.done ? 'rgba(0,220,150,0.1)' : isCurrent ? 'rgba(75,156,245,0.12)' : 'rgba(255,255,255,0.04)',
                        borderColor: step.done ? 'rgba(0,220,150,0.3)' : isCurrent ? 'rgba(75,156,245,0.35)' : 'rgba(255,255,255,0.1)',
                        color: step.done ? 'var(--success-text)' : isCurrent ? 'var(--accent-blue)' : 'var(--text-muted)',
                        opacity: isSelectable ? 1 : 0.45,
                      }}
                    >
                      <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, background: step.done ? 'var(--success-text)' : isCurrent ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)', color: step.done||isCurrent ? '#fff' : 'var(--text-muted)' }}>
                        {step.done ? '✓' : i + 1}
                      </span>
                      <span>{step.label}</span>
                      <span style={{ fontSize: 11, color: step.done ? 'var(--success-text)' : 'var(--text-muted)' }}>{step.description}</span>
                    </button>
                    {i < arr.length - 1 ? <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>→</span> : null}
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* ── KYC step ───────────────────────────────────────── */}
          {actionStep === 'profile' ? (
            <div className={styles.stepFormCard}>
              <h3>Profile Capture</h3>
              <p>The borrower cannot move forward until the profile picture and pinned GPS location are complete.</p>
              <div className={styles.grid}>
                <div className={styles.card}>
                  <div className={styles.label}>Customer picture</div>
                  <div className={styles.value}>{profilePhotoDone ? 'Complete' : 'Incomplete'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => { void openCameraCapture(CAMERA_CAPTURE_CONFIGS.photo) }}
                      disabled={uploadTarget === 'photo'}
                    >
                      {uploadTarget === 'photo' ? 'Uploading...' : 'Capture with camera'}
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={() => filePhotoInputRef.current?.click()} disabled={uploadTarget === 'photo'}>
                      Upload file
                    </button>
                  </div>
                  <p className={styles.muted} style={{ marginTop: 12 }}>
                    Smart Shrink now reduces file size while preserving natural face detail and original proportions.
                  </p>
                </div>

                <div className={styles.card}>
                  <div className={styles.label}>Pinned location</div>
                  <div className={styles.value}>{locationDone ? 'Complete' : 'Incomplete'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button type="button" className={styles.primaryButton} onClick={() => { void captureLocationFromGps() }} disabled={locationDraft.status === 'locating' || locationDraft.status === 'saving' || updateClientMutation.isPending}>
                      {locationDraft.status === 'locating' ? 'Fetching GPS...' : locationDraft.status === 'saving' ? 'Saving pin...' : 'Use current GPS'}
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={() => { void saveManualLocationPin() }} disabled={!hasDraftCoordinates || locationDraft.status === 'saving' || updateClientMutation.isPending}>
                      Save manual pin
                    </button>
                  </div>
                  <div className={styles.inlineForm} style={{ marginTop: 12 }}>
                    <label>
                      <span>Latitude *</span>
                      <input value={locationDraft.latitude} onChange={(e) => setLocationDraft((previous) => ({ ...previous, latitude: e.target.value, source: 'manual' }))} placeholder="-1.286389" />
                    </label>
                    <label>
                      <span>Longitude *</span>
                      <input value={locationDraft.longitude} onChange={(e) => setLocationDraft((previous) => ({ ...previous, longitude: e.target.value, source: 'manual' }))} placeholder="36.817223" />
                    </label>
                    <label>
                      <span>Accuracy (m)</span>
                      <input value={locationDraft.accuracyMeters} onChange={(e) => setLocationDraft((previous) => ({ ...previous, accuracyMeters: e.target.value }))} placeholder="15" />
                    </label>
                    <label className={styles.fullWidthField}>
                      <span>Resolved address</span>
                      <input value={locationDraft.displayName} readOnly placeholder="Address will auto-fill after reverse geocoding" />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button type="button" className={styles.secondaryButton} onClick={() => nudgeManualPin(MAP_NUDGE_DELTA, 0)}>North</button>
                    <button type="button" className={styles.secondaryButton} onClick={() => nudgeManualPin(-MAP_NUDGE_DELTA, 0)}>South</button>
                    <button type="button" className={styles.secondaryButton} onClick={() => nudgeManualPin(0, -MAP_NUDGE_DELTA)}>West</button>
                    <button type="button" className={styles.secondaryButton} onClick={() => nudgeManualPin(0, MAP_NUDGE_DELTA)}>East</button>
                  </div>
                  {hasDraftCoordinates ? (
                    <div style={{ marginTop: 12 }}>
                      <iframe
                        title="Pinned location preview"
                        src={buildMapEmbedUrl(mapLatitude, mapLongitude)}
                        style={{ width: '100%', height: 220, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16 }}
                        loading="lazy"
                      />
                    </div>
                  ) : null}
                  {locationError ? <p className={styles.muted} style={{ marginTop: 12, color: 'var(--danger-text)' }}>{locationError}</p> : null}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={styles.primaryButton} onClick={() => setActionStep('kyc')} disabled={!profileDone}>
                  Next: KYC →
                </button>
                {!profileDone ? <span className={styles.muted}>Status: Incomplete. Photo and GPS pin are both required.</span> : null}
              </div>
            </div>
          ) : null}

          {actionStep === 'kyc' ? (
            <div className={styles.stepFormCard}>
              <h3>KYC Verification</h3>
              <p>Set the KYC status and add a review note for this borrower.</p>
              <div className={styles.card} style={{ marginBottom: 16 }}>
                <div className={styles.label}>Customer ID document</div>
                <div className={styles.value}>{customerIdDocumentDone ? (customerIdDocument?.name || 'Complete') : 'Incomplete'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => { void openCameraCapture(CAMERA_CAPTURE_CONFIGS['customer-id']) }}
                    disabled={uploadTarget === 'customer-id'}
                  >
                    {uploadTarget === 'customer-id' ? 'Uploading...' : 'Capture ID with camera'}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => customerIdDocInputRef.current?.click()}
                    disabled={uploadTarget === 'customer-id'}
                  >
                    Upload ID file
                  </button>
                  {customerIdDocumentUrl ? <a href={customerIdDocumentUrl} target="_blank" rel="noreferrer">Preview â†—</a> : null}
                </div>
                <p className={styles.muted} style={{ marginTop: 12 }}>
                  Document images are compressed gently so names and ID numbers remain readable after upload.
                </p>
              </div>
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
              <div className={styles.card} style={{ marginBottom: 16 }}>
                <div className={styles.label}>Guarantor ID *</div>
                <div className={styles.value}>{guarantorDocument?.name || 'Incomplete'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => { void openCameraCapture(CAMERA_CAPTURE_CONFIGS.guarantor) }}
                    disabled={uploadTarget === 'guarantor'}
                  >
                    {uploadTarget === 'guarantor' ? 'Uploading...' : 'Capture ID with camera'}
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={() => guarantorDocInputRef.current?.click()} disabled={uploadTarget === 'guarantor'}>
                    {uploadTarget === 'guarantor' ? 'Uploading...' : 'Upload guarantor ID'}
                  </button>
                  {guarantorDocument?.url ? <a href={guarantorDocument.url} target="_blank" rel="noreferrer">Preview ↗</a> : null}
                </div>
                <p className={styles.muted} style={{ marginTop: 12 }}>
                  Accepted formats: PDF, JPG, PNG, WebP. Image compression keeps text readable while trimming file size.
                </p>
              </div>
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
              <div className={styles.card} style={{ marginBottom: 16 }}>
                <div className={styles.label}>Collateral Documentation *</div>
                <div className={styles.value}>{collateralDocument?.name || 'Incomplete'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button type="button" className={styles.secondaryButton} onClick={() => collateralDocInputRef.current?.click()} disabled={uploadTarget === 'collateral'}>
                    {uploadTarget === 'collateral' ? 'Uploading...' : 'Upload collateral proof'}
                  </button>
                  {collateralDocument?.url ? <a href={collateralDocument.url} target="_blank" rel="noreferrer">Preview ↗</a> : null}
                </div>
                <p className={styles.muted} style={{ marginTop: 12 }}>Accepted formats: PDF, JPG, PNG, WebP.</p>
              </div>
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
