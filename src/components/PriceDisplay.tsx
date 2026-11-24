import { CircleSlash, Tag } from 'lucide-react'
import type { SellingPrice } from '../../shared/api'
import { formatAmount, formatDate } from '../lib/format'

/**
 * The selling price is the most important number on screen. An unavailable price is shown as
 * an explicit "No price" state — never as 0.
 */
export function PriceDisplay({ price }: { price: SellingPrice }) {
  if (price.status === 'unavailable') {
    return (
      <div className="rounded-card border-[1.5px] border-dashed border-warning/50 bg-warning/8 p-4" data-testid="price">
        <p className="text-xs font-extrabold tracking-widest text-warning uppercase">Selling price · <span lang="ar" className="tracking-normal normal-case">سعر البيع</span></p>
        <p className="mt-1.5 flex items-center gap-2 text-2xl font-extrabold">
          <CircleSlash className="size-6 text-warning" aria-hidden /> No price available
        </p>
        <p className="mt-1 text-sm text-ink/80">{price.message}</p>
        {price.availableUoms && price.availableUoms.length > 0 && (
          <p className="mt-1 text-sm text-ink/80">Prices exist for: {price.availableUoms.join(', ')}.</p>
        )}
        <p className="mt-2 text-xs font-semibold text-muted">
          Price list: <bdi>{price.priceList}</bdi>
        </p>
      </div>
    )
  }

  return (
    <div className="@container relative overflow-hidden rounded-card bg-charcoal p-4 text-white sm:p-5" data-testid="price">
      <div className="absolute inset-y-0 start-0 w-1.5 bg-[#e11d2e]" aria-hidden />
      <p className="flex items-center gap-1.5 ps-1 text-xs font-extrabold tracking-widest text-white/70 uppercase">
        <Tag className="size-3.5" aria-hidden /> Selling price · <span lang="ar" className="tracking-normal normal-case">سعر البيع</span>
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 ps-1">
        <span className="text-[2.6rem] leading-none font-extrabold tracking-[-0.03em] tabular-nums @md:text-6xl">
          {formatAmount(price.amount, price.currency)}
        </span>
        <span className="rounded-chip bg-[#e11d2e] px-2.5 py-1 text-base font-extrabold tracking-wide" aria-label={`currency ${price.currency}`}>
          {price.currency}
        </span>
        <span className="text-base font-semibold text-white/80">per {price.uom}</span>
      </p>
      {price.uomMatch === 'stock_uom_fallback' && (
        <p className="mt-3 rounded-chip bg-white/10 px-3 py-2 text-sm">
          Note: this barcode is for <strong>{price.requestedUom}</strong>, but ERPNext only has a price per <strong>{price.uom}</strong>.
        </p>
      )}
      <p className="mt-3 ps-1 text-xs font-medium text-white/70">
        Price list: <bdi>{price.priceList}</bdi>
        {price.validFrom && <> · valid from {formatDate(price.validFrom)}</>}
        {price.validUpto && <> · until {formatDate(price.validUpto)}</>}
      </p>
    </div>
  )
}
