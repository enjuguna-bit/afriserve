import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { hasAnyRole } from '../../../app/roleAccess'
import { AsyncState } from '../../../components/common/AsyncState'
import { listUsers } from '../../../services/adminService'
import { listClients, updateClient } from '../../../services/clientService'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'
import { useAuthStore } from '../../../store/authStore'
import { useToastStore } from '../../../store/toastStore'
import type { AssignableOfficer, PortfolioReallocationPayload } from '../../../types/client'
import { useAssignableOfficers, useReallocatePortfolio } from '../hooks/useClients'
import styles from './ClientReallocationPage.module.css'

function formatOfficerLabel(officer: { full_name: string; branch_name?: string | null }) {
  return officer.branch_name ? `${officer.full_name} | ${officer.branch_name}` : officer.full_name
}

function extractErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data && typeof error.response.data === 'object' && 'message' in error.response.data
      ? String((error.response.data as { message?: unknown }).message || '').trim()
      : ''
    return responseMessage || error.message || 'Request failed.'
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Request failed.'
}

function extractErrorStatus(error: unknown) {
  return axios.isAxiosError(error) ? Number(error.response?.status || 0) : 0
}

async function loadAdminFallbackOfficers(): Promise<AssignableOfficer[]> {
  const response = await listUsers({
    limit: 500,
    offset: 0,
    sortBy: 'fullName',
    sortOrder: 'asc',
  })

  return (response.data || [])
    .filter((user) => String(user.role || '').trim().toLowerCase() === 'loan_officer' && Number(user.is_active || 0) === 1)
    .map((user) => ({
      id: Number(user.id),
      full_name: String(user.full_name || '').trim(),
      branch_id: user.branch_id == null ? null : Number(user.branch_id),
      branch_name: user.branch_name || null,
      region_name: user.region_name || null,
    }))
    .filter((officer) => officer.id > 0 && officer.full_name)
}

async function reallocatePortfolioCompat(payload: PortfolioReallocationPayload) {
  const clients = [] as Array<{ id: number }>
  const limit = 200
  let offset = 0

  for (;;) {
    const response = await listClients({
      officerId: payload.fromOfficerId,
      limit,
      offset,
      sortBy: 'id',
      sortOrder: 'asc',
    })
    const page = Array.isArray(response.data) ? response.data : []
    clients.push(...page.map((client) => ({ id: Number(client.id) })).filter((client) => client.id > 0))
    if (page.length < limit) {
      break
    }
    offset += limit
  }

  for (const client of clients) {
    await updateClient(client.id, { officerId: payload.toOfficerId })
  }

  return {
    movedClients: clients.length,
    message: `Portfolio reallocated successfully. ${clients.length} borrower${clients.length === 1 ? '' : 's'} moved in compatibility mode.`,
  }
}

