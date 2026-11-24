import { BrandLockup } from './BrandMark'
import { UserMenu } from './UserMenu'

/** The shop sign as an app bar: charcoal, white mark, red name — the same in light and dark. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 bg-charcoal pt-[env(safe-area-inset-top)] text-white shadow-[0_1px_0_rgb(255_255_255/0.06)]">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] sm:px-6">
        <BrandLockup subtitle="Product Scanner · ماسح المنتجات" />
        <div className="ms-auto">
          <UserMenu />
        </div>
      </div>
      <div className="h-[3px] bg-[#e11d2e]" aria-hidden />
    </header>
  )
}
