import { ScanBarcode, ShieldCheck, Tag } from 'lucide-react'
import type { ReactNode } from 'react'
import { BrandLockup, BrandMark, ShopSign } from '../components/BrandMark'

/**
 * Two-column auth layout in the shop's identity: the form on one side, the charcoal "shop sign"
 * on the other (wide screens). Phones and iPad portrait get a slim sign band above the form.
 * `my-auto` centres the form only while it fits, so a short screen with the keyboard up scrolls
 * instead of pushing the first field out of reach (same rule as the storefront's auth layout).
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
      <div className="flex min-w-0 flex-col">
        {/* Compact sign band — phones and tablets in portrait */}
        <div className="relative overflow-hidden bg-charcoal pt-[env(safe-area-inset-top)] lg:hidden">
          <div className="absolute -end-10 -top-16 size-48 rounded-full bg-[#e11d2e]/25 blur-3xl" aria-hidden />
          <div className="relative mx-auto flex max-w-[440px] items-center px-5 py-5 sm:py-7">
            <BrandLockup subtitle="ماسح المنتجات والأسعار" />
          </div>
          <div className="h-[3px] bg-[#e11d2e]" aria-hidden />
        </div>

        <div className="hidden items-center px-10 pt-8 lg:flex">
          <BrandLockup tone="onLight" subtitle="ماسح المنتجات والأسعار" />
        </div>

        <div className="flex flex-1 flex-col px-5 py-8 sm:px-8 sm:py-10">
          <div className="mx-auto my-auto w-full max-w-[400px] animate-rise">{children}</div>
        </div>

        <p className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-muted">
          شركة الاسناد لتجارة الهاتف النقال · للموظفين المخوّلين فقط
        </p>
      </div>

      {/* The shop sign — decorative, hidden from assistive tech and from narrow screens */}
      <aside className="relative hidden flex-col items-center justify-center gap-12 overflow-hidden bg-charcoal px-12 py-16 lg:flex" aria-hidden>
        <div className="absolute -end-24 -top-24 size-80 rounded-full bg-[#e11d2e]/25 blur-3xl motion-safe:animate-pulse" />
        <div className="absolute -start-20 -bottom-28 size-96 rounded-full bg-white/5 blur-3xl" />
        <BrandMark className="absolute -bottom-24 -start-24 size-96 opacity-[0.04]" plate="#ffffff" dot="#ffffff" />

        <div className="relative rounded-panel border border-white/10 bg-sign/60 px-14 py-12 shadow-2xl backdrop-blur-sm">
          <ShopSign />
        </div>

        <ul className="relative grid w-full max-w-md gap-3 text-white/90">
          <li className="flex items-center gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <ScanBarcode className="size-5" />
            </span>
            <span className="font-bold">امسح بماسح USB أو بلوتوث أو بكاميرا الهاتف</span>
          </li>
          <li className="flex items-center gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Tag className="size-5" />
            </span>
            <span className="font-bold">أسعار البيع مباشرة من نظام ERPNext</span>
          </li>
          <li className="flex items-center gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <ShieldCheck className="size-5" />
            </span>
            <span className="font-bold">للموظفين فقط — كل طلب يتم التحقق منه</span>
          </li>
        </ul>
      </aside>
    </div>
  )
}
