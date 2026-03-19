import { useMemo, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import {
  filterQuickActionsForRole,
  filterSidebarItemsForRole,
  quickActions,
  sectionMeta,
  sidebarNavItems,
  type SidebarNavItem,
  type SidebarSection,
} from '../../app/navigation'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { usePendingApprovalsCount } from '../../features/loans/hooks/usePendingApprovalsCount'
import { AfriserveLogo } from '../common/AfriserveLogo'
import styles from './Sidebar.module.css'

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

// Ordered list of sections — controls render order in the nav
const SECTION_ORDER: SidebarSection[] = ['operate', 'measure', 'configure']

export function Sidebar() {
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const user = useAuthStore((state) => state.user)
  const pendingApprovals = usePendingApprovalsCount()

  const visibleItems = useMemo(() => filterSidebarItemsForRole(sidebarNavItems, user), [user])
  const visibleQuickActions = useMemo(() => filterQuickActionsForRole(quickActions, user), [user])

  // Group items by section, preserving SECTION_ORDER
  const sections = useMemo(() => {
    const grouped = visibleItems.reduce<Record<string, SidebarNavItem[]>>((acc, item) => {
      const key = item.section
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    }, {})

    return SECTION_ORDER
      .filter((key) => grouped[key]?.length)
      .map((key) => ({ key, meta: sectionMeta[key], items: grouped[key] }))
  }, [visibleItems])

  // Section collapsed state — configure starts collapsed
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(
      SECTION_ORDER.map((k) => [k, sectionMeta[k].defaultCollapsed]),
    ),
  )

  // Per-item expand/collapse for nested children
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  const displayName = user?.full_name || 'Afriserve User'
  const displayRole = user?.role_description || user?.role || 'Operations'
  const displayBranch = user?.branch_name || user?.region_name || 'Assigned portfolio'

  function itemMatchesPath(item: SidebarNavItem): boolean {
    if (location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)) {
      return true
    }
    if (Array.isArray(item.matchPrefixes) && item.matchPrefixes.some((p) => location.pathname.startsWith(p))) {
      return true
    }
    return Array.isArray(item.children) ? item.children.some((child) => itemMatchesPath(child)) : false
  }

  function isItemExpanded(key: string, active: boolean) {
    return expandedItems[key] ?? active
  }

  function toggleItemExpanded(key: string) {
    setExpandedItems((current) => ({
      ...current,
      [key]: !(current[key] ?? false),
    }))
  }

  function toggleSection(key: string) {
    setCollapsedSections((current) => ({ ...current, [key]: !current[key] }))
  }

  function getBadgeCount(badge?: string): number | null {
    if (badge === 'approvals') return pendingApprovals > 0 ? pendingApprovals : null
    return null
  }

  const handleNavigate = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 900 && sidebarOpen) {
      toggleSidebar()
    }
  }

  function renderNavItem(item: SidebarNavItem, depth = 0) {
    const active = itemMatchesPath(item)
    const hasChildren = Array.isArray(item.children) && item.children.length > 0
    const key = `${item.to}:${item.label}`

    if (hasChildren) {
      const expanded = isItemExpanded(key, active)

      return (
        <motion.div key={key} layout className={styles.nestedBlock}>
          <motion.button
            type="button"
            className={`${styles.linkButton} ${active ? styles.active : ''}`}
            onClick={() => toggleItemExpanded(key)}
            whileHover={reduceMotion ? undefined : { x: 2 }}
            whileTap={reduceMotion ? undefined : { scale: 0.99 }}
          >
            <span className={styles.linkLabel}>{item.label}</span>
            <motion.span
              className={styles.expander}
              animate={reduceMotion ? undefined : { rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.14 }}
              aria-hidden="true"
            >
              ›
            </motion.span>
          </motion.button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                className={depth === 0 ? styles.childLinks : styles.grandChildLinks}
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={reduceMotion ? undefined : { height: 'auto', opacity: 1 }}
                exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                {item.children?.map((child) => renderNavItem(child, depth + 1))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )
    }

    return (
      <motion.div key={key} layout>
        <Link
          to={item.to}
          onClick={handleNavigate}
          className={`${styles.link} ${active ? styles.active : ''} ${depth > 0 ? styles.childLink : ''}`.trim()}
        >
          {active && (
            <motion.span layoutId="sidebar-active-rail" className={styles.activeRail} aria-hidden="true" />
          )}
          <span className={styles.linkLabel}>{item.label}</span>
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.aside
      layout
      className={`${styles.sidebar} ${sidebarOpen ? styles.open : styles.closed}`}
      initial={false}
      animate={reduceMotion ? undefined : { opacity: sidebarOpen ? 1 : 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* Brand */}
      <motion.div layout className={styles.brandCard}>
        <AfriserveLogo className={styles.logo} />
      </motion.div>

      {/* Quick Actions — 1-click primary CTAs, always visible */}
      {visibleQuickActions.length > 0 && (
        <div className={styles.quickActions}>
          <span className={styles.quickActionsLabel}>Quick actions</span>
          <div className={styles.quickActionsGrid}>
            {visibleQuickActions.map((action) => {
              const count = getBadgeCount(action.badge)
              return (
                <Link
                  key={action.to}
                  to={action.to}
                  onClick={handleNavigate}
                  className={`${styles.quickAction} ${styles[`quickAction_${action.variant}`]}`}
                >
                  {action.label}
                  {count !== null && (
                    <span className={styles.quickActionBadge}>{count}</span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <LayoutGroup>
        <nav className={styles.nav}>
          {sections.map(({ key, meta, items }) => {
            const collapsed = collapsedSections[key] ?? false
            return (
              <motion.div key={key} layout className={styles.section}>
                {/* Section toggle */}
                <button
                  type="button"
                  className={styles.sectionToggle}
                  onClick={() => toggleSection(key)}
                >
                  <span className={styles.sectionTitle}>{meta.label}</span>
                  <motion.span
                    className={styles.sectionChevron}
                    animate={reduceMotion ? undefined : { rotate: collapsed ? 0 : 90 }}
                    transition={{ duration: 0.14 }}
                    aria-hidden="true"
                  >
                    ›
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div
                      className={styles.sectionLinks}
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={reduceMotion ? undefined : { height: 'auto', opacity: 1 }}
                      exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                      {items.map((item) => renderNavItem(item))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </nav>
      </LayoutGroup>

      {/* User footer */}
      <motion.div layout className={styles.profileCard}>
        <div className={styles.profileAvatar}>{getInitials(displayName)}</div>
        <div>
          <strong className={styles.profileName}>{displayName}</strong>
          <div className={styles.profileMeta}>{displayRole}</div>
          <div className={styles.profileMeta}>{displayBranch}</div>
        </div>
      </motion.div>
    </motion.aside>
  )
}