export function ClientReallocationPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const pushToast = useToastStore((state) => state.pushToast)
  const [fromOfficerId, setFromOfficerId] = useState('')
  const [toOfficerId, setToOfficerId] = useState('')
  const [note, setNote] = useState('')
  const officersQuery = useAssignableOfficers()
  const reallocationMutation = useReallocatePortfolio()
  const isAdminUser = hasAnyRole(user, ['admin'])
  const fallbackOfficersQuery = useQuery({
    queryKey: [...queryKeys.clients.assignableOfficers(), 'admin-fallback'],
    queryFn: loadAdminFallbackOfficers,
    enabled: isAdminUser && officersQuery.isError,
    ...queryPolicies.list,
  })
  const compatibilityMutation = useMutation({
    mutationFn: reallocatePortfolioCompat,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.assignableOfficers(), refetchType: 'active' })
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists(), refetchType: 'active' })
    },
  })

  const isUsingCompatibilityMode = officersQuery.isError && fallbackOfficersQuery.isSuccess
  const workspaceLoading = officersQuery.isLoading || (isAdminUser && officersQuery.isError && fallbackOfficersQuery.isLoading)
  const workspaceError = officersQuery.isError && !isUsingCompatibilityMode && !fallbackOfficersQuery.isLoading
  const workspaceErrorDetail = workspaceError
    ? extractErrorMessage(fallbackOfficersQuery.error || officersQuery.error)
    : undefined

  const officers = useMemo(
    () => officersQuery.data || fallbackOfficersQuery.data || [],
    [fallbackOfficersQuery.data, officersQuery.data],
  )
  const selectedSourceOfficer = useMemo(
    () => officers.find((officer) => String(officer.id) === fromOfficerId),
    [fromOfficerId, officers],
  )
  const selectableTargetOfficers = useMemo(
    () => officers.filter((officer) => String(officer.id) !== fromOfficerId),
    [fromOfficerId, officers],
  )

  async function handleSave() {
    const payload: PortfolioReallocationPayload = {
      fromOfficerId: Number(fromOfficerId),
      toOfficerId: Number(toOfficerId),
      note: note.trim() || undefined,
    }

    try {
      const result = isUsingCompatibilityMode
        ? await compatibilityMutation.mutateAsync(payload)
        : await reallocationMutation.mutateAsync(payload)

      pushToast({ type: 'success', message: String(result?.message || 'Portfolio reallocated successfully.') })
      setNote('')
      setFromOfficerId('')
      setToOfficerId('')
      return
    } catch (error) {
      const status = extractErrorStatus(error)
      const shouldFallbackToCompatibility = isAdminUser && !isUsingCompatibilityMode && [404, 405, 500, 501, 503].includes(status)

      if (shouldFallbackToCompatibility) {
        try {
          const result = await compatibilityMutation.mutateAsync(payload)
          pushToast({ type: 'success', message: String(result?.message || 'Portfolio reallocated successfully.') })
          setNote('')
          setFromOfficerId('')
          setToOfficerId('')
          return
        } catch (fallbackError) {
          pushToast({ type: 'error', message: extractErrorMessage(fallbackError) })
          return
        }
      }

      pushToast({ type: 'error', message: extractErrorMessage(error) })
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <h1>Portfolio Reallocation</h1>
        </div>
      </section>

      <AsyncState
        loading={workspaceLoading}
        error={workspaceError}
        empty={Boolean(!workspaceLoading && !workspaceError && officers.length === 0)}
        loadingText="Loading portfolio reallocation workspace..."
        errorText="Unable to load portfolio reallocation workspace."
        errorDetail={workspaceErrorDetail}
        emptyText="No active agents are available for portfolio reallocation."
        onRetry={() => {
          void officersQuery.refetch()
          if (isAdminUser) {
            void fallbackOfficersQuery.refetch()
          }
        }}
      />

      {officers.length > 0 ? (
        <section className={styles.formCard}>
          {isUsingCompatibilityMode ? (
            <div className={styles.notice}>
              Compatibility mode is active. The dedicated portfolio service is unavailable, so this page is using the existing user and client assignment APIs.
            </div>
          ) : null}

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Select the agent whose portfolio you want to reallocate.</span>
              <select className={styles.select} value={fromOfficerId} onChange={(event) => setFromOfficerId(event.target.value)}>
                <option value="">---please select an agent---</option>
                {officers.map((officer) => (
                  <option key={officer.id} value={String(officer.id)}>
                    {formatOfficerLabel(officer)}
                  </option>
                ))}
              </select>
              {selectedSourceOfficer && Number.isFinite(selectedSourceOfficer.assigned_portfolio_count)
                ? <small className={styles.helperText}>{selectedSourceOfficer.assigned_portfolio_count} borrowers currently assigned.</small>
                : null}
            </label>

            <label className={styles.field}>
              <span>Select agent to be assigned the portfolio.</span>
              <select className={styles.select} value={toOfficerId} onChange={(event) => setToOfficerId(event.target.value)}>
                <option value="">---please select an agent---</option>
                {selectableTargetOfficers.map((officer) => (
                  <option key={officer.id} value={String(officer.id)}>
                    {formatOfficerLabel(officer)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.noteRow}>
            <label className={styles.noteField}>
              <span>Add a note for portfolio reallocation and save.</span>
              <input className={styles.input} type="text" value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <button
              type="button"
              className={styles.saveButton}
              disabled={reallocationMutation.isPending || compatibilityMutation.isPending || !fromOfficerId || !toOfficerId}
              onClick={() => {
                void handleSave()
              }}
            >
              {reallocationMutation.isPending || compatibilityMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
