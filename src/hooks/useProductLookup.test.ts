import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiResult } from '../lib/api'
import type { Product } from '../../shared/api'
import { deferred, productFixture } from '../test/fixtures'
import { useProductLookup } from './useProductLookup'

type LookupFn = (barcode: string, itemCode?: string, signal?: AbortSignal) => Promise<ApiResult<Product>>

function setup(lookup: LookupFn) {
  const api = { lookup: vi.fn(lookup) }
  const hook = renderHook(() => useProductLookup(api))
  return { api, hook }
}

describe('useProductLookup', () => {
  it('goes idle → loading → found and records the scan', async () => {
    const pending = deferred<ApiResult<Product>>()
    const { hook } = setup(() => pending.promise)
    expect(hook.result.current.state.status).toBe('idle')

    act(() => void hook.result.current.submit('0123456789012'))
    expect(hook.result.current.state).toEqual({ status: 'loading', barcode: '0123456789012' })

    await act(async () => pending.resolve({ ok: true, data: productFixture() }))
    expect(hook.result.current.state.status).toBe('found')
    expect(hook.result.current.recent).toHaveLength(1)
    expect(hook.result.current.recent[0]!.barcode).toBe('0123456789012')
  })

  it('passes the barcode as a trimmed string with leading zeros intact', async () => {
    const { api, hook } = setup(async () => ({ ok: true, data: productFixture() }))
    await act(() => hook.result.current.submit('  000042 \n'))
    expect(api.lookup).toHaveBeenCalledWith('000042', undefined, expect.any(AbortSignal))
  })

  it('rejects empty input locally without calling the API', async () => {
    const { api, hook } = setup(async () => ({ ok: true, data: productFixture() }))
    await act(() => hook.result.current.submit('   '))
    expect(hook.result.current.state).toMatchObject({ status: 'error', error: { code: 'INVALID_BARCODE' } })
    expect(api.lookup).not.toHaveBeenCalled()
  })

  it('ignores a duplicate submission of the same barcode (double Enter / repeated handler)', async () => {
    const pending = deferred<ApiResult<Product>>()
    const { api, hook } = setup(() => pending.promise)
    act(() => {
      void hook.result.current.submit('111')
      void hook.result.current.submit('111')
    })
    // A stray empty Enter right after a scan is ignored too (CR+LF scanners).
    act(() => void hook.result.current.submit(''))
    expect(api.lookup).toHaveBeenCalledTimes(1)
    expect(hook.result.current.state.status).toBe('loading')
    await act(async () => pending.resolve({ ok: true, data: productFixture() }))
  })

  it('never lets an older response overwrite a newer scan', async () => {
    const first = deferred<ApiResult<Product>>()
    const second = deferred<ApiResult<Product>>()
    const signals: AbortSignal[] = []
    const { hook } = setup((barcode, _itemCode, signal) => {
      signals.push(signal!)
      return barcode === 'AAA' ? first.promise : second.promise
    })

    act(() => void hook.result.current.submit('AAA'))
    act(() => void hook.result.current.submit('BBB'))
    expect(signals[0]!.aborted).toBe(true)

    await act(async () => second.resolve({ ok: true, data: productFixture({ itemName: 'Second' }) }))
    await act(async () => first.resolve({ ok: true, data: productFixture({ itemName: 'First (stale)' }) }))

    const state = hook.result.current.state
    expect(state.status === 'found' && state.product.itemName).toBe('Second')
    expect(hook.result.current.recent.map((r) => r.barcode)).toEqual(['BBB'])
  })

  it('maps API failures to error / ambiguous states', async () => {
    const { hook } = setup(async (barcode) =>
      barcode === 'dup'
        ? { ok: false, status: 409, error: { code: 'AMBIGUOUS_BARCODE', message: 'x', candidates: [{ itemCode: 'A', itemName: 'A', itemGroup: null, disabled: false }] } }
        : { ok: false, status: 404, error: { code: 'ITEM_NOT_FOUND', message: 'No product was found for this barcode.' } },
    )
    await act(() => hook.result.current.submit('nope'))
    expect(hook.result.current.state).toMatchObject({ status: 'error', barcode: 'nope', error: { code: 'ITEM_NOT_FOUND' } })
    await act(() => hook.result.current.submit('dup'))
    expect(hook.result.current.state).toMatchObject({ status: 'ambiguous', barcode: 'dup' })
  })

  it('reviews a previous scan instantly, then re-reads it live from ERPNext', async () => {
    let version = 1
    const { api, hook } = setup(async (barcode) => ({ ok: true, data: productFixture({ itemName: `${barcode} v${version}` }) }))
    await act(() => hook.result.current.submit('first'))
    await act(() => hook.result.current.submit('second'))
    version = 2 // the product was edited in ERPNext meanwhile
    act(() => hook.result.current.review(hook.result.current.recent[1]!))
    const snapshot = hook.result.current.state
    expect(snapshot.status === 'found' && snapshot.product.itemName).toBe('first v1')
    await waitFor(() => {
      const state = hook.result.current.state
      expect(state.status === 'found' && state.product.itemName).toBe('first v2')
    })
    expect(api.lookup).toHaveBeenCalledTimes(3)
    expect(hook.result.current.recent).toHaveLength(2) // refreshes never add entries
  })

  it('refresh() updates the product on screen without a loading state', async () => {
    let price = 10
    const { hook } = setup(async () => ({ ok: true, data: productFixture({ sellingPrice: price }) }))
    await act(() => hook.result.current.submit('abc'))
    price = 15
    let refreshing: Promise<void> | undefined
    act(() => {
      refreshing = hook.result.current.refresh()
    })
    expect(hook.result.current.state.status).toBe('found')
    await act(() => refreshing!)
    const state = hook.result.current.state
    expect(state.status === 'found' && state.product.sellingPrice).toBe(15)
  })
})
