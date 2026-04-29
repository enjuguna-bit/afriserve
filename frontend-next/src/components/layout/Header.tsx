import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { sidebarNavItems } from '../../app/navigation'
import { logout } from '../../services/authService'
import { queryClient } from '../../services/queryClient'
import { useAuthStore } from '../../store/authStore'
import { useCommandMenuStore } from '../../store/commandMenuStore'
import { useDashboardStore } from '../../store/dashboardStore'
import { useUiStore } from '../../store/uiStore'
import { useToastStore } from '../../store/toastStore'
import { formatDisplayDateTime } from '../../utils/dateFormatting'
import { TenantSwitcher } from './TenantSwitcher'
import styles from './Header.module.css'

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const theme = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const clearSession = useAuthStore((state) => state.clearSession)
  const user = useAuthStore((state) => state.user)
  const openCommandMenu = useCommandMenuStore((state) => state.open)
  const openDashboardFilter = useDashboardStore((state) => state.openFilter)
  const isDashboardFilterOpen = useDashboardStore((state) => state.isFilterOpen)
  const closeDashboardFilter = useDashboardStore((state) => state.closeFilter)
  const pushToast = useToastStore((state) => state.pushToast)
  const notifications = useToastStore((state) => state.notifications)
  const markAllNotificationsRead = useToastStore((state) => state.markAllNotificationsRead)
  const clearNotifications = useToastStore((state) => state.clearNotifications)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const shortcutLabel = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? 'CMD K' : 'CTRL K'
  const motionProps = reduceMotion
    ? {}
    : {
      whileHover: { y: -1 },
      whileTap: { scale: 0.985 },
    }

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      pushToast({ type: 'success', message: 'Signed out successfully.' })
    },
    onError: () => {
      pushToast({ type: 'info', message: 'Signed out locally. Server session may have already expired.' })
    },
    onSettled: () => {
      clearSession()
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  const unreadCount = useMemo(
    () => notifications.reduce((sum, item) => sum + (item.read ? 0 : 1), 0),
    [notifications],
  )
  const activeNavItem = useMemo(() => {
    if (/^\/clients\/\d+$/.test(location.pathname)) {
      return { label: 'Customer 360', section: 'Portfolio' }
    }

    if (location.pathname === '/clients/reallocation') {
      return { label: 'Reallocation', section: 'Portfolio' }
    }

    const sortedItems = [...sidebarNavItems].sort((left, right) => right.to.length - left.to.length)
    return sortedItems.find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
  }, [location.pathname])
  const pageTitle = activeNavItem?.label || 'Workspace'
  const pageSection = activeNavItem?.section || 'Index'
  const userName = user?.full_name || 'Afriserve User'
  const userRole = user?.role_description || user?.role || 'Manager'
  const userLocation = user?.branch_name || user?.region_name || 'Assigned branch'
  const normalizedRole = String(user?.role || '').trim().toLowerCase()
  const canFilterDashboard = normalizedRole === 'operations_manager' && location.pathname === '/dashboard'

  useEffect(() => {
    if (!canFilterDashboard && isDashboardFilterOpen) {
      closeDashboardFilter()
    }
  }, [canFilterDashboard, closeDashboardFilter, isDashboardFilterOpen])

  return (
    <motion.header
      className={styles.header}
      initial={false}
      animate={reduceMotion ? undefined : { y: 0, opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className={styles.brandWrap}>
        <motion.button type="button" className={styles.menuButton} onClick={toggleSidebar} {...motionProps}>
          Menu
        </motion.button>
        {canFilterDashboard ? (
          <motion.button
            type="button"
            className={`${styles.headerFilterButton} ${isDashboardFilterOpen ? styles.headerFilterButtonActive : ''}`.trim()}
            onClick={openDashboardFilter}
            aria-label="Open dashboard filter"
            {...motionProps}
          >
            Filter
          </motion.button>
        ) : null}
        <motion.div className={styles.contextCard} layout>
          <p className={styles.contextEyebrow}>{pageSection}</p>
          <div className={styles.brand}>{pageTitle}</div>
        </motion.div>
      </div>
      <div className={styles.actions}>
        <motion.button
          type="button"
          className={styles.commandButton}
          onClick={openCommandMenu}
          aria-label="Open quick search"
          {...motionProps}
        >
          <span>Quick Find</span>
          <span className={styles.shortcutBadge}>{shortcutLabel}</span>
        </motion.button>
        <TenantSwitcher userRole={user?.role} />
        <Link className={styles.actionLink} to="/search">Search Page</Link>
        <div className={styles.notificationWrap}>
          <motion.button
            type="button"
            className={styles.notificationButton}
            onClick={() => {
              const nextOpen = !notificationsOpen
              setNotificationsOpen(nextOpen)
              if (nextOpen) {
                markAllNotificationsRead()
              }
            }}
            {...motionProps}
          >
            Notifications
            {unreadCount > 0 ? <span className={styles.badge}>{unreadCount}</span> : null}
          </motion.button>
          <AnimatePresence>
            {notificationsOpen ? (
              <motion.div
                className={styles.notificationPanel}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                <div className={styles.notificationHeader}>
                  <strong>Notifications</strong>
                  <button type="button" className={styles.inlineButton} onClick={clearNotifications}>Clear</button>
                </div>
                {notifications.length > 0 ? (
                  <ul className={styles.notificationList}>
                    {notifications.map((item) => (
                      <li key={item.id} className={styles.notificationItem}>
                        <div className={styles.notificationMessage}>{item.message}</div>
                        <div className={styles.notificationMeta}>{formatDisplayDateTime(item.createdAt)}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.notificationEmpty}>No notifications yet.</div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <motion.button
          type="button"
          className={styles.actionButton}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          {...motionProps}
        >
          {theme === 'light' ? 'Night mode' : 'Day mode'}
        </motion.button>
        <Link className={styles.actionLink} to="/profile">Profile</Link>
        <motion.div className={styles.userCard} layout>
          <div className={styles.userAvatar}>{getInitials(userName)}</div>
          <div className={styles.userMeta}>
            <strong>{userName}</strong>
            <span>{userRole}</span>
            <span>{userLocation}</span>
          </div>
        </motion.div>
        <motion.button
          type="button"
          className={styles.logoutButton}
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          {...motionProps}
        >
          {logoutMutation.isPending ? 'Signing out...' : 'Logout'}
        </motion.button>
      </div>
    </motion.header>
  )
}
