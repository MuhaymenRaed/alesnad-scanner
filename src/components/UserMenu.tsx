import { useClerk, useUser } from '@clerk/react'
import { ChevronDown, LogOut } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

/**
 * Account menu drawn in the app's own style (no Clerk-branded UI): avatar, name and email,
 * and sign-out. Closes on outside click, Escape, or after choosing an item.
 */
export function UserMenu() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const name = user?.fullName || user?.username || ''
  const email = user?.primaryEmailAddress?.emailAddress ?? ''
  const label = name || email || 'Account'

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account: ${label}`}
        className="flex min-h-11 items-center gap-2 rounded-full py-1 ps-1 pe-2 text-white hover:bg-white/10 sm:pe-3"
      >
        {user?.hasImage ? (
          <img src={user.imageUrl} alt="" className="size-9 rounded-full object-cover ring-2 ring-white/20" />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-[#e11d2e] text-sm font-bold">{initials(label)}</span>
        )}
        <span className="hidden max-w-40 truncate text-sm font-semibold md:block" dir="auto">
          {label}
        </span>
        <ChevronDown className={`size-4 opacity-80 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div
          id={panelId}
          data-popover
          className="absolute end-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] origin-top-right animate-rise overflow-hidden rounded-card border border-line bg-surface text-ink shadow-xl"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-bold" dir="auto">
              {name || 'Signed in'}
            </p>
            {email && <p className="truncate text-sm text-muted">{email}</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void signOut({ redirectUrl: '/sign-in' })
            }}
            className="flex min-h-12 w-full items-center gap-3 px-4 text-start text-sm font-bold text-danger hover:bg-subtle"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
