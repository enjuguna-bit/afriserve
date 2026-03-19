import { useMemo, useState, type FormEvent } from 'react'
import {
  useActiveBranches,
  useCreateUser,
  useDeactivateUser,
  useResetUserPassword,
  useUserRoles,
  useUsers,
} from '../hooks/useAdmin'
import { AsyncState } from '../../../components/common/AsyncState'
import { useToastStore } from '../../../store/toastStore'
import type { CreateUserRequest } from '../../../types/admin'
import { buildBranchAreaOptions } from '../utils/branchAssignment'
import styles from './UserManagementPage.module.css'

type CreateUserFormState = {
  fullName: string
  email: string
  password: string
  role: string
  roles: string[]
  branchId: string
  areaKey: string
  branchIds: number[]
}

const DEFAULT_ROLE = 'loan_officer'
const multiBranchRoles = new Set(['area_manager', 'investor', 'partner'])
const branchScopedRoles = new Set(['operations_manager', 'loan_officer', 'cashier'])

function isStrongPassword(value: string): boolean {
  return /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9]/.test(value)
    && value.length >= 12
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || !error) {
    return fallback
  }

  const maybeError = error as { response?: { data?: { message?: unknown; issues?: Array<{ message: string }> } } }
  const data = maybeError.response?.data
  
  if (data?.issues && Array.isArray(data.issues) && data.issues.length > 0) {
    return data.issues.map((issue) => issue.message).join('. ')
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message
  }

  return fallback
}

