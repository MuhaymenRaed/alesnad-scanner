import type { MetadataEntry, Product, UomConversion } from '../../shared/api.js'
import type { ErpSchema } from './schema.js'

/** Raw ERPNext Item document — every field is optional because sites differ. */
export interface ItemDoc {
  name: string
  item_code?: string
  item_name?: string
  item_group?: string | null
  brand?: string | null
  stock_uom?: string | null
  sales_uom?: string | null
  description?: string | null
  image?: string | null
  disabled?: number
  is_stock_item?: number
  has_variants?: number
  variant_of?: string | null
  weight_per_unit?: number | null
  weight_uom?: string | null
  uoms?: Array<{ uom?: string; conversion_factor?: number }>
  item_defaults?: Array<{ company?: string }>
  barcodes?: BarcodeRow[]
  [field: string]: unknown
}

export interface BarcodeRow {
  name?: string
  parent?: string
  barcode?: string
  barcode_type?: string | null
  uom?: string | null
  idx?: number
}

/**
 * Fields that may hold costs, supplier data, accounting or system information. They are never
 * returned to the browser, even if an administrator lists them in ITEM_METADATA_FIELDS.
 */
const DENIED_FIELD_PATTERN =
  /(valuation|cost|purchase|supplier|buying|margin|rate|price|account|tax|password|secret|token|api_key|owner|modified_by|_user$)/i

export function isFieldDenied(fieldname: string): boolean {
  return DENIED_FIELD_PATTERN.test(fieldname)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** ERPNext descriptions are HTML (Text Editor). Convert to plain text; the browser never renders HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === '#') {
        const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
      }
      return ENTITIES[entity.toLowerCase()] ?? match
    })
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

function humanize(fieldname: string): string {
  const words = fieldname.replace(/^custom_/, '').split('_').filter(Boolean)
  return words.map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ')
}

const MAX_METADATA_TEXT = 500

/** Build the allowlisted metadata list: configured fields that exist, are safe, and have a value. */
export function buildMetadata(doc: ItemDoc, fields: string[], schema: ErpSchema): MetadataEntry[] {
  const entries: MetadataEntry[] = []
  for (const field of fields) {
    if (isFieldDenied(field)) continue
    const info = schema.itemFields.get(field)
    if (schema.source === 'metadata' && !info) continue // not a field on this site
    if (info && /Table|Password|Attach|Signature|Geolocation|JSON|Code/.test(info.fieldtype)) continue
    const raw = doc[field]
    if (raw === null || raw === undefined || raw === '') continue

    let value: MetadataEntry['value']
    if (info?.fieldtype === 'Check') value = Number(raw) === 1
    else if (typeof raw === 'number' || typeof raw === 'boolean') value = raw
    else if (typeof raw === 'string') {
      const plain = htmlToText(raw)
      if (!plain) continue
      value = plain.length > MAX_METADATA_TEXT ? `${plain.slice(0, MAX_METADATA_TEXT)}…` : plain
    } else continue // objects/arrays (child tables) are never exposed

    entries.push({ field, label: info?.label ?? humanize(field), value })
  }
  return entries
}

/** Accept only images hosted on the ERPNext site itself; returns its path or null. */
export function resolveImagePath(image: unknown, baseUrl: string): string | null {
  if (typeof image !== 'string' || !image.trim()) return null
  try {
    const base = new URL(baseUrl)
    const url = new URL(image.trim(), base)
    if (url.origin !== base.origin) return null
    if (!url.pathname.startsWith('/files/') && !url.pathname.startsWith('/private/files/')) return null
    return url.pathname
  } catch {
    return null
  }
}

/** Unit the item is being looked up in: barcode UOM → sales UOM → stock UOM. */
export function requestedUomFor(doc: ItemDoc, barcodeRow: BarcodeRow | null): string {
  return text(barcodeRow?.uom) ?? text(doc.sales_uom) ?? text(doc.stock_uom) ?? 'Unit'
}

export function normalizeProduct(input: {
  doc: ItemDoc
  barcodeRow: BarcodeRow | null
  matchedBy: Product['matchedBy']
  schema: ErpSchema
  metadataFields: string[]
  baseUrl: string
}): Omit<Product, 'price' | 'sellingPrice' | 'currency' | 'priceList'> {
  const { doc, barcodeRow } = input
  const itemCode = text(doc.item_code) ?? doc.name
  const description = typeof doc.description === 'string' ? htmlToText(doc.description) : null
  const itemName = text(doc.item_name) ?? itemCode

  const uomConversions: UomConversion[] = (doc.uoms ?? [])
    .filter((row) => text(row.uom) && typeof row.conversion_factor === 'number')
    .map((row) => ({ uom: row.uom as string, factor: row.conversion_factor as number }))

  const weight =
    typeof doc.weight_per_unit === 'number' && doc.weight_per_unit > 0
      ? { value: doc.weight_per_unit, uom: text(doc.weight_uom) }
      : null

  return {
    itemCode,
    itemName,
    matchedBy: input.matchedBy,
    barcode: barcodeRow?.barcode ?? null,
    barcodeType: text(barcodeRow?.barcode_type),
    barcodeUom: text(barcodeRow?.uom),
    uom: requestedUomFor(doc, barcodeRow),
    stockUom: text(doc.stock_uom),
    // Don't repeat the name as a "description" (common when descriptions are auto-filled).
    description: description && description !== itemName ? description : null,
    itemGroup: text(doc.item_group),
    brand: text(doc.brand),
    hasImage: resolveImagePath(doc.image, input.baseUrl) !== null,
    weight,
    isStockItem: doc.is_stock_item === undefined ? null : Number(doc.is_stock_item) === 1,
    disabled: Number(doc.disabled) === 1,
    hasVariants: Number(doc.has_variants) === 1,
    variantOf: text(doc.variant_of),
    uomConversions,
    metadata: buildMetadata(doc, input.metadataFields, input.schema),
  }
}
