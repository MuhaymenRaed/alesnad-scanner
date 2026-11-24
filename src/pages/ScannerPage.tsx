import { useClerk } from '@clerk/react'
import { ScanBarcode } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { signInPathFor } from '../auth/redirect'
import { AmbiguousMatches } from '../components/AmbiguousMatches'
import { AppHeader } from '../components/AppHeader'
import { BarcodeInput, type BarcodeInputHandle } from '../components/BarcodeInput'
import { primaryButton } from '../components/ui'
import { ProductDetails } from '../components/ProductDetails'
import { RecentScans } from '../components/RecentScans'
import { StatusMessage } from '../components/StatusMessage'
import { useApiClient } from '../hooks/useApiClient'
import { useProductLookup, type LookupState } from '../hooks/useProductLookup'
import type { ApiClient } from '../lib/api'
import { statusCopy } from '../lib/messages'

// The barcode decoder is only downloaded when someone opens the camera.
const CameraScanner = lazy(() => import('../components/CameraScanner').then((m) => ({ default: m.CameraScanner })))

function isEditable(element: Element | null): boolean {
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (element as HTMLElement).isContentEditable
}

function ResultArea(props: { state: LookupState; api: ApiClient; onChoose(itemCode: string): void; onSignInAgain(): void }) {
  const { state } = props
  switch (state.status) {
    case 'idle':
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-panel border-2 border-dashed border-line-strong/50 px-6 py-12 text-center lg:py-20">
          <span className="flex size-16 items-center justify-center rounded-full bg-charcoal text-white">
            <ScanBarcode className="size-8" aria-hidden />
          </span>
          <p className="text-xl font-extrabold tracking-[-0.02em]">
            Ready to scan <span lang="ar" className="font-semibold text-muted">· جاهز للمسح</span>
          </p>
          <p className="max-w-sm text-sm text-muted">Scan a product barcode, or type it into the barcode field and press Enter.</p>
        </div>
      )
    case 'loading':
      return (
        <StatusMessage tone="loading" title="Looking up product…">
          Barcode <span className="font-mono">{state.barcode}</span>
        </StatusMessage>
      )
    case 'found':
      return <ProductDetails product={state.product} api={props.api} />
    case 'ambiguous':
      return <AmbiguousMatches barcode={state.barcode} candidates={state.candidates} onChoose={props.onChoose} />
    case 'error': {
      const copy = statusCopy(state.error.code, state.error.message)
      const needsSignIn = state.error.code === 'UNAUTHENTICATED' || state.error.code === 'SESSION_ENDED'
      return (
        <StatusMessage
          tone={copy.tone}
          title={copy.title}
          action={
            needsSignIn ? (
              <button type="button" className={primaryButton} onClick={props.onSignInAgain}>
                Sign in again
              </button>
            ) : undefined
          }
        >
          {state.barcode && (
            <p>
              Barcode <span className="font-mono">{state.barcode}</span>
            </p>
          )}
          <p>{state.error.code === 'INVALID_BARCODE' ? state.error.message : copy.hint}</p>
          {state.error.requestId && <p className="mt-1 text-xs opacity-75">Reference: {state.error.requestId}</p>}
        </StatusMessage>
      )
    }
  }
}

