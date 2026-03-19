import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import { useUiStore } from '../../store/uiStore'
import { GlobalCommandMenu } from './GlobalCommandMenu'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import styles from './PageShell.module.css'

export function PageShell() {
  const location = useLocation()
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const reduceMotion = useReducedMotion()

  const pageContent = reduceMotion ? (
    <div key={location.pathname}>
      <Outlet />
    </div>
  ) : (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  )

  return (
    <div className={`${styles.shell} ${sidebarOpen ? styles.sidebarExpanded : styles.sidebarCollapsed}`}>
      <Sidebar />
      <div className={styles.main}>
        <Header />
        <main className={styles.content}>
          {pageContent}
        </main>
      </div>
      {sidebarOpen ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close sidebar"
          onClick={toggleSidebar}
        />
      ) : null}
      <GlobalCommandMenu />
    </div>
  )
}
