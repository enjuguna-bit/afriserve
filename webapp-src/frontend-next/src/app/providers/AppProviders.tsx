import { useEffect, type PropsWithChildren } from 'react'
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { queryClient } from '../../services/queryClient'
import { AppErrorBoundary } from '../../components/common/AppErrorBoundary'
import { prefetchWorkspaceWarmup } from '../../services/prefetch'
import { ThemeSync } from './ThemeSync'

function QueryWarmup() {
  const client = useQueryClient()

  useEffect(() => {
    let cancelled = false
    let idleHandle: number | null = null
    let timeoutHandle: number | null = null
    const win = typeof window !== 'undefined'
      ? (window as Window & {
        requestIdleCallback?: (callback: IdleRequestCallback) => number
        cancelIdleCallback?: (handle: number) => void
      })
      : null
    const scheduleWarmup = () => {
      if (cancelled) {
        return
      }
      void prefetchWorkspaceWarmup(client)
    }

    if (win?.requestIdleCallback) {
      idleHandle = win.requestIdleCallback(() => {
        scheduleWarmup()
      })
    } else if (win) {
      timeoutHandle = win.setTimeout(() => {
        scheduleWarmup()
      }, 350)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleWarmup()
      }
    }

    const handleOnline = () => {
      scheduleWarmup()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    win?.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      win?.removeEventListener('online', handleOnline)
      if (idleHandle !== null && win?.cancelIdleCallback) {
        win.cancelIdleCallback(idleHandle)
      }
      if (timeoutHandle !== null && win) {
        win.clearTimeout(timeoutHandle)
      }
    }
  }, [client])

  return null
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeSync />
        <QueryWarmup />
        {children}
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
