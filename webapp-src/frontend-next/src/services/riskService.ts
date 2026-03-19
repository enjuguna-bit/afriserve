import { apiClient } from './apiClient'
import type {
  CollateralAssetRecord,
  CreateCollateralAssetPayload,
  CreateGuarantorPayload,
  CreateLoanProductPayload,
  GuarantorRecord,
  LoanProductRecord,
  PagedResponse,
  UpdateLoanProductPayload,
} from '../types/risk'

export async function listLoanProducts(params: { includeInactive?: boolean } = {}) {
  const { data } = await apiClient.get<LoanProductRecord[]>('/loan-products', {
    params: {
      includeInactive: params.includeInactive ? 'true' : undefined,
    },
  })
  return data
}

export async function createLoanProduct(payload: CreateLoanProductPayload) {
  const { data } = await apiClient.post<LoanProductRecord>('/loan-products', payload)
  return data
}

export async function updateLoanProduct(productId: number, payload: UpdateLoanProductPayload) {
  const { data } = await apiClient.patch<LoanProductRecord>(`/loan-products/${productId}`, payload)
  return data
}

export async function deactivateLoanProduct(productId: number) {
  const { data } = await apiClient.post<LoanProductRecord>(`/loan-products/${productId}/deactivate`)
  return data
}

export async function activateLoanProduct(productId: number) {
  const { data } = await apiClient.post<LoanProductRecord>(`/loan-products/${productId}/activate`)
  return data
}

export async function listGuarantors(params: Record<string, unknown> = {}): Promise<PagedResponse<GuarantorRecord>> {
  const normalizedParams = { limit: 50, offset: 0, ...params }
  const { data } = await apiClient.get<PagedResponse<GuarantorRecord>>('/guarantors', { params: normalizedParams })
  return data
}

export async function createGuarantor(payload: CreateGuarantorPayload) {
  const { data } = await apiClient.post<GuarantorRecord>('/guarantors', payload)
  return data
}

export async function listCollateralAssets(params: Record<string, unknown> = {}): Promise<PagedResponse<CollateralAssetRecord>> {
  const normalizedParams = { limit: 50, offset: 0, ...params }
  const { data } = await apiClient.get<PagedResponse<CollateralAssetRecord>>('/collateral-assets', { params: normalizedParams })
  return data
}

export async function createCollateralAsset(payload: CreateCollateralAssetPayload) {
  const { data } = await apiClient.post<CollateralAssetRecord>('/collateral-assets', payload)
  return data
}

