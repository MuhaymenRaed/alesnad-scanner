import { AlertOctagon, ChevronDown, ImageOff, Loader2, Package } from 'lucide-react'
import type { Product } from '../../shared/api'
import { useProductImage } from '../hooks/useProductImage'
import type { ApiClient } from '../lib/api'
import { PriceDisplay } from './PriceDisplay'
import { card } from './ui'

function Detail({ label, value, mono }: { label: string; value: string | number | boolean; mono?: boolean }) {
  const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold tracking-wide text-muted uppercase">{label}</dt>
      {/* <bdi> renders Arabic/mixed ERPNext text correctly without flipping the layout. */}
      <dd className={`mt-0.5 font-semibold wrap-break-word ${mono ? 'font-mono text-[0.95rem]' : ''}`}>
        <bdi>{text}</bdi>
      </dd>
    </div>
  )
}

function ProductImage({ api, product }: { api: Pick<ApiClient, 'image'>; product: Product }) {
  const image = useProductImage(api, product.itemCode, product.hasImage)
  return (
    <div className="flex aspect-square w-20 shrink-0 items-center justify-center self-start overflow-hidden rounded-card border border-line bg-subtle @md:w-28">
      {image.status === 'loaded' ? (
        <img src={image.url} alt={product.itemName} className="size-full object-contain" />
      ) : image.status === 'loading' ? (
        <Loader2 className="size-6 text-muted motion-safe:animate-spin" aria-label="Loading image" />
      ) : product.hasImage ? (
        <ImageOff className="size-8 text-muted" aria-label="Image unavailable" />
      ) : (
        <Package className="size-9 text-muted" aria-label="No product image" />
      )}
    </div>
  )
}

/** Product metadata (secondary information) in a collapsible section. */
function ProductMetadata({ product }: { product: Product }) {
  const rows: Array<{ label: string; value: string | number | boolean; mono?: boolean }> = [
    { label: 'Item group', value: product.itemGroup ?? '' },
    { label: 'Brand', value: product.brand ?? '' },
    { label: 'Stock unit', value: product.stockUom ?? '' },
    { label: 'Barcode type', value: product.barcodeType ?? '' },
    { label: 'Weight', value: product.weight ? `${product.weight.value} ${product.weight.uom ?? ''}`.trim() : '' },
    { label: 'Stock item', value: product.isStockItem ?? '' },
    { label: 'Variant of', value: product.variantOf ?? '', mono: true },
    { label: 'Has variants', value: product.hasVariants ? true : '' },
    ...product.metadata.map((entry) => ({ label: entry.label, value: entry.value })),
  ].filter((row) => row.value !== '')

  const conversions = product.uomConversions.filter((c) => c.factor !== 1)

  if (rows.length === 0 && conversions.length === 0) return null
  return (
    <details className="group rounded-card border border-line" open>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-card px-4 font-extrabold hover:bg-subtle [&::-webkit-details-marker]:hidden">
        More details <span lang="ar" className="ms-1.5 me-auto font-semibold text-muted">· تفاصيل</span>
        <ChevronDown className="size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 pb-4 @2xl:grid-cols-3">
        {rows.map((row) => (
          <Detail key={row.label} {...row} />
        ))}
        {conversions.length > 0 && (
          <Detail label="Unit conversions" value={conversions.map((c) => `1 ${c.uom} = ${c.factor} ${product.stockUom ?? ''}`.trim()).join(' · ')} />
        )}
      </dl>
    </details>
  )
}

export function ProductDetails({ product, api }: { product: Product; api: Pick<ApiClient, 'image'> }) {
  return (
    <article className={`@container animate-rise space-y-4 p-4 sm:p-6 ${card}`} aria-labelledby="product-name">
      {product.disabled && (
        <p className="flex items-center gap-2 rounded-control border border-danger/40 bg-danger/8 px-3 py-2.5 font-bold text-danger" role="alert">
          <AlertOctagon className="size-5 shrink-0" aria-hidden /> This product is disabled in ERPNext — do not sell it without checking.
        </p>
      )}

      <div className="flex gap-4">
        <ProductImage api={api} product={product} />
        <div className="min-w-0 flex-1">
          <h2 id="product-name" className="text-[1.45rem] leading-tight font-extrabold tracking-[-0.025em] @md:text-3xl">
            <bdi>{product.itemName}</bdi>
          </h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 @md:grid-cols-3">
            <Detail label="Item code" value={product.itemCode} mono />
            <Detail
              label={product.matchedBy === 'barcode' ? 'Barcode' : 'Matched by'}
              value={product.matchedBy === 'barcode' ? (product.barcode ?? '') : 'Item code (no barcode)'}
              mono={product.matchedBy === 'barcode'}
            />
            <Detail label="Unit" value={product.barcodeUom ? `${product.uom} (barcode unit)` : product.uom} />
          </dl>
        </div>
      </div>

      <PriceDisplay price={product.price} />

      {product.description && (
        <section>
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">Description</h3>
          <p className="mt-1 whitespace-pre-line text-ink/90">
            <bdi>{product.description}</bdi>
          </p>
        </section>
      )}

      <ProductMetadata product={product} />
    </article>
  )
}
