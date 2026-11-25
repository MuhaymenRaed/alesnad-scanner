import { CheckCircle2, CircleSlash, History, ListTree, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ScanRecord } from '../hooks/useProductLookup'
import { currencyLabel, formatAmount, formatTime } from '../lib/format'
import { statusCopy } from '../lib/messages'
import { card } from './ui'

function summary(record: ScanRecord): { icon: ReactNode; label: string; detail: string; price?: string } {
  const r = record.result
  if (r.status === 'found') {
    const price = r.product.price.status === 'available' ? `${formatAmount(r.product.price.amount, r.product.price.currency)} ${currencyLabel(r.product.price.currency)}` : 'بدون سعر'
    return { icon: <CheckCircle2 className="size-4 text-success" aria-hidden />, label: 'تم العثور', detail: r.product.itemName, price }
  }
  if (r.status === 'ambiguous') {
    return { icon: <ListTree className="size-4 text-warning" aria-hidden />, label: 'عدة نتائج', detail: `${r.candidates.length} منتجات تحمل هذا الباركود` }
  }
  const copy = statusCopy(r.error.code)
  const notFound = r.error.code === 'ITEM_NOT_FOUND'
  return {
    icon: notFound ? <CircleSlash className="size-4 text-warning" aria-hidden /> : <XCircle className="size-4 text-danger" aria-hidden />,
    label: notFound ? 'غير موجود' : 'فشل',
    detail: copy.title,
  }
}

/** Session-only scan history (kept in memory: cleared on reload or sign-out, never stored). */
export function RecentScans(props: {
  records: ScanRecord[]
  activeId: number | null
  onSelect(record: ScanRecord): void
  onClear(): void
  className?: string
}) {
  return (
    <section aria-labelledby="recent-heading" className={`flex min-h-0 flex-col ${card} ${props.className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 id="recent-heading" className="flex items-center gap-2 font-extrabold">
          <History className="size-4 text-brand" aria-hidden /> آخر عمليات المسح
        </h2>
        {props.records.length > 0 && (
          <button type="button" onClick={props.onClear} className="min-h-10 rounded-chip px-3 text-sm font-bold text-muted hover:bg-subtle hover:text-ink">
            مسح القائمة
          </button>
        )}
      </div>
      {props.records.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">ستظهر هنا المنتجات التي تمسحها في هذه الجلسة.</p>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain">
          {props.records.map((record) => {
            const s = summary(record)
            const active = record.id === props.activeId
            return (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => props.onSelect(record)}
                  aria-current={active ? 'true' : undefined}
                  className="relative flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-subtle aria-[current]:bg-brand/6 aria-[current]:before:absolute aria-[current]:before:inset-y-0 aria-[current]:before:start-0 aria-[current]:before:w-1 aria-[current]:before:bg-brand"
                >
                  <span>{s.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      <span className="sr-only">{s.label}: </span>
                      <bdi>{s.detail}</bdi>
                    </span>
                    <span dir="ltr" className="block truncate text-end font-mono text-xs text-muted">
                      {record.barcode}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    {s.price && <span className="text-sm font-extrabold tabular-nums">{s.price}</span>}
                    <time dateTime={record.at.toISOString()} className="text-xs text-muted tabular-nums">
                      {formatTime(record.at)}
                    </time>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <p className="border-t border-line px-4 py-2 text-xs text-muted">قائمة مؤقتة — تُمسح عند إعادة تحميل الصفحة أو تسجيل الخروج.</p>
    </section>
  )
}
