import { apiClient } from './apiClient'
import type {
  CollectionAction,
  CollectionOverdueRow,
  CollectionsSummary,
  CreateCollectionActionPayload,
  PagedResponse,
} from '../types/collection'

export async function getCollectionsSummary(params: Record<string, unknown> = {}): Promise<CollectionsSummary> {
  const { data } = await apiClient.get<CollectionsSummary>('/reports/collections-summary', { params })
  return data
}

export async function listOverdueCollections(params: Record<string, unknown> = {}): Promise<PagedResponse<CollectionOverdueRow>> {
  const normalizedParams = { limit: 50, offset: 0, ...params }
  const { data } = await apiClient.get<PagedResponse<CollectionOverdueRow>>('/collections/overdue', { params: normalizedParams })
  return data
}

export async function listCollectionActions(params: Record<string, unknown> = {}): Promise<PagedResponse<CollectionAction>> {
  const normalizedParams = { limit: 50, offset: 0, ...params }
  const { data } = await apiClient.get<PagedResponse<CollectionAction>>('/collections/actions', { params: normalizedParams })
  return data
}

export async function createCollectionAction(payload: CreateCollectionActionPayload): Promise<CollectionAction> {
  const { data } = await apiClient.post<CollectionAction>('/collections/actions', payload)
  return data
}

