import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createClientCollateral,
  createClientGuarantor,
  createClient,
  getClientById,
  getClientHistory,
  getClientOnboardingStatus,
  getPotentialDuplicates,
  listAssignableOfficers,
  listClientCollaterals,
  listClientGuarantors,
  listClients,
  reallocatePortfolio,
  recordClientFeePayment,
  updateClient,
  updateClientKyc,
  uploadClientDocument,
} from '../../../services/clientService'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'
import type {
  AssignableOfficer,
  ClientDetail,
  ClientKycUpdatePayload,
  ClientRecord,
  CreateClientCollateralPayload,
  CreateClientPayload,
  CreateClientGuarantorPayload,
  ListClientsQuery,
  PagedResponse,
  PotentialDuplicateQuery,
  PortfolioReallocationPayload,
  RecordClientFeePayload,
  UpdateClientPayload,
} from '../../../types/client'

function isClientListResponse(value: unknown): value is PagedResponse<ClientRecord> {
  return Boolean(
    value
    && typeof value === 'object'
    && 'data' in value
    && Array.isArray((value as { data?: unknown }).data),
  )
}

function isClientDetail(value: unknown): value is ClientDetail {
  return Boolean(
    value
    && typeof value === 'object'
    && 'id' in value
    && 'loans' in value
    && Array.isArray((value as { loans?: unknown }).loans),
  )
}

export function useClients(query: ListClientsQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.clients.list(query),
    queryFn: () => listClients(query),
    enabled,
    placeholderData: keepPreviousData,
    ...queryPolicies.list,
  })
}

export function useAssignableOfficers(enabled = true) {
  return useQuery<AssignableOfficer[]>({
    queryKey: queryKeys.clients.assignableOfficers(),
    queryFn: listAssignableOfficers,
    enabled,
    ...queryPolicies.list,
  })
}

export function useClient(clientId: number) {
  return useQuery({
    queryKey: queryKeys.clients.detail(clientId),
    queryFn: () => getClientById(clientId),
    enabled: Number.isInteger(clientId) && clientId > 0,
    ...queryPolicies.detail,
  })
}

export function useClientHistory(clientId: number) {
  return useQuery({
    queryKey: queryKeys.clients.history(clientId),
    queryFn: () => getClientHistory(clientId),
    enabled: Number.isInteger(clientId) && clientId > 0,
    ...queryPolicies.detail,
  })
}

export function useClientOnboardingStatus(clientId: number) {
  return useQuery({
    queryKey: queryKeys.clients.onboardingStatus(clientId),
    queryFn: () => getClientOnboardingStatus(clientId),
    enabled: Number.isInteger(clientId) && clientId > 0,
    ...queryPolicies.detail,
  })
}

export function useClientGuarantors(clientId: number) {
  return useQuery({
    queryKey: queryKeys.clients.guarantors(clientId),
    queryFn: () => listClientGuarantors(clientId),
    enabled: Number.isInteger(clientId) && clientId > 0,
    ...queryPolicies.detail,
  })
}

export function useClientCollaterals(clientId: number) {
  return useQuery({
    queryKey: queryKeys.clients.collaterals(clientId),
    queryFn: () => listClientCollaterals(clientId),
    enabled: Number.isInteger(clientId) && clientId > 0,
    ...queryPolicies.detail,
  })
}

