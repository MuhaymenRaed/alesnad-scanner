import { ChevronLeft } from 'lucide-react'
import type { AmbiguousCandidate } from '../../shared/api'
import { StatusMessage } from './StatusMessage'
import { card } from './ui'

/** Shown when one barcode is assigned to several Items: the user picks; the server re-validates. */
export function AmbiguousMatches(props: { barcode: string; candidates: AmbiguousCandidate[]; onChoose(itemCode: string): void }) {
  return (
    <div className="space-y-3">
      <StatusMessage tone="warning" title="هذا الباركود مرتبط بأكثر من منتج">
        الباركود <span dir="ltr" className="font-mono">{props.barcode}</span> مسجّل على {props.candidates.length} منتجات في النظام. اختر المنتج الصحيح، واطلب من المسؤول تصحيح الباركود المكرر.
      </StatusMessage>
      <ul className={`divide-y divide-line overflow-hidden ${card}`}>
        {props.candidates.map((candidate) => (
          <li key={candidate.itemCode}>
            <button type="button" onClick={() => props.onChoose(candidate.itemCode)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start hover:bg-subtle">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">
                  <bdi>{candidate.itemName}</bdi>
                </span>
                <span className="block text-sm text-muted">
                  <span dir="ltr" className="font-mono">
                    {candidate.itemCode}
                  </span>
                  {candidate.itemGroup && (
                    <>
                      {' '}
                      · <bdi>{candidate.itemGroup}</bdi>
                    </>
                  )}
                </span>
              </span>
              {candidate.disabled && <span className="rounded-chip bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">معطّل</span>}
              <ChevronLeft className="size-5 text-muted ltr:rotate-180" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
