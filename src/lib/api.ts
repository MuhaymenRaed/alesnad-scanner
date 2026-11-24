import type { ApiError, ApiResponse, Product, SessionInfo } from '../../shared/api'

/**
 * Typed client for OUR backend only. It never talks to ERPNext and holds no ERPNext secrets:
 * the only credential it sends is the signed-in user's short-lived Clerk session token.
 */

export type TokenGetter = (options?: { skipCache?: boolean }) => Promise<string | null>

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError }

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

const failure = (status: number, code: ApiError['code'], message: string): { ok: false; status: number; error: ApiError } => ({
  ok: false,
  status,
  error: { code, message },
})

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function createApiClient(getToken: TokenGetter, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  /**
   * Authenticated GET. On 401 it asks Clerk for a fresh token (skipCache) and retries once;
   * if Clerk has no session any more it reports SESSION_ENDED so the UI can return to sign-in.
   * Abort errors are re-thrown so callers can ignore superseded requests.
   */
  async function authedFetch(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<Response | ApiResult<never>> {
    const url = `${API_BASE}${path}?${new URLSearchParams(params).toString()}`
    const attempt = async (skipCache: boolean): Promise<Response | 'no-session'> => {
      const token = await getToken(skipCache ? { skipCache: true } : undefined)
      if (!token) return 'no-session'
      return fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal })
    }
    try {
      let response = await attempt(false)
      if (response !== 'no-session' && response.status === 401) response = await attempt(true)
      if (response === 'no-session') return failure(401, 'SESSION_ENDED', 'Your session has ended. Sign in again.')
      return response
    } catch (error) {
      if (isAbortError(error)) throw error
      return failure(0, 'NETWORK_ERROR', 'Cannot reach the scanner service. Check your connection and try again.')
    }
  }

  async function getJson<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<ApiResult<T>> {
    const response = await authedFetch(path, params, signal)
    if (!(response instanceof Response)) return response
    let body: ApiResponse<T>
    try {
      body = (await response.json()) as ApiResponse<T>
    } catch (error) {
      if (isAbortError(error)) throw error
      return failure(response.status, 'BAD_RESPONSE', 'The scanner service returned an unexpected response.')
    }
    if (body && body.success === true) return { ok: true, data: body.data }
    if (body && body.success === false && body.error?.code) return { ok: false, status: response.status, error: body.error }
    return failure(response.status, 'BAD_RESPONSE', 'The scanner service returned an unexpected response.')
  }

  return {
    session: (signal?: AbortSignal) => getJson<SessionInfo>('/api/session', {}, signal),

    lookup: (barcode: string, itemCode?: string, signal?: AbortSignal) =>
      getJson<Product>('/api/items/lookup', itemCode ? { barcode, itemCode } : { barcode }, signal),

    async image(itemCode: string, signal?: AbortSignal): Promise<Blob | null> {
      const response = await authedFetch('/api/items/image', { itemCode }, signal)
      if (!(response instanceof Response) || !response.ok) return null
      const blob = await response.blob()
      return blob.type.startsWith('image/') ? blob : null
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
