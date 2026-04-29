import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addLoanGuarantor,
  addLoanCollateral,
  approveLoan,
  createLoan,
  createRepayment,
  disburseLoan,
  extendLoanTerm,
  getLoanById,
  getLoanCollateral,
  getLoanContracts,
  getLoanDisbursements,
  getLoanGuarantors,
  getLoanLifecycleEvents,
  getLoanSchedule,
  getLoanStatement,
  listApprovalRequests,
  listLoans,
  listPendingApprovalLoans,
  releaseLoanCollateral,
  removeLoanCollateral,
  removeLoanGuarantor,
  refinanceLoan,
  rejectLoan,
  reviewApprovalRequest,
  restructureLoan,
  topUpLoan,
  writeLoanOff,
} from '../../../services/loanService'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'
import type {
  CreateLoanGuarantorPayload,
  CreateLoanPayload,
  LoanContractHistory,
  LoanDisbursementHistory,
  LoanDisbursementPayload,
  LoanLifecycleEventResponse,
  LoanPagedResponse,
  LoanRefinancePayload,
  LoanRepaymentPayload,
  LoanStatement,
  LoanTermExtensionPayload,
  LoanTopUpPayload,
} from '../../../types/loan'

function isLoanListResponse(value: unknown): value is LoanPagedResponse {
  return Boolean(
    value
    && typeof value === 'object'
    && 'data' in value
    && Array.isArray((value as { data?: unknown }).data),
  )
}

function isLoanStatement(value: unknown): value is LoanStatement {
  return Boolean(
    value
    && typeof value === 'object'
    && 'loan' in value
    && 'summary' in value
    && 'repayments' in value
    && Array.isArray((value as { repayments?: unknown }).repayments),
  )
}

export function useLoans(params: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.loans.list(params),
    queryFn: () => listLoans(params),
    placeholderData: keepPreviousData,
    ...queryPolicies.list,
  })
}

export function useLoanStatement(loanId: number) {
  return useQuery({
    queryKey: queryKeys.loans.statement(loanId),
    queryFn: () => getLoanStatement(loanId),
    enabled: Number.isInteger(loanId) && loanId > 0,
    ...queryPolicies.detail,
  })
}

export function useLoan(loanId: number) {
  return useQuery({
    queryKey: queryKeys.loans.detail(loanId),
    queryFn: () => getLoanById(loanId),
    enabled: Number.isInteger(loanId) && loanId > 0,
    ...queryPolicies.detail,
  })
}

export function useLoanSchedule(loanId: number) {
  return useQuery({
    queryKey: queryKeys.loans.schedule(loanId),
    queryFn: () => getLoanSchedule(loanId),
    enabled: Number.isInteger(loanId) && loanId > 0,
    ...queryPolicies.detail,
  })
}

export function useLoanCollateral(loanId: number) {
  return useQuery({
    queryKey: queryKeys.loans.collateral(loanId),
    queryFn: () => getLoanCollateral(loanId),
    enabled: Number.isInteger(loanId) && loanId > 0,
    ...queryPolicies.detail,
  })
}

export function useLoanGuarantors(loanId: number) {
  return useQuery({
    queryKey: queryKeys.loans.guarantors(loanId),
    queryFn: () => getLoanGuarantors(loanId),
    enabled: Number.isInteger(loanId) && loanId > 0,
    ...queryPolicies.detail,
  })
}

export function useLoanDisbursements(loanId: number) {
  return useQuery({
    queryKey: queryKeys.loans.disbursements(loanId),
    queryFn: (): Promise<LoanDisbursementHistory> => getLoanDisbursements(loanId),
    enabled: Number.isInteger(loanId) && loanId > 0,
    ...queryPolicies.detail,
  })
}

export function useLoanContracts(loanId: number) {
  return useQuery({
    queryKey: queryKeys.loans.contracts(loanId),
    queryFn: (): Promise<LoanContractHistory> => getLoanContracts(loanId),
    enabled: Number.isInteger(loanId) && loanId > 0,
    ...queryPolicies.detail,
  })
}

export function useLoanLifecycleEvents(loanId: number) {
  return useQuery({
    queryKey: queryKeys.loans.lifecycleEvents(loanId),
    queryFn: (): Promise<LoanLifecycleEventResponse> => getLoanLifecycleEvents(loanId),
    enabled: Number.isInteger(loanId) && loanId > 0,
    ...queryPolicies.detail,
  })
}

