import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'

export function RequireAuth() {
  const location = useLocation()
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!user) {
    return <div style={{ padding: '20px' }}>Restoring session...</div>
  }

  return <Outlet />
}