export function UserManagementPage() {
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [formState, setFormState] = useState<CreateUserFormState>({
    fullName: '',
    email: '',
    password: '',
    role: DEFAULT_ROLE,
    roles: [DEFAULT_ROLE],
    branchId: '',
    areaKey: '',
    branchIds: [],
  })

  const usersQuery = useUsers({ limit: 100, offset: 0, search: search || undefined })
  const rolesQuery = useUserRoles()
  const branchesQuery = useActiveBranches()
  const createUserMutation = useCreateUser()
  const deactivateUserMutation = useDeactivateUser()
  const resetPasswordMutation = useResetUserPassword()
  const pushToast = useToastStore((state) => state.pushToast)

  const roleOptions = useMemo(() => {
    const fromApiRoles = Array.isArray(rolesQuery.data?.roles) ? rolesQuery.data.roles : []
    return fromApiRoles.length > 0
      ? fromApiRoles.map((entry) => ({ key: entry.key, label: entry.label || entry.key }))
      : [{ key: DEFAULT_ROLE, label: 'Loan Officer' }]
  }, [rolesQuery.data])
  const activeBranches = useMemo(() => branchesQuery.data?.data || [], [branchesQuery.data])
  const branchOptions = useMemo(
    () => activeBranches.map((branch) => ({
      id: Number(branch.id),
      label: `${branch.region_name || 'Region'} - ${branch.name}${branch.code ? ` (${branch.code})` : ''}`,
    })),
    [activeBranches],
  )
  const areaOptions = useMemo(() => buildBranchAreaOptions(activeBranches), [activeBranches])
  const selectedRole = useMemo(() => {
    const normalizedRole = formState.role.trim()
    if (roleOptions.some((entry) => entry.key === normalizedRole)) {
      return normalizedRole
    }
    return roleOptions[0]?.key || DEFAULT_ROLE
  }, [formState.role, roleOptions])
  const selectedRoles = useMemo(() => {
    const normalizedRoles = [...new Set(formState.roles.map((entry) => String(entry || '').trim()).filter(Boolean))]
    if (selectedRole && !normalizedRoles.includes(selectedRole)) {
      return [selectedRole, ...normalizedRoles]
    }
    return normalizedRoles.length > 0 ? normalizedRoles : (selectedRole ? [selectedRole] : [])
  }, [formState.roles, selectedRole])
  const isAreaManagerRole = selectedRole === 'area_manager'
  const isMultiBranchRole = multiBranchRoles.has(selectedRole)
  const isBranchScopedRole = branchScopedRoles.has(selectedRole)
  const selectedAreaOption = useMemo(() => {
    if (!isAreaManagerRole || areaOptions.length === 0) {
      return null
    }
    return areaOptions.find((option) => option.key === formState.areaKey) || areaOptions[0]
  }, [areaOptions, formState.areaKey, isAreaManagerRole])
  const effectiveAreaKey = selectedAreaOption?.key || ''
  const effectiveBranchIds = isAreaManagerRole ? (selectedAreaOption?.branchIds || []) : formState.branchIds

  function resetForm() {
    setFormState({
      fullName: '',
      email: '',
      password: '',
      role: roleOptions[0]?.key || DEFAULT_ROLE,
      roles: [roleOptions[0]?.key || DEFAULT_ROLE],
      branchId: '',
      areaKey: '',
      branchIds: [],
    })
    setCreateError(null)
  }

  function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)

    const fullName = formState.fullName.trim()
    const email = formState.email.trim().toLowerCase()
    const password = formState.password
    const role = selectedRole.trim()
    const roles = [...new Set(selectedRoles.map((entry) => entry.trim().toLowerCase()).filter(Boolean))]

    if (fullName.length < 2) {
      setCreateError('Full name must be at least 2 characters.')
      return
    }
    if (!email) {
      setCreateError('Email is required.')
      return
    }
    if (!isStrongPassword(password)) {
      setCreateError('Password must be at least 12 chars with upper, lower, number, and symbol.')
      return
    }
    if (!role) {
      setCreateError('Role is required.')
      return
    }

    const payload: CreateUserRequest = {
      fullName,
      email,
      password,
      role,
      roles: roles.includes(role) ? roles : [role, ...roles],
    }

    if (isBranchScopedRole) {
      const parsedBranchId = Number(formState.branchId)
      if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
        setCreateError('Select a branch for this role.')
        return
      }
      payload.branchId = parsedBranchId
    }

    if (isMultiBranchRole) {
      if (isAreaManagerRole && !effectiveAreaKey.trim()) {
        setCreateError('Select an area for this role.')
        return
      }
      if (effectiveBranchIds.length === 0) {
        setCreateError(isAreaManagerRole
          ? 'The selected area does not contain any active branches.'
          : 'Select at least one branch for this role.')
        return
      }
      payload.branchIds = effectiveBranchIds
    }

    createUserMutation.mutate(payload, {
      onSuccess: () => {
        pushToast({ type: 'success', message: 'User created successfully.' })
        resetForm()
        setModalOpen(false)
      },
      onError: (error) => {
        const message = getApiErrorMessage(error, 'Failed to create user.')
        setCreateError(message)
        pushToast({ type: 'error', message })
      },
    })
  }

  return (
    <div>
      <div className={styles.header}>
        <h1>User Management</h1>
        <button
          type="button"
          onClick={() => {
            resetForm()
            setModalOpen(true)
          }}
        >
          Create user
        </button>
      </div>

      <div className={styles.toolbar}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email"
        />
      </div>

      <AsyncState
        loading={usersQuery.isLoading}
        error={usersQuery.isError}
        empty={Boolean(usersQuery.data && usersQuery.data.data.length === 0)}
        loadingText="Loading users..."
        errorText="Unable to load users."
        emptyText="No users found."
        onRetry={() => {
          void usersQuery.refetch()
        }}
      />

      {usersQuery.data && usersQuery.data.data.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.data.data.map((user) => (
              <tr key={user.id}>
                <td>{user.full_name}</td>
                <td>{Array.isArray(user.roles) && user.roles.length > 0 ? user.roles.join(', ') : user.role}</td>
                <td>{user.branch_name || '-'}</td>
                <td>{user.is_active === 1 ? 'active' : 'inactive'}</td>
                <td>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={deactivateUserMutation.isPending || user.is_active !== 1}
                      onClick={() => {
                        deactivateUserMutation.mutate(user.id, {
                          onSuccess: () => {
                            pushToast({ type: 'success', message: `User ${user.full_name} deactivated.` })
                          },
                          onError: () => {
                            pushToast({ type: 'error', message: `Failed to deactivate ${user.full_name}.` })
                          },
                        })
                      }}
                    >
                      Deactivate
                    </button>
                    <button
                      type="button"
                      disabled={resetPasswordMutation.isPending || user.is_active !== 1}
                      onClick={() => {
                        resetPasswordMutation.mutate(user.id, {
                          onSuccess: () => {
                            pushToast({ type: 'success', message: `Password reset initiated for ${user.full_name}.` })
                          },
                          onError: () => {
                            pushToast({ type: 'error', message: `Failed to reset password for ${user.full_name}.` })
                          },
                        })
                      }}
                    >
                      Reset password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {modalOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2>Create user</h2>
            <form className={styles.form} onSubmit={handleCreateUser}>
              <label className={styles.field}>
                <span>Full name</span>
                <input
                  value={formState.fullName}
                  onChange={(event) => setFormState((prev) => ({ ...prev, fullName: event.target.value }))}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Email</span>
                <input
                  type="email"
                  value={formState.email}
                  onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Password</span>
                <input
                  type="password"
                  value={formState.password}
                  onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Role</span>
                <select
                  value={selectedRole}
                  onChange={(event) => {
                    const nextRole = event.target.value
                    setFormState((prev) => ({
                      ...prev,
                      role: nextRole,
                      roles: prev.roles.includes(nextRole) ? prev.roles : [nextRole, ...prev.roles],
                      branchId: '',
                      areaKey: nextRole === 'area_manager' ? prev.areaKey : '',
                      branchIds: [],
                    }))
                    setCreateError(null)
                  }}
                >
                  {roleOptions.map((role) => (
                    <option key={role.key} value={role.key}>{role.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Assigned roles</span>
                <select
                  multiple
                  className={styles.multiSelect}
                  value={selectedRoles}
                  onChange={(event) => {
                    const selectedRoles = Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                    const deduped = [...new Set(selectedRoles)]
                    const nextRoles = deduped.includes(selectedRole) ? deduped : [selectedRole, ...deduped]
                    setFormState((prev) => ({ ...prev, roles: nextRoles }))
                    setCreateError(null)
                  }}
                >
                  {roleOptions.map((role) => (
                    <option key={role.key} value={role.key}>{role.label}</option>
                  ))}
                </select>
              </label>

              {isBranchScopedRole ? (
                <label className={styles.field}>
                  <span>Branch</span>
                  <select
                    value={formState.branchId}
                    onChange={(event) => setFormState((prev) => ({ ...prev, branchId: event.target.value }))}
                  >
                    <option value="">Select branch</option>
                    {branchOptions.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {isAreaManagerRole ? (
                <div className={styles.field}>
                  <span>Area</span>
                  <select
                    value={effectiveAreaKey}
                    onChange={(event) => {
                      const nextArea = areaOptions.find((option) => option.key === event.target.value)
                      setFormState((prev) => ({
                        ...prev,
                        areaKey: event.target.value,
                        branchIds: nextArea?.branchIds || [],
                      }))
                      setCreateError(null)
                    }}
                  >
                    <option value="">Select area</option>
                    {areaOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label} ({option.branchCount} branches)
                      </option>
                    ))}
                  </select>
                  {selectedAreaOption ? (
                    <div className={styles.assignmentPreview}>
                      <div className={styles.assignmentPreviewTitle}>
                        {selectedAreaOption.branchCount} active branches will be assigned from {selectedAreaOption.label}.
                      </div>
                      <div className={styles.assignmentPreviewList}>
                        {selectedAreaOption.branchLabels.map((branchLabel) => (
                          <span key={branchLabel} className={styles.assignmentPreviewChip}>{branchLabel}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isMultiBranchRole && !isAreaManagerRole ? (
                <label className={styles.field}>
                  <span>Branches</span>
                  <select
                    multiple
                    className={styles.multiSelect}
                    value={effectiveBranchIds.map(String)}
                    onChange={(event) => {
                      const selectedIds = Array.from(event.currentTarget.selectedOptions)
                        .map((option) => Number(option.value))
                        .filter((value) => Number.isInteger(value) && value > 0)
                      setFormState((prev) => ({ ...prev, branchIds: selectedIds }))
                    }}
                  >
                    {branchOptions.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {createError ? <p className={styles.error}>{createError}</p> : null}
              <div className={styles.modalActions}>
                <button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? 'Creating...' : 'Create user'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false)
                    setCreateError(null)
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
