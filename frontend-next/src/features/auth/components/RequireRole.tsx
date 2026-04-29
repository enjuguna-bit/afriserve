import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { hasAnyRole } from '../../../app/roleAccess'

type RequireRoleProps = {
  allowedRoles: string[]
}

// Shown when a user is authenticated but lacks the required role.
// Rendered inline so the page shell (sidebar, navbar) stays visible —
// this makes it clear the user is logged in but not permitted,
// rather than dumping them silently back at the dashboard.
function ForbiddenPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: '12px',
      color: 'var(--text-muted, #8899aa)',
      textAlign: 'center',
      padding: '40px',
    }}>
      <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>🚫</span>
      <h2 style={{ margin: 0, color: 'var(--text, #e2e8f0)', fontSize: '1.4rem', fontWeight: 700 }}>
        Access Restricted
      </h2>
      <p style={{ margin: 0, maxWidth: '38ch', lineHeight: 1.6 }}>
        You don&apos;t have permission to view this page. Contact your administrator if you believe this is an error.
      </p>
    </div>
  )
}

export function RequireRole({ allowedRoles }: RequireRoleProps) {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)

  if (!user) {
    return <div style={{ padding: '20px' }}>Restoring session...</div>
  }

  if (!hasAnyRole(user, allowedRoles)) {
    // For nested routes used purely as layout guards (no path of their own),
    // render the 403 inline rather than navigating away — this avoids a redirect
    // loop when the route itself has no path prop.
    const isLayoutGuard = !location.pathname.endsWith('/') && allowedRoles.length > 0
    if (isLayoutGuard) {
      return <ForbiddenPage />
    }
    return <Navigate to="/dashboard" replace state={{ from: location }} />
  }

  return <Outlet />
}
