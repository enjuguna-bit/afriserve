import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createUser,
  deactivateUser,
  getPermissionCatalog,
  getUserPermissions,
  getUserSecurityState,
  getUserRoles,
  getUsersSummary,
  grantUserPermission,
  listActiveBranches,
  listUsers,
  resetUserPassword,
  revokeUserSessions,
  revokeUserPermission,
  unlockUser,
  updateUserProfile,
  updateUserRoles,
} from '../../../services/adminService'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'
import type { UpdateUserRolesRequest } from '../../../types/admin'

export function useUsers(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.admin.users(params),
    queryFn: () => listUsers(params),
    ...queryPolicies.list,
  })
}

export function useUsersSummary() {
  return useQuery({
    queryKey: queryKeys.admin.usersSummary(),
    queryFn: getUsersSummary,
    ...queryPolicies.report,
  })
}

export function useUserRoles() {
  return useQuery({
    queryKey: queryKeys.admin.userRoles(),
    queryFn: getUserRoles,
    ...queryPolicies.list,
  })
}

export function useActiveBranches() {
  return useQuery({
    queryKey: queryKeys.admin.activeBranches(),
    queryFn: listActiveBranches,
    ...queryPolicies.list,
  })
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: queryKeys.admin.permissionCatalog(),
    queryFn: getPermissionCatalog,
    ...queryPolicies.list,
  })
}

export function useUserPermissions(userId: number | null) {
  return useQuery({
    queryKey: queryKeys.admin.userPermissions(Number(userId || 0)),
    queryFn: () => getUserPermissions(Number(userId)),
    enabled: Number.isInteger(userId) && Number(userId) > 0,
    ...queryPolicies.detail,
  })
}

export function useUserSecurityState(userId: number | null) {
  return useQuery({
    queryKey: queryKeys.admin.userSecurityState(Number(userId || 0)),
    queryFn: () => getUserSecurityState(Number(userId)),
    enabled: Number.isInteger(userId) && Number(userId) > 0,
    ...queryPolicies.detail,
  })
}

export function useGrantUserPermission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, permissionId }: { userId: number; permissionId: string }) => {
      return grantUserPermission(userId, permissionId)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.userPermissions(variables.userId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersLists() })
    },
  })
}

export function useRevokeUserPermission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, permissionId }: { userId: number; permissionId: string }) => {
      return revokeUserPermission(userId, permissionId)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.userPermissions(variables.userId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersLists() })
    },
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersSummary() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersLists() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.userRoles() })
    },
  })
}

export function useUpdateUserRoles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: UpdateUserRolesRequest }) => updateUserRoles(userId, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersLists() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersSummary() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.userPermissions(variables.userId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.userSecurityState(variables.userId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.userRoles() })
    },
  })
}

export function useDeactivateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => deactivateUser(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersSummary() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersLists() })
    },
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (userId: number) => resetUserPassword(userId),
  })
}

export function useRevokeUserSessions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => revokeUserSessions(userId),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.userSecurityState(userId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersLists() })
    },
  })
}

export function useUnlockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => unlockUser(userId),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.userSecurityState(userId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersLists() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersSummary() })
    },
  })
}

export function useUpdateUserProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: Record<string, unknown> }) => updateUserProfile(userId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersLists() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersSummary() })
    },
  })
}