export function usePotentialDuplicateClients(query: PotentialDuplicateQuery) {
  return useQuery({
    queryKey: [...queryKeys.clients.duplicates(), query],
    queryFn: () => getPotentialDuplicates(query),
    enabled: Boolean(query.nationalId || query.phone || query.name),
    ...queryPolicies.list,
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateClientPayload) => createClient(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.clients.lists() })

      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.clients.lists() })
      const temporaryId = -Date.now()

      queryClient.setQueriesData({ queryKey: queryKeys.clients.lists() }, (existing) => {
        if (!isClientListResponse(existing)) {
          return existing
        }

        const optimisticClient = {
          id: temporaryId,
          full_name: payload.fullName,
          phone: payload.phone ?? null,
          national_id: payload.nationalId ?? null,
          kra_pin: payload.kraPin ?? null,
          photo_url: null,
          id_document_url: null,
          next_of_kin_name: payload.nextOfKinName ?? null,
          next_of_kin_phone: payload.nextOfKinPhone ?? null,
          next_of_kin_relation: payload.nextOfKinRelation ?? null,
          business_type: payload.businessType ?? null,
          business_years: payload.businessYears ?? null,
          business_location: payload.businessLocation ?? null,
          residential_address: payload.residentialAddress ?? null,
          is_active: 1,
          branch_id: payload.branchId ?? null,
          officer_id: payload.officerId ?? null,
          created_by_user_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          loan_count: 0,
        }

        return {
          ...existing,
          data: [optimisticClient, ...existing.data],
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
    onSuccess: (createdClient, _payload, context) => {
      if (!context) {
        return
      }

      queryClient.setQueriesData({ queryKey: queryKeys.clients.lists() }, (existing) => {
        if (!isClientListResponse(existing)) {
          return existing
        }

        return {
          ...existing,
          data: existing.data.map((client) => (client.id === context.temporaryId ? createdClient : client)),
        }
      })
      queryClient.setQueryData(queryKeys.clients.detail(createdClient.id), {
        ...createdClient,
        loans: [],
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(createdClient.id), exact: true })
    },
    onSettled: (_data, _error, _payload, context) => {
      if (context?.temporaryId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(context.temporaryId), exact: true })
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists(), refetchType: 'active' })
    },
  })
}

export function useUpdateClient(clientId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateClientPayload) => updateClient(clientId, payload),
    onMutate: async (payload) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.clients.detail(clientId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.clients.lists() }),
      ])

      const previousDetail = queryClient.getQueryData(queryKeys.clients.detail(clientId))
      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.clients.lists() })

      queryClient.setQueryData(queryKeys.clients.detail(clientId), (existing) => {
        if (!isClientDetail(existing)) {
          return existing
        }

        return {
          ...existing,
          ...(payload.fullName !== undefined ? { full_name: payload.fullName } : {}),
          ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
          ...(payload.nationalId !== undefined ? { national_id: payload.nationalId } : {}),
          ...(payload.kraPin !== undefined ? { kra_pin: payload.kraPin } : {}),
          ...(payload.nextOfKinName !== undefined ? { next_of_kin_name: payload.nextOfKinName } : {}),
          ...(payload.nextOfKinPhone !== undefined ? { next_of_kin_phone: payload.nextOfKinPhone } : {}),
          ...(payload.nextOfKinRelation !== undefined ? { next_of_kin_relation: payload.nextOfKinRelation } : {}),
          ...(payload.businessType !== undefined ? { business_type: payload.businessType } : {}),
          ...(payload.businessYears !== undefined ? { business_years: payload.businessYears } : {}),
          ...(payload.businessLocation !== undefined ? { business_location: payload.businessLocation } : {}),
          ...(payload.residentialAddress !== undefined ? { residential_address: payload.residentialAddress } : {}),
          ...(payload.photoUrl !== undefined ? { photo_url: payload.photoUrl } : {}),
          ...(payload.idDocumentUrl !== undefined ? { id_document_url: payload.idDocumentUrl } : {}),
          ...(payload.latitude !== undefined ? { latitude: payload.latitude } : {}),
          ...(payload.longitude !== undefined ? { longitude: payload.longitude } : {}),
          ...(payload.locationAccuracyMeters !== undefined ? { location_accuracy_meters: payload.locationAccuracyMeters } : {}),
          ...(payload.locationCapturedAt !== undefined ? { location_captured_at: payload.locationCapturedAt } : {}),
          ...(payload.officerId !== undefined ? { officer_id: payload.officerId } : {}),
          ...(payload.isActive !== undefined ? { is_active: payload.isActive ? 1 : 0 } : {}),
          updated_at: new Date().toISOString(),
        }
      })

      queryClient.setQueriesData({ queryKey: queryKeys.clients.lists() }, (existing) => {
        if (!isClientListResponse(existing)) {
          return existing
        }

        return {
          ...existing,
          data: existing.data.map((client) => {
            if (client.id !== clientId) {
              return client
            }

            return {
              ...client,
              ...(payload.fullName !== undefined ? { full_name: payload.fullName } : {}),
              ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
              ...(payload.nationalId !== undefined ? { national_id: payload.nationalId } : {}),
              ...(payload.photoUrl !== undefined ? { photo_url: payload.photoUrl } : {}),
              ...(payload.idDocumentUrl !== undefined ? { id_document_url: payload.idDocumentUrl } : {}),
              ...(payload.latitude !== undefined ? { latitude: payload.latitude } : {}),
              ...(payload.longitude !== undefined ? { longitude: payload.longitude } : {}),
              ...(payload.isActive !== undefined ? { is_active: payload.isActive ? 1 : 0 } : {}),
            }
          }),
        }
      })

      return { previousDetail, previousLists }
    },
    onError: (_error, _payload, context) => {
      if (!context) {
        return
      }

      queryClient.setQueryData(queryKeys.clients.detail(clientId), context.previousDetail)
      context.previousLists.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
    },
    onSuccess: (response) => {
      queryClient.setQueryData(queryKeys.clients.detail(clientId), (existing) => {
        if (!isClientDetail(existing)) {
          return existing
        }

        return {
          ...existing,
          ...response.client,
          loans: 'loans' in existing && Array.isArray(existing.loans) ? existing.loans : [],
        }
      })

      queryClient.setQueriesData({ queryKey: queryKeys.clients.lists() }, (existing) => {
        if (!isClientListResponse(existing)) {
          return existing
        }

        return {
          ...existing,
          data: existing.data.map((client) => (client.id === clientId ? { ...client, ...response.client } : client)),
        }
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists(), refetchType: 'active' })
    },
  })
}

