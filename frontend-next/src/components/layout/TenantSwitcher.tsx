/**
 * TenantSwitcher — admin-only header control for multi-tenant environments.
 *
 * Shows the currently active tenant ID and lets an admin switch to any other
 * active tenant. The selection is persisted to localStorage via setActiveTenantId()
 * so it survives page reloads, then the page reloads to flush all cached data.
 *
 * Design decisions:
 *   - Rendered only when the authenticated user's role is 'admin'.
 *   - Skipped entirely when the tenants list has only the single 'default' tenant
 *     (single-tenant deployment — no UI noise for standard installs).
 *   - Dropdown is keyboard-navigable and closes on outside click / Escape.
 *   - The active tenant is visually highlighted with a green dot.
 *   - Suspended / deactivated tenants are shown as disabled options with a
 *     status label so an admin can see they exist but cannot switch to them.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getActiveTenantId, setActiveTenantId } from '../../services/apiClient'
import { listTenants } from '../../services/adminService'
import { queryPolicies } from '../../services/queryPolicies'
import type { TenantRecord } from '../../types/admin'
import styles from './TenantSwitcher.module.css'

type TenantSwitcherProps = {
  /** Only render when user role is 'admin'. Caller is responsible for this guard. */
  userRole: string | undefined
}

export function TenantSwitcher({ userRole }: TenantSwitcherProps) {
  const isAdmin = String(userRole || '').trim().toLowerCase() === 'admin'
  const [isOpen, setIsOpen] = useState(false)
  const [activeTenantId, setLocalActiveTenantId] = useState(getActiveTenantId)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const tenantsQuery = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: listTenants,
    enabled: isAdmin,
    ...queryPolicies.list,
  })

  const tenants: TenantRecord[] = tenantsQuery.data?.data ?? []
  // Only render the switcher when there are multiple tenants
  const hasMultipleTenants = tenants.length > 1
  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? null
  const displayId = activeTenant?.id ?? activeTenantId

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  function switchTenant(tenantId: string) {
    try {
      setActiveTenantId(tenantId)
      setLocalActiveTenantId(tenantId)
      setIsOpen(false)
      // Full reload: flushes TanStack Query cache and re-initialises the app
      // under the new tenant context. A hard reload is intentional here — tenant
      // switching is an infrequent admin operation and a clean slate is safer
      // than invalidating each query key individually.
      window.location.reload()
    } catch {
      // setActiveTenantId throws on invalid ID format — should not happen via UI
    }
  }

  // Don't render for non-admins or single-tenant installs
  if (!isAdmin || !hasMultipleTenants) return null

  return (
    <div className={styles.wrap} ref={wrapperRef}>
      <button
        type="button"
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Active tenant: ${displayId}. Click to switch tenant.`}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>{displayId}</span>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={styles.dropdown}
          role="listbox"
          aria-label="Select tenant"
        >
          <div className={styles.dropdownHeader}>
            <span>Switch tenant</span>
          </div>
          {tenantsQuery.isLoading ? (
            <div className={styles.dropdownLoading}>Loading tenants…</div>
          ) : (
            <ul className={styles.list}>
              {tenants.map((tenant) => {
                const isActive = tenant.id === activeTenantId
                const isDisabled = tenant.status !== 'active'
                return (
                  <li key={tenant.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      disabled={isDisabled}
                      className={`${styles.option} ${isActive ? styles.optionActive : ''} ${isDisabled ? styles.optionDisabled : ''}`}
                      onClick={() => {
                        if (!isDisabled && !isActive) {
                          switchTenant(tenant.id)
                        }
                      }}
                    >
                      <span className={`${styles.optionDot} ${isActive ? styles.optionDotActive : ''}`} aria-hidden="true" />
                      <span className={styles.optionId}>{tenant.id}</span>
                      <span className={styles.optionName}>{tenant.name}</span>
                      {isDisabled && (
                        <span className={styles.optionStatus}>{tenant.status}</span>
                      )}
                      {isActive && (
                        <span className={styles.optionCheck} aria-hidden="true">✓</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
