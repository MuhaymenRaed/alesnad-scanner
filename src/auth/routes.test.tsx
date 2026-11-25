import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInPage } from '../pages/SignInPage'
import { ProtectedRoute } from './ProtectedRoute'
import { safeRedirectPath } from './redirect'

const authState = vi.hoisted(() => ({ current: { isLoaded: false, isSignedIn: undefined as boolean | undefined } }))

vi.mock('@clerk/react', () => ({
  useAuth: () => authState.current,
  useSignIn: () => ({ signIn: { status: 'needs_identifier', supportedSecondFactors: [] }, errors: { fields: {}, global: null, raw: null }, fetchStatus: 'idle' }),
  ClerkLoading: () => null,
  ClerkFailed: () => null,
}))

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sign-in/*" element={<><SignInPage /><LocationProbe /></>} />
        <Route path="/" element={<ProtectedRoute><p>Scanner content</p><LocationProbe /></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('protected routes', () => {
  beforeEach(() => {
    authState.current = { isLoaded: false, isSignedIn: undefined }
  })

  it('shows a loading screen and no protected content while Clerk resolves the session', () => {
    renderAt('/')
    expect(screen.getByText('جارٍ التحقق من الجلسة…')).toBeInTheDocument()
    expect(screen.queryByText('Scanner content')).not.toBeInTheDocument()
  })

  it('redirects a signed-out user to sign-in, remembering the destination', () => {
    authState.current = { isLoaded: true, isSignedIn: false }
    renderAt('/?barcode=123')
    expect(screen.queryByText('Scanner content')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/sign-in?redirect_url=%2F%3Fbarcode%3D123')
    expect(screen.getByRole('heading', { name: 'تسجيل دخول الموظفين' })).toBeInTheDocument()
  })

  it('renders the scanner for a signed-in user', () => {
    authState.current = { isLoaded: true, isSignedIn: true }
    renderAt('/')
    expect(screen.getByText('Scanner content')).toBeInTheDocument()
  })

  it('sends an already signed-in user from /sign-in to the scanner', () => {
    authState.current = { isLoaded: true, isSignedIn: true }
    renderAt('/sign-in')
    expect(screen.getByText('Scanner content')).toBeInTheDocument()
  })

  it('returns to the sign-in page after sign-out (session gone)', () => {
    authState.current = { isLoaded: true, isSignedIn: true }
    const view = renderAt('/')
    authState.current = { isLoaded: true, isSignedIn: false }
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/" element={<ProtectedRoute><p>Scanner content</p></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByText('Scanner content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'تسجيل دخول الموظفين' })).toBeInTheDocument()
  })
})

describe('safeRedirectPath', () => {
  it.each([
    [null, '/'],
    ['/?barcode=1', '/?barcode=1'],
    ['https://evil.example/steal', '/'],
    ['//evil.example', '/'],
    ['/sign-in', '/'],
    [`${window.location.origin}/x`, '/x'],
  ])('%s → %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected)
  })
})