export function useReassignClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ clientId, officerId }: { clientId: number; officerId: number | null }) => updateClient(clientId, { officerId }),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(variables.clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists(), refetchType: 'active' })
    },
  })
}

export function useReallocatePortfolio() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: PortfolioReallocationPayload) => reallocatePortfolio(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.assignableOfficers(), refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists(), refetchType: 'active' })
    },
  })
}

export function useUpdateClientKyc(clientId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ClientKycUpdatePayload) => updateClientKyc(clientId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.history(clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.onboardingStatus(clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists(), refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.duplicates(), refetchType: 'active' })
    },
  })
}

export function useUploadClientDocument(clientId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      file,
      documentType,
    }: {
      file: File
      documentType?: 'photo' | 'id_document' | 'guarantor_id_document' | 'collateral_document'
    }) => (
      uploadClientDocument(clientId, file, documentType)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.history(clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.onboardingStatus(clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.guarantors(clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.collaterals(clientId), exact: true, refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists(), refetchType: 'active' })
    },
  })
}

function invalidateClientWorkflowQueries(queryClient: ReturnType<typeof useQueryClient>, clientId: number) {
  queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.clients.history(clientId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.clients.onboardingStatus(clientId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.clients.guarantors(clientId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.clients.collaterals(clientId), exact: true, refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists(), refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists(), refetchType: 'active' })
  queryClient.invalidateQueries({ queryKey: queryKeys.loans.pendingApprovalLists(), refetchType: 'active' })
}

export function useCreateClientGuarantor(clientId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateClientGuarantorPayload) => createClientGuarantor(clientId, payload),
    onSuccess: () => {
      invalidateClientWorkflowQueries(queryClient, clientId)
    },
  })
}

export function useCreateClientCollateral(clientId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateClientCollateralPayload) => createClientCollateral(clientId, payload),
    onSuccess: () => {
      invalidateClientWorkflowQueries(queryClient, clientId)
    },
  })
}

export function useRecordClientFeePayment(clientId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RecordClientFeePayload) => recordClientFeePayment(clientId, payload),
    onSuccess: () => {
      invalidateClientWorkflowQueries(queryClient, clientId)
    },
  })
}
