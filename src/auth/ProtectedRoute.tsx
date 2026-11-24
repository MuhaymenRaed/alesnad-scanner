import { useAuth } from '@clerk/react'
import { useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { FullPageState } from '../components/FullPageState'
import { signInPathFor } from './redirect'

/**
 * Renders its children only for a signed-in Clerk user.
 * - While Clerk is still resolving the session: a loading screen (protected content never renders early).
 * - Signed out (never signed in, expired, or just signed out): redirect to /sign-in, remembering
 *   the intended destination.
 *
 * This is a UX guard only. The backend independently verifies a Clerk token on every API call.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const location = useLocation()

  // `isLoaded` can briefly turn false while Clerk refreshes state; don't unmount the scanner (and
  // lose its state) for that. Tracked with the "adjust state while rendering" pattern.
  const [confirmedSignedIn, setConfirmedSignedIn] = useState(false)
  if (isLoaded && Boolean(isSignedIn) !== confirmedSignedIn) setConfirmedSignedIn(Boolean(isSignedIn))

  if (!isLoaded) {
    if (confirmedSignedIn) return <>{children}</>
    return <FullPageState title="Checking your session…" loading />
  }

  if (!isSignedIn) {
    const destination = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={signInPathFor(destination)} replace />
  }

  return <>{children}</>
}
