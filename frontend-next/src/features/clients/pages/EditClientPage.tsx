import axios from 'axios'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClientForm } from './shared/ClientForm'
import { useClient, useUpdateClient } from '../hooks/useClients'
import type { UpdateClientPayload } from '../../../types/client'
import { AsyncState } from '../../../components/common/AsyncState'
import { useToastStore } from '../../../store/toastStore'

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof axios.AxiosError) {
    const payload = error.response?.data as {
      message?: unknown
      requestId?: unknown
      issues?: Array<{ path?: unknown[]; message?: unknown }>
      debugDetails?: { cause?: unknown }
    } | undefined
    const message = String(payload?.message || '').trim()
    const issues = Array.isArray(payload?.issues)
      ? payload.issues
        .map((issue) => {
          const path = Array.isArray(issue?.path) ? issue.path.join('.') : ''
          const issueMessage = String(issue?.message || '').trim()
          return path ? `${path}: ${issueMessage}` : issueMessage
        })
        .filter(Boolean)
        .join('; ')
      : ''
    const cause = String(payload?.debugDetails?.cause || '').trim()
    const requestId = String(payload?.requestId || '').trim()
    const parts = [message || fallback]

    if (issues) {
      parts.push(issues)
    }
    if (cause) {
      parts.push(`Cause: ${cause}`)
    }
    if (requestId) {
      parts.push(`Request ID: ${requestId}`)
    }

    const combined = parts.filter(Boolean).join(' | ').trim()
    if (combined) {
      return combined
    }
  }

  return fallback
}

export function EditClientPage() {
  const { id } = useParams()
  const clientId = Number(id)
  const navigate = useNavigate()

  const clientQuery = useClient(clientId)
  const updateMutation = useUpdateClient(clientId)
  const pushToast = useToastStore((state) => state.pushToast)

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return <AsyncState error errorText="Invalid client ID." />
  }

  if (clientQuery.isLoading) {
    return <AsyncState loading loadingText="Loading client..." />
  }

  if (clientQuery.isError || !clientQuery.data) {
    return (
      <AsyncState
        error
        errorText="Unable to load client."
        onRetry={() => {
          void clientQuery.refetch()
        }}
      />
    )
  }

  const client = clientQuery.data

  const normalizeNullable = (value?: string) => {
    const trimmed = (value || '').trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return (
    <div>
      <h1>Edit Client</h1>
      <p>
        <Link to={`/clients/${client.id}`}>Back to details</Link>
      </p>
      <ClientForm
        mode="edit"
        initialValues={{
          fullName: client.full_name,
          phone: client.phone || '',
          nationalId: client.national_id || '',
          kraPin: client.kra_pin || '',
          nextOfKinName: client.next_of_kin_name || '',
          nextOfKinPhone: client.next_of_kin_phone || '',
          nextOfKinRelation: client.next_of_kin_relation || '',
          businessType: client.business_type || '',
          businessYears: client.business_years ?? undefined,
          businessLocation: client.business_location || '',
          residentialAddress: client.residential_address || '',
          isActive: client.is_active === 1,
          piiOverrideReason: '',
        }}
        isSubmitting={updateMutation.isPending}
        apiError={updateMutation.isError ? getApiErrorMessage(updateMutation.error, 'Unable to update client.') : null}
        onSubmit={(payload) => {
          const normalizedPhone = normalizeNullable(payload.phone)
          const normalizedNationalId = normalizeNullable(payload.nationalId)
          const piiOverrideReason = normalizeNullable(payload.piiOverrideReason)
          const piiChanged = normalizedPhone !== normalizeNullable(client.phone || '')
            || normalizedNationalId !== normalizeNullable(client.national_id || '')

          if (piiChanged && !piiOverrideReason) {
            pushToast({
              type: 'error',
              message: 'Enter an admin correction reason before changing the phone number or National ID.',
            })
            return
          }

          const updatePayload: UpdateClientPayload = {
            fullName: payload.fullName.trim(),
            phone: normalizedPhone,
            nationalId: normalizedNationalId,
            kraPin: normalizeNullable(payload.kraPin),
            nextOfKinName: normalizeNullable(payload.nextOfKinName),
            nextOfKinPhone: normalizeNullable(payload.nextOfKinPhone),
            nextOfKinRelation: normalizeNullable(payload.nextOfKinRelation),
            businessType: normalizeNullable(payload.businessType),
            businessYears: payload.businessYears ?? null,
            businessLocation: normalizeNullable(payload.businessLocation),
            residentialAddress: normalizeNullable(payload.residentialAddress),
            isActive: payload.isActive,
            ...(piiOverrideReason ? { piiOverrideReason } : {}),
          }

          updateMutation.mutate(updatePayload, {
            onSuccess: () => {
              pushToast({ type: 'success', message: 'Client updated successfully.' })
              navigate(`/clients/${client.id}`)
            },
            onError: (error) => {
              pushToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to update client.') })
            },
          })
        }}
      />
    </div>
  )
}
