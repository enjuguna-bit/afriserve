import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import { queryPolicies } from '../../../services/queryPolicies'
import { createBranch, deactivateBranch, getHierarchyPerformance, listBranches, listRegions, updateBranch } from '../../../services/branchService'
import { useUpdateUserProfile, useUsers } from '../hooks/useAdmin'
import { useToastStore } from '../../../store/toastStore'
import styles from './BranchManagementPage.module.css'

type BranchFormState = {
  name: string
  locationAddress: string
  county: string
  town: string
  regionId: string
  contactPhone: string
  contactEmail: string
  branchCode: string
}

function buildBranchPayload(values: BranchFormState): Record<string, unknown> {
  return {
    name: values.name.trim(),
    locationAddress: values.locationAddress.trim(),
    county: values.county.trim(),
    town: values.town.trim(),
    regionId: Number(values.regionId),
    contactPhone: values.contactPhone.trim() || undefined,
    contactEmail: values.contactEmail.trim() || undefined,
    branchCode: values.branchCode.trim() || undefined,
  }
}

export function BranchManagementPage() {
  const queryClient = useQueryClient()
  const pushToast = useToastStore((state) => state.pushToast)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState<BranchFormState>({
    name: '',
    locationAddress: '',
    county: '',
    town: '',
    regionId: '',
    contactPhone: '',
    contactEmail: '',
    branchCode: '',
  })
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<BranchFormState>({
    name: '',
    locationAddress: '',
    county: '',
    town: '',
    regionId: '',
    contactPhone: '',
    contactEmail: '',
    branchCode: '',
  })
  const [managerSelection, setManagerSelection] = useState<Record<number, string>>({})

  const regionsQuery = useQuery({
    queryKey: ['admin', 'regions'],
    queryFn: listRegions,
    ...queryPolicies.list,
  })
  const branchesQuery = useQuery({
    queryKey: ['admin', 'branches', 'all'],
    queryFn: () => listBranches({ limit: 500, offset: 0, sortBy: 'name', sortOrder: 'asc' }),
    ...queryPolicies.list,
  })
  const hierarchyPerfQuery = useQuery({
    queryKey: ['admin', 'hierarchy-performance'],
    queryFn: () => getHierarchyPerformance({}),
    ...queryPolicies.report,
  })
  const managersQuery = useUsers({ limit: 200, offset: 0, role: 'operations_manager', isActive: 'true' })

  const updateUserProfileMutation = useUpdateUserProfile()
  const createBranchMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createBranch(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'hierarchy-performance'] })
    },
  })
  const updateBranchMutation = useMutation({
    mutationFn: ({ branchId, payload }: { branchId: number; payload: Record<string, unknown> }) => updateBranch(branchId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'hierarchy-performance'] })
    },
  })
  const deactivateBranchMutation = useMutation({
    mutationFn: (branchId: number) => deactivateBranch(branchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'hierarchy-performance'] })
    },
  })

  const regions = useMemo(() => regionsQuery.data?.data ?? [], [regionsQuery.data])
  const branches = useMemo(() => branchesQuery.data?.data ?? [], [branchesQuery.data])
  const activeManagers = useMemo(() => managersQuery.data?.data ?? [], [managersQuery.data])

  const loanCountsByBranch = useMemo(() => {
    const map = new Map<number, number>()
    const rows = hierarchyPerfQuery.data?.branchPerformance || []
    rows.forEach((row) => {
      map.set(Number(row.branch_id), Number(row.total_loans || 0))
    })
    return map
  }, [hierarchyPerfQuery.data?.branchPerformance])

  const managerByBranchId = useMemo(() => {
    const map = new Map<number, { id: number; full_name: string }>()
    activeManagers.forEach((manager) => {
      const branchId = Number(manager.branch_id || 0)
      if (!Number.isInteger(branchId) || branchId <= 0 || map.has(branchId)) {
        return
      }
      map.set(branchId, { id: manager.id, full_name: manager.full_name })
    })
    return map
  }, [activeManagers])

  const regionsWithBranches = useMemo(() => {
    const regionMap = new Map<number, { id: number; name: string; branches: typeof branches }>()
    regions.forEach((region) => {
      regionMap.set(Number(region.id), { id: Number(region.id), name: region.name, branches: [] })
    })
    branches.forEach((branch) => {
      const regionId = Number(branch.region_id || 0)
      if (!regionMap.has(regionId)) {
        regionMap.set(regionId, { id: regionId, name: `Region ${regionId}`, branches: [] })
      }
      regionMap.get(regionId)?.branches.push(branch)
    })

    return Array.from(regionMap.values())
      .map((region) => ({
        ...region,
        branches: [...region.branches].sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [regions, branches])

  function resetCreateForm() {
    setCreateForm({
      name: '',
      locationAddress: '',
      county: '',
      town: '',
      regionId: regions[0] ? String(regions[0].id) : '',
      contactPhone: '',
      contactEmail: '',
      branchCode: '',
    })
  }

  function openEdit(branch: (typeof branches)[number]) {
    setEditingBranchId(branch.id)
    setEditForm({
      name: branch.name || '',
      locationAddress: branch.location_address || '',
      county: branch.county || '',
      town: branch.town || '',
      regionId: String(branch.region_id || ''),
      contactPhone: branch.contact_phone || '',
      contactEmail: branch.contact_email || '',
      branchCode: branch.code || '',
    })
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createBranchMutation.mutate(buildBranchPayload(createForm), {
      onSuccess: () => {
        pushToast({ type: 'success', message: 'Branch created successfully.' })
        setCreateModalOpen(false)
        resetCreateForm()
      },
      onError: () => {
        pushToast({ type: 'error', message: 'Failed to create branch.' })
      },
    })
  }

  function submitEdit(branchId: number) {
    updateBranchMutation.mutate(
      {
        branchId,
        payload: buildBranchPayload(editForm),
      },
      {
        onSuccess: () => {
          pushToast({ type: 'success', message: 'Branch updated.' })
          setEditingBranchId(null)
        },
        onError: () => {
          pushToast({ type: 'error', message: 'Failed to update branch.' })
        },
      },
    )
  }

  return (
    <div>
      <div className={styles.header}>
        <h1>Branch Management</h1>
        <button
          type="button"
          onClick={() => {
            resetCreateForm()
            setCreateModalOpen(true)
          }}
        >
          Create branch
        </button>
      </div>

      <AsyncState
        loading={regionsQuery.isLoading || branchesQuery.isLoading || hierarchyPerfQuery.isLoading || managersQuery.isLoading}
        error={regionsQuery.isError || branchesQuery.isError || hierarchyPerfQuery.isError || managersQuery.isError}
        empty={Boolean(!regionsQuery.isLoading && !branchesQuery.isLoading && regionsWithBranches.length === 0)}
        loadingText="Loading branch hierarchy..."
        errorText="Unable to load branch hierarchy."
        emptyText="No branch records found."
        onRetry={() => {
          void Promise.all([
            regionsQuery.refetch(),
            branchesQuery.refetch(),
            hierarchyPerfQuery.refetch(),
            managersQuery.refetch(),
          ])
        }}
      />

      {regionsWithBranches.map((region) => (
        <section key={region.id} className={styles.regionBlock}>
          <h2>{region.name}</h2>
          {region.branches.length === 0 ? (
            <p className={styles.subtle}>No branches in this region.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Code</th>
                  <th>Loans</th>
                  <th>Status</th>
                  <th>Manager</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {region.branches.map((branch) => {
                  const assignedManager = managerByBranchId.get(branch.id)
                  const selectedManager = managerSelection[branch.id] ?? String(assignedManager?.id || '')
                  const isEditing = editingBranchId === branch.id
                  return (
                    <tr key={branch.id}>
                      <td>
                        {isEditing ? (
                          <input
                            value={editForm.name}
                            onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                          />
                        ) : (
                          branch.name
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            value={editForm.branchCode}
                            onChange={(event) => setEditForm((prev) => ({ ...prev, branchCode: event.target.value }))}
                          />
                        ) : (
                          branch.code || '-'
                        )}
                      </td>
                      <td>{loanCountsByBranch.get(branch.id) ?? 0}</td>
                      <td>{branch.is_active === 1 ? 'active' : 'inactive'}</td>
                      <td>
                        <div className={styles.managerCell}>
                          <select
                            value={selectedManager}
                            onChange={(event) => {
                              setManagerSelection((prev) => ({ ...prev, [branch.id]: event.target.value }))
                            }}
                          >
                            <option value="">Unassigned</option>
                            {activeManagers.map((manager) => (
                              <option key={manager.id} value={manager.id}>{manager.full_name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={updateUserProfileMutation.isPending || !selectedManager}
                            onClick={() => {
                              const managerId = Number(selectedManager)
                              if (!Number.isInteger(managerId) || managerId <= 0) {
                                return
                              }
                              updateUserProfileMutation.mutate(
                                { userId: managerId, payload: { branchId: branch.id } },
                                {
                                  onSuccess: () => {
                                    pushToast({ type: 'success', message: `Manager assigned to ${branch.name}.` })
                                  },
                                  onError: () => {
                                    pushToast({ type: 'error', message: `Failed to assign manager to ${branch.name}.` })
                                  },
                                },
                              )
                            }}
                          >
                            Assign
                          </button>
                        </div>
                        <div className={styles.subtle}>{assignedManager ? `Current: ${assignedManager.full_name}` : 'No manager assigned'}</div>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={updateBranchMutation.isPending}
                                onClick={() => submitEdit(branch.id)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingBranchId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => openEdit(branch)}>Edit</button>
                              <button
                                type="button"
                                disabled={deactivateBranchMutation.isPending || branch.is_active !== 1}
                                onClick={() => {
                                  deactivateBranchMutation.mutate(branch.id, {
                                    onSuccess: () => {
                                      pushToast({ type: 'success', message: `${branch.name} deactivated.` })
                                    },
                                    onError: () => {
                                      pushToast({ type: 'error', message: `Failed to deactivate ${branch.name}.` })
                                    },
                                  })
                                }}
                              >
                                Deactivate
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
          )}
        </section>
      ))}

      {createModalOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2>Create Branch</h2>
            <form className={styles.form} onSubmit={submitCreate}>
              <label className={styles.field}>
                <span>Name</span>
                <input
                  value={createForm.name}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Location address</span>
                <input
                  value={createForm.locationAddress}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, locationAddress: event.target.value }))}
                  required
                />
              </label>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span>County</span>
                  <input
                    value={createForm.county}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, county: event.target.value }))}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>Town</span>
                  <input
                    value={createForm.town}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, town: event.target.value }))}
                    required
                  />
                </label>
              </div>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span>Region</span>
                  <select
                    value={createForm.regionId}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, regionId: event.target.value }))}
                    required
                  >
                    <option value="">Select region</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>{region.name}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Branch code (optional)</span>
                  <input
                    value={createForm.branchCode}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, branchCode: event.target.value }))}
                  />
                </label>
              </div>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span>Contact phone (optional)</span>
                  <input
                    value={createForm.contactPhone}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>Contact email (optional)</span>
                  <input
                    type="email"
                    value={createForm.contactEmail}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                  />
                </label>
              </div>
              <div className={styles.actions}>
                <button type="submit" disabled={createBranchMutation.isPending}>
                  {createBranchMutation.isPending ? 'Creating...' : 'Create branch'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false)
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
