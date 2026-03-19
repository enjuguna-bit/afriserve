import { QueryClient } from '@tanstack/react-query'
import axios from 'axios'

function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2) {
    return false
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (typeof status === 'number') {
      if (status === 408 || status === 429) {
        return true
      }

      if (status >= 400 && status < 500) {
        return false
      }
    }
  }

  return true
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: shouldRetryQuery,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
    },
    mutations: {
      retry: 0,
    },
  },
})
