import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import type { StaffRole } from './context'

interface ProtectedRouteProps {
  /** When set, only staff with one of these roles may pass — everyone else (still authenticated,
   *  just the wrong role) is redirected to /scanner, the one area every staff role can reach. */
  allowedRoles?: StaffRole[]
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps = {}) {
  const { session, staffUser, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f4fdfc_0%,#f7f9fc_100%)] text-sm font-semibold text-[#7c8aa0]">
        Loading&hellip;
      </div>
    )
  }

  if (!session || !staffUser) {
    // Send scanner-area visitors to the staff login instead of the admin one, so they land on
    // the page that matches where they were headed.
    const loginPath = location.pathname.startsWith('/scanner') ? '/scanner/login' : '/login'
    return <Navigate to={loginPath} replace />
  }

  if (allowedRoles && !allowedRoles.includes(staffUser.role)) {
    return <Navigate to="/scanner" replace />
  }

  return <Outlet />
}
