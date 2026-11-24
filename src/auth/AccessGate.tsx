import { useClerk } from '@clerk/react'
import { useEffect, useState, type ReactNode } from 'react'
import type { ApiError } from '../../shared/api'
import { FullPageState } from '../components/FullPageState'
import { primaryButton } from '../components/ui'
import { useApiClient } from '../hooks/useApiClient'
import { isAbortError } from '../lib/api'

type GateState = { status: 'checking' } | { status: 'granted' } | { status: 'failed'; error: ApiError }

/**
 * Asks the backend (GET /api/session) whether this verified Clerk user may use the scanner before
 * showing it. The server is the authority: it verifies the token and applies the access policy.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const api = useApiClient()
  const { signOut } = useClerk()
  const [state, setState] = useState<GateState>({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const abort = new AbortController()
    api
      .session(abort.signal)
      .then((result) => setState(result.ok ? { status: 'granted' } : { status: 'failed', error: result.error }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setState({ status: 'failed', error: { code: 'NETWORK_ERROR', message: 'Cannot reach the scanner service.' } })
      })
    return () => abort.abort()
  }, [api, attempt])

  if (state.status === 'granted') return <>{children}</>
  if (state.status === 'checking') return <FullPageState title="Opening the scanner…" loading />

  const signOutButton = (
    <button type="button" className={primaryButton} onClick={() => void signOut({ redirectUrl: '/sign-in' })}>
      Sign in with another account
    </button>
  )
  switch (state.error.code) {
    case 'ACCESS_DENIED':
      return (
        <FullPageState title="No access to the scanner" action={signOutButton}>
          You are signed in, but your account is not allowed to use the product scanner. Ask an administrator for access.
        </FullPageState>
      )
    case 'UNAUTHENTICATED':
    case 'SESSION_ENDED':
      return (
        <FullPageState title="Your session could not be verified" action={signOutButton}>
          Sign in again to continue.
        </FullPageState>
      )
    default:
      return (
        <FullPageState
          title="The scanner service is unavailable"
          action={
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                setState({ status: 'checking' })
                setAttempt((n) => n + 1)
              }}
            >
              Try again
            </button>
          }
        >
          {state.error.message}
        </FullPageState>
      )
  }
}
