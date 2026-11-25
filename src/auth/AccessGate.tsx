import { useClerk } from '@clerk/react'
import { useEffect, useState, type ReactNode } from 'react'
import type { ApiError } from '../../shared/api'
import { FullPageState } from '../components/FullPageState'
import { primaryButton } from '../components/ui'
import { useApiClient } from '../hooks/useApiClient'
import { isAbortError } from '../lib/api'
import { statusCopy } from '../lib/messages'

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
        if (!isAbortError(error)) setState({ status: 'failed', error: { code: 'NETWORK_ERROR', message: 'تعذّر الوصول إلى خدمة الماسح.' } })
      })
    return () => abort.abort()
  }, [api, attempt])

  if (state.status === 'granted') return <>{children}</>
  if (state.status === 'checking') return <FullPageState title="جارٍ فتح الماسح…" loading />

  const signOutButton = (
    <button type="button" className={primaryButton} onClick={() => void signOut({ redirectUrl: '/sign-in' })}>
      الدخول بحساب آخر
    </button>
  )
  switch (state.error.code) {
    case 'ACCESS_DENIED':
      return (
        <FullPageState title="لا تملك صلاحية استخدام الماسح" action={signOutButton}>
          أنت مسجّل الدخول، لكن حسابك غير مسموح له باستخدام ماسح المنتجات. اطلب الصلاحية من المسؤول.
        </FullPageState>
      )
    case 'UNAUTHENTICATED':
    case 'SESSION_ENDED':
      return (
        <FullPageState title="تعذّر التحقق من الجلسة" action={signOutButton}>
          سجّل الدخول مرة أخرى للمتابعة.
        </FullPageState>
      )
    default:
      return (
        <FullPageState
          title="خدمة الماسح غير متاحة حالياً"
          action={
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                setState({ status: 'checking' })
                setAttempt((n) => n + 1)
              }}
            >
              إعادة المحاولة
            </button>
          }
        >
          {statusCopy(state.error.code).hint}
        </FullPageState>
      )
  }
}
