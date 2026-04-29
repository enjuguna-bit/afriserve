import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { AsyncState } from '../../../components/common/AsyncState'
import { listBranches } from '../../../services/branchService'
import { queryPolicies } from '../../../services/queryPolicies'
import { createCollateralAsset, listCollateralAssets } from '../../../services/riskService'
import { useToastStore } from '../../../store/toastStore'
import type { CollateralAssetType, CollateralOwnershipType } from '../../../types/risk'
import { formatDisplayText } from '../../../utils/displayFormatting'
import styles from '../../shared/styles/EntityPage.module.css'

const COLLATERAL_ASSET_TYPES: Array<{ value: CollateralAssetType; label: string }> = [
  { value: 'chattel', label: 'Chattel' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'land', label: 'Land' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'machinery', label: 'Machinery' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'livestock', label: 'Livestock' },
  { value: 'savings', label: 'Savings or Deposit' },
]

const COLLATERAL_OWNERSHIP_TYPES: Array<{ value: CollateralOwnershipType; label: string }> = [
  { value: 'client', label: 'Client' },
  { value: 'guarantor', label: 'Guarantor' },
  { value: 'third_party', label: 'Third party' },
]

type CollateralFormState = {
  assetType: CollateralAssetType
  description: string
  estimatedValue: string
  ownershipType: CollateralOwnershipType
  ownerName: string
  ownerNationalId: string
  registrationNumber: string
  logbookNumber: string
  titleNumber: string
  locationDetails: string
  valuationDate: string
  branchId: string
}

