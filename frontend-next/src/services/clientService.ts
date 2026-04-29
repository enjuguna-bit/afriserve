import { apiClient } from './apiClient'
import type {
  AssignableOfficer,
  ClientCollateralRecord,
  ClientHistoryPayload,
  ClientGuarantorRecord,
  ClientOnboardingStatus,
  ClientKycUpdatePayload,
  ClientDetail,
  ClientDuplicateCandidate,
  ClientRecord,
  CreateClientCollateralPayload,
  CreateClientPayload,
  CreateClientGuarantorPayload,
  ListClientsQuery,
  PagedResponse,
  PotentialDuplicateQuery,
  PortfolioReallocationPayload,
  RecordClientFeePayload,
  ReverseGeocodeResult,
  UpdateClientPayload,
} from '../types/client'

type DownloadedClientExport = {
  blob: Blob
  filename: string | null
  contentType: string | null
}

function extractFilename(contentDisposition: unknown): string | null {
  const rawValue = String(contentDisposition || '').trim()
  if (!rawValue) {
    return null
  }

  const utf8Match = rawValue.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const simpleMatch = rawValue.match(/filename="?([^";]+)"?/i)
  return simpleMatch?.[1] ? simpleMatch[1] : null
}

export async function listClients(query: ListClientsQuery = {}): Promise<PagedResponse<ClientRecord>> {
  const normalizedParams = { limit: 50, offset: 0, ...query }
  const { data } = await apiClient.get<PagedResponse<ClientRecord>>('/clients', {
    params: normalizedParams,
  })
  return data
}

export async function downloadClientsCsv(query: ListClientsQuery = {}): Promise<DownloadedClientExport> {
  const normalizedParams = { limit: 200, offset: 0, ...query, format: 'csv' }
  const response = await apiClient.get('/clients', {
    params: normalizedParams,
    responseType: 'blob',
  })

  return {
    blob: response.data as Blob,
    filename: extractFilename(response.headers?.['content-disposition']),
    contentType: String(response.headers?.['content-type'] || '') || null,
  }
}

export async function getClientById(clientId: number): Promise<ClientDetail> {
  const { data } = await apiClient.get<ClientDetail>(`/clients/${clientId}`)
  return data
}

export async function getClientOnboardingStatus(clientId: number): Promise<ClientOnboardingStatus> {
  const { data } = await apiClient.get<ClientOnboardingStatus>(`/clients/${clientId}/onboarding-status`)
  return data
}

export async function listClientGuarantors(clientId: number): Promise<ClientGuarantorRecord[]> {
  const { data } = await apiClient.get<ClientGuarantorRecord[]>(`/clients/${clientId}/guarantors`)
  return data
}

export async function createClientGuarantor(clientId: number, payload: CreateClientGuarantorPayload) {
  const { data } = await apiClient.post<{ guarantor: ClientGuarantorRecord; onboardingStatus: string }>(`/clients/${clientId}/guarantors`, payload)
  return data
}

export async function listClientCollaterals(clientId: number): Promise<ClientCollateralRecord[]> {
  const { data } = await apiClient.get<ClientCollateralRecord[]>(`/clients/${clientId}/collaterals`)
  return data
}

export async function createClientCollateral(clientId: number, payload: CreateClientCollateralPayload) {
  const { data } = await apiClient.post<{ collateral: ClientCollateralRecord; onboardingStatus: string }>(`/clients/${clientId}/collaterals`, payload)
  return data
}

export async function recordClientFeePayment(clientId: number, payload: RecordClientFeePayload) {
  const { data } = await apiClient.post<{ message: string; client: ClientRecord; onboardingStatus: string }>(`/clients/${clientId}/fees`, payload)
  return data
}

export async function createClient(payload: CreateClientPayload): Promise<ClientRecord> {
  const { data } = await apiClient.post<ClientRecord>('/clients', payload)
  return data
}

export async function updateClient(clientId: number, payload: UpdateClientPayload): Promise<{ message: string; client: ClientRecord }> {
  const { data } = await apiClient.patch<{ message: string; client: ClientRecord }>(`/clients/${clientId}`, payload)
  return data
}

export async function updateClientKyc(clientId: number, payload: ClientKycUpdatePayload) {
  const { data } = await apiClient.patch(`/clients/${clientId}/kyc`, payload)
  return data
}

export async function getClientHistory(clientId: number): Promise<ClientHistoryPayload> {
  const { data } = await apiClient.get<ClientHistoryPayload>(`/clients/${clientId}/history`)
  return data
}

export async function getPotentialDuplicates(query: PotentialDuplicateQuery): Promise<{ query: PotentialDuplicateQuery; total: number; duplicates: ClientDuplicateCandidate[] }> {
  const { data } = await apiClient.get<{ query: PotentialDuplicateQuery; total: number; duplicates: ClientDuplicateCandidate[] }>('/clients/potential-duplicates', {
    params: query,
  })
  return data
}

export async function listAssignableOfficers(): Promise<AssignableOfficer[]> {
  const { data } = await apiClient.get<AssignableOfficer[]>('/clients/assignable-officers')
  return data
}

export async function reallocatePortfolio(payload: PortfolioReallocationPayload) {
  const { data } = await apiClient.post('/clients/portfolio-reallocation', payload)
  return data
}

export async function uploadClientDocument(
  clientId: number,
  file: File,
  documentType: 'photo' | 'id_document' | 'guarantor_id_document' | 'collateral_document' = 'id_document',
) {
  const form = new FormData()
  form.append('clientId', String(clientId))
  form.append('documentType', documentType)
  form.append('file', file)

  const { data } = await apiClient.post('/uploads/client-document', form, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return data
}

export async function reverseGeocodeCoordinates(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  const { data } = await apiClient.get<ReverseGeocodeResult>('/location/reverse-geocode', {
    params: { latitude, longitude },
  })
  return data
}

