import { apiClient } from './apiClient'
import type {
  AdminResetUserPasswordRequest,
  BranchesPagedResponse,
  CreateTenantRequest,
  CreateUserRequest,
  PermissionCatalogResponse,
  TenantRecord,
  TenantsResponse,
  UpdateTenantRequest,
  UpdateUserRolesRequest,
  UserSecurityStateResponse,
  UserRolesResponse,
  UserPermissionsResponse,
  UsersPagedResponse,
  UsersSummary,
} from '../types/admin'

export async function listUsers(params: Record<string, unknown> = {}): Promise<UsersPagedResponse> {
  const normalizedParams = { limit: 100, offset: 0, ...params }
  const { data } = await apiClient.get<UsersPagedResponse>('/users', { params: normalizedParams })
  return data
}

export async function getUsersSummary(): Promise<UsersSummary> {
  const { data } = await apiClient.get<UsersSummary>('/users/summary')
  return data
}

export async function listActiveBranches(): Promise<BranchesPagedResponse> {
  const { data } = await apiClient.get<BranchesPagedResponse>('/branches', {
    params: {
      isActive: 'true',
      limit: 200,
      offset: 0,
      sortBy: 'name',
      sortOrder: 'asc',
    },
  })
  return data
}

export async function getUserRoles(): Promise<UserRolesResponse> {
  const { data } = await apiClient.get<UserRolesResponse>('/users/roles')
  return data
}

export async function getUserPermissions(userId: number): Promise<UserPermissionsResponse> {
  const { data } = await apiClient.get<UserPermissionsResponse>(`/users/${userId}/permissions`)
  return data
}

export async function getUserSecurityState(userId: number): Promise<UserSecurityStateResponse> {
  const { data } = await apiClient.get<UserSecurityStateResponse>(`/users/${userId}/security-state`)
  return data
}

export async function getPermissionCatalog(): Promise<PermissionCatalogResponse> {
  const { data } = await apiClient.get<PermissionCatalogResponse>('/permissions/catalog')
  return data
}

export async function grantUserPermission(userId: number, permissionId: string): Promise<void> {
  await apiClient.post(`/users/${userId}/permissions`, { permissionId })
}

export async function revokeUserPermission(userId: number, permissionId: string): Promise<void> {
  await apiClient.delete(`/users/${userId}/permissions/${encodeURIComponent(permissionId)}`)
}

export async function createUser(payload: CreateUserRequest): Promise<void> {
  await apiClient.post('/users', payload)
}

export async function updateUserRoles(userId: number, payload: UpdateUserRolesRequest) {
  const { data } = await apiClient.post(`/users/${userId}/roles`, payload)
  return data
}

export async function deactivateUser(userId: number) {
  const { data } = await apiClient.post(`/users/${userId}/deactivate`)
  return data
}

export async function activateUser(userId: number) {
  const { data } = await apiClient.post(`/users/${userId}/activate`)
  return data
}

export async function resetUserPassword(userId: number, payload: AdminResetUserPasswordRequest) {
  const { data } = await apiClient.post(`/users/${userId}/reset-password`, payload)
  return data
}

export async function revokeUserSessions(userId: number) {
  const { data } = await apiClient.post(`/users/${userId}/revoke-sessions`)
  return data
}

export async function unlockUser(userId: number) {
  const { data } = await apiClient.post(`/users/${userId}/unlock`)
  return data
}

export async function updateUserProfile(userId: number, payload: Record<string, unknown>) {
  const { data } = await apiClient.patch(`/users/${userId}/profile`, payload)
  return data
}

// ── Tenant management ──────────────────────────────────────────────────────

export async function listTenants(): Promise<TenantsResponse> {
  const { data } = await apiClient.get<TenantsResponse>('/admin/tenants')
  return data
}

export async function getTenant(tenantId: string): Promise<{ tenant: TenantRecord }> {
  const { data } = await apiClient.get<{ tenant: TenantRecord }>(`/admin/tenants/${encodeURIComponent(tenantId)}`)
  return data
}

export async function createTenant(payload: CreateTenantRequest): Promise<{ message: string; tenant: TenantRecord }> {
  const { data } = await apiClient.post<{ message: string; tenant: TenantRecord }>('/admin/tenants', payload)
  return data
}

export async function updateTenant(
  tenantId: string,
  payload: UpdateTenantRequest,
): Promise<{ message: string; tenant: TenantRecord }> {
  const { data } = await apiClient.patch<{ message: string; tenant: TenantRecord }>(
    `/admin/tenants/${encodeURIComponent(tenantId)}`,
    payload,
  )
  return data
}
