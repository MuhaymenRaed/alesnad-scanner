/**
 * In-memory stand-in for the Frappe REST API, used through the injectable `fetch`.
 * Mimics the behaviours the integration depends on:
 *  - child tables (Item Barcode) can only be listed with `parent=Item` (403 otherwise);
 *  - '=' comparisons are case-insensitive and ignore trailing spaces, like MariaDB's default
 *    collation — so the app's strict re-check is genuinely exercised;
 *  - failure injection per path: HTTP status, timeout (hangs until aborted) or network error.
 */

type Row = Record<string, unknown>

export interface FakeErpNextData {
  items: Row[]
  barcodes: Row[]
  itemPrices: Row[]
  priceLists: Row[]
  itemGroups: Row[]
  files: Record<string, { contentType: string; body: Buffer }>
  /** Set false to simulate a site where getdoctype is not permitted. */
  metadataAllowed: boolean
}

export type Failure = number | 'timeout' | 'network'

export interface RecordedCall {
  url: URL
  authorization: string | null
  method: string
}

export function defaultData(): FakeErpNextData {
  return {
    items: [],
    barcodes: [],
    itemPrices: [],
    priceLists: [{ name: 'Standard Selling', enabled: 1, selling: 1, buying: 0, currency: 'USD' }],
    itemGroups: [
      { name: 'All Item Groups', lft: 1, rgt: 10 },
      { name: 'Devices', lft: 2, rgt: 5 },
      { name: 'Phones', lft: 3, rgt: 4 },
      { name: 'Accessories', lft: 6, rgt: 7 },
    ],
    files: {},
    metadataAllowed: true,
  }
}

const collate = (value: unknown) => String(value ?? '').toLowerCase().replace(/ +$/, '')

function compare(actual: unknown, op: unknown, value: unknown): boolean {
  if (op === '=') return collate(actual) === collate(value)
  if (op === 'in') return (value as unknown[]).map(collate).includes(collate(actual))
  if (op === 'is') return value === 'set' ? !!actual : !actual
  throw new Error(`fake ERPNext: unsupported operator ${String(op)}`)
}

function matches(row: Row, filters: unknown[][], data?: FakeErpNextData): boolean {
  return filters.every((filter) => {
    // 4-element filters target a child table of the listed (Item) row, like Frappe's joins.
    if (filter.length === 4 && data) {
      const [doctype, field, op, value] = filter
      const children =
        doctype === 'Item Default'
          ? ((row.item_defaults as Row[] | undefined) ?? [])
          : doctype === 'Item Barcode'
            ? data.barcodes.filter((b) => b.parent === row.name)
            : []
      if (op === 'is' && value === 'not set') return !children.some((c) => c[field as string])
      return children.some((child) => compare(child[field as string], op, value))
    }
    const [field, op, value] = filter.length === 4 ? filter.slice(1) : filter
    return compare(row[field as string], op, value)
  })
}

