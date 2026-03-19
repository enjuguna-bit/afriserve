import { apiClient } from './apiClient'
import type {
  GlAccount,
  GlAccountStatementPayload,
  GlTrialBalancePayload,
  GlFxRate,
  GlBatchRun,
  GlPeriodLock,
  GlCoaVersion,
  GlCoaVersionAccount,
  GlSuspenseCase,
} from '../types/gl'

export async function listGlAccounts() {
  const { data } = await apiClient.get<GlAccount[]>('/reports/gl/accounts')
  return data
}

export async function getGlTrialBalance(params: Record<string, unknown> = {}) {
  const { data } = await apiClient.get<GlTrialBalancePayload>('/reports/gl/trial-balance', { params })
  return data
}

export async function getGlAccountStatement(accountId: number, params: Record<string, unknown> = {}) {
  const { data } = await apiClient.get<GlAccountStatementPayload>(`/reports/gl/accounts/${accountId}/statement`, { params })
  return data
}

export async function listGlFxRates(params: Record<string, unknown> = {}) {
  const { data } = await apiClient.get<GlFxRate[]>('/reports/gl/fx/rates', { params })
  return data
}

export async function createGlFxRate(payload: Record<string, unknown>) {
  const { data } = await apiClient.post<GlFxRate>('/reports/gl/fx/rates', payload)
  return data
}

export async function listGlBatchRuns(params: Record<string, unknown> = {}) {
  const { data } = await apiClient.get<GlBatchRun[]>('/reports/gl/batches', { params })
  return data
}

export async function listGlPeriodLocks(params: Record<string, unknown> = {}) {
  const { data } = await apiClient.get<GlPeriodLock[]>('/reports/gl/period-locks', { params })
  return data
}

export async function runGlBatch(batchType: 'eod' | 'eom' | 'eoy', payload: Record<string, unknown> = {}) {
  const { data } = await apiClient.post<GlBatchRun>(`/reports/gl/batch/${batchType}`, payload)
  return data
}

export async function listGlCoaVersions() {
  const { data } = await apiClient.get<GlCoaVersion[]>('/reports/gl/coa/versions')
  return data
}

export async function listGlCoaVersionAccounts(versionId: number) {
  const { data } = await apiClient.get<GlCoaVersionAccount[]>(`/reports/gl/coa/versions/${versionId}/accounts`)
  return data
}

export async function createGlCoaVersion(payload: Record<string, unknown>) {
  const { data } = await apiClient.post<GlCoaVersion>('/reports/gl/coa/versions', payload)
  return data
}

export async function activateGlCoaVersion(versionId: number, payload: Record<string, unknown> = {}) {
  const { data } = await apiClient.post<GlCoaVersion>(`/reports/gl/coa/versions/${versionId}/activate`, payload)
  return data
}

export async function listGlSuspenseCases(params: Record<string, unknown> = {}) {
  const { data } = await apiClient.get<GlSuspenseCase[]>('/reports/gl/suspense/cases', { params })
  return data
}

export async function createGlSuspenseCase(payload: Record<string, unknown>) {
  const { data } = await apiClient.post('/reports/gl/suspense/cases', payload)
  return data
}

export async function allocateGlSuspenseCase(caseId: number, payload: Record<string, unknown>) {
  const { data } = await apiClient.post(`/reports/gl/suspense/cases/${caseId}/allocate`, payload)
  return data
}
