import { useMemo, useState, type FormEvent } from 'react'
import {
  useActiveBranches,
  useCreateUser,
  useGrantUserPermission,
  usePermissionCatalog,
  useResetUserPassword,
  useRevokeUserSessions,
  useRevokeUserPermission,
  useUnlockUser,
  useUserPermissions,
  useUserSecurityState,
  useUserRoles,
  useUpdateUserRoles,
  useUsers,
  useUsersSummary,
} from '../hooks/useAdmin'
import { AsyncState } from '../../../components/common/AsyncState'
import { useToastStore } from '../../../store/toastStore'
import type { UpdateUserRolesRequest } from '../../../types/admin'
import { buildBranchAreaOptions } from '../utils/branchAssignment'
import styles from './AdminPage.module.css'

const FALLBACK_ROLE_OPTIONS = [
  { key: 'admin', label: 'Administrator', description: null, totalUsers: 0, activeUsers: 0 },
  { key: 'ceo', label: 'CEO', description: null, totalUsers: 0, activeUsers: 0 },
  { key: 'finance', label: 'Finance', description: null, totalUsers: 0, activeUsers: 0 },
  { key: 'investor', label: 'Investor', description: null, totalUsers: 0, activeUsers: 0 },
  { key: 'partner', label: 'Partner', description: null, totalUsers: 0, activeUsers: 0 },
  { key: 'operations_manager', label: 'Branch Manager', description: null, totalUsers: 0, activeUsers: 0 },
  { key: 'it', label: 'IT', description: null, totalUsers: 0, activeUsers: 0 },
  { key: 'area_manager', label: 'Area Manager', description: null, totalUsers: 0, activeUsers: 0 },
  { key: 'loan_officer', label: 'Loan Officer', description: null, totalUsers: 0, activeUsers: 0 },
  { key: 'cashier', label: 'Cashier', description: null, totalUsers: 0, activeUsers: 0 },
] as const

type CreateUserFormState = {
  fullName: string
  email: string
  password: string
  role: string
  roles: string[]
  branchId: string
  areaKey: string
  areaBranchIds: number[]
}

type RoleAllocationFormState = {
  primaryRole: string
  roles: string[]
}

function isStrongPassword(value: string): boolean {
  return /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9]/.test(value)
    && value.length >= 8
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || !error) {
    return fallback
  }

  const maybeError = error as { response?: { data?: { message?: unknown } } }
  const message = maybeError.response?.data?.message
  if (typeof message === 'string' && message.trim()) {
    return message
  }
  return fallback
}

