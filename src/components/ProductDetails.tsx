import { AlertOctagon, Barcode, Hash, ImageOff, Loader2, Package, Boxes, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Product } from '../../shared/api'
import { useProductImage } from '../hooks/useProductImage'
import type { ApiClient } from '../lib/api'
import { fieldLabel, formatTime, uomLabel } from '../lib/format'
import { PriceDisplay } from './PriceDisplay'
import { card } from './ui'

function ProductImage({ api, product }: { api: Pick<ApiClient, 'image'>; product: Product }) {
  const image = useProductImage(api, product.itemCode, product.hasImage)
  if (!product.hasImage) return null
  return (
    <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-card bg-white @md:size-24">
      {image.status === 'loaded' ? (
        <img src={image.url} alt={product.itemName} className="size-full object-contain" />
      ) : image.status === 'loading' ? (
        <Loader2 className="size-6 text-stone-400 motion-safe:animate-spin" aria-label="جارٍ تحميل الصورة" />
      ) : (
        <ImageOff className="size-7 text-stone-400" aria-label="الصورة غير متاحة" />
      )}
    </div>
  )
}

/** One fact chip (barcode, item code, unit). Codes stay left-to-right. */
function Fact({ icon, label, value, code }: { icon: ReactNode; label: string; value: string; code?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-card bg-subtle px-3.5 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-muted">{label}</span>
        <span className={`block truncate font-bold ${code ? 'font-mono text-[0.95rem]' : ''}`} dir={code ? 'ltr' : undefined}>
          {code ? value : <bdi>{value}</bdi>}
        </span>
      </span>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | number | boolean }) {
  const text = typeof value === 'boolean' ? (value ? 'نعم' : 'لا') : String(value)
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-start font-semibold wrap-break-word">
        <bdi>{text}</bdi>
      </dd>
    </div>
  )
}

export function ProductDetails(props: { product: Product; api: Pick<ApiClient, 'image'>; fetchedAt?: number; onRefresh?: () => void }) {
  const { product } = props
  const rows: Array<{ label: string; value: string | number | boolean }> = [
    { label: 'المجموعة', value: product.itemGroup ?? '' },
    { label: 'العلامة التجارية', value: product.brand ?? '' },
    ...product.metadata.map((entry) => ({ label: fieldLabel(entry.field, entry.label), value: entry.value })),
    { label: 'وحدة المخزون', value: product.stockUom ? uomLabel(product.stockUom) : '' },
    { label: 'نوع الباركود', value: product.barcodeType ?? '' },
    { label: 'الوزن', value: product.weight ? `${product.weight.value} ${product.weight.uom ?? ''}`.trim() : '' },
    { label: 'مادة مخزنية', value: product.isStockItem ?? '' },
    { label: 'نسخة من', value: product.variantOf ?? '' },
    ...product.uomConversions
      .filter((c) => c.factor !== 1)
      .map((c) => ({ label: `1 ${uomLabel(c.uom)}`, value: `${c.factor} ${uomLabel(product.stockUom)}` })),
  ].filter((row) => row.value !== '')

  return (
    <article className={`@container animate-rise overflow-hidden ${card}`} aria-labelledby="product-name">
      {/* 1) Name and 2) price first — what staff need at a glance. */}
      <header className="relative space-y-5 bg-charcoal px-5 pt-5 pb-6 text-white sm:px-7 sm:pt-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-[#e11d2e]" aria-hidden />
        {product.disabled && (
          <p className="flex items-center gap-2 rounded-control bg-[#e11d2e]/20 px-3 py-2 text-sm font-bold text-white" role="alert">
            <AlertOctagon className="size-5 shrink-0" aria-hidden /> هذا المنتج معطّل في النظام — تأكّد قبل البيع.
          </p>
        )}
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 id="product-name" className="text-[1.6rem] leading-snug font-extrabold @md:text-[2.1rem]">
              <bdi>{product.itemName}</bdi>
            </h2>
            {product.erpItemName && (
              <p className="mt-1 text-sm text-white/60">
                <bdi>{product.erpItemName}</bdi>
              </p>
            )}
          </div>
          <ProductImage api={props.api} product={product} />
        </div>
        <div className="border-t border-white/10 pt-5">
          <PriceDisplay price={product.price} />
        </div>
      </header>

      <div className="space-y-5 p-5 sm:p-7">
        <div className="grid grid-cols-1 gap-2.5 @lg:grid-cols-3">
          <Fact
            icon={<Barcode className="size-4.5" aria-hidden />}
            label={product.matchedBy === 'barcode' ? 'الباركود' : 'طريقة المطابقة'}
            value={product.matchedBy === 'barcode' ? (product.barcode ?? '') : 'برمز المادة'}
            code={product.matchedBy === 'barcode'}
          />
          <Fact icon={<Hash className="size-4.5" aria-hidden />} label="رمز المادة" value={product.itemCode} code />
          <Fact icon={<Boxes className="size-4.5" aria-hidden />} label="الوحدة" value={uomLabel(product.uom)} />
        </div>

        {product.description && (
          <section>
            <h3 className="mb-1.5 text-sm font-bold text-muted">الوصف</h3>
            <p className="whitespace-pre-line leading-relaxed">
              <bdi>{product.description}</bdi>
            </p>
          </section>
        )}

        {rows.length > 0 && (
          <section>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-muted">
              <Package className="size-4" aria-hidden /> تفاصيل المنتج
            </h3>
            <dl className="grid gap-x-8 @2xl:grid-cols-2">
              {rows.map((row) => (
                <Detail key={row.label} {...row} />
              ))}
            </dl>
          </section>
        )}

        {props.fetchedAt && (
          <p className="flex items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
            <span className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              مباشر من النظام · آخر تحديث {formatTime(new Date(props.fetchedAt))}
            </span>
            {props.onRefresh && (
              <button type="button" onClick={props.onRefresh} className="inline-flex min-h-10 items-center gap-1.5 rounded-chip px-2 font-bold text-brand hover:bg-subtle">
                <RefreshCw className="size-4" aria-hidden /> تحديث
              </button>
            )}
          </p>
        )}
      </div>
    </article>
  )
}
