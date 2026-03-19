import { apiClient } from './apiClient'
import type {
  BranchesPagedResponse,
  HierarchyPerformanceResponse,
  HierarchyTreeResponse,
  RegionRecord,
} from '../types/branch'

export async function listRegions() {
  const { data } = await apiClient.get<{ data: RegionRecord[] }>('/regions')
  return data
}

export async function listBranches(params: Record<string, unknown> = {}): Promise<BranchesPagedResponse> {
  const normalizedParams = { limit: 100, offset: 0, ...params }
  const { data } = await apiClient.get<BranchesPagedResponse>('/branches', { params: normalizedParams })
  return data
}

export async function getHierarchyTree(): Promise<HierarchyTreeResponse> {
  const { data } = await apiClient.get<HierarchyTreeResponse>('/hierarchy/tree')
  return data
}

export async function getHierarchyPerformance(params: Record<string, unknown> = {}): Promise<HierarchyPerformanceResponse> {
  const { data } = await apiClient.get<HierarchyPerformanceResponse>('/reports/hierarchy/performance', { params })
  return data
}

export async function createBranch(payload: Record<string, unknown>) {
  const { data } = await apiClient.post('/branches', payload)
  return data
}

export async function updateBranch(branchId: number, payload: Record<string, unknown>) {
  const { data } = await apiClient.patch(`/branches/${branchId}`, payload)
  return data
}

export async function deactivateBranch(branchId: number) {
  const { data } = await apiClient.delete(`/branches/${branchId}`)
  return data
}

