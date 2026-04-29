import type { QueryClient } from '@tanstack/react-query'
import { getClientById, getClientOnboardingStatus, listClients } from './clientService'
import { getLoanSchedule, getLoanStatement, listLoans } from './loanService'
import { queryKeys } from './queryKeys'
import { queryPolicies } from './queryPolicies'
import { listLoanProducts } from './riskService'

export function prefetchClientWorkspace(queryClient: QueryClient, clientId: number) {
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return Promise.resolve()
  }

  return Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.clients.detail(clientId),
      queryFn: () => getClientById(clientId),
      staleTime: queryPolicies.detail.staleTime,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.clients.onboardingStatus(clientId),
      queryFn: () => getClientOnboardingStatus(clientId),
      staleTime: queryPolicies.detail.staleTime,
    }),
  ]).then(() => undefined)
}

export function prefetchLoanWorkspace(queryClient: QueryClient, loanId: number) {
  if (!Number.isInteger(loanId) || loanId <= 0) {
    return Promise.resolve()
  }

  return Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.loans.statement(loanId),
      queryFn: () => getLoanStatement(loanId),
      staleTime: queryPolicies.detail.staleTime,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.loans.schedule(loanId),
      queryFn: () => getLoanSchedule(loanId),
      staleTime: queryPolicies.detail.staleTime,
    }),
  ]).then(() => undefined)
}

export function prefetchWorkspaceWarmup(queryClient: QueryClient) {
  const initialClientListQuery = {
    limit: 50,
    offset: 0,
    sortBy: 'id' as const,
    sortOrder: 'desc' as const,
  }
  const initialLoanListQuery = {
    limit: 50,
    offset: 0,
    sortBy: 'id',
    sortOrder: 'desc',
  }

  return Promise.all([
    queryClient.prefetchQuery({
      queryKey: ['loan-origination', 'loan-products'],
      queryFn: () => listLoanProducts(),
      staleTime: queryPolicies.list.staleTime,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.clients.list(initialClientListQuery),
      queryFn: () => listClients(initialClientListQuery),
      staleTime: queryPolicies.list.staleTime,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.loans.list(initialLoanListQuery),
      queryFn: () => listLoans(initialLoanListQuery),
      staleTime: queryPolicies.list.staleTime,
    }),
  ]).then(() => undefined)
}