const EMPTY_FORM: CollateralFormState = {
  assetType: 'chattel',
  description: '',
  estimatedValue: '0',
  ownershipType: 'client',
  ownerName: '',
  ownerNationalId: '',
  registrationNumber: '',
  logbookNumber: '',
  titleNumber: '',
  locationDetails: '',
  valuationDate: '',
  branchId: '',
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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

export function CollateralAssetsPage() {
  const queryClient = useQueryClient()
  const pushToast = useToastStore((state) => state.pushToast)
  const [search, setSearch] = useState('')
  const [assetTypeFilter, setAssetTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState<CollateralFormState>(EMPTY_FORM)

  const branchesQuery = useQuery({
    queryKey: ['risk', 'branches', 'for-collateral'],
    queryFn: () => listBranches({ limit: 500, offset: 0, isActive: 'true', sortBy: 'name', sortOrder: 'asc' }),
    ...queryPolicies.list,
  })

  const assetsQuery = useQuery({
    queryKey: ['risk', 'collateral-assets', search, assetTypeFilter, statusFilter],
    queryFn: () => listCollateralAssets({
      search: search || undefined,
      assetType: assetTypeFilter || undefined,
      status: statusFilter || undefined,
      limit: 100,
      offset: 0,
    }),
    ...queryPolicies.list,
  })

  const createMutation = useMutation({
    mutationFn: createCollateralAsset,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['risk', 'collateral-assets'] })
    },
  })

  const branches = useMemo(() => branchesQuery.data?.data || [], [branchesQuery.data])

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const description = form.description.trim()
    if (!description) {
      pushToast({ type: 'error', message: 'Collateral description is required.' })
      return
    }

    const estimatedValue = Number(form.estimatedValue)
    if (!Number.isFinite(estimatedValue) || estimatedValue <= 0) {
      pushToast({ type: 'error', message: 'Estimated value must be greater than 0.' })
      return
    }

    createMutation.mutate(
      {
        assetType: form.assetType,
        description,
        estimatedValue,
        ownershipType: form.ownershipType,
        ownerName: form.ownerName.trim() || undefined,
        ownerNationalId: form.ownerNationalId.trim() || undefined,
        registrationNumber: form.registrationNumber.trim() || undefined,
        logbookNumber: form.logbookNumber.trim() || undefined,
        titleNumber: form.titleNumber.trim() || undefined,
        locationDetails: form.locationDetails.trim() || undefined,
        valuationDate: toIsoDateTimeOrUndefined(form.valuationDate),
        branchId: Number(form.branchId) > 0 ? Number(form.branchId) : undefined,
      },
      {
        onSuccess: () => {
          pushToast({ type: 'success', message: 'Collateral asset created.' })
          setForm(EMPTY_FORM)
        },
        onError: (error) => {
          pushToast({
            type: 'error',
            message: getApiErrorMessage(error, 'Failed to create collateral asset.'),
          })
        },
      },
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Collateral Assets</h1>
          <p className={styles.muted}>Register and monitor collateral assets that can be linked to loans.</p>
        </div>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Register collateral asset</h2>
        <form className={styles.gridThree} onSubmit={submitCreate}>
          <label className={styles.inputGroup}>
            <span>Asset type</span>
            <select value={form.assetType} onChange={(event) => setForm((prev) => ({ ...prev, assetType: event.target.value as CollateralFormState['assetType'] }))}>
              {COLLATERAL_ASSET_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.inputGroupWide}>
            <span>Description</span>
            <input value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} required />
          </label>
          <label className={styles.inputGroup}>
            <span>Estimated value</span>
            <input type="number" min={1} step="0.01" value={form.estimatedValue} onChange={(event) => setForm((prev) => ({ ...prev, estimatedValue: event.target.value }))} required />
          </label>
          <label className={styles.inputGroup}>
            <span>Ownership type</span>
            <select
              value={form.ownershipType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  ownershipType: event.target.value as CollateralFormState['ownershipType'],
                }))
              }
            >
              {COLLATERAL_OWNERSHIP_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.inputGroup}>
            <span>Owner name</span>
            <input value={form.ownerName} onChange={(event) => setForm((prev) => ({ ...prev, ownerName: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Owner national ID</span>
            <input value={form.ownerNationalId} onChange={(event) => setForm((prev) => ({ ...prev, ownerNationalId: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Registration number</span>
            <input value={form.registrationNumber} onChange={(event) => setForm((prev) => ({ ...prev, registrationNumber: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Logbook number</span>
            <input value={form.logbookNumber} onChange={(event) => setForm((prev) => ({ ...prev, logbookNumber: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Title number</span>
            <input value={form.titleNumber} onChange={(event) => setForm((prev) => ({ ...prev, titleNumber: event.target.value }))} />
          </label>
          <label className={styles.inputGroupWide}>
            <span>Location details</span>
            <input value={form.locationDetails} onChange={(event) => setForm((prev) => ({ ...prev, locationDetails: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Valuation date</span>
            <input type="date" value={form.valuationDate} onChange={(event) => setForm((prev) => ({ ...prev, valuationDate: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Branch</span>
            <select value={form.branchId} onChange={(event) => setForm((prev) => ({ ...prev, branchId: event.target.value }))}>
              <option value="">Auto-select in scope</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.region_name ? `${branch.region_name} - ` : ''}{branch.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.actions}>
            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Create asset'}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <label className={styles.inputGroupWide}>
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Description, registration, logbook, title" />
          </label>
          <label className={styles.inputGroup}>
            <span>Asset type</span>
            <select value={assetTypeFilter} onChange={(event) => setAssetTypeFilter(event.target.value)}>
              <option value="">All</option>
              {COLLATERAL_ASSET_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className={styles.inputGroup}>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="released">Released</option>
              <option value="liquidated">Liquidated</option>
            </select>
          </label>
        </div>
      </section>

      <AsyncState
        loading={assetsQuery.isLoading || branchesQuery.isLoading}
        error={assetsQuery.isError || branchesQuery.isError}
        empty={Boolean(assetsQuery.data && assetsQuery.data.data.length === 0)}
        loadingText="Loading collateral assets..."
        errorText="Unable to load collateral assets."
        emptyText="No collateral assets found."
        onRetry={() => {
          void Promise.all([assetsQuery.refetch(), branchesQuery.refetch()])
        }}
      />

      {assetsQuery.data && assetsQuery.data.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Asset</th>
                <th>Identifiers</th>
                <th>Owner</th>
                <th>Estimated value</th>
                <th>Status</th>
                <th>Linked loans</th>
              </tr>
            </thead>
            <tbody>
              {(assetsQuery.data?.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>
                    <div>{formatDisplayText(row.asset_type)}</div>
                    <div className={styles.muted}>{formatDisplayText(row.description)}</div>
                  </td>
                  <td>
                    <div>{formatDisplayText(row.registration_number)}</div>
                    <div className={styles.muted}>{formatDisplayText(row.logbook_number)}</div>
                    <div className={styles.muted}>{formatDisplayText(row.title_number)}</div>
                  </td>
                  <td>
                    <div>{formatDisplayText(row.owner_name)}</div>
                    <div className={styles.muted}>{formatDisplayText(row.owner_national_id)}</div>
                  </td>
                  <td>{formatMoney(row.estimated_value)}</td>
                  <td>
                    <span
                      className={
                        row.status === 'active'
                          ? styles.badgeActive
                          : row.status === 'released'
                            ? styles.badgeMuted
                            : styles.badgeWarn
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td>{Number(row.linked_loan_count || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
