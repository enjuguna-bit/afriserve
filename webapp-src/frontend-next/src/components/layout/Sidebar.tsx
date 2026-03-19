import { useMemo, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import { filterSidebarItemsForRole, sidebarNavItems, type SidebarNavItem } from '../../app/navigation'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
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

function itemGlyph(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export function Sidebar() {
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const user = useAuthStore((state) => state.user)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const visibleItems = useMemo(() => filterSidebarItemsForRole(sidebarNavItems, user), [user])
  const sections = visibleItems.reduce<Array<{ title: string; items: typeof visibleItems }>>((acc, item) => {
    const sectionTitle = item.section || 'Workspace'
    const existingSection = acc.find((entry) => entry.title === sectionTitle)
    if (existingSection) {
      existingSection.items.push(item)
      return acc
    }

    acc.push({ title: sectionTitle, items: [item] })
    return acc
  }, [])
  const displayName = user?.full_name || 'Afriserve User'
  const displayRole = user?.role_description || user?.role || 'Operations'
  const displayBranch = user?.branch_name || user?.region_name || 'Assigned portfolio'

  function itemMatchesPath(item: SidebarNavItem): boolean {
    if (location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)) {
      return true
    }

    if (Array.isArray(item.matchPrefixes) && item.matchPrefixes.some((prefix) => location.pathname.startsWith(prefix))) {
      return true
    }

    return Array.isArray(item.children) ? item.children.some((child) => itemMatchesPath(child)) : false
  }

  function isExpanded(key: string, active: boolean) {
    return expandedItems[key] ?? active
  }

  function toggleExpanded(key: string) {
    setExpandedItems((current) => ({
      ...current,
      [key]: !(current[key] ?? false),
    }))
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
      const expanded = isExpanded(key, active)

      return (
        <motion.div key={key} layout className={styles.nestedBlock}>
          <motion.button
            type="button"
            className={`${styles.linkButton} ${active ? styles.active : ''}`}
            onClick={() => toggleExpanded(key)}
            whileHover={reduceMotion ? undefined : { x: 2 }}
            whileTap={reduceMotion ? undefined : { scale: 0.99 }}
          >
            <span className={styles.linkGlyph}>{itemGlyph(item.label)}</span>
            <span className={styles.linkCopy}>
              <span className={styles.linkLabel}>{item.label}</span>
              <span className={styles.linkMeta}>Expand section</span>
            </span>
            <motion.span
              className={styles.expander}
              animate={reduceMotion ? undefined : { rotate: expanded ? 45 : 0 }}
              transition={{ duration: 0.16 }}
              aria-hidden="true"
            >
              +
            </motion.span>
          </motion.button>
          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.div
                className={depth === 0 ? styles.childLinks : styles.grandChildLinks}
                initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={reduceMotion ? undefined : { height: 'auto', opacity: 1 }}
                exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {item.children?.map((child) => renderNavItem(child, depth + 1))}
              </motion.div>
            ) : null}
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
          {active ? <motion.span layoutId="sidebar-active-rail" className={styles.activeRail} aria-hidden="true" /> : null}
          <span className={styles.linkGlyph}>{itemGlyph(item.label)}</span>
          <span className={styles.linkCopy}>
            <span className={styles.linkLabel}>{item.label}</span>
            <span className={styles.linkMeta}>{item.section || 'Workspace'}</span>
          </span>
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
      <motion.div layout className={styles.brandCard}>
        <AfriserveLogo className={styles.logo} />
        <p className={styles.tagline}>Manager portal workspace</p>
      </motion.div>

      <motion.div layout className={styles.profileCard}>
        <div className={styles.profileAvatar}>{getInitials(displayName)}</div>
        <div>
          <strong className={styles.profileName}>{displayName}</strong>
          <div className={styles.profileMeta}>{displayRole}</div>
          <div className={styles.profileMeta}>{displayBranch}</div>
        </div>
      </motion.div>

      <LayoutGroup>
        <nav className={styles.nav}>
          {sections.map((section) => (
            <motion.div key={section.title} layout className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>{section.title}</div>
                <div className={styles.sectionCount}>{section.items.length}</div>
              </div>
              <div className={styles.sectionLinks}>
                {section.items.map((item) => renderNavItem(item))}
              </div>
            </motion.div>
          ))}
        </nav>
      </LayoutGroup>
    </motion.aside>
  )
}
