import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ApiFailure, ApiSuccess, Product } from '../shared/api.js'
import { createApp } from './app.js'
import type { AppConfig } from './config.js'
import { silentLogger } from './logger.js'
import { signSessionToken, TEST_ORIGIN } from './test/clerkFixtures.js'
import { createFakeErpNext, type FakeErpNext } from './test/fakeErpNext.js'
import { testConfig, TEST_ERP_URL } from './test/testConfig.js'

const TODAY = '2026-06-15'

function build(erp: FakeErpNext, config: AppConfig = testConfig()) {
  return createApp({ config, logger: silentLogger, fetchImpl: erp.fetchImpl, today: () => TODAY })
}

const bearer = (token = signSessionToken()) => ({ Authorization: `Bearer ${token}` })

function seedStandardItem(erp: FakeErpNext) {
  erp.data.items.push({
    name: 'ITEM-0001',
    item_code: 'ITEM-0001',
    item_name: 'Example Phone',
    item_group: 'Phones',
    stock_uom: 'Nos',
    description: '<p>Fast &amp; <b>reliable</b></p><script>alert(1)</script>',
    disabled: 0,
    is_stock_item: 1,
    image: null,
    country_of_origin: 'Iraq',
    custom_color: 'Black',
    valuation_rate: 9.99, // internal cost: must never leave the server
    last_purchase_rate: 8.5,
    uoms: [{ uom: 'Nos', conversion_factor: 1 }],
  })
  erp.data.barcodes.push({ name: 'bc1', parent: 'ITEM-0001', parenttype: 'Item', parentfield: 'barcodes', barcode: '0123456789012', barcode_type: 'EAN', uom: null, idx: 1 })
  erp.data.itemPrices.push({
    name: 'ip1', item_code: 'ITEM-0001', price_list: 'Standard Selling', price_list_rate: 12.5, currency: 'USD',
    uom: 'Nos', valid_from: '2026-01-01', valid_upto: null, customer: null, supplier: null, batch_no: null, buying: 0, selling: 1,
  })
}

