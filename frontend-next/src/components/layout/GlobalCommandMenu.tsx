import { startTransition, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { filterSidebarItemsForRole, sidebarNavItems, type SidebarNavItem } from '../../app/navigation'
import { listClients } from '../../services/clientService'
import { listLoans } from '../../services/loanService'
import { prefetchClientWorkspace, prefetchLoanWorkspace } from '../../services/prefetch'
import { queryPolicies } from '../../services/queryPolicies'
import { useAuthStore } from '../../store/authStore'
import { useCommandMenuStore } from '../../store/commandMenuStore'
import styles from './GlobalCommandMenu.module.css'

type CommandTarget = {
  label: string
  section: string
  to: string
}

function flattenNavigation(items: SidebarNavItem[], sectionFallback = 'Workspace'): CommandTarget[] {
  return items.flatMap((item) => {
    const section = item.section || sectionFallback
    const current: CommandTarget = {
      label: item.label,
      section,
      to: item.to,
    }

    if (!Array.isArray(item.children) || item.children.length === 0) {
      return [current]
    }

    return [current, ...flattenNavigation(item.children, section)]
  })
}

export function GlobalCommandMenu() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const user = useAuthStore((state) => state.user)
  const isOpen = useCommandMenuStore((state) => state.isOpen)
  const query = useCommandMenuStore((state) => state.query)
  const open = useCommandMenuStore((state) => state.open)
  const close = useCommandMenuStore((state) => state.close)
  const reset = useCommandMenuStore((state) => state.reset)
  const setQuery = useCommandMenuStore((state) => state.setQuery)
  const deferredQuery = useDeferredValue(query.trim())

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (isOpen) {
          close()
        } else {
          open()
        }
        return
      }

      if (event.key === 'Escape' && isOpen) {
        event.preventDefault()
        close()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [close, isOpen, open])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const timeout = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)

    document.body.style.overflow = 'hidden'

    return () => {
      window.clearTimeout(timeout)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const navigationTargets = useMemo(() => {
    const visibleItems = filterSidebarItemsForRole(sidebarNavItems, user)
    const flattened = flattenNavigation(visibleItems)
    const deduped = new Map<string, CommandTarget>()

    flattened.forEach((entry) => {
      const key = `${entry.to}:${entry.label}`
      if (!deduped.has(key)) {
        deduped.set(key, entry)
      }
    })

    const lowerQuery = deferredQuery.toLowerCase()

    return Array.from(deduped.values())
      .filter((entry) => (
        lowerQuery.length === 0
        || entry.label.toLowerCase().includes(lowerQuery)
        || entry.section.toLowerCase().includes(lowerQuery)
      ))
      .slice(0, 6)
  }, [deferredQuery, user])

  const clientsQuery = useQuery({
    queryKey: ['command-menu', 'clients', deferredQuery],
    queryFn: () => listClients({
      search: deferredQuery || undefined,
      limit: 6,
      offset: 0,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
    enabled: deferredQuery.length >= 2,
    ...queryPolicies.list,
  })

  const numericQuery = Number(deferredQuery)
  const loansQuery = useQuery({
    queryKey: ['command-menu', 'loans', deferredQuery],
    queryFn: () => listLoans({
      search: deferredQuery || undefined,
      loanId: Number.isInteger(numericQuery) && numericQuery > 0 ? numericQuery : undefined,
      limit: 6,
      offset: 0,
      sortBy: 'id',
      sortOrder: 'desc',
    }),
    enabled: deferredQuery.length >= 2,
    ...queryPolicies.list,
  })

  function selectTarget(path: string) {
    reset()
    navigate(path)
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className={styles.overlay}
          role="presentation"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={reduceMotion ? undefined : { opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          onClick={() => close()}
        >
          <motion.section
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="Quick search"
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Global command menu</p>
                <h2 className={styles.title}>Jump anywhere</h2>
                <p className={styles.subtitle}>Search navigation, clients, or loans from a single palette.</p>
              </div>
              <div className={styles.shortcut}>
                <span>Shortcut</span>
                <strong>{navigator.platform.toLowerCase().includes('mac') ? 'CMD + K' : 'CTRL + K'}</strong>
              </div>
            </div>

            <div className={styles.searchWrap}>
              <span className={styles.searchIcon} aria-hidden="true">K</span>
              <input
                ref={inputRef}
                className={styles.searchInput}
                value={query}
                onChange={(event) => {
                  const nextValue = event.target.value
                  startTransition(() => {
                    setQuery(nextValue)
                  })
                }}
                placeholder="Search routes, borrower names, phones, loan IDs, or facility names"
              />
            </div>

            <div className={styles.resultGrid}>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Navigate</h3>
                </div>
                <div className={styles.resultList}>
                  {navigationTargets.length > 0 ? navigationTargets.map((target) => (
                    <motion.button
                      key={`${target.to}:${target.label}`}
                      type="button"
                      className={styles.resultButton}
                      whileHover={reduceMotion ? undefined : { y: -2 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                      onClick={() => selectTarget(target.to)}
                    >
                      <span className={styles.resultLabel}>{target.label}</span>
                      <span className={styles.resultMeta}>{target.section}</span>
                    </motion.button>
                  )) : <p className={styles.emptyCopy}>No route matches yet.</p>}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Clients</h3>
                </div>
                <div className={styles.resultList}>
                  {deferredQuery.length < 2 ? (
                    <p className={styles.emptyCopy}>Type at least two characters to search borrower records.</p>
                  ) : clientsQuery.data?.data.length ? clientsQuery.data.data.map((client) => (
                    <motion.button
                      key={client.id}
                      type="button"
                      className={styles.resultButton}
                      whileHover={reduceMotion ? undefined : { y: -2 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                      onMouseEnter={() => {
                        void prefetchClientWorkspace(queryClient, client.id)
                      }}
                      onFocus={() => {
                        void prefetchClientWorkspace(queryClient, client.id)
                      }}
                      onClick={() => selectTarget(`/clients/${client.id}`)}
                    >
                      <span className={styles.resultLabel}>{client.full_name}</span>
                      <span className={styles.resultMeta}>{client.phone || client.national_id || `Client #${client.id}`}</span>
                    </motion.button>
                  )) : <p className={styles.emptyCopy}>{clientsQuery.isLoading ? 'Searching clients...' : 'No borrower matches.'}</p>}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Loans</h3>
                </div>
                <div className={styles.resultList}>
                  {deferredQuery.length < 2 ? (
                    <p className={styles.emptyCopy}>Search by facility ID or borrower text.</p>
                  ) : loansQuery.data?.data.length ? loansQuery.data.data.map((loan) => (
                    <motion.button
                      key={loan.id}
                      type="button"
                      className={styles.resultButton}
                      whileHover={reduceMotion ? undefined : { y: -2 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                      onMouseEnter={() => {
                        void prefetchLoanWorkspace(queryClient, loan.id)
                      }}
                      onFocus={() => {
                        void prefetchLoanWorkspace(queryClient, loan.id)
                      }}
                      onClick={() => selectTarget(`/loans/${loan.id}`)}
                    >
                      <span className={styles.resultLabel}>Loan #{loan.id}</span>
                      <span className={styles.resultMeta}>{loan.client_name || `Client #${loan.client_id}`} • {loan.status}</span>
                    </motion.button>
                  )) : <p className={styles.emptyCopy}>{loansQuery.isLoading ? 'Searching loans...' : 'No facility matches.'}</p>}
                </div>
              </section>
            </div>

            <div className={styles.footer}>
              <span>Need wider search controls? Open the full <Link to="/search" onClick={() => reset()}>Search page</Link>.</span>
              <span>Press Esc to close.</span>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
