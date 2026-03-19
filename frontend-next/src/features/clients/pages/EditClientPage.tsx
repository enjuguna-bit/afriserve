import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClientForm } from './shared/ClientForm'
import { useClient, useUpdateClient } from '../hooks/useClients'
import type { UpdateClientPayload } from '../../../types/client'
import { AsyncState } from '../../../components/common/AsyncState'
import { useToastStore } from '../../../store/toastStore'

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
        }}
        isSubmitting={updateMutation.isPending}
        apiError={updateMutation.isError ? 'Unable to update client.' : null}
        onSubmit={(payload) => {
          const updatePayload: UpdateClientPayload = {
            fullName: payload.fullName.trim(),
            phone: normalizeNullable(payload.phone),
            nationalId: normalizeNullable(payload.nationalId),
            kraPin: normalizeNullable(payload.kraPin),
            nextOfKinName: normalizeNullable(payload.nextOfKinName),
            nextOfKinPhone: normalizeNullable(payload.nextOfKinPhone),
            nextOfKinRelation: normalizeNullable(payload.nextOfKinRelation),
            businessType: normalizeNullable(payload.businessType),
            businessYears: payload.businessYears ?? null,
            businessLocation: normalizeNullable(payload.businessLocation),
            residentialAddress: normalizeNullable(payload.residentialAddress),
            isActive: payload.isActive,
          }

          updateMutation.mutate(updatePayload, {
            onSuccess: () => {
              pushToast({ type: 'success', message: 'Client updated successfully.' })
              navigate(`/clients/${client.id}`)
            },
            onError: () => {
              pushToast({ type: 'error', message: 'Failed to update client.' })
            },
          })
        }}
      />
    </div>
  )
}
