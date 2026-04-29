import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import { changePassword, getCurrentUser } from '../../../services/authService'
import { queryPolicies } from '../../../services/queryPolicies'
import { listAuditTrail } from '../../../services/systemService'
import { useToastStore } from '../../../store/toastStore'
import { formatDisplayDateTime } from '../../../utils/dateFormatting'
import { formatDisplayDetails, formatDisplayReference, formatDisplayText } from '../../../utils/displayFormatting'
import styles from '../../shared/styles/EntityPage.module.css'

type PasswordFormState = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

const AUDIT_ACTIVITY_ROLES = new Set(['admin', 'ceo', 'operations_manager'])

function resolveUserRoles(user: { role?: string; roles?: string[] } | undefined): string[] {
  const roleSet = new Set<string>()
  if (typeof user?.role === 'string' && user.role.trim()) {
    roleSet.add(user.role.trim().toLowerCase())
  }
  if (Array.isArray(user?.roles)) {
    user.roles.forEach((role) => {
      const normalized = String(role || '').trim().toLowerCase()
      if (normalized) {
        roleSet.add(normalized)
      }
    })
  }
  return [...roleSet]
}

export function ProfileSettingsPage() {
  const pushToast = useToastStore((state) => state.pushToast)
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM)

  const currentUserQuery = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: getCurrentUser,
    ...queryPolicies.detail,
  })

  const canViewActivity = resolveUserRoles(currentUserQuery.data).some((role) => AUDIT_ACTIVITY_ROLES.has(role))
  const activityQuery = useQuery({
    queryKey: ['profile', 'my-activity', currentUserQuery.data?.id || 0],
    queryFn: () => listAuditTrail({
      userId: Number(currentUserQuery.data?.id || 0),
      limit: 25,
      offset: 0,
      sortBy: 'id',
      sortOrder: 'desc',
    }),
    enabled: canViewActivity && Number.isInteger(currentUserQuery.data?.id) && Number(currentUserQuery.data?.id) > 0,
    ...queryPolicies.list,
    retry: false,
  })

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
  })

  const submitPasswordChange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      pushToast({ type: 'error', message: 'All password fields are required.' })
      return
    }
    if (passwordForm.newPassword.length < 8) {
      pushToast({ type: 'error', message: 'New password must be at least 8 characters.' })
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      pushToast({ type: 'error', message: 'New password and confirmation do not match.' })
      return
    }

    changePasswordMutation.mutate(
      {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      },
      {
        onSuccess: () => {
          setPasswordForm(EMPTY_PASSWORD_FORM)
          pushToast({ type: 'success', message: 'Password changed successfully.' })
        },
        onError: () => {
          pushToast({ type: 'error', message: 'Failed to change password. Verify your current password and try again.' })
        },
      },
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>User Profile & Settings</h1>
          <p className={styles.muted}>Manage your account details and update your sign-in credentials.</p>
        </div>
      </div>

      <AsyncState
        loading={currentUserQuery.isLoading}
        error={currentUserQuery.isError}
        empty={false}
        loadingText="Loading profile..."
        errorText="Unable to load profile."
        onRetry={() => {
          void currentUserQuery.refetch()
        }}
      />

      {currentUserQuery.data ? (
        <section className={styles.cards}>
          <article className={styles.card}>
            <div className={styles.label}>Name</div>
            <div className={styles.value}>{currentUserQuery.data.full_name}</div>
          </article>
          <article className={styles.card}>
            <div className={styles.label}>Email</div>
            <div className={styles.value}>{currentUserQuery.data.email}</div>
          </article>
          <article className={styles.card}>
            <div className={styles.label}>Role</div>
            <div className={styles.value}>{currentUserQuery.data.role}</div>
          </article>
          <article className={styles.card}>
            <div className={styles.label}>Scope</div>
            <div className={styles.value}>{currentUserQuery.data.branch_name || currentUserQuery.data.region_name || 'HQ'}</div>
          </article>
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Change password</h2>
        <form className={styles.gridThree} onSubmit={submitPasswordChange}>
          <label className={styles.inputGroup}>
            <span>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
              required
            />
          </label>
          <label className={styles.inputGroup}>
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
              required
            />
          </label>
          <label className={styles.inputGroup}>
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              required
            />
          </label>
          <div className={styles.actions}>
            <button type="submit" disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent activity</h2>
        {!canViewActivity ? (
          <p className={styles.muted}>Your role does not currently have access to system audit activity feeds.</p>
        ) : (
          <>
            <AsyncState
              loading={activityQuery.isLoading}
              error={activityQuery.isError}
              empty={Boolean(activityQuery.data && activityQuery.data.data.length === 0)}
              loadingText="Loading recent activity..."
              errorText="Unable to load recent activity."
              emptyText="No recent activity entries found."
              onRetry={() => {
                void activityQuery.refetch()
              }}
            />
            {activityQuery.data && activityQuery.data.data.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activityQuery.data?.data ?? []).map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDisplayDateTime(entry.created_at)}</td>
                        <td className={styles.mono}>{formatDisplayText(entry.action)}</td>
                        <td>{formatDisplayReference(entry.target_type, entry.target_id)}</td>
                        <td>
                          <pre className={styles.pre}>{formatDisplayDetails(entry.details)}</pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
