import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import { ClerkProviderWithRouter } from './auth/ClerkProviderWithRouter'
import { FullPageState } from './components/FullPageState'
import './index.css'

// The publishable key is public by design. Secret keys never use the VITE_ prefix.
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publishableKey?.startsWith('pk_') ? (
      <BrowserRouter>
        <ClerkProviderWithRouter publishableKey={publishableKey}>
          <App />
        </ClerkProviderWithRouter>
      </BrowserRouter>
    ) : (
      <FullPageState title="تسجيل الدخول غير مُعدّ">
        أضف <code dir="ltr" className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> إلى ملف <code dir="ltr" className="font-mono">.env</code> ثم أعد تشغيل الخادم.
      </FullPageState>
    )}
  </StrictMode>,
)