export function ScannerPage() {
  const api = useApiClient()
  const { signOut } = useClerk()
  const location = useLocation()
  const { state, recent, submit, review, clearRecent } = useProductLookup(api)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const inputRef = useRef<BarcodeInputHandle>(null)
  const loading = state.status === 'loading'

  const signInAgain = useCallback(() => {
    void signOut({ redirectUrl: signInPathFor(`${location.pathname}${location.search}`) })
  }, [signOut, location.pathname, location.search])

  // The Clerk session is gone (not just a backend hiccup): end it cleanly and go to sign-in.
  useEffect(() => {
    if (state.status === 'error' && state.error.code === 'SESSION_ENDED') signInAgain()
  }, [state, signInAgain])

  // Newest scan becomes the highlighted entry.
  useEffect(() => {
    if (state.status !== 'loading' && state.status !== 'idle') setActiveId(recent[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent])

  // After each lookup, put the cursor back in the barcode field (unless the user is busy elsewhere)
  // so the next hardware scan needs no mouse interaction.
  useEffect(() => {
    if (loading || cameraOpen) return
    const active = document.activeElement
    if (!active || active === document.body || active.id === 'barcode') inputRef.current?.focusAndSelect()
  }, [loading, cameraOpen])

  // Scanner keystrokes that arrive while nothing editable is focused are redirected to the field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || event.key === ' ') return
      if (isEditable(document.activeElement) || document.querySelector('[role="dialog"],[data-popover]')) return
      inputRef.current?.focusAndSelect()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const lookup = useCallback(
    (value: string) => {
      void submit(value)
    },
    [submit],
  )

  const onCameraDetected = useCallback(
    (code: string) => {
      inputRef.current?.setValue(code)
      void submit(code)
    },
    [submit],
  )

  const lastBarcode = state.status === 'idle' ? null : state.barcode

  // Stacked layouts (phones, iPad portrait): bring each new result into view under the sticky
  // header, and offer a "Scan next" shortcut once the scan card has scrolled away.
  const scanRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLElement>(null)
  const [scanVisible, setScanVisible] = useState(true)
  const media = (query: string) => typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const stacked = () => !media('(min-width: 64rem)')
  const reducedMotion = () => media('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    if (state.status === 'idle' || state.status === 'loading' || !stacked()) return
    const top = resultRef.current?.getBoundingClientRect().top ?? 0
    if (top > window.innerHeight * 0.55 || top < 0) {
      resultRef.current?.scrollIntoView?.({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    }
  }, [state])

  useEffect(() => {
    const target = scanRef.current
    if (!target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setScanVisible(entry?.isIntersecting ?? true), { threshold: 0.15 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  const scanNext = () => {
    scanRef.current?.scrollIntoView?.({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    if (!cameraOpen) inputRef.current?.focusAndSelect()
  }

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-4 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] sm:gap-5 sm:px-6 sm:pt-6 lg:grid lg:max-w-7xl lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:pb-10 xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
        {/* Left column on wide screens (sticky); dissolves into the page flow when stacked. */}
        <div className="contents lg:sticky lg:top-[calc(4.25rem+env(safe-area-inset-top)+1.5rem)] lg:flex lg:max-h-[calc(100dvh-4.25rem-env(safe-area-inset-top)-3rem)] lg:flex-col lg:gap-6">
          <div ref={scanRef} className="order-1 scroll-mt-24 space-y-4 lg:shrink-0">
            <BarcodeInput ref={inputRef} loading={loading} cameraOpen={cameraOpen} onSubmit={lookup} onToggleCamera={() => setCameraOpen((open) => !open)} />
            {cameraOpen && (
              <Suspense fallback={<StatusMessage tone="loading" title="Starting camera scanner…" />}>
                <CameraScanner paused={loading} onDetected={onCameraDetected} />
              </Suspense>
            )}
          </div>

          <RecentScans
            className="order-3 lg:min-h-0"
            records={recent}
            activeId={activeId}
            onSelect={(record) => {
              setActiveId(record.id)
              review(record)
            }}
            onClear={clearRecent}
          />
        </div>

        <section
          ref={resultRef}
          aria-label="Lookup result"
          aria-live="polite"
          aria-busy={loading}
          className="order-2 scroll-mt-24 lg:col-start-2 lg:row-start-1"
        >
          <ResultArea
            state={state}
            api={api}
            onChoose={(itemCode) => lastBarcode && void submit(lastBarcode, { itemCode })}
            onSignInAgain={signInAgain}
          />
        </section>
      </main>

      {!scanVisible && (
        <button
          type="button"
          onClick={scanNext}
          className="fixed end-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 inline-flex min-h-14 animate-rise items-center gap-2 rounded-full bg-brand-fill ps-5 pe-6 text-base font-extrabold text-white shadow-lg shadow-black/25 hover:bg-brand-fill-hover lg:hidden"
        >
          <ScanBarcode className="size-5" aria-hidden /> Scan next
        </button>
      )}
    </div>
  )
}