describe('backend authentication (Clerk)', () => {
  let erp: FakeErpNext
  beforeEach(() => {
    erp = createFakeErpNext()
    seedStandardItem(erp)
  })

  it('health endpoint is public and never calls ERPNext', async () => {
    const res = await request(build(erp)).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('ok')
    expect(erp.calls).toHaveLength(0)
  })

  it('rejects a lookup without an Authorization header with 401 and never calls ERPNext', async () => {
    const res = await request(build(erp)).get('/api/items/lookup?barcode=0123456789012')
    expect(res.status).toBe(401)
    expect((res.body as ApiFailure).error.code).toBe('UNAUTHENTICATED')
    expect(erp.calls).toHaveLength(0)
  })

  it('ignores a Clerk session cookie: a Bearer token is required', async () => {
    const res = await request(build(erp))
      .get('/api/items/lookup?barcode=0123456789012')
      .set('Cookie', `__session=${signSessionToken()}`)
    expect(res.status).toBe(401)
    expect(erp.calls).toHaveLength(0)
  })

  it.each([
    ['malformed token', 'not-a-jwt'],
    ['token signed with the wrong key', signSessionToken({ wrongKey: true })],
    ['expired token', signSessionToken({ expiresIn: -120 })],
    ['token issued for another origin (azp)', signSessionToken({ azp: 'https://evil.example' })],
    ['token with a tampered payload', (() => {
      const [h, , s] = signSessionToken().split('.')
      const forged = Buffer.from(JSON.stringify({ sub: 'user_admin', exp: 9999999999 })).toString('base64url')
      return `${h}.${forged}.${s}`
    })()],
  ])('rejects a %s with 401, leaks no verification details, and never calls ERPNext', async (_label, token) => {
    const res = await request(build(erp)).get('/api/items/lookup?barcode=0123456789012').set(bearer(token))
    expect(res.status).toBe(401)
    expect((res.body as ApiFailure).error.code).toBe('UNAUTHENTICATED')
    expect(Object.keys(res.headers).filter((h) => h.startsWith('x-clerk'))).toEqual([])
    // Always the same generic message, whatever the verification failure was.
    expect((res.body as ApiFailure).error.message).toBe('Your session is missing or has expired. Sign in again.')
    expect(JSON.stringify(res.body)).not.toMatch(/signature|jwt|azp|expiry date|token-/i)
    expect(erp.calls).toHaveLength(0)
  })

  it('accepts a valid token and returns product data', async () => {
    const res = await request(build(erp)).get('/api/items/lookup?barcode=0123456789012').set(bearer())
    expect(res.status).toBe(200)
    expect((res.body as ApiSuccess<Product>).data.itemCode).toBe('ITEM-0001')
    expect(Object.keys(res.headers).filter((h) => h.startsWith('x-clerk'))).toEqual([])
  })

  it('returns 403 for an authenticated user outside the allowlist, without calling ERPNext', async () => {
    const app = build(erp, testConfig({ access: { allowedUserIds: ['user_allowed'] } }))
    const denied = await request(app).get('/api/items/lookup?barcode=0123456789012').set(bearer(signSessionToken({ userId: 'user_other' })))
    expect(denied.status).toBe(403)
    expect((denied.body as ApiFailure).error.code).toBe('ACCESS_DENIED')
    expect(erp.calls).toHaveLength(0)

    const allowed = await request(app).get('/api/items/lookup?barcode=0123456789012').set(bearer(signSessionToken({ userId: 'user_allowed' })))
    expect(allowed.status).toBe(200)
  })

  it('returns 403 for an explicitly denied user', async () => {
    const app = build(erp, testConfig({ access: { deniedUserIds: ['user_blocked'] } }))
    const res = await request(app).get('/api/session').set(bearer(signSessionToken({ userId: 'user_blocked' })))
    expect(res.status).toBe(403)
  })

  it('session endpoint confirms access for a valid user', async () => {
    const res = await request(build(erp)).get('/api/session').set(bearer(signSessionToken({ userId: 'user_42' })))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: { userId: 'user_42', access: 'granted' } })
    expect(erp.calls).toHaveLength(0)
  })

  it('protects the image endpoint too', async () => {
    const res = await request(build(erp)).get('/api/items/image?itemCode=ITEM-0001')
    expect(res.status).toBe(401)
    expect(erp.calls).toHaveLength(0)
  })

  it('allows CORS only for the configured frontend origin', async () => {
    const app = build(erp)
    const good = await request(app).get('/api/health').set('Origin', TEST_ORIGIN)
    expect(good.headers['access-control-allow-origin']).toBe(TEST_ORIGIN)
    const bad = await request(app).get('/api/health').set('Origin', 'https://evil.example')
    expect(bad.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('GET /api/items/lookup', () => {
  let erp: FakeErpNext
  beforeEach(() => {
    erp = createFakeErpNext()
    seedStandardItem(erp)
  })

  const lookup = (app: ReturnType<typeof build>, query: string) => request(app).get(`/api/items/lookup?${query}`).set(bearer())

  it('returns the normalized product with its selling price', async () => {
    const res = await lookup(build(erp), 'barcode=0123456789012')
    expect(res.status).toBe(200)
    const product = (res.body as ApiSuccess<Product>).data
    expect(product).toMatchObject({
      itemCode: 'ITEM-0001',
      itemName: 'Example Phone',
      matchedBy: 'barcode',
      barcode: '0123456789012',
      barcodeType: 'EAN',
      uom: 'Nos',
      itemGroup: 'Phones',
      description: 'Fast & reliable',
      sellingPrice: 12.5,
      currency: 'USD',
      priceList: 'Standard Selling',
      disabled: false,
      isStockItem: true,
      price: { status: 'available', amount: 12.5, currency: 'USD', uom: 'Nos', uomMatch: 'exact' },
    })
    expect(product.metadata).toEqual([
      { field: 'country_of_origin', label: 'Country of Origin', value: 'Iraq' },
      { field: 'custom_color', label: 'Device Color', value: 'Black' },
    ])
  })

  it('never returns costs or other non-allowlisted fields', async () => {
    const res = await lookup(build(erp), 'barcode=0123456789012')
    const raw = JSON.stringify(res.body)
    expect(raw).not.toContain('9.99')
    expect(raw).not.toContain('valuation')
    expect(raw).not.toContain('last_purchase_rate')
    expect(raw).not.toContain('<script>')
  })

  it('sends token authentication and URL-encoded exact-match filters to ERPNext', async () => {
    await lookup(build(erp), `barcode=${encodeURIComponent('0123456789012')}`)
    const call = erp.callsTo('/api/resource/Item Barcode')[0]!
    expect(call.authorization).toBe('token test-api-key:test-api-secret')
    expect(call.url.origin).toBe(TEST_ERP_URL)
    expect(call.url.searchParams.get('parent')).toBe('Item')
    expect(JSON.parse(call.url.searchParams.get('filters')!)).toContainEqual(['barcode', '=', '0123456789012'])
    expect(erp.calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('preserves leading zeros: "0012345" does not match "12345"', async () => {
    erp.data.items.push({ name: 'SHORT', item_name: 'Short code', item_group: 'Phones', stock_uom: 'Nos' })
    erp.data.barcodes.push({ name: 'bc2', parent: 'SHORT', parenttype: 'Item', parentfield: 'barcodes', barcode: '12345', idx: 1 })
    const res = await lookup(build(erp), 'barcode=0012345')
    expect(res.status).toBe(404)
    expect((res.body as ApiFailure).error.code).toBe('ITEM_NOT_FOUND')
  })

  it('matches exactly even though the database collation is case-insensitive', async () => {
    erp.data.items.push({ name: 'CODE128', item_name: 'Labelled box', item_group: 'Phones', stock_uom: 'Nos' })
    erp.data.barcodes.push({ name: 'bc3', parent: 'CODE128', parenttype: 'Item', parentfield: 'barcodes', barcode: 'ABC-001', idx: 1 })
    expect((await lookup(build(erp), 'barcode=abc-001')).status).toBe(404)
    expect((await lookup(build(erp), 'barcode=ABC-001')).status).toBe(200)
  })

  it('trims surrounding whitespace but keeps the barcode otherwise intact', async () => {
    const res = await lookup(build(erp), `barcode=${encodeURIComponent('  0123456789012\n')}`)
    expect(res.status).toBe(200)
  })

  it.each([
    ['empty', 'barcode='],
    ['whitespace only', 'barcode=%20%20'],
    ['missing', ''],
    ['too long', `barcode=${'1'.repeat(141)}`],
    ['repeated parameter', 'barcode=1&barcode=2'],
    ['control characters', 'barcode=12%0034'],
  ])('rejects %s input with 400 before calling ERPNext', async (_label, query) => {
    const res = await lookup(build(erp), query)
    expect(res.status).toBe(400)
    expect((res.body as ApiFailure).error.code).toBe('INVALID_BARCODE')
    expect(erp.calls).toHaveLength(0)
  })

  it('returns 404 ITEM_NOT_FOUND for an unknown barcode', async () => {
    const res = await lookup(build(erp), 'barcode=9999999999999')
    expect(res.status).toBe(404)
    expect((res.body as ApiFailure).error).toMatchObject({ code: 'ITEM_NOT_FOUND', message: 'No product was found for this barcode.' })
  })

  it('does not treat a barcode as an item code unless explicitly enabled', async () => {
    expect((await lookup(build(erp), 'barcode=ITEM-0001')).status).toBe(404)
    const enabled = build(erp, testConfig({ erpnext: { matchItemCode: true } }))
    const res = await lookup(enabled, 'barcode=ITEM-0001')
    expect(res.status).toBe(200)
    expect((res.body as ApiSuccess<Product>).data).toMatchObject({ matchedBy: 'item_code', barcode: null })
    expect((await lookup(enabled, 'barcode=item-0001')).status).toBe(404) // still exact
  })

  describe('ambiguous barcodes', () => {
    beforeEach(() => {
      erp.data.items.push({ name: 'ITEM-0002', item_name: 'Example Phone (old)', item_group: 'Phones', stock_uom: 'Nos', disabled: 1 })
      erp.data.barcodes.push({ name: 'bc9', parent: 'ITEM-0002', parenttype: 'Item', parentfield: 'barcodes', barcode: '0123456789012', idx: 1 })
    })

    it('returns 409 with the candidates instead of picking one', async () => {
      const res = await lookup(build(erp), 'barcode=0123456789012')
      expect(res.status).toBe(409)
      const error = (res.body as ApiFailure).error
      expect(error.code).toBe('AMBIGUOUS_BARCODE')
      expect(error.candidates).toEqual([
        { itemCode: 'ITEM-0001', itemName: 'Example Phone', itemGroup: 'Phones', disabled: false },
        { itemCode: 'ITEM-0002', itemName: 'Example Phone (old)', itemGroup: 'Phones', disabled: true },
      ])
    })

    it('resolves the user’s choice only when it is one of the matches', async () => {
      const chosen = await lookup(build(erp), 'barcode=0123456789012&itemCode=ITEM-0002')
      expect(chosen.status).toBe(200)
      expect((chosen.body as ApiSuccess<Product>).data.itemCode).toBe('ITEM-0002')

      erp.data.items.push({ name: 'UNRELATED', item_name: 'Other', item_group: 'Phones', stock_uom: 'Nos' })
      const forged = await lookup(build(erp), 'barcode=0123456789012&itemCode=UNRELATED')
      expect(forged.status).toBe(400)
      expect((forged.body as ApiFailure).error.code).toBe('INVALID_ITEM_CODE')
    })
  })

  it('flags disabled items (warn policy) and hides them (reject policy)', async () => {
    erp.data.items[0]!.disabled = 1
    const warn = await lookup(build(erp), 'barcode=0123456789012')
    expect(warn.status).toBe(200)
    expect((warn.body as ApiSuccess<Product>).data.disabled).toBe(true)

    const reject = await lookup(build(erp, testConfig({ erpnext: { disabledItemPolicy: 'reject' } })), 'barcode=0123456789012')
    expect(reject.status).toBe(404)
    expect((reject.body as ApiFailure).error.code).toBe('ITEM_DISABLED')
  })

  it('enforces the item-group scope, including sub-groups', async () => {
    const inScope = await lookup(build(erp, testConfig({ erpnext: { itemGroups: ['Devices'] } })), 'barcode=0123456789012')
    expect(inScope.status).toBe(200) // Phones is under Devices

    const outOfScope = await lookup(build(erp, testConfig({ erpnext: { itemGroups: ['Accessories'] } })), 'barcode=0123456789012')
    expect(outOfScope.status).toBe(404)
    expect((outOfScope.body as ApiFailure).error.code).toBe('ITEM_OUT_OF_SCOPE')
  })

  it('works with the standard schema when DocType metadata is not readable', async () => {
    erp.data.metadataAllowed = false
    const res = await lookup(build(erp), 'barcode=0123456789012')
    expect(res.status).toBe(200)
    expect((res.body as ApiSuccess<Product>).data.price.status).toBe('available')
  })

  describe('selling price', () => {
    it('reports a missing price explicitly — never as 0 — and does not try other price lists', async () => {
      erp.data.itemPrices.length = 0
      erp.data.itemPrices.push({ name: 'ipW', item_code: 'ITEM-0001', price_list: 'Wholesale', price_list_rate: 10, currency: 'USD', selling: 1, buying: 0 })
      const res = await lookup(build(erp), 'barcode=0123456789012')
      expect(res.status).toBe(200)
      const product = (res.body as ApiSuccess<Product>).data
      expect(product.sellingPrice).toBeNull()
      expect(product.currency).toBeNull()
      expect(product.price).toMatchObject({ status: 'unavailable', reason: 'NO_PRICE_IN_LIST', priceList: 'Standard Selling' })
      for (const call of erp.callsTo('/api/resource/Item Price')) {
        expect(JSON.parse(call.url.searchParams.get('filters')!)).toContainEqual(['price_list', '=', 'Standard Selling'])
      }
    })

    it('shows a real zero price as 0', async () => {
      erp.data.itemPrices[0]!.price_list_rate = 0
      const product = (await lookup(build(erp), 'barcode=0123456789012')).body.data as Product
      expect(product.sellingPrice).toBe(0)
      expect(product.price.status).toBe('available')
    })

    it('refuses a price list that is also a buying list', async () => {
      erp.data.priceLists[0]!.buying = 1
      erp.data.itemPrices[0]!.buying = 1
      const product = (await lookup(build(erp), 'barcode=0123456789012')).body.data as Product
      expect(product.price).toMatchObject({ status: 'unavailable', reason: 'PRICE_LIST_IS_BUYING_LIST' })
      expect(JSON.stringify(product)).not.toContain('12.5')
    })

    it('refuses a disabled or missing price list', async () => {
      erp.data.priceLists[0]!.enabled = 0
      expect(((await lookup(build(erp), 'barcode=0123456789012')).body.data as Product).price).toMatchObject({ reason: 'PRICE_LIST_DISABLED' })
      erp.data.priceLists.length = 0
      expect(((await lookup(build(erp), 'barcode=0123456789012')).body.data as Product).price).toMatchObject({ reason: 'PRICE_LIST_NOT_FOUND' })
    })

    it('uses the barcode-specific unit and labels a stock-unit fallback', async () => {
      erp.data.barcodes[0]!.uom = 'Box'
      erp.data.items[0]!.uoms = [{ uom: 'Nos', conversion_factor: 1 }, { uom: 'Box', conversion_factor: 12 }]
      const fallback = ((await lookup(build(erp), 'barcode=0123456789012')).body.data as Product)
      expect(fallback.uom).toBe('Box')
      expect(fallback.price).toMatchObject({ status: 'available', amount: 12.5, uom: 'Nos', requestedUom: 'Box', uomMatch: 'stock_uom_fallback' })

      erp.data.itemPrices.push({ ...erp.data.itemPrices[0]!, name: 'ipBox', uom: 'Box', price_list_rate: 140 })
      const exact = ((await lookup(build(erp), 'barcode=0123456789012')).body.data as Product)
      expect(exact.price).toMatchObject({ amount: 140, uom: 'Box', uomMatch: 'exact' })
    })

    it('still returns the product when the price cannot be read', async () => {
      erp.fail((url) => decodeURIComponent(url.pathname) === '/api/resource/Item Price', 403)
      const res = await lookup(build(erp), 'barcode=0123456789012')
      expect(res.status).toBe(200)
      expect((res.body as ApiSuccess<Product>).data.price).toMatchObject({ status: 'unavailable', reason: 'PRICE_PERMISSION_DENIED' })
    })
  })

  describe('ERPNext failures', () => {
    const barcodeQuery = (url: URL) => decodeURIComponent(url.pathname) === '/api/resource/Item Barcode'

    it('maps a timeout to 504 ERPNEXT_TIMEOUT', async () => {
      erp.fail(barcodeQuery, 'timeout')
      const res = await lookup(build(erp), 'barcode=0123456789012')
      expect(res.status).toBe(504)
      expect((res.body as ApiFailure).error.code).toBe('ERPNEXT_TIMEOUT')
    })

    it('maps a network failure to 502 ERPNEXT_UNAVAILABLE', async () => {
      erp.fail(barcodeQuery, 'network')
      const res = await lookup(build(erp), 'barcode=0123456789012')
      expect(res.status).toBe(502)
      expect((res.body as ApiFailure).error.code).toBe('ERPNEXT_UNAVAILABLE')
    })

    it.each([
      [401, 'ERPNEXT_AUTH_FAILED'],
      [403, 'ERPNEXT_PERMISSION_DENIED'],
      [500, 'ERPNEXT_ERROR'],
      [503, 'ERPNEXT_UNAVAILABLE'],
    ])('maps ERPNext HTTP %i to 502/504 %s without leaking upstream details', async (status, code) => {
      erp.fail(barcodeQuery, status)
      const res = await lookup(build(erp), 'barcode=0123456789012')
      expect(res.status).toBe(502)
      expect((res.body as ApiFailure).error.code).toBe(code)
      const raw = JSON.stringify(res.body)
      expect(raw).not.toContain('Traceback')
      expect(raw).not.toContain('test-api-secret')
      expect(raw).not.toContain(TEST_ERP_URL)
    })
  })

  it('rate-limits lookups per user', async () => {
    const app = build(erp, testConfig({ lookupRateLimitPerMinute: 2 }))
    expect((await lookup(app, 'barcode=0123456789012')).status).toBe(200)
    expect((await lookup(app, 'barcode=0123456789012')).status).toBe(200)
    const limited = await lookup(app, 'barcode=0123456789012')
    expect(limited.status).toBe(429)
    expect((limited.body as ApiFailure).error.code).toBe('RATE_LIMITED')
  })
})

describe('GET /api/items/image', () => {
  let erp: FakeErpNext
  beforeEach(() => {
    erp = createFakeErpNext()
    seedStandardItem(erp)
  })
  const image = (app: ReturnType<typeof build>, code: string) => request(app).get(`/api/items/image?itemCode=${encodeURIComponent(code)}`).set(bearer())

  it('streams an image hosted on the ERPNext site', async () => {
    erp.data.items[0]!.image = '/private/files/phone.png'
    erp.data.files['/private/files/phone.png'] = { contentType: 'image/png', body: Buffer.from([137, 80, 78, 71]) }
    const res = await image(build(erp), 'ITEM-0001')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it.each([
    ['an external URL', 'https://elsewhere.example/x.png'],
    ['a path outside /files', '/api/resource/User'],
    ['a traversal attempt', '/files/../api/resource/User'],
  ])('refuses %s', async (_label, path) => {
    erp.data.items[0]!.image = path
    const res = await image(build(erp), 'ITEM-0001')
    expect(res.status).toBe(404)
    expect(erp.calls.some((c) => !c.url.pathname.startsWith('/api/resource/Item') && !c.url.pathname.startsWith('/api/method'))).toBe(false)
  })

  it('refuses SVG content', async () => {
    erp.data.items[0]!.image = '/files/logo.svg'
    erp.data.files['/files/logo.svg'] = { contentType: 'image/svg+xml', body: Buffer.from('<svg onload="alert(1)"/>') }
    expect((await image(build(erp), 'ITEM-0001')).status).toBe(404)
  })
})

describe('unknown API routes', () => {
  it('returns a JSON 404', async () => {
    const res = await request(build(createFakeErpNext())).get('/api/resource/Item')
    expect(res.status).toBe(404)
    expect((res.body as ApiFailure).error.code).toBe('NOT_FOUND')
  })
})

describe('company scope (ERPNEXT_COMPANY)', () => {
  let erp: FakeErpNext
  const scoped = () => build(erp, testConfig({ erpnext: { company: 'Al Esnad', matchItemCode: true } }))
  const lookup = (query: string) => request(scoped()).get(`/api/items/lookup?${query}`).set(bearer())
  const touched = (code: string) =>
    erp.calls.filter((c) => {
      const path = decodeURIComponent(c.url.pathname)
      return path === `/api/resource/Item/${code}` || (path === '/api/resource/Item Price' && c.url.searchParams.get('filters')!.includes(code))
    })

  beforeEach(() => {
    erp = createFakeErpNext()
    seedStandardItem(erp)
    erp.data.items[0]!.item_defaults = [{ company: 'Al Esnad' }]
    erp.data.items.push({ name: 'OTHER-1', item_name: 'Other company phone', item_group: 'Phones', stock_uom: 'Nos', item_defaults: [{ company: 'Other Co' }], image: '/files/other.png' })
    erp.data.items.push({ name: 'NO-COMPANY', item_name: 'Unassigned', item_group: 'Phones', stock_uom: 'Nos' })
    erp.data.barcodes.push({ name: 'bo1', parent: 'OTHER-1', parenttype: 'Item', parentfield: 'barcodes', barcode: '5555555555555', idx: 1 })
    erp.data.barcodes.push({ name: 'bn1', parent: 'NO-COMPANY', parenttype: 'Item', parentfield: 'barcodes', barcode: '7777777777777', idx: 1 })
    erp.data.itemPrices.push({ name: 'ipo', item_code: 'OTHER-1', price_list: 'Standard Selling', price_list_rate: 99, currency: 'USD', selling: 1, buying: 0 })
    erp.data.files['/files/other.png'] = { contentType: 'image/png', body: Buffer.from([1, 2, 3]) }
  })

  it('returns the company’s own items', async () => {
    const res = await lookup('barcode=0123456789012')
    expect(res.status).toBe(200)
    expect((res.body as ApiSuccess<Product>).data.itemCode).toBe('ITEM-0001')
  })

  it('hides another company’s item exactly like a barcode that does not exist, without reading it', async () => {
    const other = await lookup('barcode=5555555555555')
    const missing = await lookup('barcode=9999999999999')
    expect(other.status).toBe(404)
    expect((other.body as ApiFailure).error.code).toBe('ITEM_NOT_FOUND')
    expect((other.body as ApiFailure).error.message).toBe((missing.body as ApiFailure).error.message)
    expect(JSON.stringify(other.body)).not.toMatch(/OTHER-1|Other company/)
    expect(touched('OTHER-1')).toHaveLength(0)
  })

  it('treats items with no company assignment as outside the company', async () => {
    expect((await lookup('barcode=7777777777777')).status).toBe(404)
  })

  it('never lists another company’s item among duplicate-barcode candidates', async () => {
    erp.data.barcodes.push({ name: 'bo2', parent: 'OTHER-1', parenttype: 'Item', parentfield: 'barcodes', barcode: '0123456789012', idx: 2 })
    const res = await lookup('barcode=0123456789012')
    expect(res.status).toBe(200) // only one match remains inside the company
    expect((res.body as ApiSuccess<Product>).data.itemCode).toBe('ITEM-0001')
    expect(JSON.stringify(res.body)).not.toContain('OTHER-1')

    const forged = await lookup('barcode=0123456789012&itemCode=OTHER-1')
    expect(forged.status).toBe(400)
    expect(touched('OTHER-1')).toHaveLength(0)
  })

  it('applies the company to item-code matches and images too', async () => {
    expect((await lookup('barcode=ITEM-0001')).status).toBe(200)
    expect((await lookup('barcode=OTHER-1')).status).toBe(404)
    const image = await request(scoped()).get('/api/items/image?itemCode=OTHER-1').set(bearer())
    expect(image.status).toBe(404)
    expect(erp.calls.some((c) => c.url.pathname === '/files/other.png')).toBe(false)
  })

  it('sends the company filter inside the ERPNext query', async () => {
    await lookup('barcode=0123456789012')
    const scopedCall = erp.calls.find(
      (c) => decodeURIComponent(c.url.pathname) === '/api/resource/Item' && c.url.searchParams.get('filters')!.includes('Item Default'),
    )
    expect(JSON.parse(scopedCall!.url.searchParams.get('filters')!)).toContainEqual(['Item Default', 'company', '=', 'Al Esnad'])
  })
})
