/**
 * Low-level, READ-ONLY Frappe REST client.
 *
 * - Only GET requests exist here; there is deliberately no way to create, update or delete.
 * - Doctypes and method names are passed by our own code, never taken from user input.
 * - Every query parameter is URL-encoded via URLSearchParams (no string concatenation).
 * - The `Authorization: token key:secret` header is built here and never logged or returned.
 */

export type ErpNextErrorKind = 'auth' | 'permission' | 'not_found' | 'timeout' | 'unavailable' | 'upstream' | 'bad_response'

export class ErpNextError extends Error {
  readonly kind: ErpNextErrorKind
  readonly status?: number

  constructor(kind: ErpNextErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ErpNextError'
    this.kind = kind
    this.status = status
  }
}

/** [field, operator, value] or, for a child-table field, [childDoctype, field, operator, value]. */
export type FrappeFilter = [field: string, operator: string, value: unknown] | [doctype: string, field: string, operator: string, value: unknown]

export interface ListOptions {
  fields: string[]
  filters?: FrappeFilter[]
  /** Parent doctype — required by Frappe when listing a child table such as Item Barcode. */
  parent?: string
  orderBy?: string
  /** 0 = no limit. Defaults to 20 like Frappe itself. */
  limit?: number
}

export interface BinaryFile {
  contentType: string
  body: Buffer
}

export interface ErpNextClient {
  readonly baseUrl: string
  getList<T>(doctype: string, options: ListOptions): Promise<T[]>
  getDoc<T>(doctype: string, name: string): Promise<T>
  /** Calls a whitelisted read-only method with GET and returns the whole JSON body. */
  callGetMethod<T>(method: string, params?: Record<string, string>): Promise<T>
  /** Downloads a file that lives on the ERPNext host (path must start with /files/ or /private/files/). */
  getFile(path: string, maxBytes: number): Promise<BinaryFile>
}

export interface ErpNextClientOptions {
  baseUrl: string
  apiKey: string
  apiSecret: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

function classifyStatus(status: number): ErpNextErrorKind {
  if (status === 401) return 'auth'
  if (status === 403) return 'permission'
  if (status === 404) return 'not_found'
  if (status === 429 || status === 502 || status === 503 || status === 504) return 'unavailable'
  return 'upstream'
}

export function createErpNextClient(options: ErpNextClientOptions): ErpNextClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? fetch
  const authorization = `token ${options.apiKey}:${options.apiSecret}`

  async function request(path: string, params: URLSearchParams | undefined, accept: string): Promise<Response> {
    const url = new URL(path, `${baseUrl}/`)
    if (params) url.search = params.toString()
    if (url.origin !== new URL(baseUrl).origin) {
      throw new ErpNextError('bad_response', 'Refusing to call a URL outside the configured ERPNext host')
    }

    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: authorization, Accept: accept },
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs),
      })
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new ErpNextError('timeout', `ERPNext did not respond within ${options.timeoutMs} ms`)
      }
      throw new ErpNextError('unavailable', 'ERPNext could not be reached')
    }

    if (!response.ok) {
      // Drain the body without reading it into logs: Frappe error bodies can contain tracebacks.
      await response.body?.cancel().catch(() => undefined)
      throw new ErpNextError(classifyStatus(response.status), `ERPNext responded with HTTP ${response.status}`, response.status)
    }
    return response
  }

  async function requestJson(path: string, params?: URLSearchParams): Promise<Record<string, unknown>> {
    const response = await request(path, params, 'application/json')
    try {
      const body: unknown = await response.json()
      if (body === null || typeof body !== 'object') throw new Error('not an object')
      return body as Record<string, unknown>
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new ErpNextError('timeout', `ERPNext did not respond within ${options.timeoutMs} ms`)
      }
      throw new ErpNextError('bad_response', 'ERPNext returned a response that is not valid JSON')
    }
  }

  const resourcePath = (doctype: string, name?: string) =>
    `/api/resource/${encodeURIComponent(doctype)}${name === undefined ? '' : `/${encodeURIComponent(name)}`}`

  return {
    baseUrl,

    async getList<T>(doctype: string, list: ListOptions): Promise<T[]> {
      const params = new URLSearchParams()
      params.set('fields', JSON.stringify(list.fields))
      if (list.filters && list.filters.length > 0) params.set('filters', JSON.stringify(list.filters))
      if (list.parent) params.set('parent', list.parent)
      if (list.orderBy) params.set('order_by', list.orderBy)
      params.set('limit_page_length', String(list.limit ?? 20))
      const body = await requestJson(resourcePath(doctype), params)
      if (!Array.isArray(body.data)) throw new ErpNextError('bad_response', 'ERPNext list response has no data array')
      return body.data as T[]
    },

    async getDoc<T>(doctype: string, name: string): Promise<T> {
      const body = await requestJson(resourcePath(doctype, name))
      if (body.data === null || typeof body.data !== 'object') {
        throw new ErpNextError('bad_response', 'ERPNext document response has no data object')
      }
      return body.data as T
    },

    async callGetMethod<T>(method: string, params: Record<string, string> = {}): Promise<T> {
      return (await requestJson(`/api/method/${method}`, new URLSearchParams(params))) as T
    },

    async getFile(path: string, maxBytes: number): Promise<BinaryFile> {
      if (!path.startsWith('/files/') && !path.startsWith('/private/files/')) {
        throw new ErpNextError('bad_response', 'Only ERPNext file paths can be downloaded')
      }
      const response = await request(path, undefined, 'image/*')
      const declared = Number(response.headers.get('content-length') ?? '0')
      if (declared > maxBytes) {
        await response.body?.cancel().catch(() => undefined)
        throw new ErpNextError('bad_response', 'File is larger than allowed')
      }
      const chunks: Uint8Array[] = []
      let total = 0
      const reader = response.body?.getReader()
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined)
            throw new ErpNextError('bad_response', 'File is larger than allowed')
          }
          chunks.push(value)
        }
      }
      return {
        contentType: (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase(),
        body: Buffer.concat(chunks),
      }
    },
  }
}
