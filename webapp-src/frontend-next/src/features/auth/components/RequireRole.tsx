import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { hasAnyRole } from '../../../app/roleAccess'

type RequireRoleProps = {
  allowedRoles: string[]
}

export function RequireRole({ allowedRoles }: RequireRoleProps) {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)

  if (!user) {
    return <div style={{ padding: '20px' }}>Restoring session...</div>
  }

  if (!hasAnyRole(user, allowedRoles)) {
    return <Navigate to="/dashboard" replace state={{ from: location }} />
  }

  return <Outlet />
}