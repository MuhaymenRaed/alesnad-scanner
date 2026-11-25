import { describe, expect, it } from 'vitest'
import { createNetlifyHandler, createNetlifyWebHandler, netlifyEnv } from './netlify.js'
import { signSessionToken, TEST_JWT_PUBLIC_KEY, TEST_PUBLISHABLE_KEY, TEST_SECRET_KEY } from './test/clerkFixtures.js'
import { createFakeErpNext } from './test/fakeErpNext.js'

const SITE = 'https://scanner.netlify.app'
const baseEnv = {
  ERPNEXT_BASE_URL: 'https://erp.test.example',
  ERPNEXT_API_KEY: 'k',
  ERPNEXT_API_SECRET: 's',
  CLERK_SECRET_KEY: TEST_SECRET_KEY,
  CLERK_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY,
  CLERK_JWT_KEY: TEST_JWT_PUBLIC_KEY,
  LOG_LEVEL: 'silent',
  URL: SITE,
}

const event = (path: string, query: Record<string, string> = {}, headers: Record<string, string> = {}) => ({
  httpMethod: 'GET',
  path,
  headers: { host: 'scanner.netlify.app', ...headers },
  multiValueHeaders: {},
  queryStringParameters: query,
  multiValueQueryStringParameters: null,
  body: null,
  isBase64Encoded: false,
  requestContext: { identity: { sourceIp: '203.0.113.7' } },
})

type Response = { statusCode: number; body: string }

describe('netlifyEnv', () => {
  it('applies the versioned business settings over stale dashboard values (price list الاسناد)', () => {
    const env = netlifyEnv({ ERPNEXT_PRICE_LIST: 'Standard Selling', ERPNEXT_COMPANY: 'Other' })
    expect(env.ERPNEXT_PRICE_LIST).toBe('الاسناد')
    expect(env.ERPNEXT_ALLOW_BUYING_PRICE_LIST).toBe('true')
    expect(env.ERPNEXT_COMPANY).toBe('الاسناد')
    expect(env.ITEM_NAME_FIELDS?.split(',')[0]).toBe('custom_arabic_item_name')
  })

  it('adds the site URLs to FRONTEND_ORIGIN, trusts the proxy and caps the ERPNext timeout', () => {
    const env = netlifyEnv({ FRONTEND_ORIGIN: 'http://localhost:5173', URL: SITE, DEPLOY_PRIME_URL: 'https://main--scanner.netlify.app', ERPNEXT_TIMEOUT_MS: '20000' })
    expect(env.FRONTEND_ORIGIN).toBe(`http://localhost:5173,${SITE},https://main--scanner.netlify.app`)
    expect(env.TRUST_PROXY).toBe('1')
    expect(env.ERPNEXT_TIMEOUT_MS).toBe('8000')
    expect(netlifyEnv({ ERPNEXT_TIMEOUT_MS: '5000' }).ERPNEXT_TIMEOUT_MS).toBe('5000')
  })
})

describe('Netlify function handler', () => {
  it('serves the API under both /api and /.netlify/functions/api', async () => {
    const handler = createNetlifyHandler(baseEnv, createFakeErpNext().fetchImpl, {})
    for (const path of ['/api/health', '/.netlify/functions/api/health']) {
      const res = (await handler(event(path), {})) as Response
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).data.status).toBe('ok')
    }
  })

  it('still requires a Clerk token and never calls ERPNext without one', async () => {
    const erp = createFakeErpNext()
    const handler = createNetlifyHandler(baseEnv, erp.fetchImpl, {})
    const res = (await handler(event('/.netlify/functions/api/items/lookup', { barcode: '123' }), {})) as Response
    expect(res.statusCode).toBe(401)
    expect(erp.calls).toHaveLength(0)
  })

  it('accepts tokens issued for the Netlify site URL only', async () => {
    const handler = createNetlifyHandler(baseEnv, createFakeErpNext().fetchImpl, {})
    const ok = (await handler(event('/api/session', {}, { authorization: `Bearer ${signSessionToken({ azp: SITE })}` }), {})) as Response
    expect(ok.statusCode).toBe(200)
    const other = (await handler(event('/api/session', {}, { authorization: `Bearer ${signSessionToken({ azp: 'https://evil.example' })}` }), {})) as Response
    expect(other.statusCode).toBe(401)
  })

  it('answers with a JSON error (no crash) when configuration is missing', async () => {
    const handler = createNetlifyHandler({ LOG_LEVEL: 'silent' })
    const res = (await handler(event('/api/health'), {})) as Response
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error.message).toMatch(/not configured/)
  })
})

describe('Netlify: the site domain is trusted even without URL / FRONTEND_ORIGIN', () => {
  it('accepts tokens issued for the domain the request came in on, and nothing else', async () => {
    const { URL: _omit, ...env } = baseEnv
    const handler = createNetlifyHandler({ ...env, FRONTEND_ORIGIN: 'http://localhost:5173' }, createFakeErpNext().fetchImpl, {})
    const forSite = (await handler(event('/api/session', {}, { authorization: `Bearer ${signSessionToken({ azp: SITE })}` }), {})) as Response
    expect(forSite.statusCode).toBe(200)
    const foreign = (await handler(event('/api/session', {}, { authorization: `Bearer ${signSessionToken({ azp: 'https://evil.example' })}` }), {})) as Response
    expect(foreign.statusCode).toBe(401)
  })
})

describe('Netlify Functions v2 web handler (Request → Response)', () => {
  const request = (path: string, headers: Record<string, string> = {}) => new Request(`${SITE}${path}`, { headers })

  it('serves /api/health and rejects unauthenticated lookups without calling ERPNext', async () => {
    const erp = createFakeErpNext()
    const handle = createNetlifyWebHandler(baseEnv, erp.fetchImpl, {})
    const health = await handle(request('/api/health'))
    expect(health.status).toBe(200)
    expect(((await health.json()) as { data: { status: string } }).data.status).toBe('ok')
    const lookup = await handle(request('/api/items/lookup?barcode=123'))
    expect(lookup.status).toBe(401)
    expect(erp.calls).toHaveLength(0)
  })

  it('accepts a token for the site the request came in on (no URL / FRONTEND_ORIGIN needed)', async () => {
    const { URL: _omit, ...env } = baseEnv
    const handle = createNetlifyWebHandler({ ...env, FRONTEND_ORIGIN: 'http://localhost:5173' }, createFakeErpNext().fetchImpl, {})
    const res = await handle(request('/api/session', { authorization: `Bearer ${signSessionToken({ azp: SITE })}` }))
    expect(res.status).toBe(200)
  })

  it('keeps repeated query parameters (validation rejects them) and passes binary images through', async () => {
    const erp = createFakeErpNext()
    erp.data.items.push({ name: 'IMG-1', item_name: 'Has image', item_group: 'Phones', image: '/files/p.png' })
    erp.data.files['/files/p.png'] = { contentType: 'image/png', body: Buffer.from([137, 80, 78, 71, 0, 255]) }
    const handle = createNetlifyWebHandler(baseEnv, erp.fetchImpl, {})
    const auth = { authorization: `Bearer ${signSessionToken({ azp: SITE })}` }
    expect((await handle(request('/api/items/lookup?barcode=1&barcode=2', auth))).status).toBe(400)
    const image = await handle(request('/api/items/image?itemCode=IMG-1', auth))
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/png')
    expect([...new Uint8Array(await image.arrayBuffer())]).toEqual([137, 80, 78, 71, 0, 255])
  })
})
