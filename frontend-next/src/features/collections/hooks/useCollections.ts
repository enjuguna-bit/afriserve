import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCollectionAction,
  getCollectionsSummary,
  listCollectionActions,
  listOverdueCollections,
} from '../../../services/collectionService'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'
import type { CollectionAction, CollectionsSummary, CreateCollectionActionPayload, PagedResponse } from '../../../types/collection'

function isCollectionActionsResponse(value: unknown): value is PagedResponse<CollectionAction> {
  return Boolean(
    value
    && typeof value === 'object'
    && 'data' in value
    && Array.isArray((value as { data?: unknown }).data),
  )
}

function isCollectionsSummary(value: unknown): value is CollectionsSummary {
  return Boolean(
    value
    && typeof value === 'object'
    && 'total_collection_actions' in value
    && 'open_collection_actions' in value,
  )
}

export function useCollectionsSummary(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.collections.summary(params),
    queryFn: () => getCollectionsSummary(params),
    ...queryPolicies.report,
  })
}

export function useOverdueCollections(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.collections.overdue(params),
    queryFn: () => listOverdueCollections(params),
    ...queryPolicies.list,
  })
}

export function useCollectionActions(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.collections.actions(params),
    queryFn: () => listCollectionActions(params),
    ...queryPolicies.list,
  })
}

export function useCreateCollectionAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCollectionActionPayload) => createCollectionAction(payload),
    onMutate: async (payload) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.collections.actionLists() }),
        queryClient.cancelQueries({ queryKey: queryKeys.collections.summaries() }),
      ])

      const previousActions = queryClient.getQueriesData({ queryKey: queryKeys.collections.actionLists() })
      const previousSummaries = queryClient.getQueriesData({ queryKey: queryKeys.collections.summaries() })
      const temporaryId = -Date.now()

      queryClient.setQueriesData({ queryKey: queryKeys.collections.actionLists() }, (existing) => {
        if (!isCollectionActionsResponse(existing)) {
          return existing
        }

        const optimisticAction = {
          id: temporaryId,
          loan_id: payload.loanId,
          installment_id: payload.installmentId ?? null,
          action_type: payload.actionType,
          action_note: payload.actionNote ?? null,
          promise_date: payload.promiseDate ?? null,
          next_follow_up_date: payload.nextFollowUpDate ?? null,
          action_status: payload.actionStatus ?? 'open',
          created_by_user_id: 0,
          created_at: new Date().toISOString(),
        }

        return {
          ...existing,
          data: [optimisticAction, ...existing.data],
          paging: existing.paging
            ? {
              ...existing.paging,
              total: Number(existing.paging.total ?? 0) + 1,
            }
            : existing.paging,
        }
      })

      queryClient.setQueriesData({ queryKey: queryKeys.collections.summaries() }, (existing) => {
        if (!isCollectionsSummary(existing)) {
          return existing
        }

        return {
          ...existing,
          total_collection_actions: Number(existing.total_collection_actions ?? 0) + 1,
          open_collection_actions:
            payload.actionStatus && payload.actionStatus !== 'open'
              ? Number(existing.open_collection_actions ?? 0)
              : Number(existing.open_collection_actions ?? 0) + 1,
        }
      })

      return { previousActions, previousSummaries }
    },
    onError: (_error, _payload, context) => {
      if (!context) {
        return
      }

      context.previousActions.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      context.previousSummaries.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.actionLists(), refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.summaries(), refetchType: 'active' })
    },
  })
}
