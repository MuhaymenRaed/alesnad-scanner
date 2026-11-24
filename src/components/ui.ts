/**
 * Shared control styles, mirroring the Al Isnad storefront (`components/ui/button.tsx`,
 * `components/ui/field.tsx`): extra-bold labels, 12px control radius, 1.5px outlines, brand-red
 * primary. Every control is at least 44px tall (48px on touch screens).
 */
const base =
  'inline-flex min-h-11 coarse:min-h-12 items-center justify-center gap-2 rounded-control px-5 text-sm font-extrabold tracking-[-0.01em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed'

export const primaryButton = `${base} bg-brand-fill text-white hover:bg-brand-fill-hover disabled:bg-line disabled:text-muted`
export const darkButton = `${base} bg-charcoal text-white hover:bg-sign dark:bg-subtle dark:hover:bg-line`
export const outlineButton = `${base} border-[1.5px] border-line bg-surface font-bold text-ink hover:border-line-strong`
export const ghostButton =
  'inline-flex min-h-11 items-center gap-1 rounded-chip px-1 text-sm font-bold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand disabled:opacity-60'

export const fieldInput =
  'w-full min-h-12 rounded-control border border-line bg-surface px-4 text-base font-medium text-ink transition-colors placeholder:text-muted hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger'
export const fieldLabel = 'text-[0.8rem] font-bold text-ink'
export const card = 'rounded-panel border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]'
