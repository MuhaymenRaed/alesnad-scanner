import { useCallback, useEffect, useRef, useState } from 'react'
import type { AmbiguousCandidate, ApiError, Product } from '../../shared/api'
import { validateBarcode } from '../../shared/barcode'
import { isAbortError, type ApiClient } from '../lib/api'

export type LookupState =
  | { status: 'idle' }
  | { status: 'loading'; barcode: string }
  | { status: 'found'; barcode: string; product: Product; itemCode?: string; fetchedAt: number }
  | { status: 'ambiguous'; barcode: string; candidates: AmbiguousCandidate[] }
  | { status: 'error'; barcode: string | null; error: ApiError }

export interface ScanRecord {
  id: number
  barcode: string
  at: Date
  /** Latest known result for this scan (kept fresh by live refreshes). */
  result: Exclude<LookupState, { status: 'idle' } | { status: 'loading' }>
}

const MAX_RECENT = 15
/** A second submission of the same barcode within this window is treated as a duplicate (e.g. CR+LF). */
const DUPLICATE_WINDOW_MS = 800

export function useProductLookup(api: Pick<ApiClient, 'lookup'>) {
  const [state, setState] = useState<LookupState>({ status: 'idle' })
  const [recent, setRecent] = useState<ScanRecord[]>([])

  const stateRef = useRef(state)
  const latestRequest = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const inFlightKey = useRef<string | null>(null)
  const lastSubmit = useRef<{ key: string; at: number } | null>(null)
  const activeRecordId = useRef<number | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])
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
        if (result.ok) next = { status: 'found', barcode, product: result.data, itemCode: options.itemCode, fetchedAt: Date.now() }
        else if (result.error.code === 'AMBIGUOUS_BARCODE' && result.error.candidates?.length)
          next = { status: 'ambiguous', barcode, candidates: result.error.candidates }
        else next = { status: 'error', barcode, error: result.error }
      } catch (error) {
        if (isAbortError(error) || requestId !== latestRequest.current) return
        next = { status: 'error', barcode, error: { code: 'NETWORK_ERROR', message: 'The lookup failed. Try again.' } }
      } finally {
        if (requestId === latestRequest.current) inFlightKey.current = null
      }

      activeRecordId.current = requestId
      setState(next)
      setRecent((list) => [{ id: requestId, barcode, at: new Date(), result: next }, ...list].slice(0, MAX_RECENT))
    },
    [api],
  )

  /**
   * Re-reads the product on screen from ERPNext without a loading flash, so edits made in ERPNext
   * (name, price…) appear by themselves. Network hiccups keep the current data; a product that no
   * longer exists switches to the error state.
   */
  const refresh = useCallback(async () => {
    const current = stateRef.current
    if (current.status !== 'found' || inFlightKey.current) return
    const abort = new AbortController()
    controller.current?.abort()
    controller.current = abort
    const requestId = ++latestRequest.current
    try {
      const result = await api.lookup(current.barcode, current.itemCode, abort.signal)
      if (requestId !== latestRequest.current) return
      let next: ScanRecord['result'] | null = null
      if (result.ok) next = { ...current, product: result.data, fetchedAt: Date.now() }
      else if (['ITEM_NOT_FOUND', 'ITEM_DISABLED', 'ITEM_OUT_OF_SCOPE'].includes(result.error.code)) {
        next = { status: 'error', barcode: current.barcode, error: result.error }
      }
      if (!next) return
      setState(next)
      const recordId = activeRecordId.current
      setRecent((list) => list.map((record) => (record.id === recordId ? { ...record, result: next } : record)))
    } catch {
      // Aborted or offline: keep showing the last good data.
    }
  }, [api])

  /** Show a previous scan right away, then re-read it live from ERPNext. */
  const review = useCallback(
    (record: ScanRecord) => {
      controller.current?.abort()
      latestRequest.current++
      inFlightKey.current = null
      activeRecordId.current = record.id
      stateRef.current = record.result
      setState(record.result)
      if (record.result.status === 'found') void refresh()
    },
    [refresh],
  )

  const clearRecent = useCallback(() => setRecent([]), [])

  return { state, recent, submit, refresh, review, clearRecent }
}