function pick(row: Row, fields: string[]): Row {
  if (fields.includes('*')) return { ...row }
  return Object.fromEntries(fields.map((f) => [f.split(' as ').pop()!, row[f] ?? null]))
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const META = {
  Item: {
    docs: [
      {
        name: 'Item',
        fields: [
          { fieldname: 'item_name', fieldtype: 'Data', label: 'Item Name' },
          { fieldname: 'item_group', fieldtype: 'Link', label: 'Item Group' },
          { fieldname: 'stock_uom', fieldtype: 'Link', label: 'Default Unit of Measure' },
          { fieldname: 'sales_uom', fieldtype: 'Link', label: 'Default Sales Unit of Measure' },
          { fieldname: 'description', fieldtype: 'Text Editor', label: 'Description' },
          { fieldname: 'disabled', fieldtype: 'Check', label: 'Disabled' },
          { fieldname: 'country_of_origin', fieldtype: 'Link', label: 'Country of Origin' },
          { fieldname: 'custom_color', fieldtype: 'Data', label: 'Device Color' },
          { fieldname: 'valuation_rate', fieldtype: 'Currency', label: 'Valuation Rate' },
          { fieldname: 'section_break_1', fieldtype: 'Section Break' },
          { fieldname: 'barcodes', fieldtype: 'Table', label: 'Barcodes', options: 'Item Barcode' },
          { fieldname: 'uoms', fieldtype: 'Table', label: 'UOMs', options: 'UOM Conversion Detail' },
        ],
      },
      {
        name: 'Item Barcode',
        fields: [
          { fieldname: 'barcode', fieldtype: 'Data' },
          { fieldname: 'barcode_type', fieldtype: 'Select' },
          { fieldname: 'uom', fieldtype: 'Link' },
        ],
      },
      { name: 'UOM Conversion Detail', fields: [{ fieldname: 'uom', fieldtype: 'Link' }] },
    ],
  },
  'Item Price': {
    docs: [
      {
        name: 'Item Price',
        fields: [
          'item_code', 'uom', 'price_list', 'customer', 'supplier', 'batch_no', 'buying', 'selling',
          'currency', 'price_list_rate', 'valid_from', 'valid_upto',
        ].map((fieldname) => ({ fieldname, fieldtype: 'Data' })),
      },
    ],
  },
} as const

export function createFakeErpNext(initial: Partial<FakeErpNextData> = {}) {
  const data: FakeErpNextData = { ...defaultData(), ...initial }
  const calls: RecordedCall[] = []
  const failures: Array<{ match: (url: URL) => boolean; failure: Failure }> = []

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const headers = new Headers(init?.headers)
    calls.push({ url, authorization: headers.get('authorization'), method: init?.method ?? 'GET' })
    const signal = init?.signal

    const failure = failures.find((f) => f.match(url))?.failure
    if (failure === 'timeout') {
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }
    if (failure === 'network') throw new TypeError('fetch failed')
    if (typeof failure === 'number') return json(failure, { exc_type: 'SimulatedError', exception: 'Traceback (secret internals)' })

    if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
      if (!data.metadataAllowed) return json(403, { exc_type: 'PermissionError' })
      const doctype = url.searchParams.get('doctype') as keyof typeof META
      return META[doctype] ? json(200, META[doctype]) : json(404, { exc_type: 'DoesNotExistError' })
    }

    const resource = url.pathname.match(/^\/api\/resource\/([^/]+)(?:\/(.+))?$/)
    if (resource) {
      const doctype = decodeURIComponent(resource[1]!)
      const name = resource[2] === undefined ? undefined : decodeURIComponent(resource[2])
      const table: Record<string, Row[]> = {
        Item: data.items,
        'Item Barcode': data.barcodes,
        'Item Price': data.itemPrices,
        'Price List': data.priceLists,
        'Item Group': data.itemGroups,
      }
      const rows = table[doctype]
      if (!rows) return json(404, { exc_type: 'DoesNotExistError' })

      if (name !== undefined) {
        const doc = rows.find((r) => r.name === name)
        if (!doc) return json(404, { exc_type: 'DoesNotExistError' })
        if (doctype === 'Item') {
          return json(200, { data: { ...doc, barcodes: data.barcodes.filter((b) => b.parent === name) } })
        }
        return json(200, { data: doc })
      }

      if (doctype === 'Item Barcode' && url.searchParams.get('parent') !== 'Item') {
        return json(403, { exc_type: 'PermissionError' })
      }
      const fields = JSON.parse(url.searchParams.get('fields') ?? '["name"]') as string[]
      const filters = JSON.parse(url.searchParams.get('filters') ?? '[]') as unknown[][]
      const limit = Number(url.searchParams.get('limit_page_length') ?? '20')
      const result = rows.filter((r) => matches(r, filters, data)).map((r) => pick(r, fields))
      return json(200, { data: limit > 0 ? result.slice(0, limit) : result })
    }

    const file = data.files[url.pathname]
    if (file) return new Response(new Uint8Array(file.body), { status: 200, headers: { 'content-type': file.contentType } })
    return json(404, { exc_type: 'DoesNotExistError' })
  }

  return {
    data,
    calls,
    fetchImpl,
    /** Make every request whose URL satisfies `match` fail. */
    fail(match: (url: URL) => boolean, failure: Failure) {
      failures.push({ match, failure })
    },
    callsTo: (fragment: string) => calls.filter((c) => decodeURIComponent(c.url.pathname).includes(fragment)),
  }
}

export type FakeErpNext = ReturnType<typeof createFakeErpNext>