export function AdminPage() {
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [selectedPermissionId, setSelectedPermissionId] = useState<string>('')
  const [createUserForm, setCreateUserForm] = useState<CreateUserFormState>({
    fullName: '',
    email: '',
    password: '',
    role: 'loan_officer',
    roles: ['loan_officer'],
    branchId: '',
    areaKey: '',
    areaBranchIds: [],
  })
  const [createUserError, setCreateUserError] = useState<string | null>(null)
  const [roleAllocationDraft, setRoleAllocationDraft] = useState<{ userId: number; form: RoleAllocationFormState } | null>(null)
  const [roleAllocationError, setRoleAllocationError] = useState<string | null>(null)

  const usersSummaryQuery = useUsersSummary()
  const userRolesQuery = useUserRoles()
  const activeBranchesQuery = useActiveBranches()
  const permissionCatalogQuery = usePermissionCatalog()
  const usersQuery = useUsers({ limit: 50, offset: 0, search: search || undefined })
  const userPermissionsQuery = useUserPermissions(selectedUserId)
  const userSecurityStateQuery = useUserSecurityState(selectedUserId)
  const createUserMutation = useCreateUser()
  const updateUserRolesMutation = useUpdateUserRoles()
  const grantPermissionMutation = useGrantUserPermission()
  const revokePermissionMutation = useRevokeUserPermission()
  const resetUserPasswordMutation = useResetUserPassword()
  const revokeUserSessionsMutation = useRevokeUserSessions()
  const unlockUserMutation = useUnlockUser()
  const pushToast = useToastStore((state) => state.pushToast)

  const summary = usersSummaryQuery.data?.totals
  const roleOptions = useMemo(() => {
    const merged = new Map<string, { key: string; label: string; description: string | null; totalUsers: number; activeUsers: number }>()

    FALLBACK_ROLE_OPTIONS.forEach((entry) => {
      merged.set(entry.key, { ...entry })
    })

    const apiRoles = Array.isArray(userRolesQuery.data?.roles) ? userRolesQuery.data.roles : []
    apiRoles.forEach((entry) => {
      merged.set(entry.key, {
        key: entry.key,
        label: entry.label || entry.key,
        description: entry.description || null,
        totalUsers: Number(entry.totalUsers || 0),
        activeUsers: Number(entry.activeUsers || 0),
      })
    })

    return [...merged.values()]
  }, [userRolesQuery.data])
  const activeBranches = useMemo(() => activeBranchesQuery.data?.data || [], [activeBranchesQuery.data])
  const branchOptions = useMemo(
    () => activeBranches.map((branch) => ({
      id: Number(branch.id),
      label: `${branch.region_name || 'Region'} - ${branch.name}${branch.code ? ` (${branch.code})` : ''}`,
    })),
    [activeBranches],
  )
  const areaOptions = useMemo(() => buildBranchAreaOptions(activeBranches), [activeBranches])
  const selectedUser = useMemo(
    () => usersQuery.data?.data.find((user) => user.id === selectedUserId) || null,
    [usersQuery.data, selectedUserId],
  )
  const permissionOptions = useMemo(
    () => (Array.isArray(permissionCatalogQuery.data?.permissions) ? permissionCatalogQuery.data.permissions : []),
    [permissionCatalogQuery.data],
  )
  const selectedRole = useMemo(() => {
    const normalizedRole = createUserForm.role.trim()
    if (roleOptions.some((entry) => entry.key === normalizedRole)) {
      return normalizedRole
    }
    return roleOptions[0]?.key || ''
  }, [createUserForm.role, roleOptions])
  const selectedRoles = useMemo(() => {
    const normalizedRoles = [...new Set(createUserForm.roles.map((entry) => String(entry || '').trim()).filter(Boolean))]
    if (selectedRole && !normalizedRoles.includes(selectedRole)) {
      return [selectedRole, ...normalizedRoles]
    }
    return normalizedRoles.length > 0 ? normalizedRoles : (selectedRole ? [selectedRole] : [])
  }, [createUserForm.roles, selectedRole])
  const isAreaManagerRole = selectedRole === 'area_manager'
  const isMultiBranchRole = isAreaManagerRole || selectedRole === 'investor' || selectedRole === 'partner'
  const isBranchScopedRole = selectedRole === 'operations_manager' || selectedRole === 'loan_officer' || selectedRole === 'cashier'
  const selectedAreaOption = useMemo(() => {
    if (!isAreaManagerRole || areaOptions.length === 0) {
      return null
    }
    return areaOptions.find((option) => option.key === createUserForm.areaKey) || areaOptions[0]
  }, [areaOptions, createUserForm.areaKey, isAreaManagerRole])
  const effectiveAreaKey = selectedAreaOption?.key || ''
  const effectiveAreaBranchIds = isAreaManagerRole ? (selectedAreaOption?.branchIds || []) : createUserForm.areaBranchIds
  const effectiveSelectedPermissionId = useMemo(() => {
    if (permissionOptions.length === 0) {
      return ''
    }
    return permissionOptions.some((entry) => entry.permission_id === selectedPermissionId)
      ? selectedPermissionId
      : permissionOptions[0].permission_id
  }, [permissionOptions, selectedPermissionId])
  const selectedPermission = useMemo(
    () => permissionOptions.find((entry) => entry.permission_id === effectiveSelectedPermissionId) || null,
    [effectiveSelectedPermissionId, permissionOptions],
  )
  const roleAllocationDefaults = useMemo((): RoleAllocationFormState => {
    if (!selectedUserId || !selectedUser) {
      return { primaryRole: '', roles: [] }
    }

    const assignedRoles = Array.isArray(userPermissionsQuery.data?.roles) && userPermissionsQuery.data.roles.length > 0
      ? userPermissionsQuery.data.roles
      : Array.isArray(selectedUser.roles) && selectedUser.roles.length > 0
        ? selectedUser.roles
        : [selectedUser.role]
    const primaryRole = String(userPermissionsQuery.data?.role || selectedUser.role || '').trim()
    const normalizedRoles = [...new Set(assignedRoles.map((role) => String(role || '').trim()).filter(Boolean))]
    const ensuredRoles = primaryRole && !normalizedRoles.includes(primaryRole)
      ? [primaryRole, ...normalizedRoles]
      : normalizedRoles

    return {
      primaryRole,
      roles: ensuredRoles,
    }
  }, [selectedUser, selectedUserId, userPermissionsQuery.data])
  const roleAllocationForm = roleAllocationDraft && roleAllocationDraft.userId === selectedUserId
    ? roleAllocationDraft.form
    : roleAllocationDefaults

  function updateRoleAllocationForm(updater: (previous: RoleAllocationFormState) => RoleAllocationFormState) {
    if (!selectedUserId) {
      return
    }

    setRoleAllocationDraft((current) => {
      const previous = current?.userId === selectedUserId ? current.form : roleAllocationDefaults
      return {
        userId: selectedUserId,
        form: updater(previous),
      }
    })
  }

  const canGrantSelectedPermission = Boolean(
    selectedUserId
      && effectiveSelectedPermissionId
      && !userPermissionsQuery.data?.customPermissions.some((entry) => entry.permission_id === effectiveSelectedPermissionId),
  )

  const handleGrantPermission = () => {
    if (!selectedUserId || !effectiveSelectedPermissionId) {
      return
    }
    grantPermissionMutation.mutate({ userId: selectedUserId, permissionId: effectiveSelectedPermissionId })
  }

  const handleRevokePermission = (permissionId: string) => {
    if (!selectedUserId) {
      return
    }
    revokePermissionMutation.mutate({ userId: selectedUserId, permissionId })
  }

  const handleResetUserPassword = () => {
    if (!selectedUserId) {
      return
    }
    resetUserPasswordMutation.mutate(selectedUserId, {
      onSuccess: () => {
        pushToast({ type: 'success', message: 'Password reset initiated.' })
        void userSecurityStateQuery.refetch()
      },
      onError: (error) => {
        pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to initiate password reset.') })
      },
    })
  }

  const handleRevokeSessions = () => {
    if (!selectedUserId) {
      return
    }
    revokeUserSessionsMutation.mutate(selectedUserId, {
      onSuccess: () => {
        pushToast({ type: 'success', message: 'User sessions revoked.' })
      },
      onError: (error) => {
        pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to revoke sessions.') })
      },
    })
  }

  const handleUnlockUser = () => {
    if (!selectedUserId) {
      return
    }
    unlockUserMutation.mutate(selectedUserId, {
      onSuccess: () => {
        pushToast({ type: 'success', message: 'User account unlocked.' })
      },
      onError: (error) => {
        pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to unlock user.') })
      },
    })
  }

  const handleUpdateAllocatedRoles = () => {
    if (!selectedUserId || !selectedUser) {
      return
    }

    const primaryRole = roleAllocationForm.primaryRole.trim()
    const roles = [...new Set(roleAllocationForm.roles.map((entry) => entry.trim().toLowerCase()).filter(Boolean))]
    const nextRoles = roles.includes(primaryRole) ? roles : [primaryRole, ...roles]

    if (!primaryRole) {
      setRoleAllocationError('Primary role is required.')
      return
    }

    if (nextRoles.length === 0) {
      setRoleAllocationError('Select at least one allocated role.')
      return
    }

    const payload: UpdateUserRolesRequest = {
      role: primaryRole,
      roles: nextRoles,
      branchId: selectedUser.branch_id ?? null,
      primaryRegionId: selectedUser.primary_region_id ?? null,
    }

    if (Array.isArray(selectedUser.assigned_branch_ids) && selectedUser.assigned_branch_ids.length > 0) {
      payload.branchIds = selectedUser.assigned_branch_ids
    }

    setRoleAllocationError(null)
    updateUserRolesMutation.mutate(
      { userId: selectedUserId, payload },
      {
        onSuccess: () => {
          pushToast({ type: 'success', message: 'Allocated roles updated successfully.' })
        },
        onError: (error) => {
          const message = getApiErrorMessage(error, 'Failed to update allocated roles.')
          setRoleAllocationError(message)
          pushToast({ type: 'error', message })
        },
      },
    )
  }

  const handleCreateUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateUserError(null)

    const fullName = createUserForm.fullName.trim()
    const email = createUserForm.email.trim().toLowerCase()
    const password = createUserForm.password
    const role = selectedRole.trim()
    const roles = [...new Set(selectedRoles.map((entry) => entry.trim().toLowerCase()).filter(Boolean))]
    const branchIdInput = createUserForm.branchId.trim()
    const areaBranchIdsInput = [...new Set(effectiveAreaBranchIds)].filter((branchId) => Number.isInteger(branchId) && branchId > 0)

    if (fullName.length < 2) {
      setCreateUserError('Full name must be at least 2 characters.')
      return
    }
    if (!email) {
      setCreateUserError('Email is required.')
      return
    }
    if (!isStrongPassword(password)) {
      setCreateUserError('Password must be 8+ chars with upper, lower, number, and symbol.')
      return
    }
    if (!role) {
      setCreateUserError('Role is required.')
      return
    }
    if (!roles.includes(role)) {
      roles.unshift(role)
    }

    if ((isMultiBranchRole || isBranchScopedRole) && activeBranches.length === 0) {
      setCreateUserError('No active branches are currently available for assignment.')
      return
    }

    let branchId: number | undefined = undefined
    let branchIds: number[] | undefined = undefined

    if (isBranchScopedRole) {
      const parsedBranchId = Number(branchIdInput)
      if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
        setCreateUserError('Select one active branch for this role.')
        return
      }
      branchId = parsedBranchId
    }

    if (isMultiBranchRole) {
      if (isAreaManagerRole && !effectiveAreaKey.trim()) {
        setCreateUserError('Select an area for this role.')
        return
      }
      if (areaBranchIdsInput.length === 0) {
        setCreateUserError(
          isAreaManagerRole
            ? 'The selected area does not contain any active branches.'
            : 'Select at least one active branch for this role.',
        )
        return
      }
      branchIds = areaBranchIdsInput
    }

    createUserMutation.mutate(
      {
        fullName,
        email,
        password,
        role,
        roles,
        branchId,
        branchIds,
      },
      {
        onSuccess: () => {
          setCreateUserForm((prev) => ({
            ...prev,
            fullName: '',
            email: '',
            password: '',
            role: selectedRole || prev.role,
            roles: selectedRole ? [selectedRole] : [prev.role],
            branchId: isBranchScopedRole ? prev.branchId : '',
            areaKey: '',
            areaBranchIds: [],
          }))
          setCreateUserError(null)
          pushToast({ type: 'success', message: 'User created successfully.' })
        },
        onError: (error) => {
          const message = getApiErrorMessage(error, 'Failed to create user.')
          setCreateUserError(message)
          pushToast({ type: 'error', message })
        },
      },
    )
  }

  return (
    <div>
      <h1>Admin</h1>

      {summary ? (
        <div className={styles.cards}>
          <div className={styles.card}><div className={styles.label}>Total users</div><div className={styles.value}>{summary.totalUsers}</div></div>
          <div className={styles.card}><div className={styles.label}>Active users</div><div className={styles.value}>{summary.activeUsers}</div></div>
          <div className={styles.card}><div className={styles.label}>Inactive users</div><div className={styles.value}>{summary.inactiveUsers}</div></div>
          <div className={styles.card}><div className={styles.label}>Locked users</div><div className={styles.value}>{summary.lockedUsers}</div></div>
        </div>
      ) : null}

      <section className={styles.createPanel}>
        <h2>Create user</h2>
        <p className={styles.muted}>Create a new account and assign an initial role.</p>
        <form className={styles.createForm} onSubmit={handleCreateUser}>
          <div className={styles.createGrid}>
            <input
              className={`${styles.input} ${styles.createField}`}
              value={createUserForm.fullName}
              onChange={(event) => setCreateUserForm((prev) => ({ ...prev, fullName: event.target.value }))}
              placeholder="Full name"
              autoComplete="name"
              required
            />
            <input
              className={`${styles.input} ${styles.createField}`}
              type="email"
              value={createUserForm.email}
              onChange={(event) => setCreateUserForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Email address"
              autoComplete="email"
              required
            />
            <input
              className={`${styles.input} ${styles.createField}`}
              type="password"
              value={createUserForm.password}
              onChange={(event) => setCreateUserForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Password"
              autoComplete="new-password"
              required
            />
            <select
              className={`${styles.input} ${styles.createField}`}
              value={selectedRole}
              onChange={(event) => {
                const nextRole = event.target.value
                setCreateUserForm((prev) => ({
                  ...prev,
                  role: nextRole,
                  roles: prev.roles.includes(nextRole) ? prev.roles : [nextRole, ...prev.roles],
                  branchId: nextRole === 'operations_manager' || nextRole === 'loan_officer' || nextRole === 'cashier' ? prev.branchId : '',
                  areaKey: nextRole === 'area_manager' ? prev.areaKey : '',
                  areaBranchIds: nextRole === 'area_manager' ? prev.areaBranchIds : [],
                }))
                setCreateUserError(null)
              }}
            >
              {roleOptions.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label} ({entry.key})
                </option>
              ))}
            </select>
            <label className={styles.createField}>
              <span className={styles.fieldLabel}>Assigned roles (multi-select)</span>
              <select
                className={styles.multiSelect}
                multiple
                size={Math.min(10, Math.max(5, roleOptions.length || 5))}
                value={selectedRoles}
                onChange={(event) => {
                  const selectedRoles = Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                  const normalized = [...new Set(selectedRoles)]
                  const nextRoles = normalized.includes(selectedRole)
                    ? normalized
                    : [selectedRole, ...normalized]
                  setCreateUserForm((prev) => ({ ...prev, roles: nextRoles }))
                  setCreateUserError(null)
                }}
              >
                {roleOptions.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label} ({entry.key})
                  </option>
                ))}
              </select>
            </label>
            {isBranchScopedRole ? (
              <select
                className={`${styles.input} ${styles.createField}`}
                value={createUserForm.branchId}
                onChange={(event) => setCreateUserForm((prev) => ({ ...prev, branchId: event.target.value }))}
              >
                <option value="">Select branch</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.label}
                  </option>
                ))}
              </select>
            ) : null}
            {isAreaManagerRole ? (
              <div className={styles.createField}>
                <label>
                  <span className={styles.fieldLabel}>Assign area</span>
                  <select
                    className={styles.input}
                    value={effectiveAreaKey}
                    onChange={(event) => {
                      const nextArea = areaOptions.find((option) => option.key === event.target.value)
                      setCreateUserForm((prev) => ({
                        ...prev,
                        areaKey: event.target.value,
                        areaBranchIds: nextArea?.branchIds || [],
                      }))
                      setCreateUserError(null)
                    }}
                  >
                    <option value="">Select area</option>
                    {areaOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label} ({option.branchCount} branches)
                      </option>
                    ))}
                  </select>
                </label>
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
              <label className={styles.createField}>
                <span className={styles.fieldLabel}>Assign branches (multi-select)</span>
                <select
                  className={styles.multiSelect}
                  multiple
                  size={Math.min(10, Math.max(5, branchOptions.length || 5))}
                  value={createUserForm.areaBranchIds.map(String)}
                  onChange={(event) => {
                    const selectedIds = Array.from(event.currentTarget.selectedOptions)
                      .map((option) => Number(option.value))
                      .filter((value) => Number.isInteger(value) && value > 0)
                    setCreateUserForm((prev) => ({ ...prev, areaBranchIds: selectedIds }))
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
          </div>
          {isMultiBranchRole || isBranchScopedRole ? (
            <p className={styles.muted}>
              {activeBranchesQuery.isLoading
                ? 'Loading active branches...'
                : activeBranchesQuery.isError
                  ? 'Unable to load active branches.'
                  : isAreaManagerRole
                    ? `${areaOptions.length} areas covering ${branchOptions.length} active branches available for assignment.`
                    : `${branchOptions.length} active branches available for assignment.`}
            </p>
          ) : null}
          <div className={styles.createActions}>
            <button type="submit" className={styles.actionButton} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? 'Creating...' : 'Create user'}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={createUserMutation.isPending}
              onClick={() => {
                setCreateUserForm((prev) => ({
                  ...prev,
                  fullName: '',
                  email: '',
                  password: '',
                  role: selectedRole || prev.role,
                  roles: selectedRole ? [selectedRole] : [prev.role],
                  branchId: isBranchScopedRole ? prev.branchId : '',
                  areaKey: '',
                  areaBranchIds: [],
                }))
                setCreateUserError(null)
              }}
            >
              Reset
            </button>
          </div>
          <p className={styles.muted}>Password must include uppercase, lowercase, number, and symbol.</p>
          {createUserError ? <p className={styles.errorText} role="alert">{createUserError}</p> : null}
        </form>
      </section>

      <div className={styles.toolbar}>
        <input
          className={styles.input}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search users by name or email"
        />
      </div>

      <AsyncState
        loading={usersSummaryQuery.isLoading || usersQuery.isLoading}
        error={usersSummaryQuery.isError || usersQuery.isError}
        empty={Boolean(usersQuery.data && usersQuery.data.data.length === 0)}
        loadingText="Loading admin data..."
        errorText="Unable to load admin data."
        emptyText="No users found for the current filters."
        onRetry={() => {
          void Promise.all([usersSummaryQuery.refetch(), usersQuery.refetch()])
        }}
      />

      {usersQuery.data && usersQuery.data.data.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Branch</th>
              <th>Region</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.data.data.map((user) => (
              <tr key={user.id}>
                <td>{user.full_name}</td>
                <td>{user.email}</td>
                <td>{Array.isArray(user.roles) && user.roles.length > 0 ? user.roles.join(', ') : user.role}</td>
                <td>{user.is_active === 1 ? 'active' : 'inactive'}</td>
                <td>{user.branch_name || '-'}</td>
                <td>{user.region_name || '-'}</td>
                <td>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => {
                      setSelectedUserId(user.id)
                      setSelectedPermissionId('')
                      setRoleAllocationDraft(null)
                      setRoleAllocationError(null)
                    }}
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {selectedUserId ? (
        <section className={styles.permissionsPanel}>
          <h2>Permissions {selectedUser ? `- ${selectedUser.full_name}` : ''}</h2>

          <AsyncState
            loading={userPermissionsQuery.isLoading}
            error={userPermissionsQuery.isError}
            empty={false}
            loadingText="Loading user permissions..."
            errorText="Unable to load user permissions."
            onRetry={() => {
              void userPermissionsQuery.refetch()
            }}
          />

          {userPermissionsQuery.data ? (
            <>
              <div className={styles.roleEditor}>
                <h3>Allocated roles</h3>
                <div className={styles.roleEditorGrid}>
                  <label className={styles.createField}>
                    <span className={styles.fieldLabel}>Primary role</span>
                    <select
                      className={styles.input}
                      value={roleAllocationForm.primaryRole}
                      onChange={(event) => {
                        const nextPrimaryRole = event.target.value
                        updateRoleAllocationForm((prev) => ({
                          primaryRole: nextPrimaryRole,
                          roles: prev.roles.includes(nextPrimaryRole) ? prev.roles : [nextPrimaryRole, ...prev.roles],
                        }))
                        setRoleAllocationError(null)
                      }}
                    >
                      <option value="">Select role</option>
                      {roleOptions.map((role) => (
                        <option key={role.key} value={role.key}>{role.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.createField}>
                    <span className={styles.fieldLabel}>Allocated roles</span>
                    <select
                      multiple
                      className={styles.multiSelect}
                      value={roleAllocationForm.roles}
                      onChange={(event) => {
                        const selectedRoles = Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                        const deduped = [...new Set(selectedRoles)]
                        const nextRoles = roleAllocationForm.primaryRole && !deduped.includes(roleAllocationForm.primaryRole)
                          ? [roleAllocationForm.primaryRole, ...deduped]
                          : deduped
                        updateRoleAllocationForm((prev) => ({ ...prev, roles: nextRoles }))
                        setRoleAllocationError(null)
                      }}
                    >
                      {roleOptions.map((role) => (
                        <option key={role.key} value={role.key}>{role.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className={styles.muted}>Branch and region assignments are preserved when updating general role allocation.</p>
                {roleAllocationError ? <p className={styles.errorText}>{roleAllocationError}</p> : null}
                <div className={styles.roleEditorActions}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={handleUpdateAllocatedRoles}
                    disabled={updateUserRolesMutation.isPending || !roleAllocationForm.primaryRole}
                  >
                    {updateUserRolesMutation.isPending ? 'Saving roles...' : 'Save allocated roles'}
                  </button>
                </div>
              </div>

              <div className={styles.permissionMeta}>
                <div>Role: <strong>{userPermissionsQuery.data.role}</strong></div>
                <div>Assigned roles: <strong>{Array.isArray(userPermissionsQuery.data.roles) && userPermissionsQuery.data.roles.length > 0 ? userPermissionsQuery.data.roles.join(', ') : userPermissionsQuery.data.role}</strong></div>
                <div>Effective: {userPermissionsQuery.data.effectivePermissions.join(', ') || 'none'}</div>
              </div>

              <div className={styles.permissionActions}>
                <select
                  className={styles.input}
                  value={effectiveSelectedPermissionId}
                  onChange={(event) => setSelectedPermissionId(event.target.value)}
                  disabled={permissionCatalogQuery.isLoading || permissionOptions.length === 0}
                >
                  {permissionOptions.map((permission) => (
                    <option key={permission.permission_id} value={permission.permission_id}>
                      {permission.permission_id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={handleGrantPermission}
                  disabled={!canGrantSelectedPermission || grantPermissionMutation.isPending}
                >
                  {grantPermissionMutation.isPending ? 'Granting...' : 'Grant custom permission'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setSelectedUserId(null)
                    setSelectedPermissionId('')
                    setRoleAllocationDraft(null)
                    setRoleAllocationError(null)
                  }}
                >
                  Close
                </button>
              </div>

              {permissionCatalogQuery.isError ? (
                <p className={styles.errorText}>Unable to load permission catalog.</p>
              ) : null}

              {effectiveSelectedPermissionId ? (
                <div className={styles.permissionMeta}>
                  <div>
                    Description: <strong>{selectedPermission?.description || 'No description available.'}</strong>
                  </div>
                  <div>
                    Default roles: <strong>{(selectedPermission?.default_roles || []).join(', ') || 'none'}</strong>
                  </div>
                </div>
              ) : null}

              <h3>Custom permissions</h3>
              {userPermissionsQuery.data.customPermissions.length === 0 ? (
                <p className={styles.muted}>No custom permissions assigned.</p>
              ) : (
                <ul className={styles.permissionList}>
                  {userPermissionsQuery.data.customPermissions.map((permission) => (
                    <li key={permission.permission_id} className={styles.permissionItem}>
                      <div>
                        <div><strong>{permission.permission_id}</strong></div>
                        <div className={styles.muted}>{permission.description}</div>
                      </div>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleRevokePermission(permission.permission_id)}
                        disabled={revokePermissionMutation.isPending}
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <h3>Security state</h3>
              <AsyncState
                loading={userSecurityStateQuery.isLoading}
                error={userSecurityStateQuery.isError}
                empty={false}
                loadingText="Loading security state..."
                errorText="Unable to load security state."
                onRetry={() => {
                  void userSecurityStateQuery.refetch()
                }}
              />

              {userSecurityStateQuery.data ? (
                <>
                  <div className={styles.permissionMeta}>
                    <div>Status: <strong>{userSecurityStateQuery.data.isActive ? 'active' : 'inactive'}</strong></div>
                    <div>Failed login attempts: <strong>{userSecurityStateQuery.data.failedLoginAttempts}</strong></div>
                    <div>Locked until: <strong>{userSecurityStateQuery.data.lockedUntil || 'not locked'}</strong></div>
                    <div>Token version: <strong>{userSecurityStateQuery.data.tokenVersion}</strong></div>
                    <div>Deactivated at: <strong>{userSecurityStateQuery.data.deactivatedAt || 'n/a'}</strong></div>
                  </div>

                  <div className={styles.permissionActions}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={handleRevokeSessions}
                      disabled={revokeUserSessionsMutation.isPending}
                    >
                      {revokeUserSessionsMutation.isPending ? 'Revoking...' : 'Revoke sessions'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handleUnlockUser}
                      disabled={!userSecurityStateQuery.data.isLocked || unlockUserMutation.isPending}
                    >
                      {unlockUserMutation.isPending ? 'Unlocking...' : 'Unlock account'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handleResetUserPassword}
                      disabled={!userSecurityStateQuery.data.isActive || resetUserPasswordMutation.isPending}
                    >
                      {resetUserPasswordMutation.isPending ? 'Sending...' : 'Send reset link'}
                    </button>
                  </div>

                  <h3>Recent security actions</h3>
                  {userSecurityStateQuery.data.recentActions.length === 0 ? (
                    <p className={styles.muted}>No recent security actions recorded.</p>
                  ) : (
                    <ul className={styles.permissionList}>
                      {userSecurityStateQuery.data.recentActions.map((action) => (
                        <li key={action.id} className={styles.permissionItem}>
                          <div>
                            <div><strong>{action.action}</strong></div>
                            <div className={styles.muted}>
                              {action.createdAt || 'unknown time'}
                              {action.actorUserName ? ` by ${action.actorUserName}` : ''}
                              {action.ipAddress ? ` from ${action.ipAddress}` : ''}
                            </div>
                            {action.details ? <div className={styles.muted}>{action.details}</div> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

    </div>
  )
}
