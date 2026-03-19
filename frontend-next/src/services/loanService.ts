import { apiClient } from './apiClient'
import type {
  CreateLoanGuarantorPayload,
  CreateLoanPayload,
  LoanContractHistory,
  LoanDisbursementPayload,
  LoanDisbursementHistory,
  LoanGuarantorRecord,
  LoanLifecycleEventResponse,
  LoanPagedResponse,
  LoanRefinancePayload,
  LoanRepaymentPayload,
  LoanStatement,
  LoanTermExtensionPayload,
  LoanTopUpPayload,
  PendingApprovalLoanResponse,
} from '../types/loan'

export async function listLoans(params: Record<string, unknown> = {}): Promise<LoanPagedResponse> {
  const normalizedParams = { limit: 50, offset: 0, ...params }
  const { data } = await apiClient.get<LoanPagedResponse>('/loans', { params: normalizedParams })
  return data
}

export async function createLoan(payload: CreateLoanPayload) {
  const { data } = await apiClient.post('/loans', payload)
  return data
}

export async function getLoanStatement(loanId: number): Promise<LoanStatement> {
  const { data } = await apiClient.get<LoanStatement>(`/loans/${loanId}/statement`)
  return data
}

export async function createRepayment(loanId: number, payload: LoanRepaymentPayload) {
  const { data } = await apiClient.post(`/loans/${loanId}/repayments`, payload)
  return data
}

export async function getLoanById(loanId: number) {
  const { data } = await apiClient.get(`/loans/${loanId}`)
  return data
}

export async function getLoanSchedule(loanId: number) {
  const { data } = await apiClient.get(`/loans/${loanId}/schedule`)
  return data
}

export async function listPendingApprovalLoans(params: Record<string, unknown> = {}): Promise<PendingApprovalLoanResponse> {
  const normalizedParams = { limit: 50, offset: 0, ...params }
  const { data } = await apiClient.get<PendingApprovalLoanResponse>('/loans/pending-approval', { params: normalizedParams })
  return data
}

export async function approveLoan(loanId: number, payload: Record<string, unknown> = {}) {
  const { data } = await apiClient.post(`/loans/${loanId}/approve`, payload)
  return data
}

export async function rejectLoan(loanId: number, payload: Record<string, unknown> = {}) {
  const { data } = await apiClient.post(`/loans/${loanId}/reject`, payload)
  return data
}

export async function disburseLoan(loanId: number, payload: LoanDisbursementPayload = {}) {
  const { data } = await apiClient.post(`/loans/${loanId}/disburse`, payload)
  return data
}

export async function getLoanDisbursements(loanId: number): Promise<LoanDisbursementHistory> {
  const { data } = await apiClient.get<LoanDisbursementHistory>(`/loans/${loanId}/disbursements`)
  return data
}

export async function getLoanContracts(loanId: number): Promise<LoanContractHistory> {
  const { data } = await apiClient.get<LoanContractHistory>(`/loans/${loanId}/contracts`)
  return data
}

export async function getLoanLifecycleEvents(loanId: number): Promise<LoanLifecycleEventResponse> {
  const { data } = await apiClient.get<LoanLifecycleEventResponse>(`/loans/${loanId}/lifecycle-events`)
  return data
}

export async function writeLoanOff(loanId: number, payload: Record<string, unknown> = {}) {
  const { data } = await apiClient.post(`/loans/${loanId}/write-off`, payload)
  return data
}

export async function restructureLoan(loanId: number, payload: Record<string, unknown>) {
  const { data } = await apiClient.post(`/loans/${loanId}/restructure`, payload)
  return data
}

export async function topUpLoan(loanId: number, payload: LoanTopUpPayload) {
  const { data } = await apiClient.post(`/loans/${loanId}/top-up`, payload)
  return data
}

export async function refinanceLoan(loanId: number, payload: LoanRefinancePayload) {
  const { data } = await apiClient.post(`/loans/${loanId}/refinance`, payload)
  return data
}

export async function extendLoanTerm(loanId: number, payload: LoanTermExtensionPayload) {
  const { data } = await apiClient.post(`/loans/${loanId}/extend-term`, payload)
  return data
}

async function getLoanCollateralFromPath(loanId: number, path: string) {
  const { data } = await apiClient.get(path.replace(':id', String(loanId)))
  return data
}

export async function getLoanCollateral(loanId: number) {
  try {
    return await getLoanCollateralFromPath(loanId, '/loans/:id/collateral')
  } catch {
    return getLoanCollateralFromPath(loanId, '/loans/:id/collaterals')
  }
}

async function getLoanGuarantorsFromPath(loanId: number, path: string) {
  const { data } = await apiClient.get<LoanGuarantorRecord[]>(path.replace(':id', String(loanId)))
  return data
}

export async function getLoanGuarantors(loanId: number) {
  try {
    return await getLoanGuarantorsFromPath(loanId, '/loans/:id/guarantors')
  } catch {
    return []
  }
}

async function addLoanCollateralToPath(loanId: number, payload: Record<string, unknown>, path: string) {
  const { data } = await apiClient.post(path.replace(':id', String(loanId)), payload)
  return data
}

export async function addLoanCollateral(loanId: number, payload: Record<string, unknown>) {
  return addLoanCollateralToPath(loanId, payload, '/loans/:id/collaterals')
}

export async function addLoanGuarantor(loanId: number, payload: CreateLoanGuarantorPayload) {
  const { data } = await apiClient.post(`/loans/${loanId}/guarantors`, payload)
  return data
}

export async function removeLoanGuarantor(loanId: number, loanGuarantorId: number) {
  const { data } = await apiClient.delete(`/loans/${loanId}/guarantors/${loanGuarantorId}`)
  return data
}

export async function removeLoanCollateral(loanId: number, loanCollateralId: number) {
  const { data } = await apiClient.delete(`/loans/${loanId}/collaterals/${loanCollateralId}`)
  return data
}

export async function releaseLoanCollateral(loanId: number, loanCollateralId: number) {
  const { data } = await apiClient.post(`/loans/${loanId}/collaterals/${loanCollateralId}/release`)
  return data
}

export async function listApprovalRequests(params: Record<string, unknown> = {}) {
  try {
    const { data } = await apiClient.get('/loans/approval-requests', { params })
    return data
  } catch {
    const { data } = await apiClient.get('/approval-requests', { params })
    return data
  }
}

export async function reviewApprovalRequest(
  requestId: number,
  payload: { decision: 'approve' | 'reject'; note?: string },
) {
  const { data } = await apiClient.post(`/approval-requests/${requestId}/review`, payload)
  return data
}

