import { CircleSlash } from 'lucide-react'
import type { SellingPrice } from '../../shared/api'
import { currencyLabel, formatAmount, formatDate, uomLabel } from '../lib/format'
import { PRICE_REASON } from '../lib/messages'

/**
 * The selling price — the most important number on screen. Drawn on the dark product header.
 * An unavailable price is an explicit "لا يوجد سعر" state with the reason — never 0.
 */
export function PriceDisplay({ price }: { price: SellingPrice }) {
  if (price.status === 'unavailable') {
    return (
      <div className="rounded-card border border-dashed border-amber-300/50 bg-amber-300/10 p-4" data-testid="price">
        <p className="text-xs font-bold text-amber-200">سعر البيع</p>
        <p className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-white">
          <CircleSlash className="size-6 shrink-0 text-amber-300" aria-hidden /> لا يوجد سعر
        </p>
        <p className="mt-1 text-sm text-white/80">{PRICE_REASON[price.reason]}</p>
        {price.availableUoms && price.availableUoms.length > 0 && (
          <p className="mt-1 text-sm text-white/80">يوجد سعر للوحدات: {price.availableUoms.map(uomLabel).join('، ')}</p>
        )}
        <p className="mt-2 text-xs text-white/60">
          قائمة الأسعار: <bdi>{price.priceList}</bdi>
        </p>
      </div>
    )
  }

  return (
    <div data-testid="price">
      <p className="text-xs font-bold text-white/60">سعر البيع</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span dir="ltr" className="text-[2.9rem] leading-none font-extrabold tracking-tight tabular-nums @md:text-6xl">
          {formatAmount(price.amount, price.currency)}
        </span>
        <span className="text-2xl font-bold text-[#ff4b59] @md:text-3xl" aria-label={`العملة ${price.currency}`}>
          {currencyLabel(price.currency)}
        </span>
        <span className="text-base font-semibold text-white/70">لكل {uomLabel(price.uom)}</span>
      </p>
      {price.uomMatch === 'stock_uom_fallback' && (
        <p className="mt-3 rounded-chip bg-white/10 px-3 py-2 text-sm">
          تنبيه: هذا الباركود لوحدة <strong>{uomLabel(price.requestedUom)}</strong> لكن السعر المسجّل في النظام لكل <strong>{uomLabel(price.uom)}</strong>.
        </p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/60">
        <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-white/85">
          قائمة الأسعار: <bdi>{price.priceList}</bdi>
        </span>
        {price.validFrom && <span>ساري من {formatDate(price.validFrom)}</span>}
        {price.validUpto && <span>حتى {formatDate(price.validUpto)}</span>}
      </p>
    </div>
  )
}
