import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api'

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('api client', () => {
  it('sends the Clerk session token as a Bearer header and keeps the barcode a string', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true, data: { itemCode: 'X' } }))
    const api = createApiClient(async () => 'token-1', fetchImpl)
    const result = await api.lookup('000123')
    expect(result).toEqual({ ok: true, data: { itemCode: 'X' } })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/items/lookup?barcode=000123')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-1' })
  })

  it('on 401 refreshes the token (skipCache) and retries once', async () => {
    const getToken = vi.fn(async (options?: { skipCache?: boolean }) => (options?.skipCache ? 'fresh' : 'stale'))
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'x' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { userId: 'u', access: 'granted' } }))
    const result = await createApiClient(getToken, fetchImpl).session()
    expect(result.ok).toBe(true)
    expect(getToken).toHaveBeenLastCalledWith({ skipCache: true })
    expect((fetchImpl.mock.calls[1]![1] as RequestInit).headers).toEqual({ Authorization: 'Bearer fresh' })
  })

  it('reports UNAUTHENTICATED when the fresh token is rejected too', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'expired' } }))
    const result = await createApiClient(async () => 't', fetchImpl).lookup('1')
    expect(result).toMatchObject({ ok: false, status: 401, error: { code: 'UNAUTHENTICATED' } })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('reports SESSION_ENDED without calling the backend when Clerk has no session', async () => {
    const fetchImpl = vi.fn()
    const result = await createApiClient(async () => null, fetchImpl).lookup('1')
    expect(result).toMatchObject({ ok: false, error: { code: 'SESSION_ENDED' } })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps network failures and non-JSON responses', async () => {
    const offline = createApiClient(async () => 't', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await offline.lookup('1')).toMatchObject({ ok: false, error: { code: 'NETWORK_ERROR' } })
    const html = createApiClient(async () => 't', vi.fn(async () => new Response('<html>', { status: 502 })))
    expect(await html.lookup('1')).toMatchObject({ ok: false, status: 502, error: { code: 'BAD_RESPONSE' } })
  })
})