export function usePendingApprovalLoans(params: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.loans.pendingApprovals(params),
    queryFn: () => listPendingApprovalLoans(params),
    enabled,
    ...queryPolicies.list,
  })
}

export function useApprovalRequests(params: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.loans.approvalRequests(params),
    queryFn: () => listApprovalRequests(params),
    enabled,
    ...queryPolicies.list,
  })
}

export function useReviewApprovalRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (
      payload: { requestId: number; decision: 'approve' | 'reject'; note?: string },
    ) => reviewApprovalRequest(payload.requestId, { decision: payload.decision, note: payload.note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.approvalRequestLists(), refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists(), refetchType: 'active' })
    },
  })
}

export function useCreateLoan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateLoanPayload) => createLoan(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.loans.lists() })
      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.loans.lists() })
      const temporaryId = -Date.now()

      queryClient.setQueriesData({ queryKey: queryKeys.loans.lists() }, (existing) => {
        if (!isLoanListResponse(existing)) {
          return existing
        }

        const optimisticLoan = {
          id: temporaryId,
          client_id: payload.clientId,
          principal: payload.principal,
          expected_total: payload.principal,
          repaid_total: 0,
          balance: payload.principal,
          status: 'pending_approval',
          disbursed_at: null,
        }

        return {
          ...existing,
          data: [optimisticLoan, ...existing.data],
          paging: existing.paging
            ? {
              ...existing.paging,
              total: Number(existing.paging.total ?? 0) + 1,
            }
            : existing.paging,
        }
      })

      return { previousLists, temporaryId }
    },
    onError: (_error, _payload, context) => {
      context?.previousLists.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists(), refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.pendingApprovalLists(), refetchType: 'active' })
    },
  })
}

export function useCreateRepayment(loanId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: LoanRepaymentPayload) => createRepayment(loanId, payload),
    onMutate: async (payload) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.loans.statement(loanId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.loans.lists() }),
      ])

      const previousStatement = queryClient.getQueryData(queryKeys.loans.statement(loanId))
      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.loans.lists() })

      const amount = Number(payload.amount)
      const paidAt = new Date().toISOString()
      const temporaryRepaymentId = -Date.now()

      queryClient.setQueryData(queryKeys.loans.statement(loanId), (existing) => {
        if (!isLoanStatement(existing)) {
          return existing
        }

        const currentBalance = Number(existing.loan.balance ?? 0)
        const currentRepaidTotal = Number(existing.loan.repaid_total ?? 0)
        const appliedAmount = Math.max(0, Math.min(amount, currentBalance))
        const overpaymentAmount = Math.max(0, amount - appliedAmount)

        return {
          ...existing,
          loan: {
            ...existing.loan,
            balance: Math.max(0, currentBalance - appliedAmount),
            repaid_total: currentRepaidTotal + appliedAmount,
          },
          summary: {
            ...existing.summary,
            repayment_count: Number(existing.summary.repayment_count ?? 0) + 1,
            total_repayments: Number(existing.summary.total_repayments ?? 0) + amount,
            total_applied: Number(existing.summary.total_applied ?? 0) + appliedAmount,
            last_repayment_at: paidAt,
          },
          repayments: [
            {
              id: temporaryRepaymentId,
              amount,
              applied_amount: appliedAmount,
              penalty_amount: 0,
              interest_amount: 0,
              principal_amount: 0,
              overpayment_amount: overpaymentAmount,
              paid_at: paidAt,
              note: payload.note ?? null,
              payment_channel: payload.paymentChannel ?? 'manual',
              payment_provider: payload.paymentProvider ?? null,
              external_receipt: payload.externalReceipt ?? null,
              external_reference: payload.externalReference ?? null,
              payer_phone: payload.payerPhone ?? null,
            },
            ...existing.repayments,
          ],
        }
      })

      queryClient.setQueriesData({ queryKey: queryKeys.loans.lists() }, (existing) => {
        if (!isLoanListResponse(existing)) {
          return existing
        }

        return {
          ...existing,
          data: existing.data.map((loan) => {
            if (loan.id !== loanId) {
              return loan
            }

            const currentLoanBalance = Number(loan.balance ?? 0)
            const appliedAmount = Math.max(0, Math.min(amount, currentLoanBalance))
            return {
              ...loan,
              balance: Math.max(0, currentLoanBalance - appliedAmount),
              repaid_total: Number(loan.repaid_total ?? 0) + appliedAmount,
            }
          }),
        }
      })

      return { previousStatement, previousLists }
    },
    onError: (_error, _payload, context) => {
      if (!context) {
        return
      }

      queryClient.setQueryData(queryKeys.loans.statement(loanId), context.previousStatement)
      context.previousLists.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.statement(loanId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists(), refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.detail(loanId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.schedule(loanId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.pendingApprovalLists(), refetchType: 'active' })
    },
  })
}

