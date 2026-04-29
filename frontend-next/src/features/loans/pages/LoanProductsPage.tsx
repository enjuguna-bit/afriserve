import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import { queryPolicies } from '../../../services/queryPolicies'
import {
  activateLoanProduct,
  createLoanProduct,
  deactivateLoanProduct,
  listLoanProducts,
  updateLoanProduct,
} from '../../../services/riskService'
import { useToastStore } from '../../../store/toastStore'
import type { CreateLoanProductPayload, LoanProductRecord } from '../../../types/risk'
import { formatDisplayDateTime } from '../../../utils/dateFormatting'
import styles from '../../shared/styles/EntityPage.module.css'

type LoanProductFormState = {
  name: string
  interestRate: string
  interestAccrualMethod: 'upfront' | 'daily'
  registrationFee: string
  processingFee: string
  penaltyRateDaily: string
  penaltyFlatAmount: string
  penaltyGraceDays: string
  penaltyCapAmount: string
  penaltyCompoundingMethod: 'simple' | 'compound'
  penaltyBaseAmount: 'installment_outstanding' | 'principal_outstanding' | 'full_balance'
  penaltyCapPercentOfOutstanding: string
  minTermWeeks: string
  maxTermWeeks: string
  isActive: boolean
}

const EMPTY_FORM: LoanProductFormState = {
  name: '',
  interestRate: '20',
  interestAccrualMethod: 'upfront',
  registrationFee: '0',
  processingFee: '0',
  penaltyRateDaily: '0',
  penaltyFlatAmount: '0',
  penaltyGraceDays: '0',
  penaltyCapAmount: '',
  penaltyCompoundingMethod: 'simple',
  penaltyBaseAmount: 'installment_outstanding',
  penaltyCapPercentOfOutstanding: '',
  minTermWeeks: '4',
  maxTermWeeks: '52',
  isActive: true,
}

