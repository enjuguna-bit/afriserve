import { useEffect, type PropsWithChildren } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCurrentUser } from '../../../services/authService'
import { queryKeys } from '../../../services/queryKeys'
import { queryPolicies } from '../../../services/queryPolicies'
import { useAuthStore } from '../../../store/authStore'

export function AuthSessionBootstrap({ children }: PropsWithChildren) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const clearSession = useAuthStore((state) => state.clearSession)

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: getCurrentUser,
    enabled: Boolean(token) && !user,
    ...queryPolicies.auth,
    retry: false,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (data && !user) {
      setUser(data)
    }
  }, [data, user, setUser])

  useEffect(() => {
    if (isError && token) {
      clearSession()
    }
  }, [isError, token, clearSession])

  if (token && !user && isLoading) {
    return <div style={{ padding: '20px' }}>Restoring session...</div>
  }

  return <>{children}</>
}
