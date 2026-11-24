import { useCallback, useEffect, useRef, useState } from 'react'
import type { AmbiguousCandidate, ApiError, Product } from '../../shared/api'
import { validateBarcode } from '../../shared/barcode'
import { isAbortError, type ApiClient } from '../lib/api'

export type LookupState =
  | { status: 'idle' }
  | { status: 'loading'; barcode: string }
  | { status: 'found'; barcode: string; product: Product }
  | { status: 'ambiguous'; barcode: string; candidates: AmbiguousCandidate[] }
  | { status: 'error'; barcode: string | null; error: ApiError }

export interface ScanRecord {
  id: number
  barcode: string
  at: Date
  /** Snapshot of the final state for this scan, so it can be reviewed without a new request. */
  result: Exclude<LookupState, { status: 'idle' } | { status: 'loading' }>
}

const MAX_RECENT = 15
/** A second submission of the same barcode within this window is treated as a duplicate (e.g. CR+LF). */
const DUPLICATE_WINDOW_MS = 800

export function useProductLookup(api: Pick<ApiClient, 'lookup'>) {
  const [state, setState] = useState<LookupState>({ status: 'idle' })
  const [recent, setRecent] = useState<ScanRecord[]>([])

  const latestRequest = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const inFlightKey = useRef<string | null>(null)
  const lastSubmit = useRef<{ key: string; at: number } | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const submit = useCallback(
    async (raw: string, options: { itemCode?: string } = {}) => {
      const parsed = validateBarcode(raw)
      if (!parsed.ok) {
        // A stray Enter right after a scan (scanners that send CR+LF) is silently ignored.
        if (parsed.reason === 'empty' && lastSubmit.current && Date.now() - lastSubmit.current.at < DUPLICATE_WINDOW_MS) return
        setState({ status: 'error', barcode: null, error: { code: 'INVALID_BARCODE', message: parsed.message } })
        return
      }

      const barcode = parsed.value
      const key = `${barcode}\u0000${options.itemCode ?? ''}`
      const now = Date.now()
      // Ignore duplicates: the same lookup already running, or re-sent within the duplicate window.
      if (inFlightKey.current === key) return
      if (lastSubmit.current?.key === key && now - lastSubmit.current.at < DUPLICATE_WINDOW_MS) return
      lastSubmit.current = { key, at: now }

      // A newer scan supersedes an older one: abort it, and ignore its result if it still arrives.
      controller.current?.abort()
      const abort = new AbortController()
      controller.current = abort
      const requestId = ++latestRequest.current
      inFlightKey.current = key
      setState({ status: 'loading', barcode })

      let next: ScanRecord['result']
      try {
        const result = await api.lookup(barcode, options.itemCode, abort.signal)
        if (requestId !== latestRequest.current) return
        if (result.ok) next = { status: 'found', barcode, product: result.data }
        else if (result.error.code === 'AMBIGUOUS_BARCODE' && result.error.candidates?.length)
          next = { status: 'ambiguous', barcode, candidates: result.error.candidates }
        else next = { status: 'error', barcode, error: result.error }
      } catch (error) {
        if (isAbortError(error) || requestId !== latestRequest.current) return
        next = { status: 'error', barcode, error: { code: 'NETWORK_ERROR', message: 'The lookup failed. Try again.' } }
      } finally {
        if (requestId === latestRequest.current) inFlightKey.current = null
      }

      setState(next)
      setRecent((list) => [{ id: requestId, barcode, at: new Date(), result: next }, ...list].slice(0, MAX_RECENT))
    },
    [api],
  )

  /** Show a previous scan's result again (no new request). */
  const review = useCallback((record: ScanRecord) => {
    controller.current?.abort()
    latestRequest.current++
    inFlightKey.current = null
    setState(record.result)
  }, [])

  const clearRecent = useCallback(() => setRecent([]), [])

  return { state, recent, submit, review, clearRecent }
}
