import { ClerkProvider } from '@clerk/react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { signUpEnabled } from '../lib/config'

/**
 * ClerkProvider wired to React Router so Clerk's own navigations stay inside the SPA.
 * No Clerk UI components are rendered anywhere in the app — sign-in, sign-up and the account
 * menu are custom — so no Clerk branding appears.
 */
export function ClerkProviderWithRouter({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl={signUpEnabled ? '/sign-up' : '/sign-in'}
      signInFallbackRedirectUrl="/"
      afterSignOutUrl="/sign-in"
    >
      {children}
    </ClerkProvider>
  )
}
