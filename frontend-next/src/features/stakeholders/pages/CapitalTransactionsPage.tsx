import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listCapitalTransactions,
  createCapitalDeposit,
  createCapitalWithdrawal,
  approveCapitalTransaction,
  rejectCapitalTransaction,
  getCashflowPosition,
  type CapitalTransaction,
  type CapitalTransactionStatus,
} from '../../../services/capitalService'
import { useToastStore } from '../../../store/toastStore'
import { useAuth } from '../../../hooks/useAuth'
import { queryPolicies } from '../../../services/queryPolicies'
import { queryKeys } from '../../../services/queryKeys'
import { formatDisplayDate } from '../../../utils/dateFormatting'
import styles from '../styles/StakeholderPage.module.css'
import capitalStyles from '../styles/CapitalTransactions.module.css'

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function fmt(value: number | undefined | null) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(value: string | null | undefined) {
  return formatDisplayDate(value, '-')
}

function getApiErrorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}

// Who can approve / reject
const APPROVER_ROLES = new Set(['finance', 'admin'])
// Who can submit deposits and withdrawals
const SUBMITTER_ROLES = new Set(['investor', 'partner', 'owner', 'ceo', 'admin'])

type TabKey = 'mine' | 'pending' | 'all'

// Ã¢â€â‚¬Ã¢â€â‚¬ Component Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export function CapitalTransactionsPage() {
  const { user } = useAuth()
  const pushToast = useToastStore((s) => s.pushToast)
  const queryClient = useQueryClient()

  const role = String(user?.role || '').toLowerCase()
  const isApprover  = APPROVER_ROLES.has(role)
  const isSubmitter = SUBMITTER_ROLES.has(role)

  // Ã¢â€â‚¬Ã¢â€â‚¬ Tab state Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const defaultTab: TabKey = isApprover ? 'pending' : 'mine'
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab)

  // Ã¢â€â‚¬Ã¢â€â‚¬ Form state Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [formType, setFormType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('KES')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastWarning, setLastWarning] = useState<string | null>(null)

  // Ã¢â€â‚¬Ã¢â€â‚¬ Approval modal state Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [approvalTarget, setApprovalTarget] = useState<CapitalTransaction | null>(null)
  const [approvalOverrideNote, setApprovalOverrideNote] = useState('')
  const [approving, setApproving] = useState(false)

  // Ã¢â€â‚¬Ã¢â€â‚¬ Rejection modal state Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [rejectionTarget, setRejectionTarget] = useState<CapitalTransaction | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Ã¢â€â‚¬Ã¢â€â‚¬ Filter state Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const [filterStatus, setFilterStatus] = useState<CapitalTransactionStatus | ''>('')
  const mineTransactionsParams = { limit: 50, offset: 0 }
  const pendingTransactionsParams = { status: 'pending' as const, limit: 100, offset: 0 }
  const filteredTransactionsParams = { status: filterStatus || null, limit: 100, offset: 0 }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Queries Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const myTxnQuery = useQuery({
    queryKey: queryKeys.capital.mine(mineTransactionsParams),
    queryFn: () => listCapitalTransactions(mineTransactionsParams),
    ...queryPolicies.list,
  })

  const pendingQuery = useQuery({
    queryKey: queryKeys.capital.pending(pendingTransactionsParams),
    queryFn: () => listCapitalTransactions(pendingTransactionsParams),
    enabled: isApprover,
    ...queryPolicies.list,
  })

  const allQuery = useQuery({
    queryKey: queryKeys.capital.filtered(filteredTransactionsParams),
    queryFn: () => listCapitalTransactions({
      status: filteredTransactionsParams.status || undefined,
      limit: filteredTransactionsParams.limit,
      offset: filteredTransactionsParams.offset,
    }),
    enabled: isApprover,
    ...queryPolicies.list,
  })

  const cashflowQuery = useQuery({
    queryKey: queryKeys.capital.cashflowPosition({}),
    queryFn: () => getCashflowPosition(),
    ...queryPolicies.report,
  })

  const pendingCount = pendingQuery.data?.paging?.total ?? 0
  const cashflow = cashflowQuery.data

  // Ã¢â€â‚¬Ã¢â€â‚¬ Invalidation helper Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  function invalidateCapital() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.capital.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.stakeholders.all })
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Submit deposit or withdrawal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleSubmit = async () => {
    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      pushToast({ type: 'error', message: 'Enter a valid positive amount.' })
      return
    }

    setSubmitting(true)
    setLastWarning(null)
    try {
      const payload = {
        amount: parsedAmount,
        currency: currency.toUpperCase(),
        reference: reference.trim() || null,
        note: note.trim() || null,
      }

      if (formType === 'deposit') {
        await createCapitalDeposit(payload)
        pushToast({
          type: 'success',
          message: `Deposit of ${currency} ${fmt(parsedAmount)} submitted for finance approval.`,
        })
      } else {
        const result = await createCapitalWithdrawal(payload)
        if (result.cashflow_warning) {
          setLastWarning(result.cashflow_warning)
          pushToast({
            type: 'info',
            message: `Withdrawal submitted. Cashflow warning: ${result.cashflow_warning}`,
          })
        } else {
          pushToast({
            type: 'success',
            message: `Withdrawal request of ${currency} ${fmt(parsedAmount)} submitted for finance approval.`,
          })
        }
      }

      setAmount('')
      setReference('')
      setNote('')
      invalidateCapital()
    } catch (err: unknown) {
      pushToast({ type: 'error', message: getApiErrorMessage(err, 'Could not submit. Please try again.') })
    } finally {
      setSubmitting(false)
    }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Approve Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleApprove = async () => {
    if (!approvalTarget) return
    setApproving(true)
    try {
      await approveCapitalTransaction(
        approvalTarget.id,
        approvalOverrideNote.trim() || null,
      )
      pushToast({
        type: 'success',
        message: `${approvalTarget.transaction_type === 'deposit' ? 'Deposit' : 'Withdrawal'} of ${approvalTarget.currency} ${fmt(approvalTarget.amount)} approved and posted to the general ledger.`,
      })
      setApprovalTarget(null)
      setApprovalOverrideNote('')
      invalidateCapital()
    } catch (err: unknown) {
      pushToast({ type: 'error', message: getApiErrorMessage(err, 'Approval failed. Please try again.') })
    } finally {
      setApproving(false)
    }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Reject Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleReject = async () => {
    if (!rejectionTarget || !rejectionReason.trim()) {
      pushToast({ type: 'error', message: 'A rejection reason is required.' })
      return
    }
    setRejecting(true)
    try {
      await rejectCapitalTransaction(rejectionTarget.id, rejectionReason.trim())
      pushToast({
        type: 'success',
        message: `Transaction #${rejectionTarget.id} has been rejected.`,
      })
      setRejectionTarget(null)
      setRejectionReason('')
      invalidateCapital()
    } catch (err: unknown) {
      pushToast({ type: 'error', message: getApiErrorMessage(err, 'Rejection failed. Please try again.') })
    } finally {
      setRejecting(false)
    }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Cashflow health indicator Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const withdrawalAmount = formType === 'withdrawal' ? Number(amount || 0) : 0
  const cashflowNet   = cashflow?.net ?? 0
  const wouldExceed   = withdrawalAmount > 0 && cashflowNet < withdrawalAmount
  const available     = cashflow?.available_after_pending ?? 0

  // Ã¢â€â‚¬Ã¢â€â‚¬ Transaction table renderer Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  function renderTxnTable(txns: CapitalTransaction[], showActions: boolean) {
    if (txns.length === 0) {
      return <p className={styles.muted}>No transactions to display.</p>
    }

    return (
      <div className={capitalStyles.tableWrap}>
        <table className={capitalStyles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Type</th>
              <th>Status</th>
              <th>Submitted by</th>
              <th>Branch</th>
              <th className={capitalStyles.tdRight}>Amount</th>
              {showActions && <th className={capitalStyles.tdRight}>Cashflow at sub.</th>}
              <th>Reference</th>
              {showActions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {txns.map((tx) => {
              const cashNet = Number(tx.cashflow_net_at_submission ?? 0)
              const risky   = tx.transaction_type === 'withdrawal' && cashNet < Number(tx.amount)
              return (
                <tr key={tx.id}>
                  <td className={capitalStyles.mono}>#{tx.id}</td>
                  <td>{fmtDate(tx.created_at)}</td>
                  <td>
                    <span className={`${capitalStyles.badge} ${tx.transaction_type === 'deposit' ? capitalStyles.badgeDeposit : capitalStyles.badgeWithdrawal}`}>
                      {tx.transaction_type}
                    </span>
                  </td>
                  <td>
                    <span className={`${capitalStyles.badge} ${capitalStyles[`badge_${tx.status}`] ?? capitalStyles.badgeMuted}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td>
                    <div>{tx.submitted_by_name ?? `User #${tx.submitted_by_user_id}`}</div>
                    <div className={capitalStyles.subRow}>{tx.submitted_by_role}</div>
                  </td>
                  <td>{tx.branch_name ?? <span className={capitalStyles.muted}>Org-wide</span>}</td>
                  <td className={`${capitalStyles.tdRight} ${capitalStyles.mono}`}>
                    <span className={tx.transaction_type === 'deposit' ? capitalStyles.textGreen : capitalStyles.textAmber}>
                      {tx.transaction_type === 'deposit' ? '+' : '-'}{tx.currency} {fmt(tx.amount)}
                    </span>
                  </td>
                  {showActions && (
                    <td className={`${capitalStyles.tdRight} ${risky ? capitalStyles.textRed : capitalStyles.textGreen}`}>
                      Ksh {fmt(cashNet)}
                      {risky && <span className={capitalStyles.riskIcon} title="Cashflow below withdrawal amount">Warning</span>}
                    </td>
                  )}
                  <td className={capitalStyles.muted}>{tx.reference ?? '-'}</td>
                  {showActions && (
                    <td>
                      {tx.status === 'pending' ? (
                        <div className={capitalStyles.actionButtons}>
                          <button
                            type="button"
                            className={capitalStyles.btnApprove}
                            onClick={() => { setApprovalTarget(tx); setApprovalOverrideNote('') }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className={capitalStyles.btnReject}
                            onClick={() => { setRejectionTarget(tx); setRejectionReason('') }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className={capitalStyles.muted}>
                          {tx.status === 'approved'
                            ? `Approved ${fmtDate(tx.approved_at)}`
                            : `Rejected ${fmtDate(tx.rejected_at)}`}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={styles.page}>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Page header Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Stakeholders - Capital</p>
          <h1 className={styles.pageTitle}>Capital transactions</h1>
          <p className={styles.pageSubtitle}>
            Investor, partner, and owner deposits and withdrawal requests.
            All transactions require finance approval before posting to the general ledger.
          </p>
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Cashflow health bar Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {cashflow && (
        <div className={`${capitalStyles.cashflowBar} ${cashflow.net < 0 ? capitalStyles.cashflowBarNegative : ''}`}>
          <div className={capitalStyles.cashflowBarItem}>
            <span className={capitalStyles.cashflowBarLabel}>Net cashflow</span>
            <span className={`${capitalStyles.cashflowBarValue} ${cashflow.net >= 0 ? capitalStyles.textGreen : capitalStyles.textRed}`}>
              Ksh {fmt(cashflow.net)}
            </span>
          </div>
          <div className={capitalStyles.cashflowBarItem}>
            <span className={capitalStyles.cashflowBarLabel}>Available after pending</span>
            <span className={`${capitalStyles.cashflowBarValue} ${available >= 0 ? capitalStyles.textGreen : capitalStyles.textRed}`}>
              Ksh {fmt(available)}
            </span>
          </div>
          <div className={capitalStyles.cashflowBarItem}>
            <span className={capitalStyles.cashflowBarLabel}>Pending withdrawals</span>
            <span className={capitalStyles.cashflowBarValue}>Ksh {fmt(cashflow.pending_withdrawals)}</span>
          </div>
        </div>
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Submit form (submitters only) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {isSubmitter && (
        <div className={capitalStyles.submitPanel}>
          <h2 className={capitalStyles.submitTitle}>Submit a transaction</h2>

          <div className={capitalStyles.typeToggle}>
            <button
              type="button"
              className={`${capitalStyles.typeBtn} ${formType === 'deposit' ? capitalStyles.typeBtnActive : ''}`}
              onClick={() => { setFormType('deposit'); setLastWarning(null) }}
            >
              + Deposit
            </button>
            <button
              type="button"
              className={`${capitalStyles.typeBtn} ${formType === 'withdrawal' ? capitalStyles.typeBtnActiveWithdrawal : ''}`}
              onClick={() => { setFormType('withdrawal'); setLastWarning(null) }}
            >
              - Withdrawal request
            </button>
          </div>

          {/* Cashflow warning for withdrawal */}
          {formType === 'withdrawal' && wouldExceed && (
            <div className={capitalStyles.cashflowWarning}>
              <strong>Cashflow notice:</strong> The current net cashflow is Ksh {fmt(cashflowNet)},
              which is below the requested amount of Ksh {fmt(withdrawalAmount)}.
              You can still submit - finance will review and may approve with an override note.
            </div>
          )}

          {lastWarning && (
            <div className={capitalStyles.cashflowWarning}>{lastWarning}</div>
          )}

          <div className={capitalStyles.formGrid}>
            <label className={capitalStyles.field}>
              <span className={capitalStyles.fieldLabel}>Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                placeholder="0.00"
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className={capitalStyles.field}>
              <span className={capitalStyles.fieldLabel}>Currency</span>
              <input
                value={currency}
                maxLength={3}
                style={{ textTransform: 'uppercase', width: 80 }}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </label>
            <label className={capitalStyles.field} style={{ flex: 1, minWidth: 200 }}>
              <span className={capitalStyles.fieldLabel}>Reference</span>
              <input
                value={reference}
                placeholder="Bank transfer ref, cheque no., etc."
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className={capitalStyles.field} style={{ flex: 2, minWidth: 280 }}>
              <span className={capitalStyles.fieldLabel}>Note</span>
              <input
                value={note}
                placeholder="Purpose or additional context"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>

          <div className={capitalStyles.submitRow}>
            <button
              type="button"
              className={`${capitalStyles.submitBtn} ${formType === 'withdrawal' ? capitalStyles.submitBtnWithdrawal : capitalStyles.submitBtnDeposit}`}
              disabled={submitting || !amount || Number(amount) <= 0}
              onClick={() => void handleSubmit()}
            >
              {submitting
                ? 'Submitting...'
                : formType === 'deposit'
                  ? `Submit deposit`
                  : `Submit withdrawal request`}
            </button>
            <p className={capitalStyles.submitNote}>
              All transactions are reviewed and approved by finance before any funds move.
            </p>
          </div>
        </div>
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Tab bar Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className={capitalStyles.tabBar}>
        {isSubmitter && (
          <button
            type="button"
            className={`${capitalStyles.tab} ${activeTab === 'mine' ? capitalStyles.tabActive : ''}`}
            onClick={() => setActiveTab('mine')}
          >
            My transactions
          </button>
        )}
        {isApprover && (
          <button
            type="button"
            className={`${capitalStyles.tab} ${activeTab === 'pending' ? capitalStyles.tabActive : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending approval
            {pendingCount > 0 && <span className={capitalStyles.tabBadge}>{pendingCount}</span>}
          </button>
        )}
        {isApprover && (
          <button
            type="button"
            className={`${capitalStyles.tab} ${activeTab === 'all' ? capitalStyles.tabActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All transactions
          </button>
        )}
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Tab content Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className={capitalStyles.tabContent}>

        {/* My transactions */}
        {activeTab === 'mine' && (
          myTxnQuery.isLoading
            ? <div className={styles.loadingState}><div className={styles.spinner} /><span>Loading...</span></div>
            : myTxnQuery.isError ? <div className={styles.errorState}><span>Failed to load.</span> <button onClick={() => void myTxnQuery.refetch()} className={styles.retryBtn}>Retry</button></div> : renderTxnTable(myTxnQuery.data?.data ?? [], false)
        )}

        {/* Pending approval (finance queue) */}
        {activeTab === 'pending' && isApprover && (
          pendingQuery.isLoading
            ? <div className={styles.loadingState}><div className={styles.spinner} /><span>Loading...</span></div>
            : pendingQuery.isError ? <div className={styles.errorState}><span>Failed to load.</span> <button onClick={() => void pendingQuery.refetch()} className={styles.retryBtn}>Retry</button></div> : renderTxnTable(pendingQuery.data?.data ?? [], true)
        )}

        {/* All transactions */}
        {activeTab === 'all' && isApprover && (
          <>
            <div className={capitalStyles.filterBar}>
              <label className={capitalStyles.field}>
                <span className={capitalStyles.fieldLabel}>Status</span>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as CapitalTransactionStatus | '')}>
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>
            {allQuery.isLoading
              ? <div className={styles.loadingState}><div className={styles.spinner} /><span>Loading...</span></div>
              : allQuery.isError ? <div className={styles.errorState}><span>Failed to load.</span> <button onClick={() => void allQuery.refetch()} className={styles.retryBtn}>Retry</button></div> : renderTxnTable(allQuery.data?.data ?? [], true)}
          </>
        )}
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Approval modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {approvalTarget && (
        <div className={capitalStyles.overlay} role="presentation" onClick={() => setApprovalTarget(null)}>
          <div
            className={capitalStyles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={capitalStyles.modalTitle}>
              Approve {approvalTarget.transaction_type}?
            </h2>
            <p className={capitalStyles.modalText}>
              You are approving a <strong>{approvalTarget.transaction_type}</strong> of{' '}
              <strong>{approvalTarget.currency} {fmt(approvalTarget.amount)}</strong>
              {approvalTarget.branch_name ? ` for ${approvalTarget.branch_name}` : ''}, submitted by{' '}
              {approvalTarget.submitted_by_name ?? `User #${approvalTarget.submitted_by_user_id}`}.
              A GL journal entry will be posted immediately on approval.
            </p>

            {/* Show cashflow warning if applicable */}
            {approvalTarget.transaction_type === 'withdrawal' && (() => {
              const cashNet = Number(approvalTarget.cashflow_net_at_submission ?? 0)
              const amt     = Number(approvalTarget.amount)
              if (cashNet < amt) {
                return (
                  <div className={capitalStyles.modalWarning}>
                    <strong>Cashflow override required.</strong> Net cashflow at submission was{' '}
                    Ksh {fmt(cashNet)}, below the withdrawal of Ksh {fmt(amt)}.
                    You must provide an override note to proceed.
                  </div>
                )
              }
              return null
            })()}

            <label className={capitalStyles.field}>
              <span className={capitalStyles.fieldLabel}>
                Override note {approvalTarget.transaction_type === 'withdrawal' &&
                Number(approvalTarget.cashflow_net_at_submission ?? 0) < Number(approvalTarget.amount)
                  ? '(required)' : '(optional)'}
              </span>
              <textarea
                value={approvalOverrideNote}
                rows={3}
                placeholder="Reason for approving despite cashflow position, or general approval note."
                onChange={(e) => setApprovalOverrideNote(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </label>

            <div className={capitalStyles.modalActions}>
              <button
                type="button"
                className={capitalStyles.btnCancel}
                onClick={() => setApprovalTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={capitalStyles.btnApprove}
                disabled={approving}
                onClick={() => void handleApprove()}
              >
                {approving ? 'Approving...' : 'Confirm approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Rejection modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {rejectionTarget && (
        <div className={capitalStyles.overlay} role="presentation" onClick={() => setRejectionTarget(null)}>
          <div
            className={capitalStyles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={capitalStyles.modalTitle}>Reject transaction?</h2>
            <p className={capitalStyles.modalText}>
              You are rejecting a <strong>{rejectionTarget.transaction_type}</strong> of{' '}
              <strong>{rejectionTarget.currency} {fmt(rejectionTarget.amount)}</strong> from{' '}
              {rejectionTarget.submitted_by_name ?? `User #${rejectionTarget.submitted_by_user_id}`}.
              No GL journal will be posted.
            </p>

            <label className={capitalStyles.field}>
              <span className={capitalStyles.fieldLabel}>Rejection reason (required)</span>
              <textarea
                value={rejectionReason}
                rows={3}
                placeholder="Explain why this transaction is being rejected."
                onChange={(e) => setRejectionReason(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </label>

            <div className={capitalStyles.modalActions}>
              <button
                type="button"
                className={capitalStyles.btnCancel}
                onClick={() => setRejectionTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={capitalStyles.btnReject}
                disabled={rejecting || !rejectionReason.trim()}
                onClick={() => void handleReject()}
              >
                {rejecting ? 'Rejecting...' : 'Confirm rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
