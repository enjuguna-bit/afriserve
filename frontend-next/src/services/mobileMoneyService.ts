import { apiClient } from './apiClient'
import type { MobileMoneyB2CDisbursement, MobileMoneyB2CSummary, MobileMoneyC2BEvent } from '../types/mobileMoney'

export async function listMobileMoneyC2BEvents(params: { status?: string; limit?: number } = {}) {
  const { data } = await apiClient.get<MobileMoneyC2BEvent[]>('/mobile-money/c2b/events', { params })
  return data
}

export async function reconcileMobileMoneyC2BEvent(eventId: number, payload: { loanId: number; note?: string }) {
  const { data } = await apiClient.post<{ status: string; loanId: number; repaymentId: number; event: MobileMoneyC2BEvent | null }>(
    `/mobile-money/c2b/events/${eventId}/reconcile`,
    payload,
  )
  return data
}

export async function listMobileMoneyB2CDisbursements(params: { status?: string; limit?: number; loanId?: number; providerRequestId?: string } = {}) {
  const { data } = await apiClient.get<MobileMoneyB2CDisbursement[]>('/mobile-money/b2c/disbursements', { params })
  return data
}

export async function getMobileMoneyB2CSummary(params: { status?: string; loanId?: number } = {}) {
  const { data } = await apiClient.get<MobileMoneyB2CSummary>('/mobile-money/b2c/disbursements/summary', { params })
  return data
}

export async function retryMobileMoneyB2CReversal(disbursementId: number) {
  const { data } = await apiClient.post<MobileMoneyB2CDisbursement>(`/mobile-money/b2c/disbursements/${disbursementId}/retry-reversal`)
  return data
}
