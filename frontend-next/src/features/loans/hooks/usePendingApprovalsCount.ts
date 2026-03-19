import { useQuery } from '@tanstack/react-query'
import { listPendingApprovalLoans } from '../../../services/loanService'
import { queryKeys } from '../../../services/queryKeys'
import { useAuth } from '../../../hooks/useAuth'

const APPROVAL_ROLES = ['admin', 'finance', 'operations_manager', 'area_manager']

/**
 * Lightweight hook that returns a live pending-approval count.
 * Used by the sidebar Quick Actions badge without blocking the main dashboard query.
 * Returns 0 for roles that can't access approvals.
 */
export function usePendingApprovalsCount(): number {
  const { user } = useAuth()
  const role = String(user?.role || '').trim().toLowerCase()
  const enabled = APPROVAL_ROLES.includes(role)

  const query = useQuery({
    queryKey: [...queryKeys.loans.pendingApprovalLists(), 'sidebar-count'] as const,
    queryFn: () => listPendingApprovalLoans({ limit: 1, offset: 0 }),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  })

  const data = query.data as { paging?: { total?: unknown } } | undefined
  return Number(data?.paging?.total ?? 0)
}
