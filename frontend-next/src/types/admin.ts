export type AdminUser = {
  id: number
  full_name: string
  email: string
  role: string
  roles?: string[]
  is_active: number
  branch_id: number | null
  primary_region_id: number | null
  branch_name: string | null
  region_name: string | null
  assigned_branch_ids: number[]
  created_at: string
}

export type UsersPagedResponse = {
  data: AdminUser[]
  paging: {
    total: number
    limit: number
    offset: number
  }
  sort: {
    sortBy: string
    sortOrder: string
  }
}

export type UsersSummary = {
  totals: {
    totalUsers: number
    activeUsers: number
    inactiveUsers: number
    lockedUsers: number
  }
  byRole: Array<{
    role: string
    totalUsers: number
    activeUsers: number
  }>
}

export type RolePermissionEntry = {
  permission_id: string
  description: string
  created_at: string
}

export type CustomPermissionEntry = {
  permission_id: string
  description: string
  granted_at: string
  granted_by_user_id: number | null
  granted_by_user_name: string | null
}

export type UserPermissionsResponse = {
  userId: number
  role: string
  roles?: string[]
  rolePermissions: RolePermissionEntry[]
  customPermissions: CustomPermissionEntry[]
  effectivePermissions: string[]
}

export type PermissionCatalogEntry = {
  permission_id: string
  description: string
  default_roles: string[]
}

export type PermissionCatalogResponse = {
  permissions: PermissionCatalogEntry[]
}

export type UserSecurityAction = {
  id: number
  actorUserId: number | null
  actorUserName: string | null
  action: string
  details: string | null
  ipAddress: string | null
  createdAt: string | null
}

export type UserSecurityStateResponse = {
  userId: number
  email: string
  role: string
  roles: string[]
  isActive: boolean
  deactivatedAt: string | null
  failedLoginAttempts: number
  lockedUntil: string | null
  isLocked: boolean
  tokenVersion: number
  recentActions: UserSecurityAction[]
}

export type UserRoleSummary = {
  key: string
  label: string
  description: string | null
  totalUsers: number
  activeUsers: number
}

export type UserRolesResponse = {
  roles: UserRoleSummary[]
}

export type AdminBranch = {
  id: number
  name: string
  code: string | null
  region_id: number
  region_name: string | null
  is_active: number
}

export type BranchesPagedResponse = {
  data: AdminBranch[]
  paging: {
    total: number
    limit: number
    offset: number
  }
  sort: {
    sortBy: string
    sortOrder: string
  }
}

export type CreateUserRequest = {
  fullName: string
  email: string
  password: string
  role: string
  roles?: string[]
  branchId?: number
  branchIds?: number[]
}

// ── Tenant management types ──────────────────────────────────────────────────

export type TenantStatus = 'active' | 'suspended' | 'deactivated'

export type TenantRecord = {
  id: string
  name: string
  status: TenantStatus
  created_at: string
  updated_at: string
}

export type TenantsResponse = {
  data: TenantRecord[]
  total: number
}

export type CreateTenantRequest = {
  id: string
  name: string
}

export type UpdateTenantRequest = {
  name?: string
  status?: TenantStatus
}

// ─────────────────────────────────────────────────────────────────────────────

export type UpdateUserRolesRequest = {
  role: string
  roles: string[]
  branchId?: number | null
  branchIds?: number[]
  primaryRegionId?: number | null
}
