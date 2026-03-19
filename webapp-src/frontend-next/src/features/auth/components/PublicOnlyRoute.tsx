import type { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'

export function PublicOnlyRoute({ children }: PropsWithChildren) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)

  if (token && user) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
