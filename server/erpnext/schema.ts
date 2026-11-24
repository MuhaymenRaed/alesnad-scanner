import type { Logger } from '../logger.js'
import { cachedValue } from './cache.js'
import { ErpNextError, type ErpNextClient } from './client.js'

/**
 * Discovers the real schema of the connected ERPNext site from its DocType metadata
 * (`frappe.desk.form.load.getdoctype`, the same read-only call the ERPNext desk uses),
 * so queries only request fields that exist — including custom fields — and the barcode
 * child table is found by inspection instead of being assumed.
 *
 * If metadata cannot be read, it falls back to the standard ERPNext v14/v15 schema.
 */

export interface FieldInfo {
  label: string
  fieldtype: string
}

export interface ErpSchema {
  source: 'metadata' | 'defaults'
  /** Child DocType holding barcodes (standard: "Item Barcode"). */
  barcodeDoctype: string
  /** Table fieldname on Item (standard: "barcodes"); null when unknown. */
  barcodeTableField: string | null
  barcodeFields: Set<string>
  itemFields: Map<string, FieldInfo>
  itemPriceFields: Set<string>
}

interface MetaField {
  fieldname?: string
  fieldtype?: string
  label?: string
  options?: string
}
interface MetaDoc {
  name?: string
  fields?: MetaField[]
}
interface GetDoctypeResponse {
  docs?: MetaDoc[]
}

const STANDARD_BARCODE_FIELDS = ['barcode', 'barcode_type', 'uom']
const STANDARD_ITEM_PRICE_FIELDS = [
  'item_code', 'uom', 'price_list', 'customer', 'supplier', 'batch_no', 'buying', 'selling',
  'currency', 'price_list_rate', 'valid_from', 'valid_upto',
]
const STANDARD_ITEM_FIELDS: Array<[string, string, string]> = [
  ['item_code', 'Item Code', 'Data'], ['item_name', 'Item Name', 'Data'], ['item_group', 'Item Group', 'Link'],
  ['stock_uom', 'Default Unit of Measure', 'Link'], ['sales_uom', 'Default Sales Unit of Measure', 'Link'],
  ['brand', 'Brand', 'Link'], ['description', 'Description', 'Text Editor'], ['image', 'Image', 'Attach Image'],
  ['disabled', 'Disabled', 'Check'], ['is_stock_item', 'Maintain Stock', 'Check'], ['has_variants', 'Has Variants', 'Check'],
  ['variant_of', 'Variant Of', 'Link'], ['weight_per_unit', 'Weight Per Unit', 'Float'], ['weight_uom', 'Weight UOM', 'Link'],
  ['country_of_origin', 'Country of Origin', 'Link'], ['customs_tariff_number', 'Customs Tariff Number', 'Link'],
  ['shelf_life_in_days', 'Shelf Life In Days', 'Int'], ['warranty_period', 'Warranty Period (in days)', 'Data'],
  ['end_of_life', 'End of Life', 'Date'],
]

export function defaultSchema(): ErpSchema {
  return {
    source: 'defaults',
    barcodeDoctype: 'Item Barcode',
    barcodeTableField: 'barcodes',
    barcodeFields: new Set(STANDARD_BARCODE_FIELDS),
    itemFields: new Map(STANDARD_ITEM_FIELDS.map(([name, label, fieldtype]) => [name, { label, fieldtype }])),
    itemPriceFields: new Set(STANDARD_ITEM_PRICE_FIELDS),
  }
}

const isDataField = (f: MetaField): f is MetaField & { fieldname: string } =>
  typeof f.fieldname === 'string' && !/Break|HTML|Button|Heading|Fold/.test(f.fieldtype ?? '')

/** Pure: build the schema from getdoctype responses for "Item" and "Item Price". */
export function parseSchema(itemBundle: GetDoctypeResponse, itemPriceBundle: GetDoctypeResponse | null): ErpSchema {
  const docs = itemBundle.docs ?? []
  const item = docs.find((d) => d.name === 'Item')
  if (!item?.fields) throw new Error('Item metadata missing from response')

  // Find the child table whose DocType has a `barcode` field — standard is barcodes → Item Barcode.
  let barcodeDoctype: string | null = null
  let barcodeTableField: string | null = null
  let barcodeFields = new Set<string>()
  for (const field of item.fields) {
    if (field.fieldtype !== 'Table' || !field.options || !field.fieldname) continue
    const child = docs.find((d) => d.name === field.options)
    const childFields = new Set((child?.fields ?? []).filter(isDataField).map((f) => f.fieldname))
    if (childFields.has('barcode')) {
      barcodeDoctype = field.options
      barcodeTableField = field.fieldname
      barcodeFields = childFields
      break
    }
  }
  if (!barcodeDoctype) throw new Error('No barcode child table found on Item')

  const itemFields = new Map<string, FieldInfo>()
  for (const field of item.fields.filter(isDataField)) {
    itemFields.set(field.fieldname, { label: field.label?.trim() || field.fieldname, fieldtype: field.fieldtype ?? 'Data' })
  }
  // Standard columns that are not part of `fields` in metadata.
  if (!itemFields.has('item_code')) itemFields.set('item_code', { label: 'Item Code', fieldtype: 'Data' })

  const priceDoc = itemPriceBundle?.docs?.find((d) => d.name === 'Item Price')
  const itemPriceFields = priceDoc?.fields
    ? new Set(priceDoc.fields.filter(isDataField).map((f) => f.fieldname))
    : new Set(STANDARD_ITEM_PRICE_FIELDS)

  return { source: 'metadata', barcodeDoctype, barcodeTableField, barcodeFields, itemFields, itemPriceFields }
}

const METADATA_TTL_MS = 10 * 60 * 1000
const FALLBACK_TTL_MS = 60 * 1000

export interface SchemaService {
  get(): Promise<ErpSchema>
}

export function createSchemaService(client: ErpNextClient, logger: Logger): SchemaService {
  const cache = cachedValue(async () => {
    try {
      const itemBundle = await client.callGetMethod<GetDoctypeResponse>('frappe.desk.form.load.getdoctype', { doctype: 'Item' })
      let priceBundle: GetDoctypeResponse | null = null
      try {
        priceBundle = await client.callGetMethod<GetDoctypeResponse>('frappe.desk.form.load.getdoctype', { doctype: 'Item Price' })
      } catch (error) {
        logger.warn('could not read Item Price metadata; using standard Item Price fields', {
          kind: error instanceof ErpNextError ? error.kind : 'parse',
        })
      }
      const schema = parseSchema(itemBundle, priceBundle)
      logger.debug('erpnext schema loaded from metadata', { barcodeDoctype: schema.barcodeDoctype })
      return { value: schema, ttlMs: METADATA_TTL_MS }
    } catch (error) {
      // Connectivity/auth failures must surface as errors, not be hidden behind defaults.
      if (error instanceof ErpNextError && ['auth', 'timeout', 'unavailable'].includes(error.kind)) throw error
      logger.warn('could not read Item metadata; using the standard ERPNext schema', {
        kind: error instanceof ErpNextError ? error.kind : 'parse',
      })
      return { value: defaultSchema(), ttlMs: FALLBACK_TTL_MS }
    }
  })
  return { get: () => cache.get() }
}
