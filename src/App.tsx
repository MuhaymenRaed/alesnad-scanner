import { Navigate, Route, Routes } from 'react-router'
import { AccessGate } from './auth/AccessGate'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { signUpEnabled } from './lib/config'
import { ScannerPage } from './pages/ScannerPage'
import { SignInPage, SignUpPage } from './pages/SignInPage'

/**
 * Routes. Everything except /sign-in (and /sign-up, only when enabled) requires a signed-in Clerk
 * user (ProtectedRoute) whom the backend has accepted (AccessGate). Unknown paths fall back to
 * the protected scanner.
 */
export function App() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={<SignInPage />} />
      {signUpEnabled && <Route path="/sign-up/*" element={<SignUpPage />} />}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AccessGate>
              <ScannerPage />
            </AccessGate>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
