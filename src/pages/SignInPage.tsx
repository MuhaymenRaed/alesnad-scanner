import { ClerkFailed, ClerkLoading, useAuth } from '@clerk/react'
import { Loader2 } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router'
import { AuthShell } from '../auth/AuthShell'
import { safeRedirectPath } from '../auth/redirect'
import { SignInForm } from '../auth/SignInForm'
import { SignUpForm } from '../auth/SignUpForm'
import { StatusMessage } from '../components/StatusMessage'

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { isLoaded, isSignedIn } = useAuth()
  const [params] = useSearchParams()
  const destination = safeRedirectPath(params.get('redirect_url'))

  // Already signed in → straight to the scanner (or the remembered destination).
  if (isLoaded && isSignedIn) return <Navigate to={destination} replace />

  return (
    <AuthShell>
      <ClerkLoading>
        <p className="flex items-center justify-center gap-2 py-10 font-semibold text-muted" role="status">
          <Loader2 className="size-5 text-brand motion-safe:animate-spin" aria-hidden /> جارٍ التحميل…
        </p>
      </ClerkLoading>
      <ClerkFailed>
        <StatusMessage tone="error" title="تعذّر تحميل صفحة الدخول">
          تحقّق من اتصال الإنترنت وأعد تحميل الصفحة. إذا تكرر ذلك أبلغ المسؤول.
        </StatusMessage>
      </ClerkFailed>
      {isLoaded && (mode === 'sign-in' ? <SignInForm destination={destination} /> : <SignUpForm destination={destination} />)}
    </AuthShell>
  )
}

/** Custom, Clerk-badge-free sign-in (see SignInForm). */
export function SignInPage() {
  return <AuthPage mode="sign-in" />
}

/** Custom sign-up — only routed when VITE_ENABLE_SIGN_UP=true. */
export function SignUpPage() {
  return <AuthPage mode="sign-up" />
}