function toPayload(form: LoanProductFormState): CreateLoanProductPayload {
  return {
    name: form.name.trim(),
    interestRate: Number(form.interestRate),
    interestAccrualMethod: form.interestAccrualMethod,
    registrationFee: Number(form.registrationFee),
    processingFee: Number(form.processingFee),
    penaltyRateDaily: Number(form.penaltyRateDaily),
    penaltyFlatAmount: Number(form.penaltyFlatAmount),
    penaltyGraceDays: Number(form.penaltyGraceDays),
    penaltyCapAmount: form.penaltyCapAmount.trim() ? Number(form.penaltyCapAmount) : null,
    penaltyCompoundingMethod: form.penaltyCompoundingMethod,
    penaltyBaseAmount: form.penaltyBaseAmount,
    penaltyCapPercentOfOutstanding: form.penaltyCapPercentOfOutstanding.trim() ? Number(form.penaltyCapPercentOfOutstanding) : null,
    minTermWeeks: Number(form.minTermWeeks),
    maxTermWeeks: Number(form.maxTermWeeks),
    isActive: form.isActive,
  }
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function LoanProductsPage() {
  const queryClient = useQueryClient()
  const pushToast = useToastStore((state) => state.pushToast)
  const [includeInactive, setIncludeInactive] = useState(true)
  const [createForm, setCreateForm] = useState<LoanProductFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<LoanProductFormState>(EMPTY_FORM)

  const loanProductsQuery = useQuery({
    queryKey: ['risk', 'loan-products', includeInactive],
    queryFn: () => listLoanProducts({ includeInactive }),
    ...queryPolicies.list,
  })

  const createMutation = useMutation({
    mutationFn: createLoanProduct,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['risk', 'loan-products'] })
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ productId, payload }: { productId: number; payload: Partial<CreateLoanProductPayload> }) => {
      return updateLoanProduct(productId, payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['risk', 'loan-products'] })
    },
  })
  const statusMutation = useMutation({
    mutationFn: ({ productId, activate }: { productId: number; activate: boolean }) => (
      activate ? activateLoanProduct(productId) : deactivateLoanProduct(productId)
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['risk', 'loan-products'] })
    },
  })

  const activeCount = useMemo(() => loanProductsQuery.data?.filter((row) => Number(row.is_active) === 1).length || 0, [loanProductsQuery.data])

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = toPayload(createForm)
    if (!payload.name) {
      pushToast({ type: 'error', message: 'Loan product name is required.' })
      return
    }
    if (payload.minTermWeeks > payload.maxTermWeeks) {
      pushToast({ type: 'error', message: 'Minimum term cannot exceed maximum term.' })
      return
    }

    createMutation.mutate(payload, {
      onSuccess: () => {
        pushToast({ type: 'success', message: 'Loan product created.' })
        setCreateForm(EMPTY_FORM)
      },
      onError: () => {
        pushToast({ type: 'error', message: 'Failed to create loan product.' })
      },
    })
  }

  const openEditor = (product: LoanProductRecord) => {
    setEditingId(product.id)
    setEditForm({
      name: product.name,
      interestRate: String(product.interest_rate),
      interestAccrualMethod: product.interest_accrual_method === 'daily_eod' ? 'daily' : 'upfront',
      registrationFee: String(product.registration_fee),
      processingFee: String(product.processing_fee),
      penaltyRateDaily: String(product.penalty_rate_daily || 0),
      penaltyFlatAmount: String(product.penalty_flat_amount || 0),
      penaltyGraceDays: String(product.penalty_grace_days || 0),
      penaltyCapAmount: product.penalty_cap_amount == null ? '' : String(product.penalty_cap_amount),
      penaltyCompoundingMethod: product.penalty_compounding_method === 'compound' ? 'compound' : 'simple',
      penaltyBaseAmount: product.penalty_base_amount === 'principal_outstanding' || product.penalty_base_amount === 'full_balance' ? product.penalty_base_amount : 'installment_outstanding',
      penaltyCapPercentOfOutstanding: product.penalty_cap_percent_of_outstanding == null ? '' : String(product.penalty_cap_percent_of_outstanding),
      minTermWeeks: String(product.min_term_weeks),
      maxTermWeeks: String(product.max_term_weeks),
      isActive: Number(product.is_active) === 1,
    })
  }

  const saveEdit = (productId: number) => {
    const payload = toPayload(editForm)
    if (!payload.name) {
      pushToast({ type: 'error', message: 'Loan product name is required.' })
      return
    }
    if (payload.minTermWeeks > payload.maxTermWeeks) {
      pushToast({ type: 'error', message: 'Minimum term cannot exceed maximum term.' })
      return
    }

    updateMutation.mutate(
      { productId, payload },
      {
        onSuccess: () => {
          pushToast({ type: 'success', message: 'Loan product updated.' })
          setEditingId(null)
        },
        onError: () => {
          pushToast({ type: 'error', message: 'Failed to update loan product.' })
        },
      },
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Loan Products</h1>
          <p className={styles.muted}>Create and manage pricing bands used in new loan origination.</p>
        </div>
        <label className={styles.inputGroup}>
          <span>Display scope</span>
          <select value={includeInactive ? 'all' : 'active'} onChange={(event) => setIncludeInactive(event.target.value === 'all')}>
            <option value="all">All products</option>
            <option value="active">Active only</option>
          </select>
        </label>
      </div>

      <div className={styles.cards}>
        <article className={styles.card}>
          <div className={styles.label}>Total products</div>
          <div className={styles.value}>{loanProductsQuery.data?.length || 0}</div>
        </article>
        <article className={styles.card}>
          <div className={styles.label}>Active products</div>
          <div className={styles.value}>{activeCount}</div>
        </article>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Create product</h2>
        <form className={styles.gridThree} onSubmit={handleCreate}>
          <label className={styles.inputGroupWide}>
            <span>Name</span>
            <input value={createForm.name} onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </label>
          <label className={styles.inputGroup}>
            <span>Interest rate (%)</span>
            <input type="number" step="0.01" min={0} value={createForm.interestRate} onChange={(event) => setCreateForm((prev) => ({ ...prev, interestRate: event.target.value }))} required />
          </label>
          <label className={styles.inputGroup}>
            <span>Accrual method</span>
            <select value={createForm.interestAccrualMethod} onChange={(event) => setCreateForm((prev) => ({ ...prev, interestAccrualMethod: event.target.value as 'upfront' | 'daily' }))}>
              <option value="upfront">Upfront / flat</option>
              <option value="daily">Daily accrual</option>
            </select>
          </label>
          <label className={styles.inputGroup}>
            <span>Registration fee</span>
            <input type="number" step="0.01" min={0} value={createForm.registrationFee} onChange={(event) => setCreateForm((prev) => ({ ...prev, registrationFee: event.target.value }))} required />
          </label>
          <label className={styles.inputGroup}>
            <span>Processing fee</span>
            <input type="number" step="0.01" min={0} value={createForm.processingFee} onChange={(event) => setCreateForm((prev) => ({ ...prev, processingFee: event.target.value }))} required />
          </label>
          <label className={styles.inputGroup}>
            <span>Min term (weeks)</span>
            <input type="number" min={1} value={createForm.minTermWeeks} onChange={(event) => setCreateForm((prev) => ({ ...prev, minTermWeeks: event.target.value }))} required />
          </label>
          <label className={styles.inputGroup}>
            <span>Max term (weeks)</span>
            <input type="number" min={1} value={createForm.maxTermWeeks} onChange={(event) => setCreateForm((prev) => ({ ...prev, maxTermWeeks: event.target.value }))} required />
          </label>
          <label className={styles.inputGroup}>
            <span>Status</span>
            <select value={createForm.isActive ? 'active' : 'inactive'} onChange={(event) => setCreateForm((prev) => ({ ...prev, isActive: event.target.value === 'active' }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className={styles.inputGroup}>
            <span>Penalty daily rate (%)</span>
            <input type="number" step="0.0001" min={0} value={createForm.penaltyRateDaily} onChange={(event) => setCreateForm((prev) => ({ ...prev, penaltyRateDaily: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Penalty flat amount</span>
            <input type="number" step="0.01" min={0} value={createForm.penaltyFlatAmount} onChange={(event) => setCreateForm((prev) => ({ ...prev, penaltyFlatAmount: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Penalty grace days</span>
            <input type="number" min={0} value={createForm.penaltyGraceDays} onChange={(event) => setCreateForm((prev) => ({ ...prev, penaltyGraceDays: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Penalty cap amount</span>
            <input type="number" step="0.01" min={0} value={createForm.penaltyCapAmount} onChange={(event) => setCreateForm((prev) => ({ ...prev, penaltyCapAmount: event.target.value }))} placeholder="Optional" />
          </label>
          <label className={styles.inputGroup}>
            <span>Penalty compounding</span>
            <select value={createForm.penaltyCompoundingMethod} onChange={(event) => setCreateForm((prev) => ({ ...prev, penaltyCompoundingMethod: event.target.value as 'simple' | 'compound' }))}>
              <option value="simple">Simple</option>
              <option value="compound">Compound</option>
            </select>
          </label>
          <label className={styles.inputGroup}>
            <span>Penalty base</span>
            <select value={createForm.penaltyBaseAmount} onChange={(event) => setCreateForm((prev) => ({ ...prev, penaltyBaseAmount: event.target.value as 'installment_outstanding' | 'principal_outstanding' | 'full_balance' }))}>
              <option value="installment_outstanding">Installment outstanding</option>
              <option value="principal_outstanding">Principal outstanding</option>
              <option value="full_balance">Full balance</option>
            </select>
          </label>
          <label className={styles.inputGroup}>
            <span>Cap % of outstanding</span>
            <input type="number" step="0.01" min={0} value={createForm.penaltyCapPercentOfOutstanding} onChange={(event) => setCreateForm((prev) => ({ ...prev, penaltyCapPercentOfOutstanding: event.target.value }))} placeholder="Optional" />
          </label>
          <div className={styles.actions}>
            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create product'}
            </button>
          </div>
        </form>
      </section>

      <AsyncState
        loading={loanProductsQuery.isLoading}
        error={loanProductsQuery.isError}
        empty={Boolean(loanProductsQuery.data && loanProductsQuery.data.length === 0)}
        loadingText="Loading loan products..."
        errorText="Unable to load loan products."
        emptyText="No loan products found."
        onRetry={() => {
          void loanProductsQuery.refetch()
        }}
      />

      {loanProductsQuery.data && loanProductsQuery.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Pricing</th>
                <th>Term range</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loanProductsQuery.data.map((product) => {
                const isEditing = editingId === product.id
                return (
                  <tr key={product.id}>
                    <td>
                      {isEditing ? (
                        <input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} />
                      ) : (
                        product.name
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className={styles.actions}>
                          <input type="number" step="0.01" min={0} value={editForm.interestRate} onChange={(event) => setEditForm((prev) => ({ ...prev, interestRate: event.target.value }))} />
                          <input type="number" step="0.01" min={0} value={editForm.registrationFee} onChange={(event) => setEditForm((prev) => ({ ...prev, registrationFee: event.target.value }))} />
                          <input type="number" step="0.01" min={0} value={editForm.processingFee} onChange={(event) => setEditForm((prev) => ({ ...prev, processingFee: event.target.value }))} />
                        </div>
                      ) : (
                        <>
                          <div>Interest: {product.interest_rate}%</div>
                          <div>Strategy: {String(product.pricing_strategy || 'flat_rate').replace(/_/g, ' ')}</div>
                          <div>Accrual: {product.interest_accrual_method === 'daily_eod' ? 'Daily accrual' : 'Upfront / flat'}</div>
                          <div>Reg fee: {formatMoney(product.registration_fee)}</div>
                          <div>Proc fee: {formatMoney(product.processing_fee)}</div>
                          <div>Penalty daily: {product.penalty_rate_daily || 0}%</div>
                          <div>Penalty flat: {formatMoney(product.penalty_flat_amount || 0)}</div>
                          <div>Penalty base: {String(product.penalty_base_amount || 'installment_outstanding').replace(/_/g, ' ')}</div>
                        </>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className={styles.actions}>
                          <input type="number" min={1} value={editForm.minTermWeeks} onChange={(event) => setEditForm((prev) => ({ ...prev, minTermWeeks: event.target.value }))} />
                          <input type="number" min={1} value={editForm.maxTermWeeks} onChange={(event) => setEditForm((prev) => ({ ...prev, maxTermWeeks: event.target.value }))} />
                        </div>
                      ) : (
                        `${product.min_term_weeks} - ${product.max_term_weeks} weeks`
                      )}
                    </td>
                    <td>
                      <span className={Number(product.is_active) === 1 ? styles.badgeActive : styles.badgeMuted}>
                        {Number(product.is_active) === 1 ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td>{formatDisplayDateTime(product.updated_at)}</td>
                    <td>
                      <div className={styles.actions}>
                        {isEditing ? (
                          <>
                            <button type="button" disabled={updateMutation.isPending} onClick={() => saveEdit(product.id)}>
                              Save
                            </button>
                            <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => openEditor(product)}>Edit</button>
                            <button
                              type="button"
                              disabled={statusMutation.isPending}
                              onClick={() => {
                                statusMutation.mutate(
                                  { productId: product.id, activate: Number(product.is_active) !== 1 },
                                  {
                                    onSuccess: () => {
                                      pushToast({
                                        type: 'success',
                                        message: Number(product.is_active) === 1 ? 'Loan product deactivated.' : 'Loan product activated.',
                                      })
                                    },
                                    onError: () => {
                                      pushToast({ type: 'error', message: 'Failed to update loan product status.' })
                                    },
                                  },
                                )
                              }}
                            >
                              {Number(product.is_active) === 1 ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
