import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import { listBranches } from '../../../services/branchService'
import { queryPolicies } from '../../../services/queryPolicies'
import { createGuarantor, listGuarantors } from '../../../services/riskService'
import { useToastStore } from '../../../store/toastStore'
import styles from '../../shared/styles/EntityPage.module.css'

type GuarantorFormState = {
  fullName: string
  phone: string
  nationalId: string
  physicalAddress: string
  occupation: string
  employerName: string
  monthlyIncome: string
  branchId: string
}

const EMPTY_FORM: GuarantorFormState = {
  fullName: '',
  phone: '',
  nationalId: '',
  physicalAddress: '',
  occupation: '',
  employerName: '',
  monthlyIncome: '0',
  branchId: '',
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function GuarantorsPage() {
  const queryClient = useQueryClient()
  const pushToast = useToastStore((state) => state.pushToast)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<GuarantorFormState>(EMPTY_FORM)

  const branchesQuery = useQuery({
    queryKey: ['risk', 'branches', 'for-guarantors'],
    queryFn: () => listBranches({ limit: 500, offset: 0, isActive: 'true', sortBy: 'name', sortOrder: 'asc' }),
    ...queryPolicies.list,
  })

  const guarantorsQuery = useQuery({
    queryKey: ['risk', 'guarantors', search],
    queryFn: () => listGuarantors({
      search: search || undefined,
      limit: 100,
      offset: 0,
    }),
    ...queryPolicies.list,
  })

  const createMutation = useMutation({
    mutationFn: createGuarantor,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['risk', 'guarantors'] })
    },
  })

  const branches = useMemo(() => branchesQuery.data?.data || [], [branchesQuery.data])

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fullName = form.fullName.trim()
    if (!fullName) {
      pushToast({ type: 'error', message: 'Guarantor full name is required.' })
      return
    }

    const monthlyIncome = Number(form.monthlyIncome)
    if (!Number.isFinite(monthlyIncome) || monthlyIncome < 0) {
      pushToast({ type: 'error', message: 'Monthly income must be 0 or greater.' })
      return
    }

    createMutation.mutate(
      {
        fullName,
        phone: form.phone.trim() || undefined,
        nationalId: form.nationalId.trim() || undefined,
        physicalAddress: form.physicalAddress.trim() || undefined,
        occupation: form.occupation.trim() || undefined,
        employerName: form.employerName.trim() || undefined,
        monthlyIncome,
        branchId: Number(form.branchId) > 0 ? Number(form.branchId) : undefined,
      },
      {
        onSuccess: () => {
          pushToast({ type: 'success', message: 'Guarantor created.' })
          setForm(EMPTY_FORM)
        },
        onError: () => {
          pushToast({ type: 'error', message: 'Failed to create guarantor.' })
        },
      },
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Guarantors</h1>
          <p className={styles.muted}>Add and browse guarantors available for loan risk coverage.</p>
        </div>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Create guarantor</h2>
        <form className={styles.gridThree} onSubmit={submitCreate}>
          <label className={styles.inputGroupWide}>
            <span>Full name</span>
            <input value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} required />
          </label>
          <label className={styles.inputGroup}>
            <span>Phone</span>
            <input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>National ID</span>
            <input value={form.nationalId} onChange={(event) => setForm((prev) => ({ ...prev, nationalId: event.target.value }))} />
          </label>
          <label className={styles.inputGroupWide}>
            <span>Physical address</span>
            <input value={form.physicalAddress} onChange={(event) => setForm((prev) => ({ ...prev, physicalAddress: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Occupation</span>
            <input value={form.occupation} onChange={(event) => setForm((prev) => ({ ...prev, occupation: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Employer</span>
            <input value={form.employerName} onChange={(event) => setForm((prev) => ({ ...prev, employerName: event.target.value }))} />
          </label>
          <label className={styles.inputGroup}>
            <span>Monthly income</span>
            <input type="number" step="0.01" min={0} value={form.monthlyIncome} onChange={(event) => setForm((prev) => ({ ...prev, monthlyIncome: event.target.value }))} />
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
              {createMutation.isPending ? 'Creating...' : 'Create guarantor'}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <label className={styles.inputGroupWide}>
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, phone, or national ID"
            />
          </label>
        </div>
      </section>

      <AsyncState
        loading={guarantorsQuery.isLoading || branchesQuery.isLoading}
        error={guarantorsQuery.isError || branchesQuery.isError}
        empty={Boolean(guarantorsQuery.data && guarantorsQuery.data.data.length === 0)}
        loadingText="Loading guarantors..."
        errorText="Unable to load guarantor data."
        emptyText="No guarantors found."
        onRetry={() => {
          void Promise.all([guarantorsQuery.refetch(), branchesQuery.refetch()])
        }}
      />

      {guarantorsQuery.data && guarantorsQuery.data.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Contacts</th>
                <th>Economic profile</th>
                <th>Branch</th>
                <th>Linked loans</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {guarantorsQuery.data.data.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.full_name}</td>
                  <td>
                    <div>{row.phone || '-'}</div>
                    <div className={styles.muted}>{row.national_id || '-'}</div>
                  </td>
                  <td>
                    <div>{row.occupation || '-'}</div>
                    <div className={styles.muted}>{row.employer_name || '-'}</div>
                    <div className={styles.muted}>Income: {formatMoney(row.monthly_income)}</div>
                  </td>
                  <td>{row.branch_name || row.branch_id}</td>
                  <td>{Number(row.linked_loan_count || 0)}</td>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
