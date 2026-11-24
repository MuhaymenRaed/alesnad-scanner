/**
 * Al Isnad mark — a diamond plate with two slots cut in from the upper-right edge and the
 * red dot low on the start side. Geometry copied from the storefront's `lib/brand/mark.ts`
 * (measured against the shop's own artwork), so both apps draw the identical shape.
 */
const MARK_PATH =
  'M24 0 L48 24 L24 48 L0 24 Z M20.808 15.876 L22.769 17.836 L32.302 8.302 L30.342 6.342 Z M30.164 25.232 L32.124 27.192 L41.658 17.658 L39.698 15.698 Z'
const MARK_DOT = { cx: 20.669, cy: 27.326, r: 6.426 }

export function BrandMark({
  className = 'size-10',
  plate = 'var(--mark-ink)',
  dot = 'var(--mark-red)',
}: {
  className?: string
  plate?: string
  dot?: string
}) {
  return (
    <svg viewBox="0 0 48 48" className={`${className} shrink-0`} aria-hidden>
      <path d={MARK_PATH} fillRule="evenodd" fill={plate} />
      <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} fill={dot} />
    </svg>
  )
}

/** Compact lockup for bars (white mark on the charcoal sign colour). */
export function BrandLockup({ subtitle, tone = 'onDark' }: { subtitle?: string; tone?: 'onDark' | 'onLight' }) {
  const onDark = tone === 'onDark'
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <BrandMark className="size-9 sm:size-10" plate={onDark ? '#ffffff' : 'var(--mark-ink)'} />
      <span className="min-w-0 leading-tight">
        <span lang="ar" dir="rtl" className={`block truncate text-lg font-bold sm:text-xl ${onDark ? 'text-[#ff3b4a]' : 'text-brand'}`}>
          شركة الاسناد
        </span>
        {subtitle && (
          <span className={`block truncate text-xs font-medium ${onDark ? 'text-white/70' : 'text-muted'}`}>{subtitle}</span>
        )}
      </span>
    </span>
  )
}

/** The shop-sign composition: mark, red name, white tagline and the "SINCE 2004" pill. */
export function ShopSign({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg'
  return (
    <div lang="ar" dir="rtl" className="flex flex-col items-center text-center">
      <BrandMark className={large ? 'size-24' : 'size-14'} plate="#ffffff" />
      <p className={`mt-4 font-bold leading-none text-[#ff2a3c] ${large ? 'text-6xl' : 'text-4xl'}`}>شركة الاسناد</p>
      <p className={`mt-3 font-semibold text-white ${large ? 'text-2xl' : 'text-lg'}`}>لتجارة الهاتف النقال</p>
      <span dir="ltr" className="mt-3 rounded-full bg-[#e11d2e] px-3 py-0.5 text-xs font-bold tracking-wide text-white">
        SINCE 2004
      </span>
    </div>
  )
}