function invalidateLoanWorkflowQueries(queryClient: ReturnType<typeof useQueryClient>, loanId: number) {
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.detail(loanId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.statement(loanId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.schedule(loanId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.collateral(loanId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.guarantors(loanId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.disbursements(loanId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.contracts(loanId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.lifecycleEvents(loanId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists(), refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.pendingApprovalLists(), refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.approvalRequestLists(), refetchType: 'active' })
}

function useLoanLifecycleMutation<TPayload extends Record<string, unknown>>(
  mutationFn: (loanId: number, payload: TPayload) => Promise<unknown>,
  loanId: number,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: TPayload) => mutationFn(loanId, payload),
    onSuccess: () => {
      invalidateLoanWorkflowQueries(queryClient, loanId)
    },
  })
}

export function useApproveLoan(loanId: number) {
  return useLoanLifecycleMutation(approveLoan, loanId)
}

export function useRejectLoan(loanId: number) {
  return useLoanLifecycleMutation(rejectLoan, loanId)
}

export function useDisburseLoan(loanId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: LoanDisbursementPayload = {}) => disburseLoan(loanId, payload),
    onSuccess: () => {
      invalidateLoanWorkflowQueries(queryClient, loanId)
    },
  })
}

export function useWriteLoanOff(loanId: number) {
  return useLoanLifecycleMutation(writeLoanOff, loanId)
}

export function useRestructureLoan(loanId: number) {
  return useLoanLifecycleMutation(restructureLoan, loanId)
}

export function useTopUpLoan(loanId: number) {
  return useLoanLifecycleMutation<LoanTopUpPayload>(topUpLoan, loanId)
}

export function useRefinanceLoan(loanId: number) {
  return useLoanLifecycleMutation<LoanRefinancePayload>(refinanceLoan, loanId)
}

export function useExtendLoanTerm(loanId: number) {
  return useLoanLifecycleMutation<LoanTermExtensionPayload>(extendLoanTerm, loanId)
}

export function useAddLoanCollateral(loanId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => addLoanCollateral(loanId, payload),
    onSuccess: () => {
      invalidateLoanWorkflowQueries(queryClient, loanId)
    },
  })
}

export function useAddLoanGuarantor(loanId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateLoanGuarantorPayload) => addLoanGuarantor(loanId, payload),
    onSuccess: () => {
      invalidateLoanWorkflowQueries(queryClient, loanId)
    },
  })
}

export function useRemoveLoanGuarantor(loanId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (loanGuarantorId: number) => removeLoanGuarantor(loanId, loanGuarantorId),
    onSuccess: () => {
      invalidateLoanWorkflowQueries(queryClient, loanId)
    },
  })
}

export function useRemoveLoanCollateral(loanId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (loanCollateralId: number) => removeLoanCollateral(loanId, loanCollateralId),
    onSuccess: () => {
      invalidateLoanWorkflowQueries(queryClient, loanId)
    },
  })
}

export function useReleaseLoanCollateral(loanId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (loanCollateralId: number) => releaseLoanCollateral(loanId, loanCollateralId),
    onSuccess: () => {
      invalidateLoanWorkflowQueries(queryClient, loanId)
    },
  })
}

export function useApproveLoanAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ loanId, ...payload }: { loanId: number; notes?: string }) => approveLoan(loanId, payload),
    onSuccess: (_response, variables) => {
      invalidateLoanWorkflowQueries(queryClient, variables.loanId)
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.pendingApprovalLists(), refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists(), refetchType: 'active' })
    },
  })
}

export function useRejectLoanAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ loanId, ...payload }: { loanId: number; reason: string }) => rejectLoan(loanId, payload),
    onSuccess: (_response, variables) => {
      invalidateLoanWorkflowQueries(queryClient, variables.loanId)
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.pendingApprovalLists(), refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists(), refetchType: 'active' })
    },
  })
}

// useLoanDetailFromList removed — use useLoan() directly (identical implementation)
