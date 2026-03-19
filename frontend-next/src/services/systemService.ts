import { apiClient } from './apiClient'
import type { AuditLogRecord, HierarchyEventRecord, SystemPagedResponse, TransactionRecord } from '../types/system'

export async function listTransactions(params: Record<string, unknown> = {}) {
  const normalizedParams = { limit: 20, offset: 0, ...params }
  const { data } = await apiClient.get<SystemPagedResponse<TransactionRecord>>('/transactions', { params: normalizedParams })
  return data
}

export async function listAuditLogs(params: Record<string, unknown> = {}) {
  const normalizedParams = { limit: 50, offset: 0, ...params }
  const { data } = await apiClient.get<SystemPagedResponse<AuditLogRecord>>('/audit-logs', { params: normalizedParams })
  return data
}

export async function listAuditTrail(params: Record<string, unknown> = {}) {
  const normalizedParams = { limit: 50, offset: 0, ...params }
  const { data } = await apiClient.get<SystemPagedResponse<AuditLogRecord>>('/system/audit-trail', { params: normalizedParams })
  return data
}

export async function listHierarchyEvents(params: Record<string, unknown> = {}) {
  const normalizedParams = { limit: 50, offset: 0, ...params }
  const { data } = await apiClient.get<SystemPagedResponse<HierarchyEventRecord>>('/hierarchy-events', { params: normalizedParams })
  return data
}

