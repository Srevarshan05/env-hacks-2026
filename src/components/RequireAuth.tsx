import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Client-side gate only. The backend must still verify the Cognito token on every protected request.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') return <div className="page-shell page-loading" role="status">Checking your account…</div>
  if (auth.status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
